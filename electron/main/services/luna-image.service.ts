import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GenerateImageRequest, GenerateImageResult } from '../../../src/shared/ipc.types'
import { loadProject } from './project.store'
import { getRuntimeSettings } from './settings.service'
import { readBoundedMedia, downloadMediaToFile } from './media-io'
import { runGenerationTask, TerminalGenerationError } from './generation-task.service'
import { normalizeLunaBaseUrl, lunaImageReferenceLimit, LUNA_IMAGE_WORKFLOW_ID } from '../../../src/shared/luna-config'
export { normalizeLunaBaseUrl } from '../../../src/shared/luna-config'

export const LUNA_IMAGE_WORKFLOW = { id: LUNA_IMAGE_WORKFLOW_ID, name: 'Luna · 批量生图 API', kind: 'text-to-image' as const }

async function jsonRequest(base: string, apiKey: string, suffix: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${base}${suffix}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) {
    const message = `Luna 接口返回 HTTP ${response.status}`
    if (init.method === 'POST' && [400, 401, 403, 404, 422].includes(response.status)) throw new TerminalGenerationError(message)
    throw new Error(message)
  }
  const text = await response.text()
  if (text.length > 2 * 1024 * 1024) throw new Error('Luna 任务响应过大')
  try { return JSON.parse(text) } catch { throw new Error('Luna 接口未返回有效 JSON') }
}

export async function queryLunaModels(baseUrl: string, apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('请先配置 Luna API Key')
  const payload = await jsonRequest(normalizeLunaBaseUrl(baseUrl), apiKey.trim(), '/images/batches/models')
  if (!Array.isArray(payload.data)) throw new Error('Luna 未返回批量生图模型列表，请确认密钥分组支持此接口')
  return [...new Set(payload.data.map((item: { id?: unknown }) => typeof item.id === 'string' ? item.id.trim() : '').filter(Boolean))] as string[]
}

async function references(rootPath: string, request: GenerateImageRequest, model: string) {
  const paths = [...new Set(request.referenceImagePaths ?? (request.referenceImagePath ? [request.referenceImagePath] : []))]
  // Limits match the public Luna batch UI; unknown models remain text-only until documented.
  const limit = lunaImageReferenceLimit(model)
  if (paths.length > limit) throw new Error(`当前 Luna 模型最多接收 ${limit} 张参考图；其他模型请先核对接口能力`)
  const root = await fs.realpath(rootPath)
  const result = []
  for (const [index, relative] of paths.entries()) {
    if (path.isAbsolute(relative) || !relative.trim()) throw new Error('参考图必须使用项目内相对路径')
    const file = await fs.realpath(path.resolve(root, relative))
    const resolved = path.relative(root, file)
    if (!resolved || resolved.startsWith('..') || path.isAbsolute(resolved)) throw new Error('参考图不在当前项目目录内')
    const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[path.extname(file).toLowerCase()]
    if (!mime) throw new Error('Luna 参考图仅支持 PNG、JPEG 或 WebP')
    const bytes = await readBoundedMedia(file, 10 * 1024 * 1024, 'Luna 参考图')
    result.push({ id: `reference_${index + 1}`, type: 'reference', mime_type: mime, data: bytes.toString('base64') })
  }
  return result
}

export async function generateImageWithLuna(request: GenerateImageRequest, context?: import('./model-adapter-context').ModelAdapterContext): Promise<GenerateImageResult> {
  const project = await loadProject(request.projectId)
  if (!project) throw new Error('项目不存在或已被删除')
  const settings = await getRuntimeSettings()
  if (context) { settings.lunaApiKey = context.apiKey; settings.lunaBaseUrl = context.baseUrl; settings.lunaImageModel = context.model }
  if (!settings.lunaApiKey) throw new Error('请先在系统配置中保存 Luna API Key')
  const base = normalizeLunaBaseUrl(settings.lunaBaseUrl)
  if (request.lunaBaseUrl && request.lunaBaseUrl !== base) throw new Error('Luna 地址已变更，请恢复原任务的服务地址后继续查询')
  const model = request.lunaModel || settings.lunaImageModel.trim()
  if (!model) throw new Error('请先在系统配置中选择 Luna 批量生图模型')
  if (!request.prompt.trim()) throw new Error('请先输入图片提示词')
  const effective = { ...request, lunaBaseUrl: base, lunaModel: model }
  return runGenerationTask({ project, provider: 'luna-image', operation: 'image', request: effective }, {
    submit: async markSubmitting => {
      const refs = await references(project.folderPath, effective, model)
      const models = await queryLunaModels(base, settings.lunaApiKey)
      if (!models.includes(model)) throw new Error('当前 Key 不支持所选批量生图模型，请在系统配置中读取可用模型')
      markSubmitting()
      const submitted = await jsonRequest(base, settings.lunaApiKey, '/images/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `tangmen-${randomUUID()}` },
        body: JSON.stringify({ model, task_name: `唐门AI-${request.nodeId}-${Date.now()}`, image_size: '1K', response_mime_type: 'image/png', items: [{
          custom_id: 'tm_image', prompt: `${request.prompt.trim()}\n画面比例：${request.aspectRatio}。`, output_count: 1,
          ...(refs.length ? { reference_images: refs } : {}),
        }] }),
      })
      if (typeof submitted.id !== 'string' || !submitted.id) throw new Error('Luna 提交未返回任务 ID，请先核实服务端结果，避免重复生成')
      return submitted.id
    },
    complete: async taskId => {
      const taskUrl = `/images/batches/${encodeURIComponent(taskId)}`
      const task = await jsonRequest(base, settings.lunaApiKey, taskUrl)
      if (['failed', 'cancelled', 'output_deleted'].includes(task.status)) throw new TerminalGenerationError(`Luna 任务状态：${task.status}`)
      if (task.status !== 'completed') throw new Error(`Luna 任务仍在${task.status === 'queued' ? '排队' : '处理'}；已保存任务 ID，稍后自动继续查询，不重复提交`)
      const items = await jsonRequest(base, settings.lunaApiKey, `${taskUrl}/items`)
      const item = Array.isArray(items.data) ? items.data.find((value: { custom_id?: string }) => value.custom_id === 'tm_image') : undefined
      if (!item || ['failed', 'cancelled'].includes(item.status) || Number(task.success_count) < 1) throw new TerminalGenerationError('Luna 批量任务未生成可下载图片，请在控制台查看失败原因')
      const response = await fetch(`${base}${taskUrl}/items/tm_image/content?image_index=0`, { headers: { Authorization: `Bearer ${settings.lunaApiKey}` }, signal: AbortSignal.timeout(120_000) })
      const output = path.join(project.folderPath, 'generated', 'images', `luna-${randomUUID()}.png`)
      await fs.mkdir(path.dirname(output), { recursive: true })
      await downloadMediaToFile(response, output, 50 * 1024 * 1024)
      const handle = await fs.open(output, 'r')
      try {
        const signature = Buffer.alloc(8)
        await handle.read(signature, 0, 8, 0)
        if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Luna 下载结果不是请求的 PNG 图片，请检查服务端输出')
      } finally { await handle.close() }
      return { success: true, relativePath: path.relative(project.folderPath, output).split(path.sep).join('/') }
    },
  })
}
