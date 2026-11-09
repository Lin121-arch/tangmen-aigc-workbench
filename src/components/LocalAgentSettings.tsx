import { useEffect, useRef, useState } from 'react'
import type { LocalAgentStatus } from '../shared/agent-config'

export function LocalAgentSettings() {
  const [agents, setAgents] = useState<LocalAgentStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [guide, setGuide] = useState('')
  const sequence = useRef(0)
  async function refresh() {
    const token = ++sequence.current
    setBusy(true); setError('')
    try { const result = await window.electronAPI.detectLocalAgents(); if (token === sequence.current) setAgents(result) }
    catch { if (token === sequence.current) setError('无法检测本机智能体，请完全退出工作台后重新启动。') }
    finally { if (token === sequence.current) setBusy(false) }
  }
  useEffect(() => { void refresh(); return () => { sequence.current++ } }, [])
  return <section className="border-b border-white/10 p-6" aria-label="本机智能体">
    <div className="flex items-center justify-between gap-4"><div><h3 className="font-medium text-[#e8e6df]">本机智能体</h3><p className="mt-1 text-xs leading-6 text-[#b8b4c2]">识别电脑上的命令行程序和登录状态；实际使用仍需要联网。</p></div><button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:border-[#d4af37] disabled:opacity-50" disabled={busy} onClick={() => void refresh()}>{busy ? '正在检测…' : '重新检测'}</button></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2">{(['codex', 'claude-code'] as const).map(id => {
      const status = agents.find(a => a.agent === id)
      const name = id === 'codex' ? 'Codex' : 'Claude Code'
      return <div key={id} className="flex items-start gap-3 rounded-xl border border-white/10 px-4 py-4">
        <svg viewBox="0 0 24 24" className="mt-1 h-6 w-6 shrink-0 text-[#e8c766]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m6 9 3 3-3 3m6 0h5"/></svg>
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between"><h4 className="text-sm font-medium">{name}</h4><span className={status?.state === 'ready' ? 'text-xs text-emerald-300' : 'text-xs text-[#c6bfad]'}>{busy ? '检测中' : status?.version ? 'v' + status.version : '未识别'}</span></div>
        <p className="mt-2 text-xs leading-6 text-[#b8b4c2]" role="status">{busy ? '正在确认安装与登录状态…' : status?.message || '等待检测'}</p>
        {status?.path && <details className="mt-2 text-xs text-[#b8b4c2]"><summary className="cursor-pointer">程序位置</summary><p className="mt-2 break-all select-text">{status.path}</p></details>}
        <button type="button" className="mt-2 text-xs text-[#e8c766] underline underline-offset-4" onClick={() => setGuide(guide === id ? '' : id)}>安装与登录指引</button>
        {guide === id && <div className="mt-3 text-xs leading-6 text-[#c6bfad]"><a target="_blank" rel="noreferrer" href={id === 'codex' ? 'https://developers.openai.com/codex/cli/' : 'https://code.claude.com/docs/en/overview'} className="underline underline-offset-4">打开官方安装说明</a><p>安装后在终端运行 <code>{id === 'codex' ? 'codex login' : 'claude auth login'}</code>，完成后点击“重新检测”。</p></div>}
        </div></div>
    })}</div>
    {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
    <p className="mt-3 text-xs leading-6 text-[#b8b4c2]">优先使用检测到的本机版本；未安装时保留工作台内置运行时。检测结果不代表账号额度或网络一定可用。</p>
  </section>
}
