import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { readArtifactFile } from '../electron/main/services/agent/artifact-file';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'aigc-artifacts-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it('reads Markdown/HTML and preserves source-relative paths', async () => {
  await fs.mkdir(path.join(root, 'reports'));
  await fs.writeFile(path.join(root, 'reports/报告.md'), '# 报告\n正文');
  await fs.writeFile(path.join(root, 'page.html'), '<button>测试</button>');
  expect(await readArtifactFile('p', root, 'reports/报告.md')).toEqual({ type: 'markdown', path: 'reports/报告.md', content: '# 报告\n正文' });
  expect((await readArtifactFile('p', root, 'page.html')).type).toBe('html');
});

it('quotes text/code literally even when it contains Markdown fences', async () => {
  await fs.writeFile(path.join(root, 'code.txt'), '<b>hello</b>\n```\ntext');
  expect((await readArtifactFile('p', root, 'code.txt')).content).toBe('````text\n<b>hello</b>\n```\ntext\n````');
});

it('rejects binaries, oversized text, invalid UTF-8 and internal project data', async () => {
  for (const file of ['clip.mp4', 'file.pdf']) {
    await fs.writeFile(path.join(root, file), 'binary');
    await expect(readArtifactFile('p', root, file)).rejects.toThrow('不支持');
  }
  await fs.writeFile(path.join(root, 'large.md'), Buffer.alloc(1024 * 1024 + 1, 65));
  await expect(readArtifactFile('p', root, 'large.md')).rejects.toThrow('大小');
  await fs.writeFile(path.join(root, 'bad.txt'), Buffer.from([0xff]));
  await expect(readArtifactFile('p', root, 'bad.txt')).rejects.toThrow('UTF-8');
  await fs.mkdir(path.join(root, '.aigc-line'));
  await fs.writeFile(path.join(root, '.aigc-line/internal.json'), '{}');
  await expect(readArtifactFile('p', root, '.aigc-line/internal.json')).rejects.toThrow('内部数据');
});

it('rejects traversal and junction escapes after realpath resolution', async () => {
  const workspace = path.join(root, 'workspace');
  const outside = path.join(root, 'outside');
  await fs.mkdir(workspace); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'private.md'), 'private');
  await fs.symlink(outside, path.join(workspace, 'linked'), 'junction');
  await expect(readArtifactFile('p', workspace, '../outside/private.md')).rejects.toThrow('项目外');
  await expect(readArtifactFile('p', workspace, 'linked/private.md')).rejects.toThrow('项目外');
});

it('uses versioned workspace URLs for images instead of embedding their bytes', async () => {
  await fs.writeFile(path.join(root, '图.png'), Buffer.from('first'));
  const first = await readArtifactFile('p', root, '图.png');
  expect(first.content).toMatch(/^workspace:\/\/p\/%E5%9B%BE.png\?v=/);
  await fs.writeFile(path.join(root, '图.png'), Buffer.from('second'));
  expect((await readArtifactFile('p', root, '图.png')).content).not.toBe(first.content);
});
