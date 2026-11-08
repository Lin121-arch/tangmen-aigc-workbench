import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { validateDirectorGlb } from '../electron/main/services/director-model-import'
describe('local director model import', () => {
  it('accepts self-contained upstream GLB and rejects external dependencies and malformed length', async () => {
    const data = await readFile(new URL('../public/models/storyboarder/adult-male-lod.glb', import.meta.url))
    expect(() => validateDirectorGlb(data)).not.toThrow()
    const corrupt = Buffer.from(data); corrupt.writeUInt32LE(1, 8)
    expect(() => validateDirectorGlb(corrupt)).toThrow()
    const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'https://example.com/model.bin' }] }).padEnd(128, ' '))
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(148, 8); header.writeUInt32LE(128, 12); header.writeUInt32LE(0x4e4f534a, 16)
    expect(() => validateDirectorGlb(Buffer.concat([header, json]))).toThrow(/外部/)
  })
})
