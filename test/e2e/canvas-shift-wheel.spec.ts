import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '../..')

test('Shift and Alt wheel pan on separate axes, ordinary wheel zooms, and input panels keep their own scrolling', async () => {
  const folder = path.join(root, 'test-results', `shift-wheel-${randomUUID()}`)
  await fs.mkdir(folder, { recursive: true })
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: '项目与模板', exact: true }).click()
    await page.getByRole('heading', { name: '我的项目', exact: true }).waitFor()
    await page.evaluate(async folder => {
      const project = await window.electronAPI.createProject('Shift wheel', folder, { provider: 'relay', model: '' })
      await window.electronAPI.saveCanvasSnapshot(folder, {
        type: 'react-flow', version: 4,
        nodes: [{ id: 'image', type: 'storyNode', position: { x: 0, y: 0 }, data: { kind: 'image', title: '保留节点位置', prompt: '练习提示词', aspectRatio: '16:9' } }],
        edges: [], viewport: { x: 100, y: 120, zoom: 0.6 },
      })
      await window.electronAPI.loadProject(project.id)
    }, folder)
    await page.reload()
    await page.getByRole('button', { name: '无限画布', exact: true }).click()
    await page.getByTitle('添加图片节点').waitFor()
    const viewport = () => page.locator('.react-flow__viewport').evaluate(element => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)
      return { x: matrix.m41, y: matrix.m42, zoom: matrix.a }
    })
    await expect.poll(async () => (await viewport()).zoom).toBe(0.6)
    const initial = await viewport()
    const pane = await page.locator('.react-flow').boundingBox()
    await page.mouse.move(pane!.x + pane!.width - 160, pane!.y + 240)
    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, 160)
    await expect.poll(async () => (await viewport()).x).toBeLessThan(initial.x - 10)
    const panned = await viewport()
    expect(panned.zoom).toBe(initial.zoom)
    expect(panned.y).toBe(initial.y)
    await page.keyboard.up('Shift')
    await page.keyboard.down('Alt')
    await page.mouse.wheel(0, 160)
    await expect.poll(async () => (await viewport()).y).toBeLessThan(panned.y - 10)
    const vertical = await viewport()
    expect(vertical.x).toBe(panned.x)
    expect(vertical.zoom).toBe(panned.zoom)
    // Alt takes precedence when both modifiers are held.
    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, -100)
    await expect.poll(async () => (await viewport()).y).toBeGreaterThan(vertical.y + 10)
    const combined = await viewport()
    expect(combined.x).toBe(vertical.x)
    expect(combined.zoom).toBe(vertical.zoom)
    await page.keyboard.up('Shift')
    await page.keyboard.up('Alt')
    await page.mouse.wheel(0, -100)
    await expect.poll(async () => (await viewport()).zoom).toBeGreaterThan(panned.zoom)

    // A real node prompt is a nowheel region; Shift wheel there must not move the canvas.
    await page.locator('.react-flow__node').click()
    const input = page.locator('.react-flow__node textarea').first()
    await expect(input).toBeVisible()
    await input.hover()
    const beforeInput = await viewport()
    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, 160)
    await page.keyboard.up('Shift')
    await page.keyboard.down('Alt')
    await page.mouse.wheel(0, 160)
    await page.keyboard.up('Alt')
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)))
    expect(await viewport()).toEqual(beforeInput)
    await page.getByRole('button', { name: '返回', exact: true }).click()
    const saved = await page.evaluate(folder => window.electronAPI.loadCanvasSnapshot(folder), folder) as any
    expect(saved.nodes[0].position).toEqual({ x: 0, y: 0 })
    expect(saved.viewport.x).toBeCloseTo(beforeInput.x, 1)
    expect(saved.viewport.y).toBeCloseTo(beforeInput.y, 1)
    expect(saved.viewport.zoom).toBeCloseTo(beforeInput.zoom, 5)
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined) }
})
