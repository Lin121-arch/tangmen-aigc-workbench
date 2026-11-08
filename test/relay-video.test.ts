import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ root: '', settings: {} as Record<string, unknown> }))
vi.mock('../electron/main/services/project.store', () => ({ loadProject: async (id: string) => ({ id, folderPath: fixture.root }) }))
vi.mock('../electron/main/services/settings.service', () => ({ getRuntimeSettings: async () => fixture.settings }))
import { DEFAULT_RELAY_VIDEO_CONFIG, relayVideoWorkflowId, fillVideoBody } from '../src/shared/relay-video-config'
import { generateVideoWithRelay } from '../electron/main/services/relay-video.service'

let server: http.Server | undefined
let posts = 0
let failQuery = false
let queryFailureStatus = 503
let lastBody: unknown
const video = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex')
async function setup() {
  fixture.root = await fs.mkdtemp(path.join(os.tmpdir(), 'tangmen-relay-video-'))
  posts = 0; failQuery = false; queryFailureStatus = 503
  server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer local-video-test') { res.writeHead(401); res.end('{}'); return }
    if (req.method === 'POST' && req.url === '/v1/create') {
      posts++
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
      lastBody = JSON.parse(Buffer.concat(chunks).toString())
      res.end(JSON.stringify({ data: { task_id: 'task/1' } })); return
    }
    if (req.url === '/v1/tasks/task%2F1') {
      if (failQuery) { res.writeHead(queryFailureStatus); res.end('{}'); return }
      res.end(JSON.stringify({ data: { state: 'finished', output: '/v1/output.mp4' } })); return
    }
    if (req.url === '/v1/output.mp4') { res.setHeader('Content-Type', 'video/mp4'); res.end(video); return }
    res.writeHead(404); res.end('{}')
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  fixture.settings = {
    relayVideoApiKey: 'local-video-test',
    relayVideoConfig: { ...DEFAULT_RELAY_VIDEO_CONFIG,
      baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
      models: [{ id: 'provider-video-id', name: '我的视频模型' }],
      submitPath: '/create', queryPath: '/tasks/{id}', taskIdPath: 'data.task_id', statusPath: 'data.state',
      videoUrlPath: 'data.output', successStatuses: 'finished',
    },
  }
}
afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
  if (fixture.root) await fs.rm(fixture.root, { recursive: true, force: true })
  server = undefined
})
const request = () => ({ projectId: 'pv', nodeId: 'video-1', workflowId: relayVideoWorkflowId('provider-video-id'), prompt: '角色说：“开始学习”\n展示教材', duration: 5, aspectRatio: '9:16' as const })

it('fills JSON placeholders as typed values without corrupting quotes, arrays or line breaks', () => {
  const body = fillVideoBody('{"model":"{{model}}","prompt":"{{prompt}}","seconds":"{{duration}}","images":"{{images}}"}', { model: 'm', prompt: '“中文” "quotes"\n换行', duration: 5, images: ['data:image/png;base64,AA=='] })
  expect(body).toEqual({ model: 'm', prompt: '“中文” "quotes"\n换行', seconds: 5, images: ['data:image/png;base64,AA=='] })
})
it('uses configured paths and response fields, saves video, and reuses the original remote task', async () => {
  await setup()
  const result = await generateVideoWithRelay(request())
  expect(result.success).toBe(true)
  expect(lastBody).toMatchObject({ model: 'provider-video-id', duration: 5, prompt: request().prompt })
  expect(await fs.readFile(path.join(fixture.root, result.relativePath!))).toEqual(video)
  await generateVideoWithRelay(request())
  expect(posts).toBe(1)
  const taskFile = (await fs.readdir(path.join(fixture.root, '.aigc-line/generation-tasks')))[0]
  expect(await fs.readFile(path.join(fixture.root, '.aigc-line/generation-tasks', taskFile), 'utf8')).not.toContain('local-video-test')
})
it('recovers a failed status query without submitting another paid generation', async () => {
  await setup(); failQuery = true
  await expect(generateVideoWithRelay(request())).rejects.toThrow('503')
  failQuery = false
  expect((await generateVideoWithRelay(request())).success).toBe(true)
  expect(posts).toBe(1)
})
it('rejects incomplete endpoint configuration before submitting', async () => {
  await setup()
  ;(fixture.settings.relayVideoConfig as { submitPath: string }).submitPath = ''
  await expect(generateVideoWithRelay(request())).rejects.toThrow('提交')
  expect(posts).toBe(0)
})
it('keeps a submitted task recoverable when the query endpoint returns an authorization error', async () => {
  await setup(); failQuery = true; queryFailureStatus = 401
  await expect(generateVideoWithRelay(request())).rejects.toThrow('401')
  failQuery = false
  expect((await generateVideoWithRelay(request())).success).toBe(true)
  expect(posts).toBe(1)
})
it('rejects project-external references before submitting', async () => {
  await setup()
  await expect(generateVideoWithRelay({ ...request(), referenceImagePaths: ['../outside.png'] })).rejects.toThrow('参考图')
  expect(posts).toBe(0)
})
