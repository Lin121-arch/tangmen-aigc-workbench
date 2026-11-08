import { test, expect, _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '../../src/shared/ipc.channels'
import type { CanvasCommandRequest, CanvasCommandResponse, CanvasNodeSnapshot } from '../../src/shared/ipc.types'

const root = path.resolve(import.meta.dirname, '../..')
const nodeId = 'refresh-image'
const sourcePath = 'uploads/同路径图片.png'

async function command(app: ElectronApplication, projectId: string, action: CanvasCommandRequest['action'], payload: unknown) {
  const response = await app.evaluate(({ BrowserWindow, ipcMain }, { request, requestChannel, responseChannel }) =>
    new Promise<CanvasCommandResponse>((resolve, reject) => {
      const listener = (_event: unknown, response: CanvasCommandResponse) => {
        if (response.requestId !== request.requestId) return
        clearTimeout(timeout)
        ipcMain.removeListener(responseChannel, listener)
        resolve(response)
      }
      const timeout = setTimeout(() => {
        ipcMain.removeListener(responseChannel, listener)
        reject(new Error(`Canvas command timed out: ${request.action}`))
      }, 10_000)
      ipcMain.on(responseChannel, listener)
      BrowserWindow.getAllWindows()[0].webContents.send(requestChannel, request)
    }), {
    request: { requestId: randomUUID(), projectId, action, payload },
    requestChannel: IPC_CHANNELS.push.canvasCommand,
    responseChannel: IPC_CHANNELS.canvas.commandResult,
  })
  expect(response.success, response.error).toBe(true)
  return response
}

async function writeSolidImage(page: Page, folder: string, color: string) {
  const base64 = await page.evaluate((color) => {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 1152
    const context = canvas.getContext('2d')!
    context.fillStyle = color
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  }, color)
  await fs.writeFile(path.join(folder, sourcePath), Buffer.from(base64, 'base64'))
}

async function savedNode(page: Page, folder: string) {
  const snapshot = await page.evaluate((folder) => window.electronAPI.loadCanvasSnapshot(folder), folder) as {
    nodes: CanvasNodeSnapshot[]
  } | null
  return snapshot?.nodes.find((node) => node.id === nodeId)
}

async function thumbnailColor(image: Locator) {
  return image.evaluate((element: HTMLImageElement) => {
    if (!element.complete || !element.naturalWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.drawImage(element, 0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    // Thumbnails use lossy JPEG; tolerate its small RGB rounding error.
    if (r > 240 && g < 15 && b < 15) return 'red'
    if (b > 240 && r < 15 && g < 15) return 'blue'
    return `rgb(${r},${g},${b})`
  })
}

async function expectBlueOriginal(page: Page, image: Locator) {
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(2048)
  // Sample the actual displayed original. workspace:// images need not be
  // canvas-readable, so inspect a screenshot instead of changing their CORS mode.
  const png = await image.screenshot()
  const pixel = await page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.drawImage(image, image.naturalWidth / 2, image.naturalHeight / 2, 1, 1, 0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data)
  }, png.toString('base64'))
  expect(pixel).toEqual([0, 0, 255, 255])
}

test('same-path image updates refresh thumbnails and originals without invalidating unrelated edits', async () => {
  test.setTimeout(90_000)
  const runFolder = path.join(root, 'test-results', `image-preview-refresh-${randomUUID()}`)
  const folder = path.join(runFolder, 'workspace')
  await fs.mkdir(path.join(folder, 'uploads'), { recursive: true })
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${path.join(runFolder, 'profile')}`], cwd: root,
  })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.getByRole('heading', { name: '我的项目', exact: true }).waitFor()
    const project = await page.evaluate(async (folder) => {
      const project = await window.electronAPI.createProject('图片预览刷新验证', folder, { provider: 'codex', model: '' })
      await window.electronAPI.loadProject(project.id)
      return project
    }, folder)
    await writeSolidImage(page, folder, '#ff0000')
    await page.reload()
    await page.getByTitle('添加图片节点').waitFor()
    await page.getByRole('button', { name: '收起聊天', exact: true }).click()
    await command(app, project.id, 'create-nodes', {
      nodes: [{ id: nodeId, kind: 'image', title: '待更新图片', sourcePath, aspectRatio: '16:9', position: { x: 100, y: 100 } }],
    })
    const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
    const thumbnail = node.locator('img[src^="data:image/"]')
    const original = node.locator('img[src^="workspace://"]')
    await expect(node).toBeVisible()
    await page.getByRole('button', { name: '适应画布', exact: true }).click()
    await expect.poll(() => thumbnailColor(thumbnail), { timeout: 15_000 }).toBe('red')
    await expect.poll(async () => (await savedNode(page, folder))?.data.sourcePath).toBe(sourcePath)
    const initialPreview = (await savedNode(page, folder))!.data.preview

    // Overwrite the real file, then take the same command path used by the Agent.
    // A cached thumbnail keyed only by path stays red here in the buggy build.
    await writeSolidImage(page, folder, '#0000ff')
    await command(app, project.id, 'update-nodes', { updates: [{ id: nodeId, sourcePath }] })
    await expect.poll(() => thumbnailColor(thumbnail), { timeout: 15_000 }).toBe('blue')
    await expect.poll(async () => (await savedNode(page, folder))?.data.preview).not.toBe(initialPreview)
    const updatedPreview = (await savedNode(page, folder))!.data.preview!

    await node.getByText('待更新图片', { exact: true }).click()
    await expect(node).toHaveClass(/selected/)
    await expect(original).toHaveAttribute('src', updatedPreview)
    await expectBlueOriginal(page, original)
    const paneBounds = (await page.locator('.react-flow__pane').boundingBox())!
    await page.mouse.click(paneBounds.x + 10, paneBounds.y + paneBounds.height / 2)
    await expect(node).not.toHaveClass(/selected/)
    await expect(original).toHaveCount(0)
    await expect.poll(() => thumbnailColor(thumbnail)).toBe('blue')
    const updatedThumbnail = await thumbnail.getAttribute('src')

    for (const update of [
      { title: '已更新图片' },
      { prompt: '保持当前图片，只更新提示词。' },
      { position: { x: 120, y: 110 } },
    ]) {
      await command(app, project.id, 'update-nodes', { updates: [{ id: nodeId, ...update }] })
      await expect.poll(() => savedNode(page, folder)).toMatchObject({
        ...(update.position ? { position: update.position } : {}),
        data: { preview: updatedPreview, ...('title' in update ? { title: update.title } : {}), ...('prompt' in update ? { prompt: update.prompt } : {}) },
      })
      await expect(thumbnail).toHaveAttribute('src', updatedThumbnail!)
    }

    await command(app, project.id, 'update-nodes', { updates: [{ id: nodeId, sourcePath: '' }] })
    await expect(node.locator('img')).toHaveCount(0)
    await expect.poll(async () => (await savedNode(page, folder))?.data.sourcePath).toBe('')
    expect((await savedNode(page, folder))!.data.preview).toBeUndefined()
    await command(app, project.id, 'update-nodes', { updates: [{ id: nodeId, sourcePath }] })
    await expect.poll(() => thumbnailColor(thumbnail)).toBe('blue')

    // Closing flushes the actual snapshot; reopening must preserve the new
    // media identity and pixels, including after the renderer's cache is lost.
    await page.getByRole('button', { name: '返回', exact: true }).click()
    const persistedPreview = (await savedNode(page, folder))!.data.preview!
    await page.getByRole('heading', { name: '图片预览刷新验证', exact: true }).click()
    await page.getByTitle('添加图片节点').waitFor()
    await expect.poll(() => thumbnailColor(thumbnail)).toBe('blue')
    await page.reload()
    await page.getByTitle('添加图片节点').waitFor()
    await expect.poll(() => thumbnailColor(thumbnail), { timeout: 15_000 }).toBe('blue')
    expect((await savedNode(page, folder))!.data.preview).toBe(persistedPreview)
    await node.getByText('已更新图片', { exact: true }).click()
    await expect(original).toHaveAttribute('src', persistedPreview)
    await expectBlueOriginal(page, original)
  } finally {
    await app.close()
  }
})
