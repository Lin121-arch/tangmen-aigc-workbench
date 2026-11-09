import { test, expect, _electron as electron } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const root = process.env.TANGMEN_TEST_APP_ROOT || path.resolve(import.meta.dirname, '../..')
test('TangMen independent keys survive save; a newly created director opens at full size', async () => {
  test.setTimeout(120_000)
  const folder = path.join(root, 'test-results', 'provider-director-' + randomUUID())
  await fs.mkdir(folder, { recursive: true })
  const app = await electron.launch({ args: ['.', '--user-data-dir=' + path.join(folder, 'profile')], cwd: root })
  const errors: string[] = []
  try {
    const page = await app.firstWindow()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') console.log('renderer:', msg.text().slice(0, 1000)) })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: '模型与设置', exact: true }).click()
    const section = page.getByRole('region', { name: '模型服务', exact: true })
    const settingsNav = page.getByRole('navigation', { name: '设置分类' })
    await settingsNav.getByRole('button', { name: '本机智能体', exact: true }).click()
    await expect(page.getByRole('button', { name: '重新检测', exact: true })).toBeEnabled({ timeout: 25000 })
    await settingsNav.getByRole('button', { name: '模型服务', exact: true }).click()
    await page.screenshot({ path: path.join(folder, '01-provider-catalog.png') })
    await section.getByRole('button', { name: /^TangMen 图片/ }).click()
    await section.getByLabel('图片 API Key', { exact: true }).fill('local-image-fixture')
    await section.getByRole('button', { name: '视频', exact: true }).click()
    await expect(section.getByLabel('视频 API Key', { exact: true })).toHaveValue('')
    await section.getByLabel('视频 API Key', { exact: true }).fill('local-video-fixture')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.getByText('配置已保存，将在下一次生成或 Agent 对话时生效', { exact: true })).toBeVisible()
    const settings = await page.evaluate(() => window.electronAPI.getAppSettings())
    expect(settings.modelServices?.providers[0].endpoints.every(e => e.apiKeyConfigured)).toBe(true)
    expect(settings.modelServices?.providers[0].apiKeyConfigured).toBe(false)
    expect(JSON.stringify(settings)).not.toContain('local-image-fixture')
    await page.screenshot({ path: path.join(folder, '02-tangmen-video.png') })
    await page.getByTitle('返回首页', { exact: true }).click()
    await page.getByRole('button', { name: '智能对话', exact: true }).click()
    await page.getByRole('button', { name: '无限画布', exact: true }).click()
    await page.getByTitle('添加3D 导演台节点', { exact: true }).click()
    await page.getByRole('button', { name: '打开导演台', exact: true }).click()
    const stage = page.locator('[data-director-stage-dialog]')
    await expect(stage).toBeVisible()
    const stageBox = await stage.boundingBox()
    expect(stageBox?.width).toBe(1440)
    expect(stageBox?.height).toBe(860)
    const viewport = stage.locator('[data-director-viewport-state]')
    await expect(viewport).toHaveAttribute('data-director-viewport-state', 'ready', { timeout: 30000 })
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 30000 })
    await expect.poll(() => stage.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).width), { timeout: 30000 }).toBeGreaterThan(300)
    console.log('canvas status', await stage.locator('canvas').evaluate(canvas => {
      const c = canvas as HTMLCanvasElement
      const gl = c.getContext('webgl2')
      return { width: c.width, height: c.height, gl: !!gl, lost: gl?.isContextLost(), error: gl?.getError(), visibility: document.visibilityState }
    }))
    await expect.poll(() => stage.locator('canvas').evaluate(canvas => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')
      if (!gl) return false
      const pixels = new Uint8Array(4)
      gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      return pixels[3] > 0
    }), { timeout: 15000 }).toBe(true)
    await expect(stage.getByRole('button', { name: '保存并关闭', exact: true })).toBeEnabled()
    await page.screenshot({ path: path.join(folder, '03-new-director.png') })
    // Lose only this isolated canvas context; never change system/GPU settings.
    expect(await stage.locator('canvas').evaluate(canvas => {
      const extension = (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')
      if (!extension) return false
      extension.loseContext()
      return true
    })).toBe(true)
    await expect(viewport).toHaveAttribute('data-director-viewport-state', 'error')
    await expect(stage.getByRole('button', { name: '拍摄构图并发送到画布', exact: true })).toBeDisabled()
    await stage.getByRole('button', { name: '重新加载3D视图', exact: true }).click()
    await expect(viewport).toHaveAttribute('data-director-viewport-state', 'ready', { timeout: 30000 })
    await expect.poll(() => stage.locator('canvas').evaluate(canvas => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')
      if (!gl || gl.isContextLost()) return false
      const pixels = new Uint8Array(4)
      gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      return pixels[3] > 0
    })).toBe(true)
    await stage.getByRole('button', { name: '保存并关闭', exact: true }).click()
    await page.getByRole('button', { name: '打开导演台', exact: true }).click()
    await expect(stage.locator('[data-director-viewport-state]')).toHaveAttribute('data-director-viewport-state', 'ready')
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect.poll(() => stage.locator('canvas').evaluate(canvas => Math.round(canvas.getBoundingClientRect().width))).toBeLessThan(800)
    expect((await stage.boundingBox())?.width).toBe(1024)
    await page.screenshot({ path: path.join(folder, '04-director-1024.png') })
    await stage.getByRole('button', { name: '保存并关闭', exact: true }).click()
    expect(errors).toEqual([])
    console.log('Acceptance evidence:', folder)
  } finally { await app.close() }
})
