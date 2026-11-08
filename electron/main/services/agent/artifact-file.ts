import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Artifact } from '../../../../src/shared/ipc.types';
import { readBoundedMedia } from '../media-io';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']);
const markdownExtensions = new Set(['.md', '.markdown']);
const textExtensions = new Set(['.txt', '.log', '.json', '.yaml', '.yml', '.toml', '.xml', '.csv', '.tsv', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.py', '.sh', '.ps1', '.sql', '.c', '.cpp', '.h', '.java', '.go', '.rs', '.srt', '.vtt']);

/** Read only supported, bounded files whose real path remains in this project. */
export async function readArtifactFile(projectId: string, folderPath: string, inputPath: string): Promise<Pick<Artifact, 'type' | 'content' | 'path'>> {
  const root = await fs.realpath(folderPath);
  const filePath = await fs.realpath(path.resolve(folderPath, inputPath));
  const relative = path.relative(root, filePath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || relative.split(path.sep).some(part => part.toLowerCase() === '.aigc-line')) {
    throw new Error('产物必须是当前项目内的普通文件，不能读取项目外文件或 .aigc-line 内部数据');
  }
  const ext = path.extname(filePath).toLowerCase();
  const isImage = imageExtensions.has(ext);
  const isHtml = ext === '.html' || ext === '.htm';
  if (!isImage && !isHtml && !markdownExtensions.has(ext) && !textExtensions.has(ext)) {
    throw new Error(`PushArtifact 不支持 ${ext || '无扩展名'} 文件。支持图片、Markdown、HTML 和常用 UTF-8 文本/代码；视频和音频请使用 CreateCanvasNodes 创建 video/audio 节点并设置 sourcePath。`);
  }
  const bytes = await readBoundedMedia(filePath, isImage ? 20 * 1024 * 1024 : 1024 * 1024, '产物文件');
  const sourcePath = relative.split(path.sep).join('/');
  if (isImage) {
    const version = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    return { type: 'image', path: sourcePath, content: `workspace://${projectId}/${sourcePath.split('/').map(encodeURIComponent).join('/')}?v=${version}` };
  }
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('文档产物必须使用 UTF-8 编码'); }
  if (content.includes('\0')) throw new Error('文件包含二进制内容，不能作为文档产物展示');
  if (textExtensions.has(ext)) {
    let longestFence = 2;
    for (const match of content.matchAll(/`+/g)) longestFence = Math.max(longestFence, match[0].length);
    const fence = '`'.repeat(longestFence + 1);
    content = `${fence}${ext === '.txt' || ext === '.log' ? 'text' : ext.slice(1)}\n${content}\n${fence}`;
  }
  return { type: isHtml ? 'html' : 'markdown', path: sourcePath, content };
}
