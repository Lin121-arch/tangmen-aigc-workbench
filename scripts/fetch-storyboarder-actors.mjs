// Reproduce the pinned upstream assets; never download executable code.
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const commit = '8195e380179561c04bcd1b5ed4a772c305245dff'
const repo = 'wonderunit/shot-generator-models'
const destination = new URL('../public/models/storyboarder/', import.meta.url)
const headers = { 'User-Agent': 'Tangmen-asset-import', Accept: 'application/vnd.github+json' }
const treeResponse = await fetch(`https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`, { headers })
if (!treeResponse.ok) throw new Error(`Tree: HTTP ${treeResponse.status}`)
const { tree } = await treeResponse.json()
async function get(path) {
  const entry = tree.find(item => item.path === path)
  if (!entry) throw new Error(`Missing upstream file ${path}`)
  const response = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${entry.sha}`, { headers })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  const item = await response.json()
  return Buffer.from(item.content, 'base64')
}
await mkdir(destination, { recursive: true })
const files = ['LICENSE', 'README.md', ...['adult-male', 'adult-female', 'teen-male', 'teen-female'].map(name => `characters/essential/${name}/${name}-lod.glb`)]
const records = []
for (const path of files) {
  const target = new URL(path.split('/').pop(), destination)
  const data = await get(path)
  if (path.endsWith('.glb') && data.readUInt32LE(0) !== 0x46546c67) throw new Error('Invalid GLB')
  try {
    const existing = await readFile(target)
    if (!existing.equals(data)) throw new Error(`Refusing to overwrite changed ${target.pathname}`)
  } catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(target, data, { flag: 'wx' }) }
  records.push({ path, file: path.split('/').pop(), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
  console.log(`Imported ${path} (${data.length} bytes)`)
}
const manifest = JSON.stringify({ repo, commit, files: records }, null, 2)
try { const existing = await readFile(new URL('source.json', destination), 'utf8'); if (existing !== manifest) throw new Error('Changed source manifest') }
catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(new URL('source.json', destination), manifest, { flag: 'wx' }) }
