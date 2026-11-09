import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const root = process.env.TANGMEN_TEST_APP_ROOT || path.resolve(import.meta.dirname, '../..')

for (const theme of ['light', 'dark'] as const) {
  test(`unsaved settings dialog remains readable in ${theme} mode and keeps the chosen save/discard behavior`, async () => {
    test.setTimeout(60000)
    const folder = path.join(root, 'test-results', 'settings-dialog-' + theme + '-' + randomUUID())
    await fs.mkdir(folder, { recursive: true })
    const app = await electron.launch({ args: ['.', '--user-data-dir=' + path.join(folder, 'profile')], cwd: root })
    try {
      const page = await app.firstWindow()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width: theme === 'light' ? 1440 : 1024, height: 900 })
      await page.getByRole('button', { name: '模型与设置', exact: true }).click()
      if (theme === 'light') await page.getByRole('button', { name: '切换到浅色模式', exact: true }).click()
      await page.getByRole('button', { name: /^Google 对话/ }).click()
      await page.getByTitle('返回首页', { exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '未保存的配置', exact: true })
      await expect(dialog).toBeVisible()
      await page.screenshot({ path: path.join(folder, '01-unsaved-dialog.png') })
      await dialog.screenshot({ path: path.join(folder, '02-dialog-detail.png') })

      // A dark media-overlay rule must not leak white text into a white dialog.
      const contrast = await dialog.locator('h2, p, button').evaluateAll(elements => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        const rgba = (value: string) => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = value
          context.fillRect(0, 0, 1, 1)
          const values = context.getImageData(0, 0, 1, 1).data
          return [values[0], values[1], values[2], values[3] / 255]
        }
        const luminance = (rgb: number[]) => rgb.slice(0, 3).reduce((sum, value, i) => {
          const s = value / 255
          return sum + (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]
        }, 0)
        return elements.map(element => {
          const style = getComputedStyle(element)
          let background = rgba(style.backgroundColor)
          let parent = element.parentElement
          while (background[3] === 0 && parent) {
            background = rgba(getComputedStyle(parent).backgroundColor)
            parent = parent.parentElement
          }
          const foreground = rgba(style.color)
          const rendered = foreground.slice(0, 3).map((v, i) => v * foreground[3] + background[i] * (1 - foreground[3]))
          const a = luminance(rendered), b = luminance(background)
          return { text: element.textContent, color: style.color, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
        })
      })
      console.log('Dialog contrast:', theme, contrast)
      for (const item of contrast) expect(item.ratio, item.text || 'dialog text').toBeGreaterThanOrEqual(4.5)
      for (const name of ['继续编辑', '放弃修改', '保存后返回']) {
        await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name, exact: true })).toBeEnabled()
      }

      await dialog.getByRole('button', { name: '继续编辑', exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('heading', { name: 'Google', exact: true })).toBeVisible()
      expect((await page.evaluate(() => window.electronAPI.getAppSettings())).modelServices?.providers || []).toHaveLength(0)

      await page.getByTitle('返回首页', { exact: true }).click()
      await dialog.getByRole('button', { name: '放弃修改', exact: true }).click()
      await expect(dialog).toBeHidden()
      await page.getByTitle('系统配置', { exact: true }).click()
      await expect(page.getByLabel('搜索厂商')).toBeVisible()
      expect((await page.evaluate(() => window.electronAPI.getAppSettings())).modelServices?.providers || []).toHaveLength(0)

      await page.getByRole('button', { name: /^Google 对话/ }).click()
      await page.getByTitle('返回首页', { exact: true }).click()
      await dialog.getByRole('button', { name: '保存后返回', exact: true }).click()
      await expect(dialog).toBeHidden()
      await page.getByTitle('系统配置', { exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Google', exact: true })).toBeVisible()
      const saved = await page.evaluate(() => window.electronAPI.getAppSettings())
      expect(saved.modelServices?.providers).toHaveLength(1)
      expect(saved.modelServices?.providers[0].name).toBe('Google')
      await page.getByTitle('返回首页', { exact: true }).click()
      await expect(page.getByTitle('系统配置', { exact: true })).toBeVisible()
      await expect(dialog).toBeHidden()
      console.log('Settings dialog evidence:', folder)
    } finally {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
      await app.close().catch(() => {})
    }
  })
}
