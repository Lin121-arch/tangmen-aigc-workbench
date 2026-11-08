import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Artifact, CanvasNodeSnapshot } from '../../src/shared/ipc.types'

const root = path.resolve(import.meta.dirname, '../..')

test('documents migrate to lightweight chat cards and only render in the reading dialog', async () => {
  test.setTimeout(90_000)
  const folder = path.join(root, 'test-results', `document-artifacts-${randomUUID()}`)
  await fs.mkdir(path.join(folder, 'reports'), { recursive: true })
  await fs.writeFile(path.join(folder, 'reports', 'pixel.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#d4af37"/></svg>')
  let app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    let page = await app.firstWindow()
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.getByRole('heading', { name: '我的项目', exact: true }).waitFor()
    const project = await page.evaluate(async folder => {
      const project = await window.electronAPI.createProject('文档产物验证', folder, { provider: 'codex', model: '' })
      await window.electronAPI.loadProject(project.id)
      return project
    }, folder)
    const report: Artifact = { id: 'report', type: 'markdown', title: '分镜创作报告', path: 'reports/report.md', content: '# 分镜创作报告\n\n## 人物与场景\n\n用统一的视觉风格连接人物、场景与分镜。\n\n| 片段 | 场景 | 状态 |\n| --- | --- | --- |\n| 01 | 黄昏街道 | 已完成 |\n| 02 | 室内对话 | 待生成 |\n\n> 下一步：确认人物参考图，再生成分镜。', width: 640, height: 420, timestamp: 100 }
    const append = (artifact: Artifact, seq: number) => fs.appendFile(path.join(folder, '.aigc-line', 'chat-events.jsonl'), JSON.stringify({ version: 1, seq, type: 'message.created', message: { id: `msg-${seq}`, role: 'assistant', content: `Artifact: ${artifact.title}`, timestamp: artifact.timestamp, artifact } }) + '\n')
    const push = (artifact: Artifact, projectId = project.id) => app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send('artifact:receive', payload)
    }, { projectId, artifact })
    const snapshot = () => page.evaluate(folder => window.electronAPI.loadCanvasSnapshot(folder), folder) as Promise<{ nodes: CanvasNodeSnapshot[] }>
    await append(report, 1)
    await page.reload()
    // Include a document that only exists in the snapshot, proving migration preserves it.
    const html: Artifact = { id: 'html', type: 'html', title: '互动页面', path: 'reports/demo.html', content: '<h1>分镜预览</h1><img src="./pixel.svg"><button onclick="this.textContent=\'已点击\'">查看片段</button><p id="bridge"></p><script>document.querySelector("#bridge").textContent=typeof window.electronAPI</script>', width: 640, height: 420, timestamp: 200 }
    const documents: CanvasNodeSnapshot[] = [report, html].map((art, index) => ({ id: `doc-${index}`, type: 'storyNode', position: { x: index * 700, y: 0 }, data: {
      kind: 'document', title: art.title, sourcePath: art.path, artifactId: art.id, artifactUpdatedAt: art.timestamp,
      document: { format: art.type as 'markdown' | 'html', content: art.content, width: 640, height: 420 },
    } }))
    // Close first so an active canvas cannot overwrite the migration fixture.
    await app.close()
    await fs.writeFile(path.join(folder, '.aigc-line', 'canvas-snapshot.json'), JSON.stringify({ type: 'react-flow', version: 4, nodes: [...documents,
      { id: 'keep-image', type: 'storyNode', position: { x: 80, y: 80 }, data: { kind: 'image', title: '保留图片节点', aspectRatio: '16:9' } },
    ], edges: [{ id: 'legacy-edge', source: 'doc-0', target: 'keep-image' }], viewport: { x: 0, y: 0, zoom: 0.6 } }))
    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
    page = await app.firstWindow()
    await page.setViewportSize({ width: 1600, height: 1000 })
    const card = page.getByRole('button', { name: '查看产物：分镜创作报告', exact: true })
    const htmlCard = page.getByRole('button', { name: '查看产物：互动页面', exact: true })
    await expect(card).toBeVisible()
    await expect(htmlCard).toBeVisible()
    await expect(page.locator('[data-document-node]')).toHaveCount(0)
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '人物与场景', exact: true })).toHaveCount(0)
    await expect.poll(async () => (await snapshot())?.nodes?.map(node => node.id)).toEqual(['keep-image'])
    const canvas = page.locator('.react-flow__node').first()
    await canvas.click()
    await card.click()
    const dialog = page.getByRole('dialog', { name: '阅读产物：分镜创作报告' })
    await expect(dialog.getByRole('heading', { name: '人物与场景' })).toBeVisible()
    await page.keyboard.press('Delete')
    await expect(canvas).toHaveCount(1)
    await dialog.getByRole('button', { name: '添加到对话', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '已添加到对话', exact: true })).toBeVisible()
    const revised = { ...report, timestamp: 300, content: report.content + '\n\n更新：第二片段已通过检查。' }
    await append(revised, 3)
    await push(revised)
    await expect(dialog).toContainText('更新：第二片段已通过检查。')
    await push({ ...revised, content: '不应显示', timestamp: 400 }, 'another-project')
    await expect(dialog).not.toContainText('不应显示')
    await page.screenshot({ path: 'test/screenshots/document-artifact-reader.png' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '人物与场景' })).toHaveCount(0)
    await htmlCard.click()
    const htmlDialog = page.getByRole('dialog', { name: '阅读产物：互动页面' })
    const frame = htmlDialog.frameLocator('iframe[title="互动页面"]')
    await expect(frame.getByRole('heading', { name: '分镜预览' })).toBeVisible()
    await frame.getByRole('button', { name: '查看片段' }).click()
    await expect(frame.getByRole('button', { name: '已点击' })).toBeVisible()
    await expect(frame.locator('#bridge')).toHaveText('undefined')
    await expect.poll(() => frame.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(80)
    await expect(htmlDialog.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts')
    await page.screenshot({ path: 'test/screenshots/document-artifact-html.png' })
    await htmlDialog.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(page.locator('iframe')).toHaveCount(0)
    await page.screenshot({ path: 'test/screenshots/document-artifact-chat.png' })
    await page.reload()
    await page.getByRole('button', { name: '查看产物：分镜创作报告', exact: true }).first().click()
    await expect(dialog).toContainText('更新：第二片段已通过检查。')
    await page.keyboard.press('Escape')
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect.poll(async () => (await snapshot())?.nodes?.map(node => node.id)).toEqual(['keep-image'])
  } finally { await app.close() }
})

