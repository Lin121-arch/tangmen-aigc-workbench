import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ root: '', settings: { lunaBaseUrl: '', lunaApiKey: 'test-secret', lunaImageModel: 'gemini-3-pro-image' } }))
vi.mock('../electron/main/services/project.store', () => ({ loadProject: async (id: string) => ({ id, folderPath: fixture.root }) }))
vi.mock('../electron/main/services/settings.service', () => ({ getRuntimeSettings: async () => fixture.settings }))

import { generateImageWithLuna, normalizeLunaBaseUrl, queryLunaModels } from '../electron/main/services/luna-image.service'
import { acknowledgeGenerationTaskResult } from '../electron/main/services/generation-task.service'

let server: http.Server | undefined
let postCount = 0
let submitted: Record<string, unknown> | undefined
let failQuery = false
let queryFailureStatus = 503
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI/wAAAAASUVORK5CYII=', 'base64')

async function setup() {
  fixture.root = await fs.mkdtemp(path.join(os.tmpdir(), 'tangmen-luna-test-'))
  postCount = 0
  submitted = undefined
  failQuery = false
  queryFailureStatus = 503
  server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer test-secret') { res.writeHead(401); res.end('{}'); return }
    if (req.url === '/v1/images/batches/models') { res.end(JSON.stringify({ data: [{ id: 'gemini-3-pro-image' }] })); return }
    if (req.url === '/v1/images/batches' && req.method === 'POST') {
      postCount++
      const buffers: Buffer[] = []
      for await (const chunk of req) buffers.push(Buffer.from(chunk))
      submitted = JSON.parse(Buffer.concat(buffers).toString())
      res.end(JSON.stringify({ id: 'batch-1', status: 'queued' })); return
    }
    if (req.url === '/v1/images/batches/batch-1') {
      if (failQuery) { res.writeHead(queryFailureStatus); res.end('{"error":{"message":"temporarily offline"}}'); return }
      res.end(JSON.stringify({ id: 'batch-1', status: 'completed', success_count: 1, fail_count: 0 })); return
    }
    if (req.url === '/v1/images/batches/batch-1/items') {
      res.end(JSON.stringify({ data: [{ custom_id: 'tm_image', status: 'succeeded' }] })); return
    }
    if (req.url === '/v1/images/batches/batch-1/items/tm_image/content?image_index=0') {
      res.setHeader('Content-Type', 'image/png'); res.end(png); return
    }
    res.writeHead(404); res.end('{}')
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  fixture.settings.lunaBaseUrl = `http://127.0.0.1:${address.port}/v1`
}

afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
  if (fixture.root) await fs.rm(fixture.root, { recursive: true, force: true })
  server = undefined
})

const request = () => ({ projectId: 'p1', nodeId: 'image-1', workflowId: 'luna-batch-image', prompt: ' 原创学习搭档 ', aspectRatio: '9:16' as const })

describe('Luna batch image integration', () => {
  it('normalizes the user site to the v1 API without duplicating endpoint suffixes', () => {
    expect(normalizeLunaBaseUrl(' https://api.example.invalid/ ')).toBe('https://api.example.invalid/v1')
    expect(normalizeLunaBaseUrl('https://api.example.invalid/v1/images/batches/')).toBe('https://api.example.invalid/v1')
    expect(() => normalizeLunaBaseUrl('file:///etc/passwd')).toThrow()
  })

  it('lists models without creating a paid generation task', async () => {
    await setup()
    expect(await queryLunaModels(fixture.settings.lunaBaseUrl, 'test-secret')).toEqual(['gemini-3-pro-image'])
    expect(postCount).toBe(0)
  })

  it('persists a remote task, saves its image and reuses unacknowledged output without another POST', async () => {
    await setup()
    const result = await generateImageWithLuna(request())
    expect(result.success).toBe(true)
    expect(result.promptId).toBe('batch-1')
    expect(await fs.readFile(path.join(fixture.root, result.relativePath!))).toEqual(png)
    expect(submitted).toMatchObject({ model: 'gemini-3-pro-image', response_mime_type: 'image/png', items: [{ custom_id: 'tm_image', prompt: '原创学习搭档\n画面比例：9:16。', output_count: 1 }] })
    await generateImageWithLuna(request())
    expect(postCount).toBe(1)
    const files = await fs.readdir(path.join(fixture.root, '.aigc-line/generation-tasks'))
    const stored = await fs.readFile(path.join(fixture.root, '.aigc-line/generation-tasks', files[0]), 'utf8')
    expect(stored).not.toContain('test-secret')
    await acknowledgeGenerationTaskResult('p1', 'image-1', 'batch-1')
  })

  it('resumes a submitted task after an unavailable query without generating and charging a second time', async () => {
    await setup(); failQuery = true
    await expect(generateImageWithLuna(request())).rejects.toThrow('503')
    failQuery = false
    expect((await generateImageWithLuna(request())).success).toBe(true)
    expect(postCount).toBe(1)
  })

  it('rejects project-external reference files before posting a task', async () => {
    await setup()
    await expect(generateImageWithLuna({ ...request(), referenceImagePaths: ['../external.png'] })).rejects.toThrow()
    expect(postCount).toBe(0)
  })
  it('does not resubmit an existing batch after a query authorization failure', async () => {
    await setup(); failQuery = true; queryFailureStatus = 401
    await expect(generateImageWithLuna(request())).rejects.toThrow('401')
    failQuery = false
    expect((await generateImageWithLuna(request())).success).toBe(true)
    expect(postCount).toBe(1)
  })
})
