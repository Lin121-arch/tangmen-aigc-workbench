import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
const root = path.resolve(import.meta.dirname, '../..')
const shots = path.join(root, '.impeccable/review/model-services')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI/wAAAAASUVORK5CYII='
test('independent provider settings, defaults, template bindings, image protocols and reopen work in Electron', async () => {
  test.setTimeout(120_000)
  const calls: { url?: string; key?: string; model?: string }[] = []
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url?.endsWith('/models')) { res.end('{"data":[{"id":"real-image-id"}]}'); return }
    const buffers = []; for await (const chunk of req) buffers.push(chunk)
    const body = JSON.parse(Buffer.concat(buffers).toString() || '{}')
    calls.push({ url: req.url, key: req.headers.authorization || req.headers['x-goog-api-key'] as string, model: body.model })
    res.setHeader('Content-Type', 'application/json')
    if (req.url?.includes(':generateContent')) res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] }))
    else res.end(JSON.stringify({ data: [{ b64_json: png }] }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const folder = path.join(root, 'test-results', `models-${randomUUID()}`)
  await fs.mkdir(path.join(folder, 'workspace'), { recursive: true }); await fs.mkdir(shots, { recursive: true })
  let app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    let page = await app.firstWindow(); const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.getByRole('button', { name: '模型与设置', exact: true }).click()
    const section = page.getByRole('region', { name: '模型服务', exact: true })
    await expect(section).toContainText('从你已有的模型服务开始')
    for (const id of ['a', 'b']) {
      await section.getByRole('button', { name: '添加服务商', exact: true }).click()
      await section.getByLabel('服务商名称', { exact: true }).fill(`渠道 ${id.toUpperCase()}`)
      await section.getByLabel('服务商通用 API Key', { exact: true }).fill(`local-key-${id}`)
      await section.getByLabel('接口协议', { exact: true }).selectOption('openai-image')
      await section.getByLabel('端点 Base URL', { exact: true }).fill(`${url}/${id}/v1`)
      await section.getByRole('button', { name: '读取模型列表', exact: true }).click()
      await expect(section.getByRole('status')).toContainText('已读取 1 个模型名称')
      await section.getByRole('button', { name: '登记此模型', exact: true }).click()
      await section.getByLabel('模型 1 名称', { exact: true }).fill('日常图片')
    }
    await section.getByLabel('默认图片模型', { exact: true }).selectOption({ label: '渠道 B · 日常图片' })
    await section.getByLabel('服务商预设', { exact: true }).selectOption('google')
    await section.getByRole('button', { name: '添加服务商', exact: true }).click()
    await section.getByLabel('服务商通用 API Key', { exact: true }).fill('local-google-key')
    await section.getByLabel('端点 Base URL', { exact: true }).fill(`${url}/google/v1`)
    await section.getByRole('button', { name: '手动添加模型', exact: true }).click()
    await section.getByLabel('模型 1 名称', { exact: true }).fill('原生图片')
    await section.getByLabel('模型 1 ID', { exact: true }).fill('actual-gemini-image')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.getByText('配置已保存，将在下一次生成或 Agent 对话时生效', { exact: true })).toBeVisible()
    expect(calls).toHaveLength(0)
    const saved = await page.evaluate(() => window.electronAPI.getAppSettings())
    expect(saved.modelServices?.providers).toHaveLength(3)
    expect(JSON.stringify(saved.modelServices)).not.toContain('local-key-')
    const stored = await fs.readFile(path.join(folder, 'profile/aigc-line/model-services.json'), 'utf8')
    expect(stored).not.toContain('local-key-'); expect(stored).not.toContain('local-google-key')
    await section.getByRole('button', { name: /^渠道 B/ }).click()
    await section.getByRole('heading', { name: '模型服务', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(shots, 'desktop.png') })
    await page.setViewportSize({ width: 1024, height: 768 })
    expect(await section.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(shots, 'user-1024.png') })
    await section.getByLabel('默认图片模型', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(shots, 'models-1024.png') })
    await page.getByTitle('返回首页', { exact: true }).click()
    await page.getByRole('button', { name: '新建项目', exact: true }).first().click()
    const create = page.getByRole('dialog', { name: '新建项目', exact: true })
    await create.getByLabel('起步模板', { exact: true }).selectOption('anime-character')
    await expect(create.getByLabel('模板图片模型（统一应用）', { exact: true })).toHaveValue(saved.modelServices!.defaults.image!)
    await create.getByRole('button', { name: '取消', exact: true }).click()
    const project = await page.evaluate(async ({ workspace, model }) => window.electronAPI.createProject('多服务商验证', workspace, { provider: 'relay', model: '' }, 'anime-character', { imageWorkflowId: model }), { workspace: path.join(folder, 'workspace'), model: saved.modelServices!.defaults.image! })
    for (const [index, provider] of saved.modelServices!.providers.entries()) {
      const model = provider.models[0]
      const result = await page.evaluate(request => window.electronAPI.generateImage(request), { projectId: project.id, nodeId: `provider-${index}`, workflowId: `service-model:${provider.id}:${model.id}`, prompt: '接口实测', aspectRatio: '9:16' as const })
      expect(result.success, result.error).toBe(true)
    }
    expect(calls).toHaveLength(3)
    expect(calls[0]).toMatchObject({ key: 'Bearer local-key-a', url: '/a/v1/images/generations', model: 'real-image-id' })
    expect(calls[1]).toMatchObject({ key: 'Bearer local-key-b', url: '/b/v1/images/generations' })
    expect(calls[2]).toMatchObject({ key: 'local-google-key', url: '/google/v1/models/actual-gemini-image:generateContent' })
    await app.evaluate(({ app }) => app.exit(0))
    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root }); page = await app.firstWindow()
    const reloaded = await page.evaluate(() => window.electronAPI.getAppSettings())
    expect(reloaded.modelServices).toEqual(saved.modelServices)
    expect(calls).toHaveLength(3); expect(errors).toEqual([])
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined); await new Promise<void>(resolve => server.close(() => resolve())) }
})
test('registered local chat, newly added node defaults and legacy aliases use the registry', async () => {
  test.setTimeout(60_000)
  let chatKey: string | undefined; let imageKey: string | undefined; let imagePosts = 0
  const server = http.createServer(async (req, res) => {
    if (req.url === '/v1/chat/completions') {
      chatKey = req.headers.authorization; res.setHeader('Content-Type', 'text/event-stream')
      res.end(`data: ${JSON.stringify({ id: 'local', object: 'chat.completion.chunk', created: 1, model: 'local-chat', choices: [{ index: 0, delta: { role: 'assistant', content: '已使用登记的本地创作助手。' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`); return
    }
    imagePosts++; imageKey = req.headers.authorization; res.end(JSON.stringify({ data: [{ b64_json: png }] }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
  const folder = path.join(root, 'test-results', `models-chat-${randomUUID()}`)
  await fs.mkdir(path.join(folder, 'workspace'), { recursive: true })
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    const page = await app.firstWindow()
    const project = await page.evaluate(async ({ workspace, url }) => {
      const old = await window.electronAPI.getAppSettings()
      await window.electronAPI.saveAppSettings({ ...old, modelServices: { version: 1, providers: [{ id: 'local', name: '本地服务', enabled: true, endpoints: [{ id: 'chat', protocol: 'chat-completions', baseUrl: url }, { id: 'image', protocol: 'openai-image', baseUrl: url, apiKey: 'registered-image-key' }], models: [{ id: 'chat', name: '本地助手', modelId: 'local-chat', endpointId: 'chat', capabilities: ['chat', 'tools'], referenceLimit: 0 }, { id: 'image', name: '登记图片', modelId: 'real-image', endpointId: 'image', capabilities: ['image'], referenceLimit: 0 }] }], defaults: { chat: 'service-model:local:chat', image: 'service-model:local:image' }, legacyAliases: { 'luna-batch-image': 'service-model:local:image' } } })
      const project = await window.electronAPI.createProject('登记助手验证', workspace, { provider: 'relay', model: '' })
      await window.electronAPI.loadProject(project.id); return project
    }, { workspace: path.join(folder, 'workspace'), url })
    await page.reload(); await page.getByRole('button', { name: '无限画布', exact: true }).click(); await page.getByTitle('添加图片节点', { exact: true }).waitFor()
    await page.getByTitle('添加图片节点', { exact: true }).click()
    const input = page.getByPlaceholder('描述你的想法，输入 / 使用 Skill，或添加文件…')
    await input.fill('请确认使用登记的助手。'); await page.getByTitle('发送', { exact: true }).click()
    await expect(page.getByText('已使用登记的本地创作助手。', { exact: true })).toBeVisible()
    expect(chatKey).toBeUndefined()
    await page.getByRole('button', { name: '返回', exact: true }).click()
    const snapshot = await page.evaluate(folder => window.electronAPI.loadCanvasSnapshot(folder), project.folderPath) as any
    expect(snapshot.nodes[0].data.workflowId).toBe('service-model:local:image')
    const result = await page.evaluate(id => window.electronAPI.generateImage({ projectId: id, nodeId: 'legacy-alias', workflowId: 'luna-batch-image', prompt: '迁移后旧节点', aspectRatio: '1:1' }), project.id)
    expect(result.success, result.error).toBe(true); expect(imageKey).toBe('Bearer registered-image-key'); expect(imagePosts).toBe(1)
    await page.evaluate(async () => { const old = await window.electronAPI.getAppSettings(); const config = old.modelServices!; await window.electronAPI.saveAppSettings({ ...old, modelServices: { ...config, defaults: {}, providers: config.providers.map(p => ({ ...p, enabled: false })) } }) })
    const disabled = await page.evaluate(id => window.electronAPI.generateImage({ projectId: id, nodeId: 'different-old-node', workflowId: 'luna-batch-image', prompt: '停用检查', aspectRatio: '1:1' }), project.id)
    expect(disabled.success).toBe(false); expect(disabled.error).toContain('停用'); expect(imagePosts).toBe(1)
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined); await new Promise<void>(resolve => server.close(() => resolve())) }
})
test('protocol changes clear invalid defaults, save feedback stays visible and discovery results cannot cross providers', async () => {
  test.setTimeout(60_000)
  let finishDiscovery: (() => void) | undefined
  const server = http.createServer((_req, res) => { finishDiscovery = () => res.end('{"data":[{"id":"only-provider-a"}]}') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
  const folder = path.join(root, 'test-results', `models-states-${randomUUID()}`); await fs.mkdir(folder, { recursive: true })
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    const page = await app.firstWindow()
    await page.evaluate(async url => { const old = await window.electronAPI.getAppSettings(); await window.electronAPI.saveAppSettings({ ...old, modelServices: { version: 1, legacyAliases: {}, defaults: { chat: 'service-model:a:m' }, providers: ['a', 'b'].map(id => ({ id, name: `渠道 ${id.toUpperCase()}`, enabled: true, endpoints: [{ id: 'api', protocol: 'chat-completions', baseUrl: url }], models: [{ id: 'm', name: '登记模型', modelId: 'actual-id', endpointId: 'api', capabilities: ['chat', 'tools'], referenceLimit: 0 }] })) } }) }, url)
    await page.getByRole('button', { name: '模型与设置', exact: true }).click()
    const section = page.getByRole('region', { name: '模型服务', exact: true })
    await section.getByLabel('接口协议', { exact: true }).selectOption('openai-image')
    await expect(section.getByLabel('默认对话模型', { exact: true })).toHaveValue('')
    await expect(section.getByText('已取消不再适用的默认模型，请在下方“默认用途”重新选择。', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    const status = page.locator('header [role="status"]'); await expect(status).toContainText('配置已保存')
    expect((await status.boundingBox())!.y).toBeLessThan(120)
    let config = (await page.evaluate(() => window.electronAPI.getAppSettings())).modelServices!
    expect(config.providers[0].models[0].capabilities).toEqual(['image'])
    await section.getByRole('button', { name: /^渠道 B/ }).click()
    await section.getByLabel('默认对话模型', { exact: true }).selectOption('service-model:b:m')
    await section.getByLabel('支持工具调用', { exact: true }).uncheck()
    await expect(section.getByLabel('默认对话模型', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: '保存配置', exact: true }).click(); await expect(status).toContainText('配置已保存')
    await section.getByRole('button', { name: /^渠道 A/ }).click()
    await section.getByRole('button', { name: '读取模型列表', exact: true }).click()
    await expect.poll(() => !!finishDiscovery).toBe(true)
    await section.getByRole('button', { name: /^渠道 B/ }).click()
    finishDiscovery!(); await page.waitForTimeout(150)
    await expect(section.getByLabel('发现的模型', { exact: true })).toHaveCount(0)
    await expect(section.getByRole('button', { name: '读取模型列表', exact: true })).toBeEnabled()
    config = (await page.evaluate(() => window.electronAPI.getAppSettings())).modelServices!
    expect(config.providers[1].models[0].capabilities).toEqual(['chat'])
    await section.getByRole('heading', { name: '模型服务', exact: true }).scrollIntoViewIfNeeded()
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.screenshot({ path: path.join(shots, 'states-1024.png') })
  } finally { finishDiscovery?.(); await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
