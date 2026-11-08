import { describe, expect, it } from 'vitest'
import { duplicateCanvasSelection, arrangeCanvasNodes, getPracticeSteps } from '../src/shared/canvas-workflow-tools'
import type { CanvasNodeSnapshot } from '../src/shared/ipc.types'
import { normalizeTemplateModels } from '../src/shared/template-models'

const node = (id: string, extra = {}): CanvasNodeSnapshot => ({ id, type: 'storyNode', position: { x: 0, y: 0 }, data: { kind: 'image', title: id, prompt: 'test', ...extra } })

describe('canvas practice tools', () => {
  it('copies selected nodes and incoming links, remaps references, clears generated results, and leaves originals independent', () => {
    const nodes = [node('outside', { readOnly: true, sourcePath: 'source.png' }), node('a', { sourcePath: 'old.png', generationStatus: 'generating', referenceImageNodeIds: ['outside'] }), node('b', { kind: 'video', firstFrameNodeId: 'a', referenceImageNodeIds: ['a'] })]
    const edges = [{ id: 'in', source: 'outside', target: 'a' }, { id: 'ab', source: 'a', target: 'b' }, { id: 'out', source: 'b', target: 'outside' }]
    let seq = 0
    const copied = duplicateCanvasSelection(nodes, edges, new Set(['a', 'b']), () => `copy-${++seq}`)
    expect(copied.nodes).toHaveLength(2)
    expect(copied.nodes[0].data.referenceImageNodeIds).toEqual(['outside'])
    expect(copied.nodes[1].data.firstFrameNodeId).toBe(copied.nodes[0].id)
    expect(copied.nodes[1].data.referenceImageNodeIds).toEqual([copied.nodes[0].id])
    expect(copied.nodes[0].data.sourcePath).toBeUndefined()
    expect(copied.nodes[0].data.generationStatus).toBe('idle')
    expect(copied.edges.map(e => [e.source, e.target])).toEqual([['outside', copied.nodes[0].id], [copied.nodes[0].id, copied.nodes[1].id]])
    copied.nodes[0].data.referenceImageNodeIds!.push('new')
    expect(nodes[1].data.referenceImageNodeIds).toEqual(['outside'])
    expect(copied.nodes[0].position.x).toBeGreaterThan(nodes[0].position.x + 620)
  })

  it('retains real uploaded media when duplicating a read-only source', () => {
    const result = duplicateCanvasSelection([node('upload', { readOnly: true, sourcePath: 'real.png', preview: 'local-file://real.png' })], [], new Set(['upload']), () => 'copy')
    expect(result.nodes[0].data.sourcePath).toBe('real.png')
  })

  it('clears a first generated result even when its workflow uses the default and its history is empty', () => {
    const result = duplicateCanvasSelection([node('generated', { sourcePath: 'generated/first.png', sourceHistory: [], generationStatus: 'idle' })], [], new Set(['generated']), () => 'copy')
    expect(result.nodes[0].data.sourcePath).toBeUndefined()
    expect(result.nodes[0].data.sourceHistory).toBeUndefined()
  })

  it('lays out dependencies left to right, reserves portrait space, terminates for cycles and preserves all content', () => {
    const nodes = [node('a', { aspectRatio: '9:16' }), node('b'), node('c'), node('d')]
    const arranged = arrangeCanvasNodes(nodes, [{ id: 'ab', source: 'a', target: 'b' }, { id: 'cd', source: 'c', target: 'd' }, { id: 'dc', source: 'd', target: 'c' }])
    expect(arranged.find(n => n.id === 'b')!.position.x).toBeGreaterThan(arranged[0].position.x)
    for (const item of arranged) expect(item.data).toEqual(nodes.find(n => n.id === item.id)!.data)
    expect(arranged.every(n => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true)
    expect(new Set(arranged.map(n => `${n.position.x}:${n.position.y}`)).size).toBe(4)
    expect(nodes.every(n => n.position.x === 0 && n.position.y === 0)).toBe(true)
  })

  it('does not mark prompts or running generations as finished media and includes video only when present', () => {
    const draft = getPracticeSteps([node('a', { workflowId: 'luna-batch-image', generationStatus: 'generating' }), node('b', { kind: 'video' })])
    expect(draft.find(s => s.id === 'image')!.done).toBe(false)
    expect(draft.find(s => s.id === 'video')!.done).toBe(false)
    const finished = getPracticeSteps([node('a', { sourcePath: 'actual.png' })])
    expect(finished.find(s => s.id === 'image')!.done).toBe(true)
    expect(finished.some(s => s.id === 'video')).toBe(false)
    expect(getPracticeSteps([node('unfilled', { prompt: '创作【角色名称】' })])[0].done).toBe(false)
  })

  it('rejects stale, local or wrong-kind template workflows against the current registry', () => {
    const available = [{ id: 'luna-batch-image', name: 'Luna', kind: 'text-to-image' as const }]
    expect(() => normalizeTemplateModels({ videoWorkflowId: 'relay-video:removed' }, available)).toThrow('模型')
    expect(() => normalizeTemplateModels({ imageWorkflowId: 'local-gpu' }, available)).toThrow('模型')
    expect(() => normalizeTemplateModels({ imageWorkflowId: 'luna-batch-image' }, [{ ...available[0], kind: 'image-to-video' }])).toThrow('模型')
    expect(normalizeTemplateModels({ imageWorkflowId: 'luna-batch-image' }, available)).toEqual({ imageWorkflowId: 'luna-batch-image' })
  })
})
