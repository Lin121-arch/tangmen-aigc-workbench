import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ root: `${process.cwd()}/test-results/luna-media-${process.pid}`, url: '' }))
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() } }))
vi.mock('../electron/main/services/project.store', () => ({ getAppDataDir: () => `${f.root}/profile`, loadProject: async (id: string) => ({ id, folderPath: f.root }) }))
import { saveModelServices, getModelServicesView, discoverServiceModels } from '../electron/main/services/model-services.store'
import { emptyModelServices, serviceWorkflows } from '../src/shared/model-services'
import { generateServiceImage, generateServiceVideo } from '../electron/main/services/model-services.runtime'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI/wAAAAASUVORK5CYII=', 'base64')
const mp4 = Buffer.from('000000186674797069736f6d000000006d703432', 'hex')
let server: http.Server
const calls: { url: string; method: string; auth?: string; body: string; type?: string }[] = []
let pendingImage = false
let failVideoPoll = false
let rejectImage = false
let invalidVideo = false
let terminalError = false
let relativeVideo = false
const config = () => ({ ...emptyModelServices(), providers: [{ id: 'media', name: '图片视频新站', enabled: true, apiKey: 'media-secret', endpoints: [
  { id: 'image', protocol: 'luna-media-image', baseUrl: f.url }, { id: 'video', protocol: 'luna-media-video', baseUrl: f.url },
], models: [
  { id: 'image', name: 'image2', modelId: 'gpt-image-2', endpointId: 'image', capabilities: ['image', 'image-edit'], referenceLimit: 1 },
  { id: 'video', name: 'grok', modelId: 'grok-video-1.5按次', endpointId: 'video', capabilities: ['video', 'first-frame'], referenceLimit: 1, durations: [6, 10, 15], aspectRatios: ['16:9', '9:16'], resolutions: ['720p', '1080p'] },
] }] })
beforeAll(async () => {
  await fs.mkdir(f.root, { recursive: true }); await fs.writeFile(path.join(f.root, 'reference.png'), png)
  server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c)
    const url = req.url || ''; const body = Buffer.concat(chunks).toString()
    calls.push({ url, method: req.method || '', auth: req.headers.authorization, body, type: req.headers['content-type'] })
    res.setHeader('Content-Type', 'application/json')
    if (url === '/api/media/models') { res.end(JSON.stringify({ images: [{ id: 'gpt-image-2', label: 'image2' }], videos: [{ id: 'grok-video-1.5按次', label: 'grok', durations: [6, 10, 15], aspects: ['16:9', '9:16'], max_images: 7, resolutions: ['720p', '1080p'] }] })); return }
    if (url.startsWith('/api/image-tasks?')) { res.end(JSON.stringify({ items: [{ id: 'image-job', status: pendingImage ? 'processing' : 'success', data: pendingImage ? [] : [{ b64_json: png.toString('base64') }] }], missing_ids: [] })); return }
    if (url.startsWith('/api/video-tasks?')) { if (failVideoPoll) { res.writeHead(404); res.end('{}'); return } res.end(JSON.stringify({ items: [{ id: 'video-job', status: terminalError ? 'failed' : 'completed', error: `${'x'.repeat(295)}media-secret`, video_url: relativeVideo ? '/result.mp4' : `${f.url}/result.mp4` }], missing_ids: [] })); return }
    if (url === '/result.mp4') { res.end(invalidVideo ? '<html>provider error</html>' : mp4); return }
    if (url === '/api/image-tasks/generations' || url === '/api/image-tasks/edits') { if (rejectImage) { res.writeHead(429); res.end('{"detail":"image quota exhausted media-secret"}'); return }; res.end('{"id":"image-job","status":"queued"}'); return }
    if (url === '/api/video-tasks/generations') { res.end('{"id":"video-job","status":"queued"}'); return }
    res.writeHead(404); res.end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  f.url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
it('reads separate image/video catalogues with Bearer GET and exposes allowed video durations', async () => {
  await saveModelServices(config())
  const view = await getModelServicesView()
  expect(await discoverServiceModels(view.providers[0], 'image')).toEqual(['gpt-image-2'])
  expect(await discoverServiceModels(view.providers[0], 'video')).toEqual(['grok-video-1.5按次'])
  expect(calls.slice(-2).every(c => c.url === '/api/media/models' && c.method === 'GET' && c.auth === 'Bearer media-secret')).toBe(true)
  expect(serviceWorkflows(view).find(w => w.id === 'service-model:media:video')).toMatchObject({ durations: [6, 10, 15], minDuration: 6, maxDuration: 15 })
})
it('downloads a relative video result without sending the API key to the media route', async () => {
  relativeVideo = true
  const start = calls.length
  try {
    const result = await generateServiceVideo({ projectId: 'p', nodeId: 'relative-result', workflowId: 'service-model:media:video', prompt: '相对路径结果', aspectRatio: '9:16', duration: 6 })
    expect(result.success).toBe(true)
    expect(await fs.readFile(path.join(f.root, result.relativePath!))).toEqual(mp4)
    const downloads = calls.slice(start).filter(c => c.url === '/result.mp4')
    expect(downloads).toHaveLength(1)
    expect(downloads[0].auth).toBeUndefined()
  } finally { relativeVideo = false }
})
it('submits image JSON once and resumes the remote task into a real image file', async () => {
  const request = { projectId: 'p', nodeId: 'text-image', workflowId: 'service-model:media:image', prompt: '原创学习搭档', aspectRatio: '9:16' as const }
  pendingImage = true
  await expect(generateServiceImage(request)).rejects.toThrow(/排队|处理|生成中/)
  pendingImage = false
  const result = await generateServiceImage(request)
  expect(await fs.readFile(path.join(f.root, result.relativePath!))).toEqual(png)
  const submits = calls.filter(c => c.url === '/api/image-tasks/generations')
  expect(submits).toHaveLength(1)
  expect(JSON.parse(submits[0].body)).toMatchObject({ model: 'gpt-image-2', prompt: '原创学习搭档', size: '9:16', client_task_id: expect.any(String) })
})
it('uploads reference images using the new site multipart field instead of image[]', async () => {
  const result = await generateServiceImage({ projectId: 'p', nodeId: 'edit-image', workflowId: 'service-model:media:image', prompt: '只改表情', aspectRatio: '9:16', referenceImagePaths: ['reference.png'] })
  expect(result.success).toBe(true)
  const submit = calls.find(c => c.url === '/api/image-tasks/edits')!
  expect(submit.type).toContain('multipart/form-data')
  expect(submit.body).toContain('name="image";')
  expect(submit.body).not.toContain('name="image[]"')
  expect(submit.body).toContain('name="client_task_id"')
})
it('retains the client ID and surfaces a redacted provider rejection without retrying', async () => {
  rejectImage = true
  const request = { projectId: 'p', nodeId: 'rejected-image', workflowId: 'service-model:media:image', prompt: '配额测试', aspectRatio: '9:16' as const }
  await expect(generateServiceImage(request)).rejects.toThrow(/image quota exhausted/)
  const tasks = await Promise.all((await fs.readdir(path.join(f.root, '.aigc-line/generation-tasks'))).map(async file => JSON.parse(await fs.readFile(path.join(f.root, '.aigc-line/generation-tasks', file), 'utf8'))))
  const task = tasks.find(t => t.nodeId === request.nodeId)
  const submits = calls.filter(c => c.url === '/api/image-tasks/generations' && c.body.includes('配额测试'))
  expect(JSON.parse(submits[0].body).client_task_id).toBe(`tangmen-${task.id}`)
  expect(task.error).not.toContain('media-secret')
  await expect(generateServiceImage(request)).rejects.toThrow(/未知/)
  expect(calls.filter(c => c.url === '/api/image-tasks/generations' && c.body.includes('配额测试'))).toHaveLength(1)
  rejectImage = false
})
it('cleans invalid video downloads on repeated recovery and redacts terminal errors before truncating', async () => {
  const request = { projectId: 'p', nodeId: 'bad-video', workflowId: 'service-model:media:video', prompt: '错误视频内容', aspectRatio: '9:16' as const, duration: 6 }
  await fs.mkdir(path.join(f.root, 'generated/videos'), { recursive: true })
  const before = await fs.readdir(path.join(f.root, 'generated/videos'))
  invalidVideo = true
  for (let i = 0; i < 2; i++) await expect(generateServiceVideo(request)).rejects.toThrow(/MP4/)
  expect(await fs.readdir(path.join(f.root, 'generated/videos'))).toEqual(before)
  invalidVideo = false; terminalError = true
  const failure = await generateServiceVideo({ ...request, nodeId: 'terminal-video' }).catch((error: Error) => error.message)
  expect(failure).not.toContain('media')
  terminalError = false
})
it('rejects unsupported duration before charging and recovers GET 404 without a second video submit', async () => {
  const request = { projectId: 'p', nodeId: 'first-frame', workflowId: 'service-model:media:video', prompt: '轻微转头', aspectRatio: '9:16' as const, duration: 6, referenceImagePath: 'reference.png' }
  await expect(generateServiceVideo({ ...request, duration: 5 })).rejects.toThrow(/时长|6/)
  expect(calls.filter(c => c.url === '/api/video-tasks/generations' && c.body.includes('轻微转头'))).toHaveLength(0)
  failVideoPoll = true
  await expect(generateServiceVideo(request)).rejects.toThrow(/404/)
  failVideoPoll = false
  const result = await generateServiceVideo(request)
  expect(await fs.readFile(path.join(f.root, result.relativePath!))).toEqual(mp4)
  const submits = calls.filter(c => c.url === '/api/video-tasks/generations' && c.body.includes('轻微转头'))
  expect(submits).toHaveLength(1)
  expect(JSON.parse(submits[0].body)).toMatchObject({ model: 'grok-video-1.5按次', seconds: 6, aspect_ratio: '9:16', resolution: '720p', images: [expect.stringContaining('data:image/png;base64,')] })
  expect(calls.find(c => c.url === '/result.mp4')?.auth).toBeUndefined()
  for (const file of await fs.readdir(path.join(f.root, '.aigc-line/generation-tasks'))) expect(await fs.readFile(path.join(f.root, '.aigc-line/generation-tasks', file), 'utf8')).not.toContain('media-secret')
})
afterAll(async () => { if (server) await new Promise<void>(r => server.close(() => r())); await fs.rm(f.root, { recursive: true, force: true }) })
