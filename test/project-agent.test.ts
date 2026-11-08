import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const environment = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => environment.root } }));
vi.mock('electron-log/main', () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
import { createProject, createConversation, listProjects, readManifest, readSessionId, searchProjects, writeSessionId, setProjectAgent } from '../electron/main/services/project.store';
import { normalizeProjectAgent } from '../src/shared/agent-config';
let workspace: string;
beforeEach(async () => { environment.root = await fs.mkdtemp(path.join(os.tmpdir(), 'aigc-agent-project-')); workspace = path.join(environment.root, 'workspace'); await fs.mkdir(workspace); });
afterEach(async () => { await fs.rm(environment.root, { recursive: true, force: true }); });
describe('project agent persistence', () => {
  it('creates independent conversations in unique managed folders and preserves their selected assistant', async () => {
    const first = await createConversation({ provider: 'codex', model: '' });
    const second = await createConversation({ provider: 'claude-code', model: '' });
    expect(path.relative(await fs.realpath(path.join(environment.root, 'aigc-line', 'conversations')), first.folderPath)).toMatch(/^[a-f0-9-]+$/);
    expect(first.folderPath).not.toBe(second.folderPath);
    expect((await readManifest(first.folderPath))?.agent?.provider).toBe('codex');
    expect((await listProjects()).projects).toHaveLength(2);
  });
  it('upgrades the original v1 database without losing rows or the startup restore target', async () => {
    const dataDir = path.join(environment.root, 'aigc-line');
    await fs.mkdir(dataDir);
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(path.join(dataDir, 'projects.sqlite'));
    db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, folder_path TEXT NOT NULL, folder_path_key TEXT NOT NULL,
      comfyui_base_url TEXT NOT NULL, agent_provider TEXT NOT NULL CHECK(agent_provider IN ('claude-code','codex')), agent_model TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, restore_on_launch INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX projects_folder ON projects(folder_path_key);
      CREATE UNIQUE INDEX projects_one_restore ON projects(restore_on_launch) WHERE restore_on_launch = 1;
      CREATE INDEX projects_created ON projects(created_at DESC, id); PRAGMA user_version = 1;`);
    for (const [id, restore] of [['old-1', 0], ['old-2', 1]]) db.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, id, workspace, workspace.toLowerCase(), 'http://127.0.0.1:8188', 'codex', 'kept-model', 1, 2, restore);
    db.close();
    const index = await listProjects();
    expect(index.lastOpenedId).toBe('old-2');
    expect(index.projects).toHaveLength(2);
    expect(index.projects.every(project => project.agent?.model === 'kept-model')).toBe(true);
    const nextFolder = path.join(environment.root, 'new-workspace'); await fs.mkdir(nextFolder);
    expect((await createProject('New relay', nextFolder, { provider: 'relay', model: 'new-model' })).agent?.provider).toBe('relay');
    expect((await listProjects()).lastOpenedId).toBe('old-2');
  });
  it('switches an existing project without changing history, canvas or local CLI sessions', async () => {
    const project = await createProject('Switch', workspace, { provider: 'codex', model: 'old' });
    await writeSessionId(workspace, 'keep-cli-session', 'codex');
    const marker = path.join(workspace, '.aigc-line', 'canvas-snapshot.json'); await fs.writeFile(marker, '{"nodes":[]}');
    expect((await setProjectAgent(project.id, { provider: 'relay', model: '' })).agent?.provider).toBe('relay');
    expect((await readManifest(workspace))?.agent?.provider).toBe('relay');
    expect(await fs.readFile(marker, 'utf8')).toBe('{"nodes":[]}');
    expect(await readSessionId(workspace, 'codex')).toBe('keep-cli-session');
  });
  it('stores and searches relay Agent projects with their actual model', async () => {
    const agent = { provider: 'relay', model: 'my-agent-model' };
    expect((await createProject('创作助手项目', workspace, agent)).agent).toEqual(agent);
    expect((await readManifest(workspace))?.agent).toEqual(agent);
    expect((await searchProjects({ search: '唐门创作助手' })).projects[0].agent).toEqual(agent);
  });
  it('defaults legacy projects to Claude without rewriting their session', async () => {
    await fs.mkdir(path.join(environment.root, 'aigc-line'));
    await fs.writeFile(path.join(environment.root, 'aigc-line/projects.json'), JSON.stringify({ projects: [{ id:'legacy', folderPath:workspace }] }));
    await writeSessionId(workspace, 'claude-session');
    expect((await listProjects()).projects[0].agent).toEqual({provider:'claude-code',model:''});
    expect(await readSessionId(workspace)).toBe('claude-session');
    expect(await readSessionId(workspace, 'codex')).toBeNull();
  });
  it('persists provider/model in the index and workspace manifest with isolated sessions', async () => {
    const agent = { provider:'codex' as const, model:'custom-model' };
    expect((await createProject('Codex project', workspace, agent)).agent).toEqual(agent);
    expect((await listProjects()).projects[0].agent).toEqual(agent);
    expect((await readManifest(workspace))?.agent).toEqual(agent);
    await writeSessionId(workspace, 'claude-session');
    await writeSessionId(workspace, 'codex-session', 'codex');
    expect(await readSessionId(workspace)).toBe('claude-session');
    expect(await readSessionId(workspace, 'codex')).toBe('codex-session');
    await writeSessionId(workspace, '', 'codex');
    expect(await readSessionId(workspace)).toBe('claude-session');
  });
  it('rejects invalid providers, duplicate directories and concurrent duplicate creation', async () => {
    expect(() => normalizeProjectAgent({provider:'other'})).toThrow();
    const results = await Promise.allSettled([createProject('One',workspace),createProject('Two',workspace)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await listProjects()).projects).toHaveLength(1);
  });
  it('does not overwrite a malformed existing workspace manifest', async () => {
    await fs.mkdir(path.join(workspace, '.aigc-line'));
    await fs.writeFile(path.join(workspace, '.aigc-line/manifest.json'), '{broken');
    await expect(createProject('One', workspace)).rejects.toThrow('已有项目');
  });
  it('rejects corrupt legacy JSON before initial migration and ignores it after migration', async () => {
    await fs.mkdir(path.join(environment.root, 'aigc-line'));
    await fs.writeFile(path.join(environment.root,'aigc-line/projects.json'), '{broken');
    await expect(listProjects()).rejects.toThrow('项目列表读取失败');
    await fs.writeFile(path.join(environment.root,'aigc-line/projects.json'), JSON.stringify({ projects: [] }));
    expect((await listProjects()).projects).toHaveLength(0);
    await fs.writeFile(path.join(environment.root,'aigc-line/projects.json'), '{broken');
    expect((await listProjects()).projects).toHaveLength(0);
  });
  it('migrates legacy project rows once and searches them in pages', async () => {
    const dataDir = path.join(environment.root, 'aigc-line');
    await fs.mkdir(dataDir);
    await fs.writeFile(path.join(dataDir, 'projects.json'), JSON.stringify({
      projects: [
        { id: 'a', name: '都市剧本 1', folderPath: path.join(environment.root, 'a'), createdAt: 1, updatedAt: 1 },
        { id: 'b', name: '都市剧本 2', folderPath: path.join(environment.root, 'b'), createdAt: 2, updatedAt: 2, agent: { provider: 'codex', model: 'custom' } },
        { id: 'c', name: '其他', folderPath: path.join(environment.root, 'c'), createdAt: 3, updatedAt: 3 },
        { id: 'd', name: '其他副本', folderPath: path.join(environment.root, 'c'), createdAt: 4, updatedAt: 4 },
      ],
      lastOpenedId: 'b',
    }));
    expect((await listProjects()).lastOpenedId).toBe('b');
    expect((await listProjects()).projects).toHaveLength(4);
    const first = await searchProjects({ search: '都市剧本', page: 1, pageSize: 1 });
    expect(first).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(first.projects.map(project => project.id)).toEqual(['b']);
    const second = await searchProjects({ search: '都市剧本', page: 2, pageSize: 1 });
    expect(second.projects.map(project => project.id)).toEqual(['a']);
    expect((await searchProjects({ search: 'CODEX' })).projects.map(project => project.id)).toEqual(['b']);
    expect((await searchProjects({ search: 'custom' })).projects.map(project => project.id)).toEqual(['b']);
  });
  it('manual migration script imports projects and is safe to run again', async () => {
    const dataDir = path.join(environment.root, 'aigc-line');
    await fs.mkdir(dataDir);
    const legacyFile = path.join(dataDir, 'projects.json');
    const legacy = JSON.stringify({
      projects: [
        { id: 'old', name: '旧项目', folderPath: workspace, createdAt: 123, updatedAt: 123 },
        { id: 'old-copy', name: '旧项目副本', folderPath: workspace, createdAt: 122, updatedAt: 122 },
      ],
      lastOpenedId: 'old',
    });
    await fs.writeFile(legacyFile, legacy);
    const script = path.resolve('scripts/migrate-projects.mjs');
    execFileSync(process.execPath, [script, '--data-dir', dataDir]);
    await fs.rename(legacyFile, `${legacyFile}.bak`);
    execFileSync(process.execPath, [script, '--data-dir', dataDir]);
    await fs.rename(`${legacyFile}.bak`, legacyFile);
    expect((await listProjects()).projects.map(project => project.id)).toEqual(['old', 'old-copy']);
    expect((await listProjects()).lastOpenedId).toBe('old');
    expect(await fs.readFile(legacyFile, 'utf8')).toBe(legacy);
  });
});
