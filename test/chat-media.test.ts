import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ root: `${process.cwd()}/test-results/chat-media-${process.pid}`, url: '' }))
vi.mock('electron', () => ({ app: { getPath: () => `${f.root}/profile` }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() } }))
vi.mock('../electron/main/services/project.store', async original => ({ ...await original<typeof import('../electron/main/services/project.store')>(), loadProject: async (id: string) => ({ id, folderPath: f.root }) }))
import { saveModelServices } from '../electron/main/services/model-services.store'
import { readChatHistory } from '../electron/main/services/project.store'
import { listComfyWorkflows } from '../electron/main/services/comfyui.service'
import { generateChatMedia, refreshChatMedia } from '../electron/main/services/chat-media.service'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI/wAAAAASUVORK5CYII=', 'base64')
let server: http.Server
const posts: { url: string; body: any }[] = []
let pending = false
beforeAll(async () => {
  await fs.mkdir(f.root, { recursive: true })
  server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    if (req.method === 'POST') posts.push({ url: req.url!, body: JSON.parse(Buffer.concat(chunks).toString()) })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/images/generations') { res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] })); return }
    if (req.url === '/api/video-tasks/generations') { res.end('{"id":"video-job","status":"queued"}'); return }
    if (req.url?.startsWith('/api/video-tasks?')) { res.end(JSON.stringify({ items: [{ id: 'video-job', status: pending ? 'processing' : 'completed', video_url: `${f.url}/result.mp4` }], missing_ids: [] })); return }
    if (req.url === '/result.mp4') { res.end(Buffer.from('000000186674797069736f6d000000006d703432', 'hex')); return }
    res.writeHead(404); res.end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  f.url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  await saveModelServices({ version: 1, providers: [{ id: 'p', name: '测试服务', enabled: true, apiKey: 'test-secret', endpoints: [
    { id: 'i', protocol: 'openai-image', baseUrl: f.url }, { id: 'v', protocol: 'luna-media-video', baseUrl: f.url },
  ], models: [
    { id: 'i', endpointId: 'i', modelId: 'image-real-id', name: '画图', capabilities: ['image'], referenceLimit: 0 },
    { id: 'v', endpointId: 'v', modelId: 'video-real-id', name: '视频', capabilities: ['video'], referenceLimit: 0, durations: [5, 10], aspectRatios: ['9:16', '16:9'] },
  ] }], defaults: { image: 'service-model:p:i', video: 'service-model:p:v' }, legacyAliases: {} })
})
const request = () => ({ projectId: 'project', requestId: randomUUID(), kind: 'image' as const, workflowId: 'service-model:p:i', prompt: '原创蓝色小龙，白色背景', aspectRatio: '9:16' as const })
it('offers registered models without unconfigured built-in channels', async () => {
  expect((await listComfyWorkflows()).map(item => item.id)).toEqual(['service-model:p:i', 'service-model:p:v'])
})
it('saves a chat image and its prompt without creating canvas nodes or duplicating concurrent submissions', async () => {
  const input = request(); const start = posts.length
  const [first, second] = await Promise.all([generateChatMedia(input), generateChatMedia(input)])
  expect(first.message.media?.status).toBe('succeeded')
  expect(second.message.id).toBe(first.message.id)
  expect(posts.slice(start).map(p => p.body.model)).toEqual(['image-real-id'])
  const history = await readChatHistory(f.root)
  expect(history.filter(m => m.id === first.message.id)).toHaveLength(1)
  expect(history.find(m => m.id === first.user.id)?.content).toBe(input.prompt)
  expect(await fs.readFile(path.join(f.root, first.message.media!.relativePath!))).toEqual(png)
  expect(JSON.stringify(history)).not.toContain('test-secret')
  await expect(fs.stat(path.join(f.root, '.aigc-line', 'canvas-snapshot.json'))).rejects.toThrow()
  await generateChatMedia(input)
  expect(posts.length - start).toBe(1)
  await expect(generateChatMedia({ ...input, prompt: 'changed' })).rejects.toThrow(/参数|不同/)
})
it('rejects unavailable models, unsupported durations and reference images before submitting', async () => {
  const start = posts.length
  await expect(generateChatMedia({ ...request(), workflowId: 'z-image-turbo-t2i' })).rejects.toThrow(/模型/)
  await expect(generateChatMedia({ ...request(), kind: 'video', workflowId: 'service-model:p:v', duration: 6 })).rejects.toThrow(/时长/)
  await expect(generateChatMedia({ ...request(), attachments: [{ name: 'reference.png', type: 'png', path: 'missing.png' }] })).rejects.toThrow(/参考图/)
  expect(posts.length).toBe(start)
})
it('retains a pending video in history and recovers the original task with no extra POST', async () => {
  const input = { ...request(), kind: 'video' as const, workflowId: 'service-model:p:v', duration: 5 }
  pending = true; const start = posts.length
  const initial = await generateChatMedia(input)
  expect(initial.message.media?.status).toBe('running')
  pending = false
  const { generateServiceVideo } = await import('../electron/main/services/model-services.runtime')
  await generateServiceVideo({ projectId: input.projectId, nodeId: initial.message.media!.nodeId, workflowId: input.workflowId, prompt: input.prompt, aspectRatio: input.aspectRatio, duration: input.duration })
  const recovered = (await refreshChatMedia('project')).find(m => m.id === initial.message.id)!
  expect(recovered.media?.status).toBe('succeeded')
  expect(recovered.media?.relativePath).toMatch(/\.mp4$/)
  expect(posts.slice(start)).toHaveLength(1)
  expect((await readChatHistory(f.root)).find(m => m.id === initial.message.id)?.media?.status).toBe('succeeded')
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(f.root, { recursive: true, force: true }) })
