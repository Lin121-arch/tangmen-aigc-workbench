import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '../..')
const launch = (folder: string) => electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })

// Replace only the native choice: settings, close IPC, disk writes and window lifecycle remain real.
async function choose(app: ElectronApplication, response: number) {
  await app.evaluate(({ dialog }, response) => {
    ;(globalThis as any).closeDialogOptions = undefined
    dialog.showMessageBox = (async (_window: unknown, options: unknown) => {
      ;(globalThis as any).closeDialogOptions = options
      return { response, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  }, response)
}
async function clickClose(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 0) })
}

test('closing dirty settings offers cancel, keeps failed saves editable and discards only after an explicit choice', async () => {
  const folder = path.join(root, 'test-results', `settings-close-${randomUUID()}`)
  await fs.mkdir(folder, { recursive: true })
  const app = await launch(folder)
  let closed = false
  app.once('close', () => { closed = true })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: '模型与设置', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存配置', exact: true })).toBeEnabled()
    const before = await page.evaluate(() => window.electronAPI.getAppSettings())
    await page.getByLabel('Luna API 地址', { exact: true }).fill('invalid-url')
    await choose(app, 2)
    await clickClose(app)
    await expect.poll(() => app.evaluate(() => (globalThis as any).closeDialogOptions?.buttons)).toEqual(['保存并退出', '放弃修改并退出', '继续编辑'])
    await expect(page.getByText('有未保存修改', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.body.inert)).toBe(false)
    await page.getByLabel('Luna API Key', { exact: true }).fill('retain-my-draft')
    expect((await page.evaluate(() => window.electronAPI.getAppSettings())).lunaBaseUrl).toBe(before.lunaBaseUrl)

    await choose(app, 0)
    await clickClose(app)
    await expect.poll(() => app.evaluate(() => (globalThis as any).closeDialogOptions?.type)).toBe('error')
    await expect.poll(() => page.evaluate(() => document.body.inert)).toBe(false)
    await expect(page.getByLabel('Luna API 地址', { exact: true })).toHaveValue('invalid-url')
    await expect(page.getByLabel('Luna API Key', { exact: true })).toHaveValue('retain-my-draft')
    expect((await page.evaluate(() => window.electronAPI.getAppSettings())).lunaBaseUrl).toBe(before.lunaBaseUrl)

    await choose(app, 1)
    const ended = app.waitForEvent('close')
    await clickClose(app)
    await ended
    const reopened = await launch(folder)
    try {
      const restored = await (await reopened.firstWindow()).evaluate(() => window.electronAPI.getAppSettings())
      expect(restored.lunaBaseUrl).toBe(before.lunaBaseUrl)
      expect(restored.lunaImageModel).toBe(before.lunaImageModel)
    } finally { await reopened.evaluate(({ app }) => app.exit(0)) }
  } finally { if (!closed) await app.evaluate(({ app }) => app.exit(0)) }
})

test('save and exit persists the latest model configuration before the window closes', async () => {
  const folder = path.join(root, 'test-results', `settings-save-close-${randomUUID()}`)
  await fs.mkdir(folder, { recursive: true })
  const app = await launch(folder)
  let closed = false
  app.once('close', () => { closed = true })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: '模型与设置', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存配置', exact: true })).toBeEnabled()
    await page.getByLabel('Luna API 地址', { exact: true }).fill('https://example.test/v1')
    await page.getByRole('button', { name: '添加视频模型', exact: true }).click()
    await page.getByLabel('视频模型 1 显示名称', { exact: true }).fill('我的视频模型')
    await page.getByLabel('视频模型 1 ID', { exact: true }).fill('my-video-model')
    await choose(app, 0)
    const ended = app.waitForEvent('close')
    await clickClose(app)
    await ended
    const reopened = await launch(folder)
    try {
      const restored = await (await reopened.firstWindow()).evaluate(() => window.electronAPI.getAppSettings())
      expect(restored.lunaBaseUrl).toBe('https://example.test/v1')
      expect(restored.relayVideoConfig?.models).toEqual([{ id: 'my-video-model', name: '我的视频模型' }])
    } finally { await reopened.evaluate(({ app }) => app.exit(0)) }
  } finally { if (!closed) await app.evaluate(({ app }) => app.exit(0)) }
})
