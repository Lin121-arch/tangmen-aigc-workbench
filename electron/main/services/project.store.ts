import path from 'node:path';
import { normalizeTemplateModels, type TemplateModelSelection } from '../../../src/shared/template-models';
import { migrateCanvasDocuments } from '../../../src/shared/canvas-artifacts';
import { normalizeProjectAgent, type AgentProvider } from '../../../src/shared/agent-config';
import { findCreativeTemplate, buildTemplateSnapshot, buildTemplateGuide, type CreativeTemplate } from '../../../src/shared/creative-templates';
import fs from 'node:fs/promises';
import { app } from 'electron';
import log from 'electron-log/main';
import { v4 as uuidv4 } from 'uuid';
import { atomicWriteFile, serializeFileOperation } from './atomic-file';
import { findProject, insertProject, listProjectIndex, openProjectDatabase, projectFolderKey, queryProjectPage } from './project-index-db';
import type { ProjectPage, ProjectPageQuery } from '../../../src/shared/ipc.types';
import type {
  Project,
  ProjectIndex,
  ProjectManifest,
  ChatMessage,
} from '../../../src/shared/ipc.types';
import {
  parseChatEventLog,
  replayChatEvents,
  type ChatHistoryEvent,
} from '../../../src/shared/chat-event-log';

const APP_DIR_NAME = 'aigc-line';
const PROJECTS_DATABASE_FILE = 'projects.sqlite';
const PROJECT_DIR_NAME = '.aigc-line';
const MANIFEST_FILE = 'manifest.json';
const CHAT_EVENTS_FILE = 'chat-events.jsonl';
const SESSION_FILE = 'session.json';
const CANVAS_SNAPSHOT_FILE = 'canvas-snapshot.json';

export function getAppDataDir(): string {
  const dir = path.join(app.getPath('userData'), APP_DIR_NAME);
  return dir;
}

const indexTransaction = <T>(operation: () => Promise<T>): Promise<T> =>
  serializeFileOperation(path.join(getAppDataDir(), PROJECTS_DATABASE_FILE), operation);
export function createProject(name: string, folderPath: string, agentConfig?: unknown, templateId?: unknown, templateModels?: unknown): Promise<Project> {
  return indexTransaction(() => createProjectInternal(name, folderPath, agentConfig, templateId, templateModels));
}
/** A chat is backed by the existing project history, without asking the user to choose a folder. */
export async function createConversation(agentConfig?: unknown): Promise<Project> {
  const agent = normalizeProjectAgent(agentConfig ?? { provider: 'codex', model: '' });
  const folder = path.join(getAppDataDir(), 'conversations', uuidv4());
  await fs.mkdir(folder, { recursive: true });
  try { return await createProject(`对话 · ${new Date().toLocaleString('zh-CN', { hour12: false })}`, folder, agent); }
  catch (error) { await fs.rmdir(folder).catch(() => undefined); throw error; }
}

