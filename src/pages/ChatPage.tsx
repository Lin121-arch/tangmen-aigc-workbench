import { useEffect, useState } from 'react'
import { ChatPanel } from '../components/ChatPanel'
import { useAppStore } from '../stores/app.store'
import { StudioIcon } from '../components/StudioIcon'
import { PromptTutorialButton } from '../components/PromptTutorial'
import { BeginnerTutorialButton } from '../components/BeginnerTutorial'
import './studio.css'

export function ChatPage() {
  const projects = useAppStore(state => state.projects.projects)
  const current = useAppStore(state => state.currentProject)
  const select = useAppStore(state => state.selectProject)
  const page = useAppStore(state => state.setCurrentPage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => {
    if (!current) return
    return window.electronAPI.onCanvasCommand(command => {
      if (command.projectId !== current.id) return
      window.electronAPI.sendCanvasCommandResult({ requestId: command.requestId, success: false, error: '当前在智能创作页。图片和视频可在下方选择类型后直接生成；操作画布节点请先打开右上角“无限画布”。' })
    })
  }, [current?.id])
  useEffect(() => {
    if (!current) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const items = await window.electronAPI.refreshChatMedia(current.id)
        if (active && useAppStore.getState().currentProject?.id === current.id) {
          const state = useAppStore.getState()
          const previous = new Map(state.messages.map(message => [message.id, JSON.stringify(message)]))
          items.forEach(message => { if (previous.get(message.id) !== JSON.stringify(message)) state.addMessage(message) })
        }
      } catch { /* History stays readable; pending results retry on the next poll. */ }
      if (active) timer = setTimeout(() => void refresh(), 3500)
    }
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [current?.id])
  async function open(id: string) {
    setBusy(true); setError('')
    try { await select(id, 'chat'); setSidebarOpen(false) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  async function create() {
    setBusy(true); setError('')
    try {
      const conversation = await window.electronAPI.createConversation(current?.agent ?? { provider: 'codex', model: '' })
      await useAppStore.getState().loadProjects()
      await select(conversation.id, 'chat'); setSidebarOpen(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  const matching = [...projects].sort((a, b) => b.updatedAt - a.updatedAt).filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  return <div className="studio-shell">
    {sidebarOpen && <button type="button" className="studio-sidebar-scrim" aria-label="关闭侧边栏" onClick={() => setSidebarOpen(false)} />}
    <aside aria-label="创作导航" className={`studio-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="studio-brand"><img src={`${import.meta.env.BASE_URL}app-icon.png`} alt="" width="30" height="30" /><span>唐门 AI<span>创作工作台</span></span></div>
      <button type="button" disabled={busy} onClick={() => void create()} className="studio-new"><StudioIcon name="plus" />{busy ? '正在打开…' : '新建创作'}</button>
      <label className="studio-search"><StudioIcon name="search" width="15" height="15" /><input aria-label="搜索创作记录" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索创作记录" /></label>
      <div className="studio-history-title">最近创作</div>
      <nav aria-label="创作记录" className="studio-history">
        {matching.map(p => <button type="button" key={p.id} disabled={busy} aria-current={p.id === current?.id ? 'page' : undefined} onClick={() => void open(p.id)} title={p.name}><StudioIcon name="chat" width="16" height="16" /><span>{p.name}</span></button>)}
        {!projects.length && <p>开始创作后，记录会保存在这里。</p>}
        {!!projects.length && !matching.length && <p>没有找到相应记录。</p>}
      </nav>
      <div className="studio-sidebar-bottom">
        <button type="button" onClick={() => page('home')}><StudioIcon name="folder" />项目与模板</button>
        <button type="button" onClick={() => page('settings')}><StudioIcon name="settings" />模型与设置</button>
        <div className="studio-local-note"><span />创作记录保存在本机</div>
      </div>
    </aside>
    <main className="studio-main">
      <header className="studio-topbar">
        <button type="button" className="studio-menu" aria-label="展开导航" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><StudioIcon name="menu" /></button>
        <div className="studio-title"><h1>智能创作</h1><span>{current?.name || '新创作'}</span></div>
        <div className="studio-top-actions"><PromptTutorialButton /><BeginnerTutorialButton /><button type="button" disabled={!current || busy} onClick={() => page('project')} className="studio-canvas-entry"><StudioIcon name="canvas" /><span>无限画布</span></button></div>
      </header>
      {error && <p role="alert" className="studio-page-error">{error}</p>}
      <div className="studio-content"><ChatPanel standalone /></div>
    </main>
  </div>
}
