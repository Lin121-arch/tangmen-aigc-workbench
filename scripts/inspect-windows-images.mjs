import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve(process.argv[2])
const images = []
for (const name of await fs.readdir(root)) {
  if (!/\.(exe|dll)$/i.test(name)) continue
  const b = await fs.readFile(path.join(root, name))
  const pe = b.readUInt32LE(0x3c), opt = pe + 24
  const count = b.readUInt16LE(pe + 6), table = opt + b.readUInt16LE(pe + 20)
  const sections = Array.from({ length: count }, (_, i) => {
    const s = table + i * 40
    return { name: b.toString('ascii', s, s + 8).replaceAll('\0', ''), rva: b.readUInt32LE(s + 12), size: b.readUInt32LE(s + 16), offset: b.readUInt32LE(s + 20), virtualSize: b.readUInt32LE(s + 8) }
  })
  const offset = rva => { const s = sections.find(s => rva >= s.rva && rva < s.rva + Math.max(s.size, s.virtualSize)); if (!s) throw new Error('Unmapped RVA'); return s.offset + rva - s.rva }
  const string = start => b.toString('ascii', start, b.indexOf(0, start))
  const directory = opt + (b.readUInt16LE(opt) === 0x20b ? 112 : 96)
  const importRva = b.readUInt32LE(directory + 8)
  const imports = []
  if (importRva) for (let s = offset(importRva), i = 0; i < 1000 && b.readUInt32LE(s + 12); s += 20, i++) imports.push(string(offset(b.readUInt32LE(s + 12))))
  const h = crypto.createHash('sha256')
  for (const s of sections.filter(s => !['.rsrc', '.reloc'].includes(s.name))) h.update(b.subarray(s.offset, s.offset + s.size))
  images.push({ name, machine: '0x' + b.readUInt16LE(pe + 4).toString(16), imports, missingImports: imports.filter(n => !/^api-ms-|^ext-ms-/i.test(n) && ![path.join(root, n), path.join(process.env.WINDIR, 'System32', n)].some(p => { try { return Boolean(fsSyncStat(p)) } catch { return false } })), nonResourceSectionsSha256: h.digest('hex'), sections })
}
function fsSyncStat(p) { return statSync(p).isFile() }
import { statSync } from 'node:fs'
await fs.writeFile(path.resolve(process.argv[3]), JSON.stringify({ checkedAt: new Date().toISOString(), root, images }, null, 2))
console.log(JSON.stringify(images.map(({ name, machine, missingImports }) => ({ name, machine, missingImports }))))
