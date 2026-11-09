import { expect, it } from 'vitest'
import { inspectAgent, type CommandResult } from '../electron/main/services/agent/agent-installations'
const ok = (stdout: string): CommandResult => ({ code: 0, stdout, stderr: '' })

it('does not mistake a missing installation for a logged-in bundled runtime', async () => {
  const status = await inspectAgent('codex', undefined, async () => { throw new Error('must not run') })
  expect(status.state).toBe('not-installed')
})
it('checks the selected executable and recognizes Codex authentication without leaking its output', async () => {
  const status = await inspectAgent('codex', 'C:/tools/codex.exe', async (_file, args) =>
    args[0] === '--version' ? ok('codex-cli 0.153.4') : ok('Logged in using ChatGPT secret-must-not-leak'))
  expect(status).toMatchObject({ state: 'ready', version: '0.153.4', path: 'C:/tools/codex.exe' })
  expect(JSON.stringify(status)).not.toContain('secret-must-not-leak')
})
it('separates logged-out, unsupported and broken native programs', async () => {
  const version = ok('2.1.0 (Claude Code)')
  expect((await inspectAgent('claude-code', 'claude.exe', async (_f, a) => a[0] === '--version' ? version : { code: 1, stdout: '{"loggedIn":false}', stderr: '' })).state).toBe('needs-login')
  expect((await inspectAgent('claude-code', 'claude.exe', async (_f, a) => a[0] === '--version' ? version : ok('unexpected output'))).state).toBe('unknown')
  expect((await inspectAgent('codex', 'codex.exe', async () => { throw new Error('bad image sk-private-value') })).state).toBe('error')
})