async function createProjectInternal(
  name: string,
  folderPath: string,
  agentConfig?: unknown,
  templateId?: unknown,
  templateModels?: unknown,
): Promise<Project> {
  const agent = normalizeProjectAgent(agentConfig);
  const template = findCreativeTemplate(templateId);
  const models = normalizeTemplateModels(templateModels);
  if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) throw new Error('请选择有效的项目目录');
  folderPath = await fs.realpath(folderPath);
  if (!(await fs.stat(folderPath)).isDirectory()) throw new Error('项目路径必须是文件夹');
  if (template) {
    try {
      await fs.lstat(path.join(folderPath, PROJECT_DIR_NAME));
      throw new Error('目录中已有工作台文件，请为模板选择一个新目录');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const db = await openProjectDatabase(getAppDataDir());
  try {
    if (db.prepare('SELECT 1 FROM projects WHERE folder_path_key = ?').get(projectFolderKey(folderPath))) {
      throw new Error('该目录已有项目，请直接打开历史项目');
    }
    try {
      await fs.access(path.join(folderPath, PROJECT_DIR_NAME, MANIFEST_FILE));
      throw new Error('该目录包含已有项目，请选择一个新的目录');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const now = Date.now();
    const project: Project = {
      id: uuidv4(),
      agent,
      name: name.trim() || path.basename(folderPath),
      folderPath,
      comfyuiBaseUrl: 'http://127.0.0.1:8188',
      createdAt: now,
      updatedAt: now,
    };

    const manifest: ProjectManifest = {
      projectId: project.id,
      agent,
      folderPath,
      cues: [],
      scenes: [],
      runs: [],
    };
    if (template) await initializeTemplateFiles(project, manifest, template, models);
    else {
      await fs.mkdir(path.join(folderPath, PROJECT_DIR_NAME), { recursive: true });
      await writeManifest(folderPath, manifest);
    }
    insertProject(db, project);
    return project;
  } finally { db.close(); }
}

/** Stage new metadata before exposing a usable project; never apply over an existing canvas. */
async function initializeTemplateFiles(project: Project, manifest: ProjectManifest, template: CreativeTemplate, models: TemplateModelSelection): Promise<void> {
  const stage = path.join(project.folderPath, `${PROJECT_DIR_NAME}.init-${project.id}`);
  const guidePath = `template-guide-${project.id}.md`;
  const content = buildTemplateGuide(template, models);
  const message: ChatMessage = {
    id: `template-${project.id}`, role: 'assistant', timestamp: project.createdAt,
    content: `已准备“${template.name}”的节点与提示词。请先打开实操说明，配置模型后按步骤手动生成。`,
    artifact: { id: `template-guide-${project.id}`, type: 'markdown', title: `${template.name} · 实操说明`,
      content, path: guidePath, width: 720, height: 540, timestamp: project.createdAt },
  };
  const files = [
    [MANIFEST_FILE, JSON.stringify(manifest, null, 2)],
    [CANVAS_SNAPSHOT_FILE, JSON.stringify(buildTemplateSnapshot(template, project.id, models))],
    [CHAT_EVENTS_FILE, JSON.stringify({ version: 1, seq: 1, type: 'message.created', message } satisfies ChatHistoryEvent) + '\n'],
  ];
  await fs.mkdir(stage);
  let guideCreated = false;
  try {
    for (const [name, text] of files) await fs.writeFile(path.join(stage, name), text, { encoding: 'utf8', flag: 'wx' });
    await fs.writeFile(path.join(project.folderPath, guidePath), content, { encoding: 'utf8', flag: 'wx' });
    guideCreated = true;
    await fs.rename(stage, path.join(project.folderPath, PROJECT_DIR_NAME));
  } catch (error) {
    // Only our uniquely named staging files; a failed import cannot remove existing user material.
    for (const [name] of files) await fs.unlink(path.join(stage, name)).catch(() => undefined);
    await fs.rmdir(stage).catch(() => undefined);
    if (guideCreated) await fs.unlink(path.join(project.folderPath, guidePath)).catch(() => undefined);
    throw error;
  }
}

export async function listProjects(): Promise<ProjectIndex> {
  return indexTransaction(async () => {
    const db = await openProjectDatabase(getAppDataDir());
    try { return listProjectIndex(db); }
    finally { db.close(); }
  });
}

export async function searchProjects(query: ProjectPageQuery): Promise<ProjectPage> {
  return indexTransaction(async () => {
    const db = await openProjectDatabase(getAppDataDir());
    try { return queryProjectPage(db, query); }
    finally { db.close(); }
  });
}

export async function loadProject(id: string): Promise<Project | null> {
  return indexTransaction(async () => {
    const db = await openProjectDatabase(getAppDataDir());
    try { return findProject(db, id); }
    finally { db.close(); }
  });
}

export async function setProjectAgent(id: string, value: unknown): Promise<Project> {
  const agent = normalizeProjectAgent(value);
  return indexTransaction(async () => {
    const db = await openProjectDatabase(getAppDataDir());
    try {
      const project = findProject(db, id);
      if (!project) throw new Error('项目不存在');
      const manifest = await readManifest(project.folderPath);
      if (!manifest || manifest.projectId !== id) throw new Error('项目清单无效，无法切换助手');
      const updated = { ...project, agent, updatedAt: Date.now() };
      await writeManifest(project.folderPath, { ...manifest, agent });
      try { db.prepare('UPDATE projects SET agent_provider = ?, agent_model = ?, updated_at = ? WHERE id = ?').run(agent.provider, agent.model, updated.updatedAt, id); }
      catch (error) { await writeManifest(project.folderPath, manifest); throw error; }
      return updated;
    } finally { db.close(); }
  });
}

export async function deleteProject(id: string): Promise<void> {
  return indexTransaction(async () => {
    const db = await openProjectDatabase(getAppDataDir());
    try { db.prepare('DELETE FROM projects WHERE id = ?').run(id); }
    finally { db.close(); }
  });
}

export async function setLastOpened(id: string): Promise<void> {
  return indexTransaction(async () => {
    const db = await openProjectDatabase(getAppDataDir());
    try {
      if (!findProject(db, id)) return;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE projects SET restore_on_launch = 0 WHERE restore_on_launch = 1').run();
        db.prepare('UPDATE projects SET restore_on_launch = 1 WHERE id = ?').run(id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } finally { db.close(); }
  });
}

/** Closing an older workspace must not clear a newer workspace's restore target. */
export async function closeProject(id: string): Promise<void> {
  if (typeof id !== 'string' || !id) throw new Error('项目 ID 无效');
  return indexTransaction(async () => {
    const db = await openProjectDatabase(getAppDataDir());
    try { db.prepare('UPDATE projects SET restore_on_launch = 0 WHERE id = ? AND restore_on_launch = 1').run(id); }
    finally { db.close(); }
  });
}

export async function readManifest(folderPath: string): Promise<ProjectManifest | null> {
  const filePath = path.join(folderPath, PROJECT_DIR_NAME, MANIFEST_FILE);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as ProjectManifest;
    return {
      projectId: parsed.projectId,
      agent: normalizeProjectAgent(parsed.agent),
      folderPath: parsed.folderPath,
      audioPath: parsed.audioPath,
      srtPath: parsed.srtPath,
      cues: parsed.cues ?? [],
      scenes: parsed.scenes ?? [],
      runs: parsed.runs ?? [],
    };
  } catch {
    return null;
  }
}

export async function writeManifest(
  folderPath: string,
  manifest: ProjectManifest,
): Promise<void> {
  const dir = path.join(folderPath, PROJECT_DIR_NAME);
  const filePath = path.join(dir, MANIFEST_FILE);
  await serializeFileOperation(filePath, () => atomicWriteFile(filePath, JSON.stringify(manifest, null, 2)));
}

// The log remains append-only; its current message index is rebuilt only after external changes.
interface ChatIndex {
  signature: string;
  nextSeq: number;
  messages: ChatMessage[];
  indexes: Map<string, number>;
  incompleteContent?: string;
}
const chatIndexes = new Map<string, ChatIndex>();
const chatEventsPath = (folderPath: string): string => path.join(folderPath, PROJECT_DIR_NAME, CHAT_EVENTS_FILE);
const chatKey = (folderPath: string): string => process.platform === 'win32' ? path.resolve(folderPath).toLowerCase() : path.resolve(folderPath);
async function chatSignature(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    return [stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino].join(':');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}
async function loadChatIndex(folderPath: string, forWrite: boolean): Promise<ChatIndex> {
  const filePath = chatEventsPath(folderPath);
  const key = chatKey(folderPath);
  const signature = await chatSignature(filePath);
  let cached = chatIndexes.get(key);
  if (!cached || cached.signature !== signature) {
    const parsed = signature === 'missing'
      ? { events: [] as ChatHistoryEvent[], ignoredIncompleteTail: false }
      : parseChatEventLog(await fs.readFile(filePath, 'utf8'));
    const messages = replayChatEvents(parsed.events);
    cached = { signature, nextSeq: (parsed.events.at(-1)?.seq ?? 0) + 1, messages,
      indexes: new Map(messages.map((message, index) => [message.id, index])),
      incompleteContent: parsed.ignoredIncompleteTail ? parsed.events.map(event => JSON.stringify(event)).join('\n') : undefined };
    if (parsed.ignoredIncompleteTail) log.warn('[ProjectStore] Ignoring incomplete final chat event:', filePath);
    chatIndexes.set(key, cached);
  }
  // Bound retained project indexes; entries can always be reconstructed from the log.
  chatIndexes.delete(key); chatIndexes.set(key, cached);
  if (chatIndexes.size > 8) chatIndexes.delete(chatIndexes.keys().next().value!);
  if (forWrite && cached.incompleteContent !== undefined) {
    await fs.copyFile(filePath, filePath + '.corrupt-' + uuidv4());
    await atomicWriteFile(filePath, cached.incompleteContent ? cached.incompleteContent + '\n' : '');
    cached.incompleteContent = undefined;
    cached.signature = await chatSignature(filePath);
  }
  return cached;
}
export async function readChatHistory(folderPath: string): Promise<ChatMessage[]> {
  // Migration must finish before history is returned, even when canvas/history load concurrently.
  await readCanvasSnapshot(folderPath).catch(error => log.warn('[ProjectStore] Document migration deferred; original canvas preserved:', error));
  return serializeFileOperation(chatEventsPath(folderPath), async () => structuredClone((await loadChatIndex(folderPath, false)).messages));
}
async function writeChatEvent(folderPath: string, cached: ChatIndex, event: ChatHistoryEvent): Promise<void> {
  const filePath = chatEventsPath(folderPath);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(event) + '\n', 'utf8');
    cached.nextSeq = event.seq + 1;
    if (event.type === 'message.created') {
      cached.indexes.set(event.message.id, cached.messages.length);
      cached.messages.push(event.message);
    } else {
      const index = cached.indexes.get(event.messageId);
      if (index !== undefined) {
        cached.messages[index] = event.message;
        cached.indexes.delete(event.messageId);
        cached.indexes.set(event.message.id, index);
      }
    }
    cached.signature = await chatSignature(filePath);
  } catch (error) {
    chatIndexes.delete(chatKey(folderPath));
    throw error;
  }
}
export function appendChatMessage(folderPath: string, message: ChatMessage): Promise<void> {
  const captured = structuredClone(message);
  return serializeFileOperation(chatEventsPath(folderPath), async () => {
    const cached = await loadChatIndex(folderPath, true);
    await writeChatEvent(folderPath, cached, { version: 1, seq: cached.nextSeq, type: 'message.created', message: captured });
  });
}
export function updateChatMessage(folderPath: string, messageId: string, updater: (msg: ChatMessage) => ChatMessage): Promise<void> {
  return serializeFileOperation(chatEventsPath(folderPath), async () => {
    const cached = await loadChatIndex(folderPath, true);
    const index = cached.indexes.get(messageId);
    if (index === undefined) return;
    const message = structuredClone(updater(structuredClone(cached.messages[index])));
    await writeChatEvent(folderPath, cached, { version: 1, seq: cached.nextSeq, type: 'message.replaced', messageId, message });
  });
}

