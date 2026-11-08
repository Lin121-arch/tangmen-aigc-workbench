import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const excluded = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', 'test-results', 'playwright-report'])
const forbidden = /^(?:\.env(?:\..*)?|settings(?:\..*)?\.json|model-services(?:\..*)?\.json|projects\.(?:json|sqlite)|chat-events\.jsonl|session\.json|codex-session\.json)$/i
const stateDirectories = /^(?:\.tangmen.*|\.aigc-line|workspaces|uploads|generated|\.codex|\.claude|\.agents)$/i
const secret = /(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/
const findings = []
let files = 0
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue
    const file = path.join(directory, entry.name)
    const relative = path.relative(root, file).replaceAll('\\', '/')
    if (entry.isSymbolicLink()) { findings.push({ file: relative, reason: 'symlink' }); continue }
    if (entry.isDirectory()) {
      if (stateDirectories.test(entry.name)) findings.push({ file: relative, reason: 'private-state-directory' })
      else await walk(file)
    } else {
      files++
      if (forbidden.test(entry.name) && entry.name !== '.env.example') findings.push({ file: relative, reason: 'private-state-file' })
      const data = await fs.readFile(file)
      if (secret.test(data.toString('utf8'))) findings.push({ file: relative, reason: 'possible-secret' })
    }
  }
}
await walk(root)
console.log(JSON.stringify({ files, passed: findings.length === 0, findings }, null, 2))
if (findings.length) process.exitCode = 1
