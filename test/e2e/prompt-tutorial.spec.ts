import { test, expect, chromium } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
let server: ViteDevServer
let origin: string
test.beforeAll(async () => {
  server = await createServer({ configFile: false, root, plugins: [react(), tailwindcss()], server: { host: '127.0.0.1', port: 0 }, resolve: { extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'] } })
  server.middlewares.use('/tutorial-test', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(await server.transformIndexHtml('/tutorial-test', `<!doctype html><html lang="zh-CN"><head><title>提示词教程界面测试</title></head><body><div id="root" style="height:100vh"></div><script type="module">import React from 'react';import{createRoot}from 'react-dom/client';import '/src/index.css';import{HomePage}from '/src/pages/HomePage.tsx';createRoot(document.getElementById('root')).render(React.createElement(HomePage));</script></body></html>`))
  })
  await server.listen()
  origin = server.resolvedUrls!.local[0]
})
test.afterAll(async () => { await server?.close() })

test('learners can read offline lessons, copy prompts, recover from clipboard denial and reopen independently', async () => {
  test.setTimeout(100_000)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const errors: string[] = []
  const paidRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.method() === 'POST' && /generations|video-tasks|image-tasks/.test(request.url())) paidRequests.push(request.url()) })
  await page.addInitScript(() => { (window as any).electronAPI = { searchProjects: async () => ({ projects: [], total: 0, page: 1, pageSize: 18 }) } })
  const shots = path.join(root, '.impeccable/review/prompt-tutorial')
  await fs.mkdir(shots, { recursive: true })
  try {
    await page.goto(`${origin}tutorial-test`)
    await page.getByRole('heading', { name: '我的项目', exact: true }).waitFor()
    await page.getByRole('button', { name: '提示词教程', exact: true }).click({ timeout: 5000 })
    const guide = page.getByRole('dialog', { name: '提示词教程', exact: true })
    await expect(guide.getByRole('heading', { name: '把任务说清楚，再让 AI 动手', exact: true })).toBeVisible()
    await guide.getByRole('button', { name: '复制提示词', exact: true }).click()
    await expect(guide.getByRole('status')).toContainText('已复制')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('输入资料')
    await page.screenshot({ path: path.join(shots, 'desktop.png') })
    await guide.getByRole('button', { name: '2. 角色设定', exact: true }).click()
    await expect(guide.getByLabel('本节提示词')).toHaveValue(/20岁成年女性/)
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied') } } }))
    await guide.getByRole('button', { name: '复制提示词', exact: true }).click()
    await expect(guide.getByRole('status')).toContainText('手动复制')
    await page.setViewportSize({ width: 1024, height: 768 })
    for (let chapter = 3; chapter <= 7; chapter++) {
      await guide.getByRole('button', { name: new RegExp(`^${chapter}\\.`) }).click()
      await expect(guide.locator('h3').first()).toBeVisible()
      expect(await guide.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    }
    await guide.getByRole('button', { name: '4. 参考图修改', exact: true }).click()
    await page.screenshot({ path: path.join(shots, 'user-1024.png') })
    await guide.getByText('开源来源与许可', { exact: true }).click()
    await expect(guide).toContainText('79750')
    await expect(guide).toContainText('10373')
    await expect(guide).toContainText('CC BY 4.0')
    await guide.getByText('查看提示词要素原文', { exact: true }).click()
    await expect(guide).toContainText('指定输出的类型或格式')
    await page.screenshot({ path: path.join(shots, 'sources-1024.png') })
    await page.keyboard.press('Escape')
    await expect(guide).toHaveCount(0)
    await expect(page.getByRole('button', { name: '提示词教程', exact: true })).toBeFocused()
    await page.getByRole('button', { name: '新手教程', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '新手教程', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '提示词教程', exact: true }).click()
    await expect(guide.getByRole('heading', { name: '把任务说清楚，再让 AI 动手', exact: true })).toBeVisible()
    expect(paidRequests).toEqual([])
    expect(errors).toEqual([])
  } finally { await browser.close() }
})
