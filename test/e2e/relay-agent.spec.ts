import { test, expect, _electron as electron } from '@playwright/test'
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '../..')

test('relay Agent config, real SDK canvas tools, documents, history, stop and context clear work in Electron', async () => {
  test.setTimeout(90_000)
  let requests = 0
  let toolNames: string[] = []
  let latestMessages: any[] = []
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/v1/chat/completions' || req.headers.authorization !== 'Bearer agent-e2e-local-only') { res.writeHead(401); res.end('{}'); return }
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests++; latestMessages = body.messages
    toolNames = body.tools?.map((entry: any) => entry.function.name) ?? []
    res.setHeader('Content-Type', 'text/event-stream')
    const send = (delta: unknown, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: `test-${requests}`, object: 'chat.completion.chunk', created: 1, model: 'local-creative-agent', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    const call = (name: string, args: unknown) => { send({ role: 'assistant', tool_calls: [{ index: 0, id: `call-${requests}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }); send({}, 'tool_calls'); res.end('data: [DONE]\n\n') }
    const user = body.messages.filter((message: any) => message.role === 'user').at(-1)?.content ?? ''
    if (user.includes('测试停止')) { send({ role: 'assistant', content: '正在逐步检查创作方向…' }); return }
    if (user.includes('新上下文')) { send({ role: 'assistant', content: '这是新的创作上下文。' }); send({}, 'stop'); res.end('data: [DONE]\n\n'); return }
    const completed = body.messages.filter((message: any) => message.role === 'tool').length
    if (completed === 0) return call('GetCanvasOverview', {})
    if (completed === 1) return call('CreateCanvasNodes', { nodes: [
      { id: 'agent-book-image', kind: 'image', title: '原创学习搭档', prompt: '原创二次元学习搭档与教材封面，保持教材实物信息准确', aspectRatio: '9:16', position: { x: 120, y: 100 } },
      { id: 'agent-book-video', kind: 'video', title: '教材导览片段', prompt: '先展示教材封面，再自然切到目录，不夸大教学效果', aspectRatio: '9:16', duration: 5, position: { x: 650, y: 100 } },
    ] })
    if (completed === 2) return call('ConnectCanvasNodes', { connections: [{ source: 'agent-book-image', target: 'agent-book-video' }] })
    if (completed === 3) return call('SaveProjectNote', { title: '教材视频执行清单', content: '# 教材视频执行清单\n\n1. 确认教材资料。\n2. 检查角色参考图。\n3. 在节点确认生成。' })
    send({ role: 'assistant', content: '已创建两个创作节点并连接参考图，执行清单已经保存。请检查提示词后在节点中确认生成。' })
    send({}, 'stop'); res.end('data: [DONE]\n\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const folder = path.join(root, 'test-results', `agent-${randomUUID()}`)
  await fs.mkdir(path.join(folder, 'workspace'), { recursive: true })
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  const errors: string[] = []
  try {
    const page = await app.firstWindow()
    page.on('pageerror', error => errors.push(error.message))
    await page.getByTitle('系统配置', { exact: true }).click()
    await page.getByLabel('创作助手 API 地址', { exact: true }).fill(`http://127.0.0.1:${(server.address() as { port: number }).port}/v1/chat/completions`)
    await page.getByLabel('创作助手模型 ID', { exact: true }).fill('local-creative-agent')
    await page.getByLabel('创作助手 API Key', { exact: true }).fill('agent-e2e-local-only')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.getByText('配置已保存，API Key 持久化校验通过')).toBeVisible()
    await expect(page.getByLabel('创作助手 API Key', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('创作助手 API 地址', { exact: true })).toHaveValue(`http://127.0.0.1:${(server.address() as { port: number }).port}/v1`)
    expect(requests).toBe(0)
    const settingsFile = await fs.readFile(path.join(folder, 'profile/aigc-line/settings.json'), 'utf8')
    expect(settingsFile).not.toContain('agent-e2e-local-only')
    await page.getByTitle('返回首页', { exact: true }).click()
    const project = await page.evaluate(async workspace => {
      const project = await window.electronAPI.createProject('Agent 实操验证', workspace, { provider: 'codex', model: '' })
      await window.electronAPI.loadProject(project.id)
      return project
    }, path.join(folder, 'workspace'))
    await page.reload()
    await page.getByLabel('切换创作助手', { exact: true }).selectOption('relay')
    await expect(page.getByLabel('切换创作助手', { exact: true })).toHaveValue('relay')
    await expect(page.getByLabel('切换创作助手', { exact: true })).toBeEnabled()
    const input = page.getByPlaceholder('描述你的想法，输入 / 使用 Skill，或添加文件…')
    await input.fill('用原创二次元学习搭档做一个教材导览视频，创建参考图和视频节点，连接起来并保存执行清单。')
    await page.getByTitle('发送', { exact: true }).click()
    await expect(page.getByText('已创建两个创作节点并连接参考图，执行清单已经保存。请检查提示词后在节点中确认生成。', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByLabel('切换创作助手', { exact: true })).toBeEnabled()
    expect(requests).toBe(5)
    expect(toolNames).toContain('CreateCanvasNodes')
    expect(toolNames).not.toContain('InvokeNodeAction')
    expect(toolNames).not.toContain('AnalyzeVideo')
    expect(latestMessages[0].content).toContain('你是唐门AI创作工作台')
    await expect.poll(async () => {
      const saved = await page.evaluate(folder => window.electronAPI.loadCanvasSnapshot(folder), project.folderPath) as { edges?: unknown[] } | null
      return saved?.edges?.length ?? 0
    }).toBe(1)
    const snapshot = await page.evaluate(folder => window.electronAPI.loadCanvasSnapshot(folder), project.folderPath) as { nodes: Array<{ id: string }>; edges: Array<{ source: string; target: string }> }
    expect(snapshot.nodes.map(node => node.id)).toEqual(expect.arrayContaining(['agent-book-image', 'agent-book-video']))
    expect(snapshot.edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'agent-book-image', target: 'agent-book-video' })]))
    const notes = await fs.readdir(path.join(project.folderPath, 'generated/agent-notes'))
    expect(notes).toHaveLength(1)
    expect(await fs.readFile(path.join(project.folderPath, 'generated/agent-notes', notes[0]), 'utf8')).toContain('确认教材资料')
    const history = await page.evaluate(folder => window.electronAPI.loadChatHistory(folder), project.folderPath)
    expect(history.filter(message => message.toolCall).map(message => message.toolCall?.status)).toEqual(['completed', 'completed', 'completed', 'completed'])
    expect(history.some(message => message.artifact?.title === '教材视频执行清单')).toBe(true)
    expect(JSON.stringify(history)).not.toContain('agent-e2e-local-only')
    await page.screenshot({ path: path.join(folder, 'agent-workbench.png') })
    await page.reload()
    await expect(page.getByLabel('切换创作助手', { exact: true })).toHaveValue('relay')
    await expect(page.getByText('已创建两个创作节点并连接参考图，执行清单已经保存。请检查提示词后在节点中确认生成。', { exact: true })).toBeVisible()
    expect(requests).toBe(5)
    await input.fill('测试停止')
    await page.getByTitle('发送', { exact: true }).click()
    await expect(page.getByText('正在逐步检查创作方向…', { exact: true })).toBeVisible()
    await page.getByTitle('停止当前回合', { exact: true }).click()
    await expect(page.getByText('已停止当前回合。已经完成的画布操作和文档仍然保留，可继续检查或修改。', { exact: true })).toBeVisible()
    await expect(page.getByLabel('切换创作助手', { exact: true })).toBeEnabled()
    const cleared = await page.evaluate(id => window.electronAPI.clearAgentContext(id), project.id)
    expect(cleared.success).toBe(true)
    await input.fill('新上下文')
    await page.getByTitle('发送', { exact: true }).click()
    await expect(page.getByText('这是新的创作上下文。', { exact: true })).toBeVisible()
    expect(latestMessages.filter(message => message.role === 'user')).toHaveLength(1)
    expect(requests).toBe(7)
    expect(errors).toEqual([])
  } finally {
    await app.evaluate(({ app }) => app.exit(0))
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
