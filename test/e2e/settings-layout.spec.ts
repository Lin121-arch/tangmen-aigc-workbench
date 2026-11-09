import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
const root = process.env.TANGMEN_TEST_APP_ROOT || path.resolve(import.meta.dirname, '../..')

test('settings shows one task at a time and preserves draft keys and model bindings across sections', async () => {
  test.setTimeout(90000)
  const folder = path.join(root, 'test-results', 'settings-layout-' + randomUUID())
  await fs.mkdir(folder, { recursive: true })
  const app = await electron.launch({ args: ['.', '--user-data-dir=' + path.join(folder, 'profile')], cwd: root })
  try {
    const page = await app.firstWindow()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.evaluate(async () => {
      const old = await window.electronAPI.getAppSettings()
      await window.electronAPI.saveAppSettings({ ...old, modelServices: {
        version: 1, defaults: { image: 'service-model:tm:m0' }, legacyAliases: {},
        providers: [{ id: 'tm', name: 'TangMen', enabled: true,
          endpoints: [{ id: 'image', protocol: 'openai-image', baseUrl: 'https://image.example.invalid/v1' }, { id: 'video', protocol: 'luna-media-video', baseUrl: 'https://video.example.invalid' }],
          models: Array.from({length: 5}, (_, i) => ({ id: 'm'+i, name: i < 3 ? '角色图片 '+(i+1) : '视频模型 '+(i-2), modelId: 'fixture-model-'+i, endpointId: i < 3 ? 'image' : 'video', capabilities: [i < 3 ? 'image' : 'video'], referenceLimit: 0 }))
        }]
      } })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: '模型与设置', exact: true }).click()
    const nav = page.getByRole('navigation', { name: '设置分类', exact: true })
    await expect(nav.getByRole('button', { name: '模型服务', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: '本机智能体', exact: true })).toBeHidden()
    await expect(page.getByLabel('默认图片模型', { exact: true })).toBeHidden()
    await expect(page.getByLabel('模型 1 名称', { exact: true })).toBeHidden()
    await expect(page.getByLabel('端点 Base URL', { exact: true })).toBeHidden()
    await page.getByRole('button', { name: '切换到浅色模式', exact: true }).click()
    await page.getByRole('button', { name: '编辑模型 角色图片 1', exact: true }).click()
    await page.getByLabel('模型 1 名称', { exact: true }).fill('我的角色图')
    await page.getByRole('button', { name: '收起模型 我的角色图', exact: true }).click()
    await page.getByLabel('图片 API Key', { exact: true }).fill('fixture-image-secret')
    await page.getByRole('button', { name: '视频', exact: true }).click()
    await expect(page.getByText('视频模型 1', { exact: true })).toBeVisible()
    await expect(page.getByText('我的角色图', { exact: true })).toBeHidden()
    await expect(page.getByLabel('视频 API Key', { exact: true })).toHaveValue('')
    await page.getByLabel('视频 API Key', { exact: true }).fill('fixture-video-secret')
    await nav.getByRole('button', { name: '默认模型', exact: true }).click()
    await expect(page.getByLabel('默认图片模型', { exact: true })).toHaveValue('service-model:tm:m0')
    await page.getByLabel('默认视频模型', { exact: true }).selectOption('service-model:tm:m3')
    await nav.getByRole('button', { name: '本机智能体', exact: true }).click()
    await expect(page.getByRole('region', { name: '本机智能体', exact: true })).toBeVisible()
    await nav.getByRole('button', { name: '模型服务', exact: true }).click()
    await expect(page.getByLabel('视频 API Key', { exact: true })).toHaveValue('fixture-video-secret')
    await page.getByRole('button', { name: '图片', exact: true }).click()
    await expect(page.getByLabel('图片 API Key', { exact: true })).toHaveValue('fixture-image-secret')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(page.locator('header [role="status"]')).toContainText('配置已保存')
    const saved = await page.evaluate(() => window.electronAPI.getAppSettings())
    expect(saved.modelServices!.providers[0].endpoints.every(e => e.apiKeyConfigured)).toBe(true)
    expect(saved.modelServices!.providers[0].models[0].name).toBe('我的角色图')
    expect(saved.modelServices!.defaults.video).toBe('service-model:tm:m3')
    expect(JSON.stringify(saved)).not.toContain('fixture-image-secret')
    await page.screenshot({ path: path.join(folder, '01-providers-light.png') })
    await page.getByRole('button', { name: '添加模型服务', exact: true }).click()
    await expect(page.getByLabel('搜索厂商')).toBeVisible()
    await page.screenshot({ path: path.join(folder, '02-catalog-light.png') })
    await page.getByRole('button', { name: '返回已连接', exact: true }).click()
    await page.getByRole('button', { name: '切换到深色模式', exact: true }).click()
    await page.setViewportSize({ width: 1024, height: 768 })
    expect(await page.locator('main').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(folder, '03-providers-dark-1024.png') })
    await nav.getByRole('button', { name: '默认模型', exact: true }).click()
    await page.screenshot({ path: path.join(folder, '04-defaults.png') })
    expect(errors).toEqual([])
    console.log('Settings layout evidence:', folder)
  } finally { await app.close() }
})
