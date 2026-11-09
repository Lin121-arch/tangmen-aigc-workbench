import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import * as asar from '@electron/asar'
import { hasPrivateSupplierEndpoint } from './public-model-endpoints.mjs'

const folder = path.resolve(process.argv[2] || '')
const output = process.argv[3]
if (!process.argv[2] || !output) throw new Error('Usage: node audit-student-package.mjs <win-unpacked> <report.json>')
const archive = path.join(folder, 'resources/app.asar')
const entries = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''))
const forbidden = /(^|\/)(?:\.tangmen[^/]*|\.env(?:\.[^/]*)?|settings(?:\.[^/]*)?\.json|model-services(?:\.[^/]*)?\.json|projects\.(?:sqlite|json)|canvas-snapshot[^/]*|chat-events\.jsonl|codex-session\.json|session\.json)$/i
const privatePath = /^(?:workspaces|test-results|交付成果|景曜知识库|uploads|generated|\.claude|\.codex|\.agents)\//i
const findings = []
const teacherCredentials = new Set()
const teacherProfile = process.argv[4]
if (teacherProfile) {
  const stateFolder = path.join(path.resolve(teacherProfile), 'aigc-line')
  const collect = (value, sensitive = false) => {
    if (typeof value === 'string') { if (sensitive && value.length >= 16) teacherCredentials.add(value); return }
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) collect(child, sensitive || /apiKey|encrypted|token|secrets/i.test(key))
  }
  for (const name of await fs.readdir(stateFolder)) if (/^(settings|model-services).*\.json$/.test(name)) collect(JSON.parse(await fs.readFile(path.join(stateFolder, name), 'utf8')))
}
const containsTeacherCredential = data => [...teacherCredentials].some(value => data.includes(value))
let textFiles = 0
for (const name of entries) {
  const archivePath = name.replaceAll('/', path.sep)
  const stat = asar.statFile(archive, archivePath, false)
  if (stat.files || stat.link) continue
  if (forbidden.test(name) || privatePath.test(name)) findings.push({ file: name, reason: 'private-state-path' })
  if (!/\.(?:js|mjs|cjs|json|html|txt|md|ts|map|yml|yaml|csv|xml)$/i.test(name)) continue
  const data = asar.extractFile(archive, archivePath).toString('utf8'); textFiles++
  if (/sk-[a-zA-Z0-9_-]{24,}/.test(data)) findings.push({ file: name, reason: 'possible-api-key' })
  if (containsTeacherCredential(data)) findings.push({ file: name, reason: 'teacher-credential-exact-match' })
  if (!name.startsWith('node_modules/') && (hasPrivateSupplierEndpoint(data) || /(?:示例学员|example-private-id|C:[\\/]+Users[\\/]+Administrator)/i.test(data))) findings.push({ file: name, reason: 'teacher-endpoint-or-identity' })
}
const files = []
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Unexpected symbolic link: ' + full)
    if (entry.isDirectory()) await walk(full)
    else {
      const data = await fs.readFile(full)
      const sha256 = crypto.createHash('sha256').update(data).digest('hex')
      const relative = path.relative(folder, full).replaceAll('\\', '/')
      if (!relative.includes('app.asar') && containsTeacherCredential(data.toString('utf8'))) findings.push({ file: relative, reason: 'teacher-credential-exact-match' })
      if (forbidden.test(relative) || privatePath.test(relative)) findings.push({ file: relative, reason: 'private-resource-path' })
      let machine
      if (/\.(exe|dll|node)$/i.test(entry.name)) {
        const pe = data.readUInt32LE(0x3c)
        if (data.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('Invalid PE: ' + relative)
        machine = data.readUInt16LE(pe + 4)
        // NSIS launches this separate 32-bit elevation helper as a process; it is not loaded as an application DLL.
        const nsisHelper = relative === 'resources/elevate.exe' && machine === 0x14c && sha256 === '9b1fbf0c11c520ae714af8aa9af12cfd48503eedecd7398d8992ee94d1b4dc37'
        if (machine !== 0x8664 && !nsisHelper) findings.push({ file: relative, reason: 'not-x64', machine })
      }
      if (!relative.includes('app.asar') && /\.(json|md|txt|js|mjs|yaml|yml)$/i.test(relative) && (/sk-[a-zA-Z0-9_-]{24,}/.test(data.toString('utf8')) || hasPrivateSupplierEndpoint(data.toString('utf8')))) findings.push({ file: relative, reason: 'private-extra-resource' })
      files.push({ file: relative, bytes: data.length, sha256, ...(machine ? { machine: '0x' + machine.toString(16) } : {}) })
    }
  }
}
await walk(folder)
const report = { checkedAt: new Date().toISOString(), folder, asarEntryCount: entries.length, scannedTextFiles: textFiles, comparedTeacherCredentialCount: teacherCredentials.size, passed: findings.length === 0, findings, files }
await fs.writeFile(path.resolve(output), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ passed: report.passed, scannedTextFiles: textFiles, physicalFiles: files.length, findings }))
if (!report.passed) process.exitCode = 1
