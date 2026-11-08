import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GenerateImageRequest, GenerateImageResult } from '../../../src/shared/ipc.types'
import type { ModelAdapterContext } from './model-adapter-context'
import { loadProject } from './project.store'
import { runLocalGeneration, TerminalGenerationError } from './generation-task.service'
import { downloadMediaToFile, readBoundedMedia } from './media-io'

export async function generateStandardImage(request: GenerateImageRequest, context: ModelAdapterContext): Promise<GenerateImageResult> {
  const project = await loadProject(request.projectId)
  if (!project) throw new Error('项目不存在')
  return runLocalGeneration({ project, provider: 'standard-image', request }, async markSubmitting => {
    if (!request.prompt.trim()) throw new Error('请填写图片提示词')
    const refs = request.referenceImagePaths ?? (request.referenceImagePath ? [request.referenceImagePath] : [])
    const prompt = `${request.prompt.trim()}\n画面比例：${request.aspectRatio}。`
    let body: BodyInit; let route: string; const headers: Record<string, string> = context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}
    if (refs.length) {
      const form = new FormData(); form.set('model', context.model); form.set('prompt', prompt); form.set('n', '1')
      const root = await fs.realpath(project.folderPath)
      for (const ref of refs) {
        if (path.isAbsolute(ref)) throw new Error('参考图片必须位于当前项目内')
        const file = await fs.realpath(path.resolve(root, ref)); const relative = path.relative(root, file)
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('参考图片不能链接到项目外')
        const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[path.extname(file).toLowerCase()]
        if (!mime) throw new Error('参考图片仅支持 PNG、JPEG、WebP')
        const data = await readBoundedMedia(file, 10 * 1024 * 1024, '参考图片')
        form.append('image[]', new Blob([new Uint8Array(data)], { type: mime }), path.basename(file))
      }
      body = form; route = '/images/edits'
    } else { body = JSON.stringify({ model: context.model, prompt, n: 1 }); headers['Content-Type'] = 'application/json'; route = '/images/generations' }
    markSubmitting()
    const response = await fetch(`${context.baseUrl}${route}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(300_000), redirect: 'error' })
    if (!response.ok) {
      if ([400, 401, 403, 404, 405, 422].includes(response.status)) throw new TerminalGenerationError(`图片接口拒绝请求（HTTP ${response.status}），请核对协议、权限和模型 ID`)
      throw new Error(`图片接口 HTTP ${response.status}，提交状态需核实，勿重复提交`)
    }
    const text = await response.text(); if (text.length > 100 * 1024 * 1024) throw new Error('图片响应过大')
    const payload = JSON.parse(text) as { data?: { b64_json?: string; url?: string }[] }
    const result = payload.data?.[0]; let bytes: Buffer
    if (result?.b64_json) bytes = Buffer.from(result.b64_json, 'base64')
    else if (result?.url) {
      const url = new URL(result.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('图片下载地址无效')
      const tmp = path.join(project.folderPath, 'generated', 'images', `${randomUUID()}.download`)
      const download = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      await downloadMediaToFile(download, tmp, 50 * 1024 * 1024)
      try { bytes = await fs.readFile(tmp) } finally { await fs.unlink(tmp) }
    } else throw new Error('接口没有返回 data[0].b64_json 或 url，请检查协议')
    const ext = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png' : bytes[0] === 255 && bytes[1] === 216 ? 'jpg' : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : ''
    if (!ext) throw new Error('接口返回的内容不是 PNG、JPEG 或 WebP 图片')
    const output = path.join(project.folderPath, 'generated', 'images', `${randomUUID()}.${ext}`)
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, bytes, { flag: 'wx' })
    return { success: true, relativePath: path.relative(project.folderPath, output).split(path.sep).join('/') }
  })
}
