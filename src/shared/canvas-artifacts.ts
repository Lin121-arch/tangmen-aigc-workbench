import type { Artifact } from './ipc.types';

/** Preserve legacy document payloads in chat before removing their canvas nodes. */
export function migrateCanvasDocuments(value: unknown): { snapshot: Record<string, unknown>; artifacts: Artifact[] } | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Record<string, unknown>;
  if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) return null;
  const documents = snapshot.nodes.filter(node => node?.data?.kind === 'document');
  if (!documents.length) return null;
  const artifacts = documents.map((node): Artifact => {
    const data = node.data;
    if (typeof node.id !== 'string' || typeof data.title !== 'string' || typeof data.document?.content !== 'string'
      || !['markdown', 'html'].includes(data.document.format)) throw new Error('旧文档产物格式不正确，已保留原画布');
    return {
      id: typeof data.artifactId === 'string' ? data.artifactId : `legacy-document-${node.id}`,
      type: data.document.format, title: data.title, content: data.document.content,
      width: 640, height: 420,
      path: typeof data.sourcePath === 'string' ? data.sourcePath : undefined,
      timestamp: typeof data.artifactUpdatedAt === 'number' && Number.isFinite(data.artifactUpdatedAt) ? data.artifactUpdatedAt : 0,
    };
  });
  const removed = new Set(documents.map(node => node.id));
  return { artifacts, snapshot: { ...snapshot,
    nodes: snapshot.nodes.filter(node => !removed.has(node?.id)),
    edges: snapshot.edges.filter(edge => !removed.has(edge?.source) && !removed.has(edge?.target)),
  } };
}