// Session persistence for Claude Agent SDK
export async function readSessionId(folderPath: string, provider: AgentProvider = 'claude-code'): Promise<string | null> {
  const filePath = path.join(folderPath, PROJECT_DIR_NAME, provider === 'codex' ? 'codex-session.json' : SESSION_FILE);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as { sessionId: string };
    return parsed.sessionId ?? null;
  } catch {
    return null;
  }
}

export async function writeSessionId(folderPath: string, sessionId: string, provider: AgentProvider = 'claude-code'): Promise<void> {
  const dir = path.join(folderPath, PROJECT_DIR_NAME);
  const filePath = path.join(dir, provider === 'codex' ? 'codex-session.json' : SESSION_FILE);
  await serializeFileOperation(filePath, () => atomicWriteFile(filePath, JSON.stringify({ sessionId }, null, 2)));
}

// Canvas snapshot persistence
export async function readCanvasSnapshot(folderPath: string): Promise<unknown | null> {
  const filePath = path.join(folderPath, PROJECT_DIR_NAME, CANVAS_SNAPSHOT_FILE);
  return serializeFileOperation(filePath, async () => {
    try {
      let data: string;
      try { data = await fs.readFile(filePath, 'utf-8'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
      const parsed: unknown = JSON.parse(data);
      const migration = migrateCanvasDocuments(parsed);
      if (!migration) return parsed;
      // Keep the complete original layout; never remove nodes before chat is safely persisted.
      await atomicWriteFile(filePath + '.before-chat-documents.bak', data);
      await serializeFileOperation(chatEventsPath(folderPath), async () => {
        const cached = await loadChatIndex(folderPath, true);
        for (const artifact of migration.artifacts) {
          const existing = cached.messages.some(message => message.artifact && (
            message.artifact.id === artifact.id || (!!artifact.path && message.artifact.path?.replace(/\\/g, '/') === artifact.path.replace(/\\/g, '/'))
          ) && (message.artifact.timestamp > artifact.timestamp || (
            message.artifact.timestamp === artifact.timestamp && message.artifact.content === artifact.content
          )));
          if (existing) continue;
          const message: ChatMessage = { id: `msg-document-${uuidv4()}`, role: 'assistant',
            content: `Artifact: ${artifact.title}`, timestamp: artifact.timestamp, artifact };
          await writeChatEvent(folderPath, cached, { version: 1, seq: cached.nextSeq, type: 'message.created', message });
        }
      });
      await atomicWriteFile(filePath, JSON.stringify(migration.snapshot));
      return migration.snapshot;
    } catch (error) {
      throw new Error(`画布快照读取失败，原文件已保留：${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export async function writeCanvasSnapshot(folderPath: string, snapshot: unknown): Promise<void> {
  const dir = path.join(folderPath, PROJECT_DIR_NAME);
  const filePath = path.join(dir, CANVAS_SNAPSHOT_FILE);
  const content = JSON.stringify(snapshot);
  await serializeFileOperation(filePath, () => atomicWriteFile(filePath, content));
}
