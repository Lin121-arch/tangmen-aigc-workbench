import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('GitHub entry opens this project in the system browser without navigating the workbench', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'TangmenGithubEntry-'));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: root });
  try {
    const page = await app.firstWindow();
    const entry = page.getByRole('link', { name: '打开唐门AIGC工作台 GitHub 项目' });
    await expect(entry).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.aigc-startup')).toHaveCount(0);
    const currentUrl = page.url();
    // Replace only the OS browser boundary; the native link and window-open handler remain real.
    await app.evaluate(({ shell }) => {
      const state = globalThis as unknown as { openedGithubUrls: string[] };
      state.openedGithubUrls = [];
      shell.openExternal = async url => { state.openedGithubUrls.push(url); };
    });
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(entry).toBeInViewport();
      expect(await entry.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('no-drag');
      await entry.click();
    }
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { openedGithubUrls: string[] }).openedGithubUrls)).toEqual([
      'https://github.com/Lin121-arch/tangmen-aigc-workbench',
      'https://github.com/Lin121-arch/tangmen-aigc-workbench',
    ]);
    await expect(page).toHaveURL(currentUrl);
    expect(app.windows()).toHaveLength(1);
    await page.setViewportSize({ width: 1440, height: 900 });
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results/github-entry.png') });
  } finally {
    await app.close();
  }
});
