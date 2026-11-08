import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GenerateImageRequest, GenerateVideoRequest, GenerateVideoResult } from '../../../src/shared/ipc.types'
import type { ModelAdapterContext } from './model-adapter-context'
import { loadProject } from './project.store'
import { runGenerationTask, TerminalGenerationError } from './generation-task.service'
import { downloadMediaToFile, readBoundedMedia } from './media-io'

/** The media site uses /api task resources, not the old /v1 batch protocol. */
async function json(context: ModelAdapterContext, route: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${context.baseUrl}${route}`, { ...init, headers: { Authorization: `Bearer ${context.apiKey}`, ...init.headers }, redirect: 'error', signal: AbortSignal.timeout(90_000) })
  if (!response.ok) {
    let detail = ''
    const reader = response.body?.getReader()
    if (reader) {
      try {
        const chunks: Uint8Array[] = []; let length = 0
        while (length < 16 * 1024) { const { value, done } = await reader.read(); if (done) break; chunks.push(value); length += value.byteLength }
        await reader.cancel()
        if (length <= 16 * 1024) { const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); const reason = payload.detail || payload.message || payload.error?.message || payload.error; if (typeof reason === 'string') detail = `：${reason.split(context.apiKey).join('[密钥]').replace(/sk-[a-zA-Z0-9_-]+/g, '[密钥]').slice(0, 350)}` }
      } catch {} finally { reader.releaseLock() }
    }
    const message = `图片／视频新站接口 HTTP ${response.status}${detail}`
    if (init.method === 'POST' && [400, 401, 403, 404, 405, 422].includes(response.status)) throw new TerminalGenerationError(`${message}，请求被拒绝，请核对模型和权限`)
    throw new Error(`${message}；已有任务保留原 ID，不会自动重复提交`)
  }
  if (!response.body) throw new Error('新站接口返回空响应')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > 75 * 1024 * 1024) { await reader.cancel(); throw new Error('图片／视频任务响应超过大小上限') }; chunks.push(value) }
  } finally { reader.releaseLock() }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('新站接口没有返回有效 JSON，请核对服务地址') }
}
async function references(rootPath: string, paths: string[]) {
  const root = await fs.realpath(rootPath)
  return Promise.all(paths.map(async relative => {
    if (!relative.trim() || path.isAbsolute(relative)) throw new Error('参考图必须是项目内相对路径')
    const file = await fs.realpath(path.resolve(root, relative)); const rel = path.relative(root, file)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('参考图片不能链接到项目外')
    const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[path.extname(file).toLowerCase()]
    if (!mime) throw new Error('参考图仅支持 PNG、JPEG、WebP')
    return { mime, name: path.basename(file), bytes: await readBoundedMedia(file, 10 * 1024 * 1024, '参考图') }
  }))
}
function imageExtension(bytes: Buffer) {
  return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png' : bytes[0] === 255 && bytes[1] === 216 ? 'jpg' : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : ''
}
async function download(url: string, output: string, limit: number, baseUrl: string) {
  const parsed = new URL(url, baseUrl)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('生成结果下载地址无效')
  // Result CDN links receive no API key, including after redirects.
  await downloadMediaToFile(await fetch(parsed, { signal: AbortSignal.timeout(180_000) }), output, limit)
}
export async function generateLunaMedia(request: GenerateImageRequest | GenerateVideoRequest, context: ModelAdapterContext, kind: 'image' | 'video'): Promise<GenerateVideoResult> {
  const project = await loadProject(request.projectId)
  if (!project) throw new Error('项目不存在')
  if (!context.apiKey) throw new Error('请先保存图片／视频新站的 API Key')
  if (!request.prompt.trim()) throw new Error('请填写生成提示词')
  const resource = `/api/${kind}-tasks`
  return runGenerationTask({ project, provider: 'luna-media', operation: kind, request }, {
    submit: async (markSubmitting, submissionId) => {
      const refs = await references(project.folderPath, request.referenceImagePaths ?? (request.referenceImagePath ? [request.referenceImagePath] : []))
      if (refs.length > context.referenceLimit) throw new Error(`此模型最多接收 ${context.referenceLimit} 张参考图`)
      const clientId = `tangmen-${submissionId}`
      let body: BodyInit; let route = `${resource}/generations`; const headers: Record<string, string> = {}
      if (kind === 'image' && refs.length) {
        const form = new FormData()
        form.set('client_task_id', clientId); form.set('model', context.model); form.set('prompt', request.prompt.trim()); form.set('size', request.aspectRatio)
        for (const ref of refs) form.append('image', new Blob([new Uint8Array(ref.bytes)], { type: ref.mime }), ref.name)
        body = form; route = `${resource}/edits`
      } else {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({ client_task_id: clientId, model: context.model, prompt: request.prompt.trim(), ...(kind === 'image' ? { size: request.aspectRatio } : {
          seconds: (request as GenerateVideoRequest).duration ?? context.durations?.[0] ?? 6,
          aspect_ratio: request.aspectRatio,
          ...(context.resolutions?.length ? { resolution: context.resolutions[0] } : {}),
          ...(refs.length ? { images: refs.map(ref => `data:${ref.mime};base64,${ref.bytes.toString('base64')}`) } : {}),
        }) })
      }
      markSubmitting()
      const submitted = await json(context, route, { method: 'POST', headers, body })
      if (typeof submitted.id !== 'string' || !submitted.id) throw new Error('提交未返回任务 ID，请先在服务端核实，勿重复生成')
      return submitted.id
    },
    complete: async taskId => {
      const payload = await json(context, `${resource}?ids=${encodeURIComponent(taskId)}`)
      const task = Array.isArray(payload.items) ? payload.items.find((item: { id?: string }) => item.id === taskId) : undefined
      if (!task) throw new Error('服务端暂未返回此任务；已保留原 ID，请稍后查询或联系服务商，勿重复生成')
      if (['error', 'failed', 'cancelled'].includes(task.status)) throw new TerminalGenerationError(`新站生成失败：${typeof task.error === 'string' ? task.error.split(context.apiKey).join('[密钥]').replace(/sk-[a-zA-Z0-9_-]+/g, '[密钥]').slice(0, 300) : task.status}`)
      if (!(kind === 'image' ? task.status === 'success' : task.status === 'completed')) throw new Error(`任务仍在${task.status === 'queued' ? '排队' : '处理'}，已保存任务 ID，稍后继续查询`)
      const folder = path.join(project.folderPath, 'generated', kind === 'image' ? 'images' : 'videos')
      await fs.mkdir(folder, { recursive: true })
      if (kind === 'image') {
        const data = task.data?.[0]; let bytes: Buffer
        if (typeof data?.b64_json === 'string') bytes = Buffer.from(data.b64_json, 'base64')
        else if (typeof data?.url === 'string') {
          const tmp = path.join(folder, `${randomUUID()}.download`)
          try { await download(data.url, tmp, 50 * 1024 * 1024, context.baseUrl); bytes = await readBoundedMedia(tmp, 50 * 1024 * 1024, '生成图片') } finally { await fs.unlink(tmp).catch(() => undefined) }
        } else throw new Error('已完成任务没有返回图片结果，保留任务以便继续查询')
        const ext = imageExtension(bytes); if (!ext || bytes.length > 50 * 1024 * 1024) throw new Error('生成结果不是有效的 PNG、JPEG、WebP 图片或超过大小上限')
        const file = path.join(folder, `luna-media-${randomUUID()}.${ext}`)
        await fs.writeFile(file, bytes, { flag: 'wx' })
        return { success: true, relativePath: path.relative(project.folderPath, file).split(path.sep).join('/') }
      }
      if (typeof task.video_url !== 'string') throw new Error('已完成任务暂未提供视频地址，保留任务继续查询')
      const file = path.join(folder, `luna-media-${randomUUID()}.mp4`)
      await download(task.video_url, file, 500 * 1024 * 1024, context.baseUrl)
      try {
        const handle = await fs.open(file, 'r')
        try { const header = Buffer.alloc(12); await handle.read(header, 0, 12, 0); if (header.toString('ascii', 4, 8) !== 'ftyp') throw new Error('下载内容不是 MP4 视频，请核对服务端结果') } finally { await handle.close() }
      } catch (error) { await fs.unlink(file).catch(() => undefined); throw error }
      return { success: true, relativePath: path.relative(project.folderPath, file).split(path.sep).join('/') }
    },
  })
}
