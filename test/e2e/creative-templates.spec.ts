import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CREATIVE_TEMPLATES } from '../../src/shared/creative-templates';

const root = path.resolve(import.meta.dirname, '../..');

test('all six templates can be chosen, created and reopened with real canvas and readable guides', async () => {
  test.setTimeout(120_000);
  const folder = path.join(root, 'test-results', `templates-${randomUUID()}`);
  await fs.mkdir(folder, { recursive: true });
  const app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${folder}/profile`], cwd: root });
  const errors: string[] = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByRole('heading', { name: '我的项目', exact: true }).waitFor();
    for (const [index, template] of CREATIVE_TEMPLATES.entries()) {
      const workspace = path.join(folder, template.id);
      await fs.mkdir(workspace);
      // Stub only the OS folder picker. Project IPC, filesystem, store and canvas stay real.
      await app.evaluate(({ dialog }, workspace) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
      }, workspace);
      await page.getByRole('button', { name: '新建项目', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: '新建项目', exact: true });
      await dialog.getByLabel('项目名称', { exact: true }).fill(template.name);
      await dialog.getByLabel('起步模板', { exact: true }).selectOption(template.id);
      await expect(dialog).toContainText(template.outcome);
      await expect(dialog).toContainText('MIT 开源许可');
      if (index === 0) {
        await page.screenshot({ path: path.join(folder, 'template-picker-wide.png') });
        await page.setViewportSize({ width: 1024, height: 768 });
        expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      }
      await dialog.getByRole('button', { name: /选择项目目录/ }).click();
      const create = dialog.getByRole('button', { name: '创建项目', exact: true });
      await create.scrollIntoViewIfNeeded();
      await expect(create).toBeInViewport();
      if (index === 0) await page.screenshot({ path: path.join(folder, 'template-picker-narrow.png') });
      await create.click();
      await expect(dialog).toHaveCount(0);
      await page.getByTitle('添加图片节点').waitFor();
      const guideCard = page.getByRole('button', { name: `查看产物：${template.name} · 实操说明`, exact: true });
      await expect(guideCard).toBeVisible();
      await guideCard.click();
      const guide = page.getByRole('dialog', { name: `阅读产物：${template.name} · 实操说明`, exact: true });
      await expect(guide.getByRole('heading', { name: '给创作助手的任务', exact: true })).toBeAttached();
      expect(await guide.locator('a[href*="github.com"]').count()).toBeGreaterThanOrEqual(1);
      await guide.getByRole('button', { name: '关闭', exact: true }).click();
      const snapshot = await page.evaluate(workspace => window.electronAPI.loadCanvasSnapshot(workspace), workspace) as { nodes: any[]; edges: any[] };
      expect(snapshot.nodes).toHaveLength(template.nodes.length);
      expect(snapshot.edges).toHaveLength(template.nodes.filter(node => node.reference).length);
      expect(snapshot.nodes.every(node => !node.data.sourcePath && node.data.generationStatus === 'idle')).toBe(true);
      if (index === 0) {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.screenshot({ path: path.join(folder, 'template-canvas.png') });
      }
      await page.getByRole('button', { name: '返回', exact: true }).click();
      await page.getByRole('heading', { name: '我的项目', exact: true }).waitFor();
      await page.getByRole('button', { name: `打开项目 ${template.name}`, exact: true }).click();
      await expect(guideCard).toBeVisible();
      await expect.poll(() => page.locator('.react-flow__node').count()).toBeGreaterThan(0);
      await page.getByRole('button', { name: '返回', exact: true }).click();
    }
    await page.reload();
    await expect(page.getByRole('article')).toHaveCount(6);
    expect(errors).toEqual([]);
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined); }
});
