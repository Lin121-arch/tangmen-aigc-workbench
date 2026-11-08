import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ root: `${process.cwd()}/test-results/model-generation-${process.pid}`, url: '' }))
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() } }))
vi.mock('../electron/main/services/project.store', () => ({ getAppDataDir: () => `${f.root}/profile`, loadProject: async (id: string) => ({ id, folderPath: f.root }) }))
import { saveModelServices } from '../electron/main/services/model-services.store'
import { emptyModelServices } from '../src/shared/model-services'
import { generateServiceImage, generateServiceVideo } from '../electron/main/services/model-services.runtime'
import { DEFAULT_RELAY_VIDEO_CONFIG } from '../src/shared/relay-video-config'
import { getModelServicesView, discoverServiceModels } from '../electron/main/services/model-services.store'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI/wAAAAASUVORK5CYII=', 'base64')
let server: http.Server; const received: { url?: string; key?: string; body: string; type?: string }[] = []
let videoPosts = 0; let failVideo = true
let arkPosts = 0; let arkBody: any; let failArk = true
it('routes two providers independently and uses multipart for edits without leaking keys into tasks', async () => {
  await fs.mkdir(f.root, { recursive: true }); await fs.writeFile(path.join(f.root, 'reference.png'), png)
  server = http.createServer(async (req, res) => {
    if (req.url === '/ark/contents/generations/tasks' && req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); arkBody = JSON.parse(Buffer.concat(chunks).toString()); arkPosts++; res.end('{"id":"ark-job"}'); return }
    if (req.url === '/ark/contents/generations/tasks/ark-job') { if (failArk) { res.writeHead(404); res.end('{}') } else res.end(JSON.stringify({ status: 'succeeded', content: { video_url: `${f.url}/video/result.mp4` } })); return }
    if (req.url === '/video/create') { videoPosts++; res.end('{"id":"original-task"}'); return }
    if (req.url === '/video/tasks/original-task') { if (failVideo) { res.writeHead(503); res.end('{}') } else res.end('{"status":"completed","url":"/video/result.mp4"}'); return }
    if (req.url === '/video/result.mp4') { res.end(Buffer.from('000000186674797069736f6d000000006d703432', 'hex')); return }
    if (req.url?.endsWith('/models')) { res.end('{"data":[{"id":"discovered-id"}]}'); return }
    const chunks = []; for await (const chunk of req) chunks.push(chunk); received.push({ url: req.url, key: req.headers.authorization, body: Buffer.concat(chunks).toString(), type: req.headers['content-type'] }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); f.url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  await saveModelServices({ ...emptyModelServices(), providers: ['a', 'b'].map(id => ({ id, name: id, enabled: true, apiKey: `key-${id}`, endpoints: [{ id: 'api', protocol: 'openai-image', baseUrl: `${f.url}/${id}/v1` }], models: [{ id: 'm', name: '相同模型', modelId: 'real-image-id', endpointId: 'api', capabilities: ['image', 'image-edit'], referenceLimit: 2 }] })) })
  for (const id of ['a', 'b']) expect((await generateServiceImage({ projectId: 'p', nodeId: id, workflowId: `service-model:${id}:m`, prompt: '测试', aspectRatio: '9:16', ...(id === 'b' ? { referenceImagePaths: ['reference.png'] } : {}) })).success).toBe(true)
  expect(received).toHaveLength(2)
  expect(received[0]).toMatchObject({ url: '/a/v1/images/generations', key: 'Bearer key-a' })
  expect(JSON.parse(received[0].body)).toMatchObject({ model: 'real-image-id', prompt: expect.stringContaining('测试') })
  expect(received[1]).toMatchObject({ url: '/b/v1/images/edits', key: 'Bearer key-b', type: expect.stringContaining('multipart/form-data') })
  expect(received[1].body).toContain('name="image[]"')
  for (const file of await fs.readdir(path.join(f.root, '.aigc-line', 'generation-tasks'))) expect(await fs.readFile(path.join(f.root, '.aigc-line', 'generation-tasks', file), 'utf8')).not.toContain('key-')
})
it('passes the Ark first frame and preserves an original job after a polling HTTP 404', async () => {
  await saveModelServices({ ...emptyModelServices(), providers: [{ id: 'ark', name: '方舟', enabled: true, apiKey: 'ark-key', endpoints: [{ id: 'api', protocol: 'ark-video', baseUrl: `${f.url}/ark` }], models: [{ id: 'm', name: '视频', modelId: 'actual-ark-id', endpointId: 'api', capabilities: ['video', 'first-frame'], referenceLimit: 1 }] }] })
  const request = { projectId: 'p', nodeId: 'ark-video', workflowId: 'service-model:ark:m', prompt: 'first frame', aspectRatio: '9:16' as const, referenceImagePath: 'reference.png' }
  await expect(generateServiceVideo(request)).rejects.toThrow(/404/)
  expect(arkBody.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image_url', role: 'first_frame', image_url: { url: expect.stringContaining('data:image/png;base64,') } })]))
  failArk = false
  expect((await generateServiceVideo(request)).success).toBe(true)
  expect(arkPosts).toBe(1)
})
it('discovers models with GET without submitting a generation', async () => {
  const config = await getModelServicesView()
  expect(await discoverServiceModels(config.providers[0], 'api')).toEqual(['discovered-id'])
  expect(received).toHaveLength(2)
})
it('resumes the original video without a second POST and rejects changed service addresses', async () => {
  const config = { ...emptyModelServices(), providers: [{ id: 'v', name: '视频', enabled: true, apiKey: 'video-key', endpoints: [{ id: 'api', protocol: 'json-video', baseUrl: `${f.url}/video`, videoConfig: { ...DEFAULT_RELAY_VIDEO_CONFIG, baseUrl: `${f.url}/video`, submitPath: '/create', queryPath: '/tasks/{id}' } }], models: [{ id: 'm', name: '视频', modelId: 'actual-video', endpointId: 'api', capabilities: ['video'], referenceLimit: 0 }] }] }
  await saveModelServices(config)
  const request = { projectId: 'p', nodeId: 'video', workflowId: 'service-model:v:m', prompt: '测试视频', aspectRatio: '9:16' as const, duration: 5 }
  await expect(generateServiceVideo(request)).rejects.toThrow(/503/)
  expect(videoPosts).toBe(1)
  const files = await fs.readdir(path.join(f.root, '.aigc-line/generation-tasks'))
  const task = (await Promise.all(files.map(file => fs.readFile(path.join(f.root, '.aigc-line/generation-tasks', file), 'utf8').then(JSON.parse)))).find(t => t.nodeId === 'video')
  expect(task.status).toBe('running'); expect(JSON.stringify(task)).not.toContain('video-key')
  await saveModelServices({ ...config, providers: config.providers.map(p => ({ ...p, endpoints: p.endpoints.map(e => ({ ...e, baseUrl: `${f.url}/changed` })) })) })
  await expect(generateServiceVideo({ ...request, modelService: task.request.modelService })).rejects.toThrow(/变更/)
  await saveModelServices(config); failVideo = false
  expect((await generateServiceVideo({ ...request, modelService: task.request.modelService })).success).toBe(true)
  expect(videoPosts).toBe(1)
})
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(f.root, { recursive: true, force: true }) })
