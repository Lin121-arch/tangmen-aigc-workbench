import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
const root = path.resolve(import.meta.dirname, '../..')
const shots = path.join(root, '.impeccable/review/luna-media')
test('new media preset discovers seven models, preserves metadata and limits canvas durations without generation', async () => {
  test.setTimeout(90_000)
  let posts = 0
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') posts++
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ images: ['gpt-image-2', 'gpt-image-2.5', 'gpt-image-2.5-flare'].map(id => ({ id, label: id })), videos: [
      { id: 'grok-video-1.5按次', label: 'Grok 视频', durations: [6, 10, 15], aspects: ['16:9', '9:16', '1:1', '4:3'], max_images: 7, resolutions: ['720p', '1080p'] },
      ...['sd-fast', 'Minimax-768', 'MiniMax-1440'].map(id => ({ id, label: id, durations: [5, 10, 15], max_images: 9 })),
    ] }))
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const folder = path.join(root, 'test-results', `media-ui-${randomUUID()}`)
  await fs.mkdir(path.join(folder, 'workspace'), { recursive: true }); await fs.mkdir(shots, { recursive: true })
  let app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    let page = await app.firstWindow(); const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.getByTitle('系统配置', { exact: true }).click()
    const region = page.getByRole('region', { name: '模型服务', exact: true })
    await region.getByLabel('服务商预设', { exact: true }).selectOption('luna-media')
    await region.getByRole('button', { name: '添加服务商', exact: true }).click()
    await expect(region.getByLabel('端点 Base URL', { exact: true })).toHaveValue('https://api.example.invalid')
    await region.getByLabel('服务商通用 API Key', { exact: true }).fill('test-media-key')
    await region.getByLabel('端点 Base URL', { exact: true }).fill(base)
    const endpoints = region.getByLabel('当前端点', { exact: true })
    const ids = await endpoints.locator('option').evaluateAll(els => els.map(e => (e as HTMLOptionElement).value))
    await endpoints.selectOption(ids[1]); await region.getByLabel('端点 Base URL', { exact: true }).fill(base)
    await region.getByRole('button', { name: '读取模型列表', exact: true }).click()
    await expect(region.getByRole('status')).toContainText('3 个图片、4 个视频')
    await region.getByRole('heading', { name: '模型服务', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(shots, 'desktop.png') })
    await page.setViewportSize({ width: 1024, height: 768 })
    expect(await region.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1)
    await region.getByRole('button', { name: '登记全部模型', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(shots, 'user-1024.png') })
    await region.getByRole('button', { name: '登记全部模型', exact: true }).click()
    await expect(region.getByLabel(/^登记模型 /)).toHaveCount(7)
    await region.getByRole('button', { name: '登记全部模型', exact: true }).click()
    await expect(region.getByLabel(/^登记模型 /)).toHaveCount(7)
    await region.getByLabel('默认图片模型', { exact: true }).selectOption({ label: 'Luna 图片／视频新站 · gpt-image-2' })
    await region.getByLabel('默认视频模型', { exact: true }).selectOption({ label: 'Luna 图片／视频新站 · Grok 视频' })
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.getByText('配置已保存，将在下一次生成或 Agent 对话时生效', { exact: true })).toBeVisible()
    const config = (await page.evaluate(() => window.electronAPI.getAppSettings())).modelServices!
    expect(config.providers[0].models[3]).toMatchObject({ durations: [6, 10, 15], referenceLimit: 1 })
    expect(JSON.stringify(config)).not.toContain('test-media-key'); expect(posts).toBe(0)
    await page.evaluate(async ({ folder, workflow }) => {
      const project = await window.electronAPI.createProject('视频时长选项', folder, { provider: 'relay', model: '' })
      await window.electronAPI.saveCanvasSnapshot(folder, { type: 'react-flow', version: 4, nodes: [{ id: 'video', type: 'storyNode', position: { x: 0, y: 0 }, data: { kind: 'video', title: '6秒角色开场', prompt: '自然眨眼', workflowId: workflow, duration: 5, aspectRatio: '9:16' } }], edges: [], viewport: { x: 80, y: 55, zoom: 0.45 } })
      await window.electronAPI.loadProject(project.id)
    }, { folder: path.join(folder, 'workspace'), workflow: config.defaults.video! })
    await page.reload(); await page.getByTitle('添加视频节点', { exact: true }).waitFor()
    await page.locator('.react-flow__node').click()
    const duration = page.getByLabel('视频时长（秒）', { exact: true })
    await expect(duration).toHaveValue('6')
    expect(await duration.locator('option').allTextContents()).toEqual(['6', '10', '15'])
    await duration.selectOption('10'); await expect(duration).toHaveValue('10')
    const box = await duration.boundingBox()
    await page.mouse.move(450, 180)
    await page.keyboard.down('Alt'); await page.mouse.wheel(0, Math.max(0, box!.y - 550) * 2); await page.keyboard.up('Alt')
    await expect(duration).toBeInViewport()
    await page.screenshot({ path: path.join(shots, 'duration-1024.png') })
    expect(posts).toBe(0); expect(errors).toEqual([])
    await app.evaluate(({ app }) => app.exit(0))
    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root }); page = await app.firstWindow()
    expect((await page.evaluate(() => window.electronAPI.getAppSettings())).modelServices).toEqual(config)
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())) }
})
test('verified image site preset fills its standard endpoint and three model capabilities', async () => {
  const folder = path.join(root, 'test-results', `image-site-ui-${randomUUID()}`)
  await fs.mkdir(folder, { recursive: true })
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.getByTitle('系统配置', { exact: true }).click()
    const region = page.getByRole('region', { name: '模型服务', exact: true })
    await region.getByLabel('服务商预设', { exact: true }).selectOption('luna-image-site')
    await region.getByRole('button', { name: '添加服务商', exact: true }).click()
    await expect(region.getByLabel('端点 Base URL', { exact: true })).toHaveValue('https://api.example.invalid/v1')
    await expect(region.getByLabel(/^登记模型 /)).toHaveCount(3)
    await expect(region.getByLabel('模型 3 ID', { exact: true })).toHaveValue('gpt-image-2.5-sunburst')
    await expect(region.getByLabel('模型 3 参考图上限', { exact: true })).toHaveValue('1')
    await region.getByRole('heading', { name: '模型服务', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(shots, 'image-site-desktop.png') })
    await page.setViewportSize({ width: 1024, height: 768 })
    expect(await region.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(shots, 'image-site-1024.png') })
    await region.getByLabel('默认图片模型', { exact: true }).selectOption({ label: 'Luna 图片专站 · image-2' })
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    const config = (await page.evaluate(() => window.electronAPI.getAppSettings())).modelServices!
    expect(config.providers[0].models.map(m => m.referenceLimit)).toEqual([0, 0, 1])
    expect(config.defaults.image).toBeTruthy()
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined) }
})
