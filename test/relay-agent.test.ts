import { afterEach, expect, it } from 'vitest'
import http from 'node:http'
import { tool } from 'ai'
import { z } from 'zod'
import { runRelayAgent } from '../electron/main/services/agent/relay-engine'

const servers: http.Server[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))) })
async function serve(handler: http.RequestListener) {
  const server = http.createServer(handler); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
}
const config = { apiKey: 'local-agent-test', model: 'actual-agent-id', messages: [{ role: 'user' as const, content: '帮我读取画布，再给一个分镜建议。' }] }

it('uses the real AI SDK tool loop, returns tool output to the model and streams its final answer', async () => {
  const requests: any[] = []
  const baseUrl = await serve(async (req, res) => {
    expect(req.url).toBe('/v1/chat/completions')
    expect(req.headers.authorization).toBe('Bearer local-agent-test')
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body)
    res.setHeader('Content-Type', 'text/event-stream')
    const send = (delta: unknown, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: 'chat-test', object: 'chat.completion.chunk', created: 1, model: config.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    if (requests.length === 1) {
      send({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-overview', type: 'function', function: { name: 'GetCanvasOverview', arguments: '{}' } }] })
      send({}, 'tool_calls')
    } else {
      expect(body.messages.find((message: any) => message.role === 'tool')?.content).toContain('教材封面')
      send({ role: 'assistant', content: '建议先展示教材封面，再切换到目录。' })
      send({}, 'stop')
    }
    res.end('data: [DONE]\n\n')
  })
  const deltas: string[] = []
  const result = await runRelayAgent({ ...config, baseUrl, tools: { GetCanvasOverview: tool({ inputSchema: z.object({}), execute: async () => ({ nodes: [{ id: 'book', title: '教材封面' }] }) }) }, onPart: part => { if (part.type === 'text-delta') deltas.push(part.text) } })
  expect(requests).toHaveLength(2)
  expect(requests[0].model).toBe('actual-agent-id')
  expect(deltas.join('')).toContain('教材封面')
  expect(result.text).toContain('目录')
})

it('rejects missing configuration before sending a request and never retries a rejected API call', async () => {
  let requests = 0
  const baseUrl = await serve((_req, res) => { requests++; res.writeHead(401); res.end(JSON.stringify({ error: { message: 'invalid key' } })) })
  await expect(runRelayAgent({ ...config, baseUrl, model: '', tools: {} })).rejects.toThrow('模型')
  expect(requests).toBe(0)
  await expect(runRelayAgent({ ...config, baseUrl, tools: {} })).rejects.toThrow()
  expect(requests).toBe(1)
})
it('allows a local no-auth chat endpoint without adding an Authorization header', async () => {
  let authorization: string | undefined
  const baseUrl = await serve((req, res) => {
    authorization = req.headers.authorization
    res.setHeader('Content-Type', 'text/event-stream')
    res.end(`data: ${JSON.stringify({ id: 'local', object: 'chat.completion.chunk', created: 1, model: config.model, choices: [{ index: 0, delta: { role: 'assistant', content: '无鉴权对话成功' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  expect((await runRelayAgent({ ...config, baseUrl, apiKey: '', tools: {} })).text).toContain('无鉴权对话成功')
  expect(authorization).toBeUndefined()
})

it('honors stop without starting another model request', async () => {
  let requests = 0
  const controller = new AbortController()
  const baseUrl = await serve((_req, res) => {
    requests++
    res.setHeader('Content-Type', 'text/event-stream')
    res.write(`data: ${JSON.stringify({ id: 'slow', object: 'chat.completion.chunk', created: 1, model: config.model, choices: [{ index: 0, delta: { role: 'assistant', content: '正在规划' }, finish_reason: null }] })}\n\n`)
    controller.abort()
  })
  await expect(runRelayAgent({ ...config, baseUrl, tools: {}, signal: controller.signal })).rejects.toThrow()
  expect(requests).toBe(1)
})

it('bounds repeated tool calls at eight steps and reports that another turn is needed', async () => {
  let requests = 0
  const baseUrl = await serve((_req, res) => {
    requests++
    res.setHeader('Content-Type', 'text/event-stream')
    const chunk = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: 'bounded', object: 'chat.completion.chunk', created: 1, model: config.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    res.end(chunk({ role: 'assistant', tool_calls: [{ index: 0, id: `step-${requests}`, type: 'function', function: { name: 'GetCanvasOverview', arguments: '{}' } }] }) + chunk({}, 'tool_calls') + 'data: [DONE]\n\n')
  })
  const result = await runRelayAgent({ ...config, baseUrl, tools: { GetCanvasOverview: tool({ inputSchema: z.object({}), execute: async () => ({ nodes: [] }) }) } })
  expect(requests).toBe(8)
  expect(result.needsContinuation).toBe(true)
})
