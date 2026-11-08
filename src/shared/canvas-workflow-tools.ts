import type { CanvasNodeSnapshot, CanvasEdgeSnapshot } from './ipc.types'

type SizedNode = CanvasNodeSnapshot & { measured?: { width?: number; height?: number }; width?: number; height?: number }
const width = (node: SizedNode) => Math.max(620, node.measured?.width || node.width || 0)
const height = (node: SizedNode) => Math.max(node.data.aspectRatio === '9:16' ? 1800 : 1100, node.measured?.height || node.height || 0)

/** Copy incoming references without connecting the new branch to original downstream nodes. */
export function duplicateCanvasSelection<T extends SizedNode, E extends CanvasEdgeSnapshot>(nodes: T[], edges: E[], selected: Set<string>, newId: () => string): { nodes: T[]; edges: E[] } {
  const originals = nodes.filter(node => selected.has(node.id))
  if (!originals.length) return { nodes: [], edges: [] }
  const remap = new Map(originals.map(node => [node.id, newId()]))
  const left = Math.min(...originals.map(node => node.position.x))
  const right = Math.max(...nodes.map(node => node.position.x + width(node)))
  const reference = (id: string) => remap.get(id) ?? id
  const copies = originals.map(node => {
    const data = structuredClone(node.data)
    const uploaded = data.readOnly || (data.sourcePath && !data.workflowId && !Array.isArray(data.sourceHistory) && data.generationStatus !== 'generating')
    if (!uploaded) { delete data.sourcePath; delete data.preview; delete data.sourceHistory }
    delete data.artifactId; delete data.artifactUpdatedAt
    delete data.boardPreviewPath; delete data.boardPreviewUpdatedAt; delete data.generationError
    data.generationStatus = 'idle'
    for (const field of ['firstFrameNodeId', 'lastFrameNodeId', 'inputNodeId'] as const) if (data[field]) data[field] = reference(data[field]!)
    for (const field of ['referenceImageNodeIds', 'referenceVideoNodeIds', 'referenceAudioNodeIds'] as const) if (data[field]) data[field] = data[field]!.map(reference)
    return { ...node, id: remap.get(node.id)!, position: { x: node.position.x + right - left + 180, y: node.position.y }, selected: true, dragging: false, data }
  })
  const links = edges.filter(edge => remap.has(edge.target)).map(edge => ({ ...edge, id: newId(), source: reference(edge.source), target: reference(edge.target), selected: false }))
  return { nodes: copies, edges: links }
}

/** Stable dependency columns, including a finite fallback for cyclic graphs. */
export function arrangeCanvasNodes<T extends SizedNode>(nodes: T[], edges: CanvasEdgeSnapshot[]): T[] {
  const ids = new Set(nodes.map(node => node.id))
  const degree = new Map(nodes.map(node => [node.id, 0]))
  const next = new Map(nodes.map(node => [node.id, [] as string[]]))
  const rank = new Map(nodes.map(node => [node.id, 0]))
  for (const edge of edges) if (ids.has(edge.source) && ids.has(edge.target)) {
    degree.set(edge.target, degree.get(edge.target)! + 1)
    next.get(edge.source)!.push(edge.target)
  }
  const queue = nodes.filter(node => degree.get(node.id) === 0).map(node => node.id)
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]
    for (const target of next.get(id)!) {
      rank.set(target, Math.max(rank.get(target)!, rank.get(id)! + 1))
      degree.set(target, degree.get(target)! - 1)
      if (degree.get(target) === 0) queue.push(target)
    }
  }
  const columnWidth = Math.max(620, ...nodes.map(width)) + 180
  const yByColumn = new Map<number, number>()
  return nodes.map(node => {
    const column = rank.get(node.id)!
    const y = yByColumn.get(column) ?? 100
    yByColumn.set(column, y + height(node) + 120)
    return { ...node, position: { x: 100 + column * columnWidth, y } }
  })
}

export interface PracticeStep { id: string; title: string; detail: string; done: boolean; nodeId?: string }
export function getPracticeSteps(nodes: CanvasNodeSnapshot[]): PracticeStep[] {
  const images = nodes.filter(node => node.data.kind === 'image')
  const videos = nodes.filter(node => node.data.kind === 'video')
  const image = images.find(node => !node.data.sourcePath) ?? images[0]
  const video = videos.find(node => !node.data.sourcePath) ?? videos[0]
  return [
    { id: 'prepare', title: '准备节点与提示词', detail: '选择模板或添加图片节点，把【】替换为自己的角色、商品与要求。', done: images.length > 0 && images.every(node => !!node.data.prompt?.trim() && !/【[^】]*】/.test(node.data.prompt)), nodeId: images.find(node => !node.data.prompt?.trim() || /【[^】]*】/.test(node.data.prompt))?.id ?? image?.id },
    { id: 'image', title: '先完成一张图片', detail: '选择图片模型，检查提示词和参考图，再手动点击生成。已有素材也可上传使用。', done: images.some(node => !!node.data.sourcePath), nodeId: image?.id },
    ...(videos.length ? [{ id: 'video', title: '再完成一段视频', detail: '检查首帧与真实视频模型，先用短片段验证；连线不会自动生成。', done: videos.some(node => !!node.data.sourcePath), nodeId: video?.id }] : []),
    { id: 'review', title: '检查结果并保存素材', detail: '人工检查角色、文字、动作和商品信息，再从项目目录取用素材；配音、字幕与剪辑另行完成。', done: false },
  ]
}
