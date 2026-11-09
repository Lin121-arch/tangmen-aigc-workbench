import path from 'node:path'
import os from 'node:os'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import type { LocalAgentId, LocalAgentStatus } from '../../../../src/shared/agent-config'

export interface CommandResult { code: number; stdout: string; stderr: string }
export type AgentRunner = (file: string, args: string[]) => Promise<CommandResult>
const run: AgentRunner = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout: 8000, maxBuffer: 128 * 1024, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
    if (error && (typeof error.code !== 'number' || error.killed)) reject(error)
    else resolve({ code: error?.code as number || 0, stdout, stderr })
  })
})

/** Inspect only standard executable locations; never load or expose credential files. */
export function findInstalledAgent(agent: LocalAgentId): string | undefined {
  const executable = (agent === 'codex' ? 'codex' : 'claude') + (process.platform === 'win32' ? '.exe' : '')
  const homes = [path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.cargo', 'bin')]
  const pathValue = Object.entries(process.env).find(([k]) => k.toLowerCase() === 'path')?.[1] || ''
  const candidates = [...homes, ...pathValue.split(path.delimiter).filter(Boolean).map(p => p.replace(/^"|"$/g, ''))].map(p => path.join(p, executable))
  if (agent === 'codex' && process.platform === 'win32' && process.arch === 'x64') {
    const npm = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '@openai', 'codex')
    for (const root of [npm, path.join(npm, 'node_modules', '@openai', 'codex-win32-x64')]) {
      for (const folder of ['bin', 'codex']) candidates.push(path.join(root, 'vendor', 'x86_64-pc-windows-msvc', folder, 'codex.exe'))
    }
  }
  return candidates.find(file => existsSync(file))
}
export async function inspectAgent(agent: LocalAgentId, file: string | undefined, runner: AgentRunner = run): Promise<LocalAgentStatus> {
  if (!file) return { agent, state: 'not-installed', message: '未检测到本机命令行程序；安装桌面应用不等于安装命令行。' }
  try {
    const version = await runner(file, ['--version'])
    if (version.code !== 0) return { agent, path: file, state: 'error', message: '程序无法正常启动，请检查安装或运行库。' }
    const number = (version.stdout + version.stderr).match(/\b\d+\.\d+\.\d+(?:[-.][\w.-]+)?\b/)?.[0]
    if (!number) return { agent, path: file, state: 'unknown', message: '无法识别程序版本，请选择正确的可执行程序。' }
    const auth = await runner(file, agent === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'])
    let state: LocalAgentStatus['state'] = 'unknown'
    if (agent === 'codex') {
      const output = auth.stdout + auth.stderr
      if (auth.code === 0 && /logged in/i.test(output)) state = 'ready'
      else if (/not logged in|logged out|not authenticated/i.test(output)) state = 'needs-login'
    } else {
      try { const payload = JSON.parse(auth.stdout); if (payload.loggedIn === true && auth.code === 0) state = 'ready'; else if (payload.loggedIn === false) state = 'needs-login' } catch {}
    }
    return { agent, path: file, version: number, state, message: state === 'ready' ? '已安装 · 已登录（未提交模型请求）' : state === 'needs-login' ? '已安装 · 需要登录' : '已安装，当前版本的登录状态无法确认' }
  } catch {
    return { agent, path: file, state: 'error', message: '检测失败或超过 8 秒，请检查程序能否启动后重新检测。' }
  }
}
export async function detectLocalAgents(): Promise<LocalAgentStatus[]> {
  return Promise.all((['codex', 'claude-code'] as const).map(agent => inspectAgent(agent, findInstalledAgent(agent))))
}