test('pushed image artifacts stay in chat and open without creating canvas nodes', async () => {
  test.setTimeout(90_000)
  const folder = path.join(root, 'test-results', `image-artifacts-${randomUUID()}`)
  await fs.mkdir(path.join(folder, 'reports'), { recursive: true })
  await fs.writeFile(path.join(folder, 'reports', 'preview.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#d4af37"/></svg>')
  let app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
  try {
    let page = await app.firstWindow()
    await page.getByRole('heading', { name: '我的项目', exact: true }).waitFor()
    const project = await page.evaluate(async folder => {
      const project = await window.electronAPI.createProject('图片产物验证', folder, { provider: 'codex', model: '' })
      await window.electronAPI.loadProject(project.id)
      return project
    }, folder)
    await page.reload()
    await page.locator('.react-flow').waitFor()
    const artifact: Artifact = {
      id: 'image-artifact', type: 'image', title: '图片产物', path: 'reports/preview.svg',
      content: `workspace://${project.id}/reports/preview.svg?v=1`, width: 640, height: 420, timestamp: 100,
    }
    const message = { id: 'image-message', role: 'assistant' as const, content: 'Artifact: 图片产物', timestamp: 100, artifact }
    await app.evaluate(({ BrowserWindow }, payload) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.webContents.send('artifact:receive', { projectId: payload.projectId, artifact: payload.artifact })
      window.webContents.send('chat:receiveMessage', { projectId: payload.projectId, message: payload.message })
    }, { projectId: project.id, artifact, message })
    const card = page.getByRole('button', { name: '查看产物：图片产物', exact: true })
    await expect(card).toBeVisible()
    await expect(page.locator('.react-flow__node')).toHaveCount(0)
    await card.click()
    const dialog = page.getByRole('dialog', { name: '阅读产物：图片产物' })
    await expect.poll(() => dialog.getByRole('img', { name: '图片产物' }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(80)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await app.close()

    await fs.appendFile(path.join(folder, '.aigc-line', 'chat-events.jsonl'), JSON.stringify({ version: 1, seq: 1, type: 'message.created', message }) + '\n')
    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root })
    page = await app.firstWindow()
    await expect(page.getByRole('button', { name: '查看产物：图片产物', exact: true })).toBeVisible()
    await expect(page.locator('.react-flow__node')).toHaveCount(0)
    await page.getByRole('button', { name: '查看产物：图片产物', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '阅读产物：图片产物' }).getByRole('img', { name: '图片产物' }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(80)
  } finally { await app.close() }
})
