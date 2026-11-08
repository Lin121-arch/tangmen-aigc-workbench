import type { Artifact } from '../../../../src/shared/ipc.types';
import { messageHub } from '../message-hub';
import log from 'electron-log/main';
import { createHash } from 'node:crypto';

let lastTimestamp = 0;

/** Push an artifact to the frontend */
export function pushArtifact(
  projectId: string,
  type: Artifact['type'],
  title: string,
  content: string,
  width = 400,
  height = 300,
  sourcePath?: string,
): Artifact {
  const artifact: Artifact = {
    id: sourcePath ? `artifact-${createHash('sha256').update(`${projectId}/${sourcePath.replace(/\\/g, '/')}`).digest('hex').slice(0, 24)}` : `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    content,
    path: sourcePath,
    width,
    height,
    timestamp: lastTimestamp = Math.max(Date.now(), lastTimestamp + 1),
  };
  log.info('[Agent] Pushing artifact:', artifact.id, type, title);
  messageHub.pushArtifact(projectId, artifact);
  return artifact;
}
