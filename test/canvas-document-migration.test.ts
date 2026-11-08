import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: { getPath: () => '' } }));
vi.mock('electron-log/main', () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
import { appendChatMessage, readCanvasSnapshot, readChatHistory, writeCanvasSnapshot } from '../electron/main/services/project.store';

let workspace: string;
beforeEach(async () => { workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aigc-document-migration-')); });
afterEach(async () => {
  vi.restoreAllMocks();
  const resolved = path.resolve(workspace);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('aigc-document-migration-')) throw new Error('Unexpected test directory');
  await fs.rm(resolved, { recursive: true, force: true });
});
const artifact = { id: 'report', type: 'markdown' as const, title: '报告', path: 'reports/report.md', content: '# 正文', timestamp: 10, width: 640, height: 420 };
const media = { id: 'image', type: 'storyNode', position: { x: 600, y: 0 }, data: { kind: 'image', title: '参考图', sourcePath: 'images/keep.png' } };
const snapshot = { nodes: [
  { id: 'document', type: 'storyNode', position: { x: 0, y: 0 }, data: { kind: 'document', title: artifact.title, artifactId: artifact.id, sourcePath: artifact.path,
    artifactUpdatedAt: 10, document: { format: artifact.type, content: artifact.content, width: 640, height: 420 } } }, media,
], edges: [{ id: 'old', source: 'document', target: 'image' }], viewport: { x: 12, y: 23, zoom: 0.8 } };

it('migrates orphan documents durably, preserves media and backup, and serializes concurrent history/canvas reads', async () => {
  await writeCanvasSnapshot(workspace, snapshot);
  const [canvas, history] = await Promise.all([readCanvasSnapshot(workspace), readChatHistory(workspace)]);
  expect(canvas).toEqual({ ...snapshot, nodes: [media], edges: [] });
  expect(history).toHaveLength(1);
  expect(history[0].artifact).toEqual(artifact);
  expect(JSON.parse(await fs.readFile(path.join(workspace, '.aigc-line/canvas-snapshot.json.before-chat-documents.bak'), 'utf8'))).toEqual(snapshot);
  await writeCanvasSnapshot(workspace, snapshot); // Retry after interruption / an old restored backup.
  expect(await readChatHistory(workspace)).toEqual(history);
});

it('keeps the newer chat artifact when the old canvas has stale content', async () => {
  await appendChatMessage(workspace, { id: 'chat', role: 'assistant', content: '', timestamp: 20, artifact: { ...artifact, timestamp: 20, content: '# 新版' } });
  await writeCanvasSnapshot(workspace, snapshot);
  const history = await readChatHistory(workspace);
  expect(history).toHaveLength(1);
  expect(history[0].artifact?.content).toBe('# 新版');
});

it('never removes canvas content when persisting migrated chat fails', async () => {
  await writeCanvasSnapshot(workspace, snapshot);
  const append = vi.spyOn(fs, 'appendFile').mockRejectedValueOnce(new Error('disk full'));
  await expect(readCanvasSnapshot(workspace)).rejects.toThrow('disk full');
  expect(JSON.parse(await fs.readFile(path.join(workspace, '.aigc-line/canvas-snapshot.json'), 'utf8'))).toEqual(snapshot);
  append.mockRestore();
  expect(await readChatHistory(workspace)).toHaveLength(1);
});

it('rejects malformed legacy documents while preserving the original snapshot', async () => {
  const invalid = { ...snapshot, nodes: [{ ...snapshot.nodes[0], data: { kind: 'document', title: '损坏', document: {} } }] };
  await writeCanvasSnapshot(workspace, invalid);
  await expect(readCanvasSnapshot(workspace)).rejects.toThrow('旧文档产物格式不正确');
  expect(JSON.parse(await fs.readFile(path.join(workspace, '.aigc-line/canvas-snapshot.json'), 'utf8'))).toEqual(invalid);
});
