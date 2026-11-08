import { useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, ChatMediaRecord, ChatMessage, ComfyWorkflowInfo, ImageAspectRatio } from '../shared/ipc.types'
import { modelWorkflowId, type ModelServicesConfig } from '../shared/model-services'
import type { ProjectAgentConfig } from '../shared/agent-config'
import { useAppStore } from '../stores/app.store'
import { ChatInput } from './ChatInput'
import { PromptInput, PromptInputActions, PromptInputTextarea } from './prompt-kit/prompt-input'
import { StudioIcon } from './StudioIcon'

export type StudioMode = 'chat' | 'image' | 'video'
export interface StudioSuggestion { mode: StudioMode; prompt: string; id: number; media?: ChatMediaRecord }
export function StudioComposer({ onSend, disabled, suggestion, onAgentChange, agentBusy }: {
  onSend: (content: string, attachments?: ChatMessage['attachments']) => Promise<boolean>
  disabled: boolean; suggestion?: StudioSuggestion; onAgentChange: (agent: ProjectAgentConfig) => Promise<void>; agentBusy: boolean
}) {
  const project = useAppStore(s => s.currentProject)
  const [mode, setMode] = useState<StudioMode>('image')
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [workflows, setWorkflows] = useState<ComfyWorkflowInfo[]>([])
  const [config, setConfig] = useState<ModelServicesConfig>()
  const [binding, setBinding] = useState<Record<'image' | 'video', string>>({ image: '', video: '' })
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('9:16')
  const [duration, setDuration] = useState(5)
  const [loadingModels, setLoadingModels] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const version = useRef(0)
  const epoch = useRef(0)
  const locked = useRef(false)
  const uploadLock = useRef(false)
  useEffect(() => { epoch.current++; version.current++; locked.current = false; setSending(false); setPrompt(''); setAttachments([]); setError('') }, [project?.id])
  useEffect(() => {
    if (!suggestion) return
    version.current++; setMode(suggestion.mode); setPrompt(suggestion.prompt); setError('')
    if (suggestion.media && project) {
      const m = suggestion.media
      setBinding(old => ({ ...old, [m.kind]: m.workflowId })); setAspectRatio(m.aspectRatio)
      if (m.duration) setDuration(m.duration)
      setAttachments(m.referenceImagePaths.map(relative => ({ path: `${project.folderPath}/${relative}`, name: relative.split('/').pop() || '参考图', type: relative.split('.').pop() || 'png' })))
    }
  }, [suggestion])
  async function loadModels() {
    setLoadingModels(true); setError('')
    try {
      const [items, settings] = await Promise.all([window.electronAPI.listComfyWorkflows(), window.electronAPI.getAppSettings()])
      setWorkflows(items.filter(w => w.id.startsWith('service-model:')))
      setConfig(settings.modelServices)
      setBinding(old => ({ image: old.image || settings.modelServices?.defaults.image || '', video: old.video || settings.modelServices?.defaults.video || '' }))
    } catch { setError('模型读取失败，请点击重试，或打开模型配置检查连接。') }
    finally { setLoadingModels(false) }
  }
  useEffect(() => { void loadModels() }, [])
  const models = useMemo(() => workflows.filter(w => (w.kind === 'image-to-video') === (mode === 'video')), [workflows, mode])
  const selected = mode === 'chat' ? undefined : models.find(w => w.id === binding[mode])
  const durations = selected?.durations || Array.from({ length: (selected?.maxDuration || 15) - (selected?.minDuration || 1) + 1 }, (_, i) => (selected?.minDuration || 1) + i)
  const aspects = (selected?.aspectRatios || ['9:16', '16:9', '1:1', '4:3']).filter(a => ['9:16', '16:9', '1:1', '4:3'].includes(a)) as ImageAspectRatio[]
  const referenceLimit = selected?.referenceLimit || 0
  useEffect(() => {
    if (mode === 'chat' || !models.length) return
    if (!models.some(m => m.id === binding[mode])) setBinding(old => ({ ...old, [mode]: models[0].id }))
  }, [models, mode, binding])
  useEffect(() => {
    if (!selected) return
    if (!aspects.includes(aspectRatio)) setAspectRatio(aspects[0] || '9:16')
    if (!durations.includes(duration)) setDuration(durations[0])
  }, [selected?.id, aspectRatio, duration])
  const updatePrompt = (text: string) => { version.current++; setPrompt(text); setError('') }
  const addAttachments = (items: Attachment[]) => { version.current++; setAttachments(old => [...old, ...items]); setError('') }
  async function upload() {
    const currentEpoch = epoch.current
    try {
      const paths = await window.electronAPI.showOpenDialog({ title: '添加参考图', properties: ['openFile', 'multiSelections'], filters: [{ name: '参考图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
      if (currentEpoch !== epoch.current) return
      if (attachments.length + paths.length > referenceLimit) { setError(`这个模型最多使用 ${referenceLimit} 张参考图，请减少选择或更换模型。`); return }
      addAttachments(paths.map(path => ({ path, name: path.split(/[/\\]/).pop() || '参考图', type: path.split('.').pop()?.toLowerCase() || 'png' })))
    } catch { if (currentEpoch === epoch.current) setError('参考图没有添加成功，请重新选择。') }
  }
  async function paste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    if (!images.length) return
    event.preventDefault()
    if (uploadLock.current) return
    if (!project || attachments.length + images.length > referenceLimit) { setError(`这个模型最多使用 ${referenceLimit} 张参考图，请选择支持参考图的模型。`); return }
    const currentEpoch = epoch.current
    uploadLock.current = true; setUploading(true)
    try {
      const added: Attachment[] = []
      for (const item of images) {
        const file = item.getAsFile(); if (!file) continue
        const result = await window.electronAPI.savePastedImage(project.id, await file.arrayBuffer(), file.type)
        if (!result.success || !result.attachment) throw new Error(result.error || '图片保存失败')
        added.push(result.attachment)
      }
      if (currentEpoch === epoch.current) addAttachments(added)
    } catch (cause) { if (currentEpoch === epoch.current) setError(cause instanceof Error ? cause.message : '粘贴图片失败，请改用添加参考图。') }
    finally { uploadLock.current = false; if (currentEpoch === epoch.current) setUploading(false) }
  }
  async function generate() {
    if (!project || mode === 'chat' || !selected || !prompt.trim() || locked.current || uploading) return
    if (attachments.length > referenceLimit) { setError('参考图数量超过当前模型上限，请移除多余参考图或更换模型。'); return }
    const submittedVersion = version.current, currentEpoch = epoch.current
    locked.current = true; setSending(true); setError('')
    try {
      const result = await window.electronAPI.generateChatMedia({ projectId: project.id, requestId: crypto.randomUUID(), kind: mode, workflowId: selected.id, prompt, aspectRatio, ...(mode === 'video' ? { duration } : {}), attachments })
      if (useAppStore.getState().currentProject?.id === project.id) {
        useAppStore.getState().addMessage(result.user); useAppStore.getState().addMessage(result.message)
        if (currentEpoch === epoch.current && submittedVersion === version.current) { setPrompt(''); setAttachments([]); version.current++ }
      }
    } catch (cause) { if (currentEpoch === epoch.current) setError(`${cause instanceof Error ? cause.message : '提交失败'}。提示词与参考图已保留。`) }
    finally { if (currentEpoch === epoch.current) { locked.current = false; setSending(false) } }
  }
  const chatModels = config?.providers.filter(p => p.enabled).flatMap(p => p.models.filter(m => m.capabilities.includes('chat') && m.capabilities.includes('tools')).map(m => ({ id: modelWorkflowId(p.id, m.id), name: m.name, provider: p.name }))) || []
  const chatValue = project?.agent?.provider === 'relay' && project.agent.model ? `relay|${project.agent.model}` : `${project?.agent?.provider || 'codex'}|`
  const chatSelector = <label className="studio-control studio-model"><span className="sr-only">对话模型</span><select aria-label="对话模型" disabled={disabled || agentBusy} value={chatValue} onChange={e => { const [provider, model] = e.target.value.split('|'); void onAgentChange({ provider: provider as ProjectAgentConfig['provider'], model: model || '' }) }}>
    <option value="codex|">Codex · 默认模型</option><option value="claude-code|">Claude Code · 默认模型</option><option value="relay|">唐门创作助手 · 默认模型</option>
    {chatModels.map(m => <option value={`relay|${m.id}`} key={m.id}>{m.name} · {m.provider}</option>)}
    {project?.agent?.model && !chatModels.some(m => m.id === project.agent?.model) && <option value={`${project.agent.provider}|${project.agent.model}`}>{project.agent.model}</option>}
  </select></label>
  return <div className="studio-compose-wrap">
    <div className="studio-mode-tabs" aria-label="创作类型">{([['chat', '对话', 'chat'], ['image', '图片', 'image'], ['video', '视频', 'video']] as const).map(([value, label, icon]) => <button key={value} type="button" aria-pressed={mode === value} disabled={sending || uploading} onClick={() => { setMode(value); setError('') }}><StudioIcon name={icon} />{label}</button>)}</div>
    {mode === 'chat' ? <div className="studio-text-compose"><ChatInput onSend={onSend} disabled={disabled || (project?.agent?.provider === 'relay' && agentBusy)} footer={chatSelector} /></div> : <PromptInput value={prompt} onValueChange={updatePrompt} onSubmit={() => void generate()} disabled={disabled}>
      {!!attachments.length && <div className="studio-references">{attachments.map((attachment, i) => <span key={`${attachment.path}:${i}`} title={attachment.name}><StudioIcon name="image" /><span>{attachment.name}</span><button type="button" aria-label={`移除参考图 ${i + 1}`} onClick={() => { version.current++; setAttachments(old => old.filter((_, index) => index !== i)) }}><StudioIcon name="close" width="14" height="14" /></button></span>)}</div>}
      <PromptInputTextarea aria-label={mode === 'image' ? '图片提示词' : '视频提示词'} placeholder={mode === 'image' ? '描述你想要的画面，也可以粘贴参考图…' : '描述画面如何运动、镜头怎么拍，也可以添加一张首帧…'} onPaste={event => void paste(event)} />
      <PromptInputActions>
        <button className="studio-upload" type="button" disabled={disabled || uploading || !referenceLimit} title={referenceLimit ? `最多使用 ${referenceLimit} 张参考图` : '此模型只接受文字，参考图修改可选择 Sunburst 等已登记编辑模型'} onClick={() => void upload()}><StudioIcon name="plus" /><span>{uploading ? '添加中' : '参考图'}</span></button>
        <label className="studio-control studio-model"><span className="sr-only">{mode === 'image' ? '图片模型' : '视频模型'}</span><select aria-label={mode === 'image' ? '图片模型' : '视频模型'} disabled={loadingModels || !models.length || sending} value={selected?.id || ''} onChange={e => setBinding(old => ({ ...old, [mode]: e.target.value }))} title={selected?.name}>
          {!models.length && <option value="">{loadingModels ? '正在读取模型…' : '尚未配置模型'}</option>}
          {config?.providers.filter(p => p.enabled).map(p => <optgroup key={p.id} label={p.name}>{models.filter(m => m.id.startsWith(`service-model:${p.id}:`)).map(m => <option key={m.id} value={m.id}>{m.name.replace(`${p.name} · `, '')}</option>)}</optgroup>)}
        </select></label>
        <label className="studio-control"><span className="sr-only">画面比例</span><select aria-label="画面比例" value={aspectRatio} onChange={e => setAspectRatio(e.target.value as ImageAspectRatio)}>{aspects.map(a => <option key={a} value={a}>{a === '9:16' ? '竖屏 9:16' : a === '16:9' ? '横屏 16:9' : a === '1:1' ? '方形 1:1' : '横图 4:3'}</option>)}</select></label>
        {mode === 'video' && <label className="studio-control"><span className="sr-only">视频时长</span><select aria-label="视频时长" value={duration} onChange={e => setDuration(Number(e.target.value))}>{durations.map(d => <option key={d} value={d}>{d} 秒</option>)}</select></label>}
        <button type="button" className="studio-submit" aria-label={mode === 'image' ? '生成图片' : '生成视频'} title={sending ? '正在提交' : mode === 'image' ? '生成图片' : '生成视频'} disabled={disabled || sending || uploading || !prompt.trim() || !selected} onClick={() => void generate()}>{sending ? <span className="studio-spinner" /> : <StudioIcon name="arrow" />}</button>
      </PromptInputActions>
    </PromptInput>}
    {error && <p role="alert" className="studio-composer-error">{error} <button type="button" onClick={() => void loadModels()}>重新读取模型</button></p>}
    {!loadingModels && mode !== 'chat' && !models.length && <p className="studio-composer-note">先添加一个{mode === 'image' ? '图片' : '视频'}服务即可开始。<button type="button" onClick={() => useAppStore.getState().setCurrentPage('settings')}>打开模型配置</button></p>}
    <div className="studio-compose-caption"><span>{mode === 'chat' ? '支持资料附件与 / Skill' : selected?.description || '选择模型，写下想法，开始创作。'}</span><span>Enter 发送 · Shift + Enter 换行</span></div>
  </div>
}
