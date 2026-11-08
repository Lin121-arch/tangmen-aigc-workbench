import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasNodeSnapshot, CanvasEdgeSnapshot } from '../src/shared/ipc.types';

const environment = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => environment.root } }));
vi.mock('electron-log/main', () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
import { createProject, listProjects, readCanvasSnapshot, readChatHistory } from '../electron/main/services/project.store';

let workspace: string;
beforeEach(async () => {
  environment.root = await fs.mkdtemp(path.join(os.tmpdir(), 'tangmen-templates-'));
  workspace = path.join(environment.root, 'workspace');
  await fs.mkdir(workspace);
});
afterEach(async () => { await fs.rm(environment.root, { recursive: true, force: true }); });

describe('ready-to-edit open-source templates', () => {
  it('applies chosen cloud workflows to every template node and records them in the guide', async () => {
    await createProject('Bound', workspace, undefined, 'product-video', { imageWorkflowId: 'google-gemini-3-pro-image', videoWorkflowId: 'relay-video:my-video' });
    const snapshot = await readCanvasSnapshot(workspace) as { nodes: CanvasNodeSnapshot[] };
    for (const node of snapshot.nodes) expect(node.data.workflowId).toBe(node.data.kind === 'image' ? 'google-gemini-3-pro-image' : 'relay-video:my-video');
    const guide = (await readChatHistory(workspace))[0].artifact!.content;
    expect(guide).toContain('relay-video:my-video');
    expect(guide).not.toContain('手动在每个视频节点顶部选择');
  });
  it('rejects malformed template model choices before creating files', async () => {
    await expect(createProject('Bad', workspace, undefined, 'product-video', { imageWorkflowId: 123 })).rejects.toThrow('模型');
    expect(await fs.readdir(workspace)).toEqual([]);
  });
  it.each(['anime-character', 'anime-storyboard', 'textbook-explainer', 'product-video', 'scene-variants', 'social-kit'])(
    'creates %s as real native nodes, references and a persisted guide without submitting generation', async templateId => {
      await fs.writeFile(path.join(workspace, 'keep.txt'), 'existing material');
      await createProject('Template', workspace, { provider: 'relay', model: '' }, templateId);
      const snapshot = await readCanvasSnapshot(workspace) as { nodes: CanvasNodeSnapshot[]; edges: CanvasEdgeSnapshot[] };
      expect(snapshot?.nodes.length).toBeGreaterThanOrEqual(3);
      const nodes = new Map(snapshot.nodes.map(node => [node.id, node]));
      expect(nodes.size).toBe(snapshot.nodes.length);
      for (const node of snapshot.nodes) {
        expect(['image', 'video']).toContain(node.data.kind);
        expect(node.data.prompt?.length).toBeGreaterThan(30);
        expect(node.data.generationStatus).toBe('idle');
        expect(node.data.sourcePath).toBeUndefined();
        expect(node.data.preview).toBeUndefined();
        for (const ref of [...(node.data.referenceImageNodeIds ?? []), ...(node.data.firstFrameNodeId ? [node.data.firstFrameNodeId] : [])]) {
          expect(nodes.get(ref)?.data.kind).toBe('image');
          expect(snapshot.edges.some(edge => edge.source === ref && edge.target === node.id)).toBe(true);
        }
        if (node.data.kind === 'image') expect(node.data.workflowId).toBe('luna-batch-image');
      }
      for (const edge of snapshot.edges) { expect(nodes.has(edge.source) && nodes.has(edge.target)).toBe(true); }
      const history = await readChatHistory(workspace);
      const guide = history.find(message => message.artifact?.type === 'markdown')?.artifact;
      expect(guide?.content).toContain('给创作助手的任务');
      expect(guide?.content).toContain('MIT');
      expect(guide?.content).toContain('github.com/');
      expect(guide?.content).toContain('手动');
      expect(await fs.readFile(path.join(workspace, guide!.path!), 'utf8')).toBe(guide!.content);
      expect(await fs.readFile(path.join(workspace, 'keep.txt'), 'utf8')).toBe('existing material');
      await expect(fs.access(path.join(workspace, '.aigc-line/generation-tasks'))).rejects.toThrow();
    },
  );
  it('keeps a blank project blank when no template is selected', async () => {
    await createProject('Blank', workspace);
    expect(await readCanvasSnapshot(workspace)).toBeNull();
    expect(await readChatHistory(workspace)).toEqual([]);
  });
  it('rejects unknown template IDs before writing project files or index entries', async () => {
    await expect(createProject('Bad', workspace, undefined, '../../bad')).rejects.toThrow('模板');
    expect(await fs.readdir(workspace)).toEqual([]);
    expect((await listProjects()).projects).toEqual([]);
  });
  it('does not overwrite an orphaned canvas when the directory has no manifest', async () => {
    await fs.mkdir(path.join(workspace, '.aigc-line'));
    const original = '{"nodes":[{"id":"user-work"}]}';
    await fs.writeFile(path.join(workspace, '.aigc-line/canvas-snapshot.json'), original);
    await expect(createProject('Protected', workspace, undefined, 'anime-character')).rejects.toThrow('已有');
    expect(await fs.readFile(path.join(workspace, '.aigc-line/canvas-snapshot.json'), 'utf8')).toBe(original);
    expect((await listProjects()).projects).toEqual([]);
  });
});
