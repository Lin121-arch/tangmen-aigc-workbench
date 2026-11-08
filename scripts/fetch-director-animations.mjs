// Quaternius Universal Animation Library Standard, CC0. Download data only.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const repo = 'J-Ponzo/gltf-universal-animation-library', commit = 'e24c23cf2a1323488a3faa226ea7ea21f644b73e'
const destination = new URL('../resources/director-animation-source/', import.meta.url)
const headers = { 'User-Agent': 'Tangmen-animation-import', Accept: 'application/vnd.github+json' }
const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`, { headers })
if (!response.ok) throw new Error(`Tree HTTP ${response.status}`)
const { tree } = await response.json()
await mkdir(destination, { recursive: true })
const records = []
for (const path of ['LICENSE', 'README.md', 'glTF/AnimationLibrary_Godot_Standard.gltf', 'glTF/AnimationLibrary_Godot_Standard.bin']) {
  const entry = tree.find(item => item.path === path)
  const response = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${entry.sha}`, { headers })
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`)
  const json = await response.json(), data = Buffer.from(json.content, 'base64'), file = path.split('/').pop()
  try { if (!(await readFile(new URL(file, destination))).equals(data)) throw new Error(`Changed ${file}`) }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(new URL(file, destination), data, { flag: 'wx' }) }
  records.push({ path, file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
  console.log(`Verified ${file}: ${data.length} bytes`)
}
const manifest = JSON.stringify({ author: 'Quaternius', repo, commit, license: 'CC0-1.0', files: records }, null, 2)
try { if (await readFile(new URL('source.json', destination), 'utf8') !== manifest) throw new Error('Changed manifest') }
catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(new URL('source.json', destination), manifest, { flag: 'wx' }) }
