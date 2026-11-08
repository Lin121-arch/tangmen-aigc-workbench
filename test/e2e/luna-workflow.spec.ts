import { test, expect, _electron as electron } from '@playwright/test'
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '../..')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI/wAAAAASUVORK5CYII=', 'base64')

test('Luna settings, image node generation and persisted output work through real Electron IPC', async () => {
  test.setTimeout(60_000)
  let posts = 0
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer e2e-local-only') { res.writeHead(401); res.end('{}'); return }
    if (req.url === '/v1/images/batches/models') { res.end(JSON.stringify({ data: [{ id: 'gemini-3-pro-image' }] })); return }
    if (req.method === 'POST' && req.url === '/v1/images/batches') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      if (!body.items?.[0]?.prompt) { res.writeHead(400); res.end('{}'); return }
      posts++; res.end(JSON.stringify({ id: 'e2e-batch', status: 'queued' })); return
    }
    if (req.url === '/v1/images/batches/e2e-batch') { res.end(JSON.stringify({ status: 'completed', success_count: 1 })); return }
    if (req.url === '/v1/images/batches/e2e-batch/items') { res.end(JSON.stringify({ data: [{ custom_id: 'tm_image', status: 'succeeded' }] })); return }
    if (req.url === '/v1/images/batches/e2e-batch/items/tm_image/content?image_index=0') { res.setHeader('Content-Type', 'image/png'); res.end(png); return }
    res.writeHead(404); res.end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const folder = path.join(root, 'test-results', `luna-${randomUUID()}`)
  await fs.mkdir(path.join(folder, 'workspace'), { recursive: true })
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  const errors: string[] = []
  try {
    const page = await app.firstWindow()
    page.on('pageerror', error => errors.push(error.message))
    await page.getByTitle('系统配置', { exact: true }).click()
    await page.getByLabel('Luna API 地址', { exact: true }).fill(`http://127.0.0.1:${(server.address() as { port: number }).port}`)
    await page.getByLabel('Luna API Key', { exact: true }).fill('e2e-local-only')
    await page.getByRole('button', { name: '读取 Luna 可用模型', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '已读取 1 个' })).toBeVisible()
    expect(posts).toBe(0)
    await expect(page.getByLabel('Luna 生图模型', { exact: true })).toHaveValue('gemini-3-pro-image')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.getByText('配置已保存，API Key 持久化校验通过')).toBeVisible()
    await expect(page.getByLabel('Luna API Key', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: /^Luna · gemini-3-pro-image/ }).click()
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.getByText('有未保存修改', { exact: true })).toHaveCount(0)
    await page.getByTitle('返回首页', { exact: true }).click()
    const project = await page.evaluate(async folder => {
      const result = await window.electronAPI.createProject('Luna 生图端到端测试', folder, { provider: 'codex', model: '' })
      await window.electronAPI.loadProject(result.id)
      return result
    }, path.join(folder, 'workspace'))
    await page.reload()
    await page.getByTitle('添加图片节点', { exact: true }).click()
    const prompt = page.getByPlaceholder('描述你想要生成的画面内容，连接其他节点可引用素材…')
    await prompt.fill('原创二次元学习搭档，不含教材文字')
    await expect(page.getByText('API 请求 · 1K', { exact: true })).toBeVisible()
    await page.getByTitle('使用所选模型生成图片', { exact: true }).click()
    await expect.poll(() => posts).toBe(1)
    await expect.poll(async () => {
      const tasks = await page.evaluate(id => window.electronAPI.listGenerationTasks(id), project.id)
      return tasks.some(task => task.status === 'succeeded' && task.acknowledged)
    }).toBe(true)
    const snapshot = await page.evaluate(folder => window.electronAPI.loadCanvasSnapshot(folder), project.folderPath) as { nodes: Array<{ data: { sourcePath: string; generationStatus: string } }> }
    expect(snapshot.nodes).toHaveLength(1)
    expect(snapshot.nodes[0].data.generationStatus).toBe('idle')
    expect(await fs.readFile(path.join(project.folderPath, snapshot.nodes[0].data.sourcePath))).toEqual(png)
    await page.reload()
    await page.getByTitle('添加图片节点', { exact: true }).waitFor()
    expect(posts).toBe(1)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.getByTitle('添加图片节点', { exact: true }).click()
    await page.getByTitle('使用所选模型生成图片', { exact: true }).click({ trial: true })
    expect(posts).toBe(1)
    expect(errors).toEqual([])
  } finally {
    // Cleanup must not wait for a native unsaved-settings dialog after an assertion fails.
    await app.evaluate(({ app }) => app.exit(0))
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('custom video models and protocol can be configured, reopened, selected and removed without generation', async () => {
  const folder = path.join(root, 'test-results', `video-config-${randomUUID()}`)
  await fs.mkdir(path.join(folder, 'workspace'), { recursive: true })
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    const page = await app.firstWindow()
    await page.getByTitle('系统配置', { exact: true }).click()
    await page.getByRole('button', { name: '添加视频模型', exact: true }).click()
    await page.getByLabel('视频模型 1 显示名称', { exact: true }).fill('我的 H3 视频')
    await page.getByLabel('视频模型 1 ID', { exact: true }).fill('actual-video-id')
    await page.getByLabel('中转视频 API Key', { exact: true }).fill('video-local-only')
    await page.getByText('高级配置 · 按中转站文档填写提交与查询协议', { exact: true }).click()
    await page.getByLabel('视频提交路径', { exact: true }).fill('/my/create')
    await page.getByLabel('视频查询路径', { exact: true }).fill('/my/query/{id}')
    await page.getByLabel('任务 ID 返回字段', { exact: true }).fill('data.task_id')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.getByText('配置已保存，API Key 持久化校验通过')).toBeVisible()
    await expect(page.getByLabel('中转视频 API Key', { exact: true })).toHaveValue('')
    await page.getByTitle('返回首页', { exact: true }).click()
    await page.getByTitle('系统配置', { exact: true }).click()
    await expect(page.getByLabel('视频模型 1 显示名称', { exact: true })).toHaveValue('我的 H3 视频')
    await page.getByText('高级配置 · 按中转站文档填写提交与查询协议', { exact: true }).click()
    await expect(page.getByLabel('任务 ID 返回字段', { exact: true })).toHaveValue('data.task_id')
    await page.getByTitle('返回首页', { exact: true }).click()
    await page.evaluate(async folder => {
      const project = await window.electronAPI.createProject('自定义视频配置测试', folder, { provider: 'codex', model: '' })
      await window.electronAPI.loadProject(project.id)
    }, path.join(folder, 'workspace'))
    await page.reload()
    await page.getByTitle('添加视频节点', { exact: true }).click()
    await page.getByTitle('选择视频生成模型', { exact: true }).click()
    await page.getByRole('button', { name: '中转 · 我的 H3 视频 自定义 API', exact: true }).click()
    await expect(page.getByText('按接口配置', { exact: true })).toBeVisible()
    await expect(page.getByTitle('使用中转接口生成视频', { exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await page.getByTitle('系统配置', { exact: true }).click()
    await page.getByLabel('移除视频模型 1', { exact: true }).click()
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.getByText('有未保存修改', { exact: true })).toHaveCount(0)
    const available = await page.evaluate(() => window.electronAPI.listComfyWorkflows())
    expect(available.some(item => item.id.startsWith('relay-video:'))).toBe(false)
  } finally { await app.evaluate(({ app }) => app.exit(0)) }
})
