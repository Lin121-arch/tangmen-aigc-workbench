import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GenerateVideoRequest, GenerateVideoResult } from '../../../src/shared/ipc.types'
import { DEFAULT_RELAY_VIDEO_CONFIG, fillVideoBody, normalizeRelayVideoConfig, relayVideoWorkflowId, videoResponseField } from '../../../src/shared/relay-video-config'
import { normalizeVideoDuration } from '../../../src/shared/video-duration'
import { getRuntimeSettings } from './settings.service'
import { loadProject } from './project.store'
import { downloadMediaToFile, readBoundedMedia } from './media-io'
import { runGenerationTask, TerminalGenerationError } from './generation-task.service'

function endpoint(base: string, route: string, id?: string): string {
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('#')) throw new Error('视频接口路径必须以单个 / 开头，且不能包含完整域名或锚点')
  return base + route.replaceAll('{id}', encodeURIComponent(id ?? ''))
}
async function readJson(url: string, apiKey: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${apiKey}`, ...init.headers }, signal: AbortSignal.timeout(90_000) })
  if (!response.ok) {
    const message = `视频接口返回 HTTP ${response.status}`
    if (init.method === 'POST' && [400, 401, 403, 404, 405, 422].includes(response.status)) throw new TerminalGenerationError(message)
    throw new Error(message)
  }
  try { return await response.json() } catch { throw new Error('视频接口没有返回有效 JSON，请核对接口格式') }
}
async function referenceImages(rootPath: string, request: GenerateVideoRequest): Promise<string[]> {
  const inputs = request.referenceImagePaths ?? (request.referenceImagePath ? [request.referenceImagePath] : [])
  if (inputs.length > 1) throw new Error('自定义视频接口本版最多接收一张参考图')
  const root = await fs.realpath(rootPath)
  const result = []
  for (const input of inputs) {
    const resolved = path.resolve(root, input)
    const relative = path.relative(root, resolved)
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.isAbsolute(input)) throw new Error('视频参考图必须位于当前项目内')
    const file = await fs.realpath(resolved)
    const realRelative = path.relative(root, file)
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error('视频参考图不能链接到项目外')
    const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[path.extname(file).toLowerCase()]
    if (!mime) throw new Error('视频参考图仅支持 PNG/JPEG/WebP')
    result.push(`data:${mime};base64,${(await readBoundedMedia(file, 10 * 1024 * 1024, '视频参考图')).toString('base64')}`)
  }
  return result
}

export async function generateVideoWithRelay(request: GenerateVideoRequest, context?: import('./model-adapter-context').ModelAdapterContext): Promise<GenerateVideoResult> {
  const project = await loadProject(request.projectId)
  if (!project) throw new Error('项目不存在或已被删除')
  const settings = await getRuntimeSettings()
  if (context) { settings.relayVideoApiKey = context.apiKey; settings.relayVideoConfig = normalizeRelayVideoConfig({ ...DEFAULT_RELAY_VIDEO_CONFIG, ...context.videoConfig, baseUrl: context.baseUrl, models: [{ id: context.model, name: context.model }] }) }
  if (!settings.relayVideoApiKey) throw new Error('请在系统配置中填写并保存中转视频 API Key')
  const current = normalizeRelayVideoConfig(settings.relayVideoConfig)
  const config = normalizeRelayVideoConfig(request.relayVideoConfig ?? current)
  if (config.baseUrl !== current.baseUrl) throw new Error('视频服务地址已更改，请恢复原地址后继续查询旧任务')
  if (!config.submitPath.trim()) throw new Error('请先在高级配置中填写视频提交路径')
  if (!config.queryPath.includes('{id}')) throw new Error('视频查询路径需要包含 {id} 任务占位符')
  endpoint(config.baseUrl, config.submitPath); endpoint(config.baseUrl, config.queryPath)
  const model = context ? { id: context.model } : config.models.find(value => relayVideoWorkflowId(value.id) === request.workflowId)
  if (!model) throw new Error('视频模型未配置或已移除，请在系统配置中填写模型 ID')
  if (!request.prompt.trim()) throw new Error('请先填写视频提示词')
  const effective = { ...request, relayVideoConfig: config }
  return runGenerationTask({ project, provider: 'relay-video', operation: 'video', request: effective }, {
    submit: async markSubmitting => {
      const images = await referenceImages(project.folderPath, request)
      const templateValues = { model: model.id, prompt: request.prompt.trim(), duration: normalizeVideoDuration(request.duration), aspectRatio: request.aspectRatio, images, image: images[0] ?? '' }
      const body = fillVideoBody(config.submitBody, templateValues)
      markSubmitting()
      const submitted = await readJson(endpoint(config.baseUrl, config.submitPath), settings.relayVideoApiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `tangmen-${randomUUID()}` }, body: JSON.stringify(body),
      })
      const id = videoResponseField(submitted, config.taskIdPath)
      if ((typeof id !== 'string' && typeof id !== 'number') || !String(id)) throw new Error('提交后未找到任务 ID，请核对返回字段并先核实服务端任务，避免重复扣费')
      return String(id)
    },
    complete: async taskId => {
      // Query mappings may be corrected without changing the original POST snapshot.
      const query = current
      const payload = await readJson(endpoint(query.baseUrl, query.queryPath, taskId), settings.relayVideoApiKey)
      const status = String(videoResponseField(payload, query.statusPath) ?? '').toLowerCase()
      const statuses = (value: string) => value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
      if (statuses(query.failedStatuses).includes(status)) throw new TerminalGenerationError(`视频任务状态：${status}`)
      if (!statuses(query.successStatuses).includes(status)) throw new Error(`视频任务${status ? `状态：${status}` : '未返回可识别状态，请核对状态字段'}；保留原任务继续查询，不重复提交`)
      const mediaUrl = videoResponseField(payload, query.videoUrlPath)
      const downloadUrl = typeof mediaUrl === 'string' && mediaUrl
        ? new URL(mediaUrl, `${config.baseUrl}/`).toString()
        : query.downloadPath ? endpoint(query.baseUrl, query.downloadPath, taskId) : ''
      if (!downloadUrl || !['http:', 'https:'].includes(new URL(downloadUrl).protocol)) throw new Error('视频任务已完成但未找到 HTTP(S) 下载地址，请核对结果字段或下载路径')
      // Signed CDN downloads must never receive the provider API key.
      const headers = new URL(downloadUrl).origin === new URL(config.baseUrl).origin ? { Authorization: `Bearer ${settings.relayVideoApiKey}` } : undefined
      const response = await fetch(downloadUrl, { headers, signal: AbortSignal.timeout(180_000) })
      const output = path.join(project.folderPath, 'generated', 'videos', `relay-${randomUUID()}.mp4`)
      await downloadMediaToFile(response, output, 500 * 1024 * 1024)
      const handle = await fs.open(output, 'r')
      try {
        const signature = Buffer.alloc(12); await handle.read(signature, 0, 12, 0)
        if (signature.toString('ascii', 4, 8) !== 'ftyp') throw new Error('下载结果不是 MP4 文件，请检查视频下载接口')
      } finally { await handle.close() }
      return { success: true, relativePath: path.relative(project.folderPath, output).split(path.sep).join('/') }
    },
  })
}
