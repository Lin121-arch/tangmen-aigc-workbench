import { useEffect, useRef, useState } from 'react'
import { MODEL_PROTOCOLS, PROTOCOL_LABELS, modelWorkflowId, type ModelServicesConfig, type ModelProvider, type ModelEndpoint, type ModelProtocol, type ServiceModel, type DiscoveredServiceModel } from '../shared/model-services'
import { DEFAULT_RELAY_VIDEO_CONFIG } from '../shared/relay-video-config'
import { createPresetProvider, endpointPurpose, PURPOSE_NAMES, PROVIDER_PRESETS, isTangMenProvider } from '../shared/provider-presets'
import { ProviderCatalog } from './ProviderCatalog'

const field = 'settings-field'
const button = 'settings-button'
const uid = () => crypto.randomUUID()
const purpose = (protocol: ModelProtocol) => protocol === 'chat-completions' ? 'chat' : protocol.endsWith('video') ? 'video' : 'image'
function SecretField({ value, patch, label, fallback }: { value: ModelProvider | ModelEndpoint; patch: (value: { apiKey?: string; clearApiKey?: boolean }) => void; label: string; fallback?: boolean }) {
  return <div><label className="text-xs text-[#b8b4c2]">{label}{value.apiKeyConfigured && !value.clearApiKey && <span className="ml-2 text-emerald-300">已保存</span>}
    <input aria-label={label} type="password" autoComplete="off" value={value.apiKey || ''} onChange={e => patch({ apiKey: e.target.value, clearApiKey: false })} placeholder={value.apiKeyConfigured ? '留空保留已保存的密钥' : fallback ? '留空使用服务商通用密钥' : '输入 API Key；本地无鉴权服务可留空'} className={field} spellCheck={false} /></label>
    {value.apiKeyConfigured && <label className="mt-2 flex items-center gap-2 text-xs text-[#b8b4c2]"><input type="checkbox" checked={!!value.clearApiKey} onChange={e => patch({ clearApiKey: e.target.checked, apiKey: '' })} className="accent-[#d4af37]" />{fallback ? '清除独立密钥，改用通用密钥' : '清除已保存的密钥'}</label>}
  </div>
}
export function ModelServicesSettings({ value, onChange, view = 'providers' }: { value: ModelServicesConfig; onChange: (config: ModelServicesConfig) => void; view?: 'providers' | 'defaults' }) {
  const [expandedModel, setExpandedModel] = useState('')
  const [managing, setManaging] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState(''); const [endpointId, setEndpointId] = useState('')
  const [catalog, setCatalog] = useState(false); const [found, setFound] = useState<DiscoveredServiceModel[]>([]); const [foundId, setFoundId] = useState(''); const [notice, setNotice] = useState(''); const [reading, setReading] = useState(false)
  const provider = value.providers.find(p => p.id === selected) || value.providers[0]
  const endpoint = provider?.endpoints.find(e => e.id === endpointId) || provider?.endpoints[0]
  const tangmen = isTangMenProvider(provider)
  const official = PROVIDER_PRESETS.find(p => p.category === 'official' && p.name === provider?.name)
  const mediaSite = !!provider?.endpoints.length && provider.endpoints.every(e => e.protocol.startsWith('luna-media-'))
  const discoveryKey = JSON.stringify([provider?.id, endpoint?.id, endpoint?.baseUrl, endpoint?.protocol, provider?.apiKey, provider?.clearApiKey, endpoint?.apiKey, endpoint?.clearApiKey])
  const activeDiscovery = useRef(discoveryKey); activeDiscovery.current = discoveryKey
  const discoverySequence = useRef(0)
  useEffect(() => { discoverySequence.current++; setReading(false); setFound([]); setFoundId('') }, [discoveryKey])
  function changeProvider(patch: Partial<ModelProvider>) {
    if (!provider) return
    const providers = value.providers.map(p => p.id === provider.id ? { ...p, ...patch } : p)
    const defaults = Object.fromEntries(Object.entries(value.defaults).filter(([type, binding]) => !binding || providers.some(p => p.enabled && p.models.some(m => modelWorkflowId(p.id, m.id) === binding && m.capabilities.includes(type as 'chat' | 'image' | 'video') && (type !== 'chat' || m.capabilities.includes('tools'))))))
    if (JSON.stringify(defaults) !== JSON.stringify(value.defaults)) setNotice('已取消不再适用的默认模型，请到“默认模型”重新选择。')
    onChange({ ...value, providers, defaults })
  }
  function changeEndpoint(patch: Partial<ModelEndpoint>) {
    if (!provider || !endpoint) return
    setNotice('')
    const changedProtocol = patch.protocol && patch.protocol !== endpoint.protocol
    changeProvider({ endpoints: provider.endpoints.map(e => e.id === endpoint.id ? { ...e, ...patch } : e),
      ...(changedProtocol ? { models: provider.models.map(m => m.endpointId === endpoint.id ? { ...m, capabilities: [purpose(patch.protocol!)], referenceLimit: 0, durations: undefined, aspectRatios: undefined, resolutions: undefined } : m) } : {}) })
  }
  async function readModels() {
    if (!provider || !endpoint) return
    const origin = discoveryKey; const token = ++discoverySequence.current
    setReading(true); setNotice('')
    try {
      const ids = await window.electronAPI.discoverServiceModelCatalog(provider, endpoint.id)
      if (activeDiscovery.current !== origin || discoverySequence.current !== token) return
      setFound(ids); setFoundId(ids[0]?.id || ''); setNotice(mediaSite ? `已读取 ${ids.filter(m => m.capabilities?.includes('image')).length} 个图片、${ids.filter(m => m.capabilities?.includes('video')).length} 个视频模型。登记后可在画布选择；读取列表不产生生成费用。` : `已读取 ${ids.length} 个模型名称，选择需要的模型添加到工作台。`)
    } catch (e) { if (activeDiscovery.current === origin && discoverySequence.current === token) setNotice(e instanceof Error ? e.message : String(e)) }
    finally { if (activeDiscovery.current === origin && discoverySequence.current === token) setReading(false) }
  }
  function removeBindings(ids: string[]) { return Object.fromEntries(Object.entries(value.defaults).filter(([, id]) => !ids.includes(id!))) }
  function addProvider(presetId: string) {
    const p = createPresetProvider(presetId)
    onChange({ ...value, providers: [...value.providers, p] }); setSelected(p.id); setEndpointId(''); setFound([]); setNotice(''); setCatalog(false); setManaging(presetId === 'custom'); setExpandedModel('')
  }
  function addModel(modelId = '') {
    if (!provider || !endpoint) return
    const type = purpose(endpoint.protocol)
    const discovered = found.find(m => m.id === modelId)
    if (modelId && provider.models.some(m => m.endpointId === (discovered?.endpointId || endpoint.id) && m.modelId === modelId)) { setNotice('此模型已经登记，可在下方修改名称或能力。'); return }
    const model: ServiceModel = { id: uid(), name: modelId, modelId, endpointId: endpoint.id, capabilities: [type], referenceLimit: 0,
      ...(discovered ? { ...discovered, id: uid(), modelId: discovered.id } : {}) }
    changeProvider({ models: [...provider.models, model] }); setExpandedModel(model.id)
  }
  function registerAll() {
    if (!provider) return
    const added = found.filter(m => !provider.models.some(x => x.endpointId === m.endpointId && x.modelId === m.id)).map(m => ({ ...m, id: uid(), modelId: m.id, capabilities: m.capabilities || [purpose(provider.endpoints.find(e => e.id === m.endpointId)!.protocol)], referenceLimit: m.referenceLimit || 0 } satisfies ServiceModel))
    changeProvider({ models: [...provider.models, ...added] }); setNotice(`已新增 ${added.length} 个模型。可到“默认模型”设置常用模型，完成后点击“保存配置”。`)
  }
  const models = value.providers.filter(p => p.enabled).flatMap(p => p.models.map(m => ({ p, m, id: modelWorkflowId(p.id, m.id) })))

  const currentModels = provider?.models.filter(m => m.endpointId === endpoint?.id) || []
  const endpointName = endpoint ? PURPOSE_NAMES[endpointPurpose(endpoint.protocol)] : ''
  return <section aria-label={view === 'defaults' ? '默认模型设置' : '模型服务'} className="model-settings">
    {view === 'defaults' ? <div className="settings-defaults">
      <div className="settings-section-heading"><h2>默认模型</h2><p>为新对话和新建节点选择常用模型，已有项目的选择会保留。</p></div>
      {(['chat', 'image', 'video'] as const).map(type => <label key={type} className="settings-default-row">
        <span><strong>{type === 'chat' ? '创作助手' : type === 'image' ? '图片生成' : '视频生成'}</strong><small>{type === 'chat' ? '用于对话和工具调用' : type === 'image' ? '用于角色、场景与参考图' : '用于视频片段生成'}</small></span>
        <select aria-label={`默认${type === 'chat' ? '对话' : type === 'image' ? '图片' : '视频'}模型`} className={field} value={value.defaults[type] || ''} onChange={e => onChange({ ...value, defaults: { ...value.defaults, [type]: e.target.value || undefined } })}>
          <option value="">暂不设置，沿用旧设置或手动选择</option>
          {models.filter(({ m }) => m.capabilities.includes(type) && (type !== 'chat' || m.capabilities.includes('tools'))).map(({ p, m, id }) => <option key={id} value={id}>{p.name} · {m.name || m.modelId}</option>)}
        </select>
      </label>)}
      <p className="settings-hint">列表只包含已启用、用途匹配的模型。创作助手需要模型支持工具调用。</p>
    </div> : catalog || !provider ? <>
      <div className="settings-section-heading settings-catalog-heading"><h2>添加模型服务</h2><p>选择你使用的平台，连接地址会自动填写。</p></div>
      <ProviderCatalog onSelect={addProvider} onClose={() => setCatalog(false)} />
    </> : <div className="settings-provider-layout">
      <aside className="settings-provider-sidebar">
        <div className="settings-sidebar-label">已添加的服务 <span>{value.providers.length}</span></div>
        <nav aria-label="服务商列表">{value.providers.map(p => <button key={p.id} aria-pressed={p.id === provider.id} onClick={() => { setSelected(p.id); setEndpointId(''); setFound([]); setNotice(''); setManaging(false); setExpandedModel('') }} className="settings-provider-item">
          <span className="settings-provider-name">{p.name || '未命名服务商'}</span>
          <span className="settings-provider-meta">{p.models.length} 个模型{!p.enabled && ' · 已停用'}</span>
        </button>)}</nav>
        <button type="button" className="settings-add-provider" onClick={() => setCatalog(true)}><span aria-hidden="true">＋</span> 添加模型服务</button>
      </aside>
      <div className="settings-provider-detail">
        <div className="settings-provider-heading">
          <div className="settings-provider-identity">{tangmen && <img src="./app-icon.png" alt="" />}
            <div><h2>{provider.name || '未命名服务商'}</h2><p>{tangmen ? '第三方模型服务' : official ? '官方模型服务' : '自定义模型服务'}</p></div>
          </div>
          <div className="settings-provider-actions"><label className="settings-enable"><input type="checkbox" checked={provider.enabled} onChange={e => changeProvider({ enabled: e.target.checked })} />启用服务商</label>
            <button type="button" className="settings-text-button" aria-expanded={managing} onClick={() => setManaging(v => !v)}>{managing ? '收起管理' : '管理服务'}</button>
          </div>
        </div>
        {managing && <div className="settings-management">
          <label className="settings-label">服务商名称<input aria-label="服务商名称" value={provider.name} onChange={e => changeProvider({ name: e.target.value })} className={field} maxLength={100} /></label>
          {tangmen && (provider.apiKeyConfigured || provider.apiKey) && <div className="mt-4"><SecretField value={provider} patch={changeProvider} label="历史通用 API Key（兼容旧配置）" /></div>}
          <div className="settings-management-footer"><button className="settings-text-button settings-danger" onClick={() => { onChange({ ...value, defaults: removeBindings(provider.models.map(m => modelWorkflowId(provider.id, m.id))), providers: value.providers.filter(p => p.id !== provider.id) }); setSelected(''); setEndpointId(''); setFound([]); setManaging(false) }}>移除服务商</button>
            <button className="settings-text-button" onClick={() => { const id = uid(); changeProvider({ endpoints: [...provider.endpoints, { id, protocol: 'chat-completions', baseUrl: '' }] }); setEndpointId(id); setFound([]); setManaging(false) }}>{tangmen ? '添加对话连接' : '添加其他连接'}</button>
          </div>
        </div>}
        {endpoint ? <>
          <div className="settings-purpose-tabs" role="group" aria-label="服务用途">{provider.endpoints.map((e, i) => <button type="button" key={e.id} aria-pressed={endpoint.id === e.id} onClick={() => { setEndpointId(e.id); setFound([]); setNotice('') }}>{PURPOSE_NAMES[endpointPurpose(e.protocol)]}{provider.endpoints.filter(x => endpointPurpose(x.protocol) === endpointPurpose(e.protocol)).length > 1 ? ' ' + (i + 1) : ''}</button>)}</div>
          <div className="settings-connection">
            <div className="settings-key-row">
              <SecretField key={tangmen ? endpoint.id : provider.id} value={tangmen ? endpoint : provider} patch={tangmen ? changeEndpoint : changeProvider} label={tangmen ? endpointName + ' API Key' : '服务商通用 API Key'} />
              <button disabled={reading || !endpoint.baseUrl.trim()} className="settings-button settings-primary" onClick={() => void readModels()}>{reading ? '读取中…' : '读取模型列表'}</button>
            </div>
            <div className="settings-key-help">
              <span>{tangmen ? '图片与视频使用各自的密钥。' : '通用密钥供此服务商的各用途使用。'}</span>
              {official?.website && <a href={official.website} target="_blank" rel="noreferrer">获取官方 Key ↗</a>}
              {tangmen && <button type="button" className="settings-text-button" title="复制微信号 STL6121" onClick={() => { void navigator.clipboard.writeText('STL6121').then(() => setNotice('微信号已复制：STL6121'), () => setNotice('复制失败，请手动复制 STL6121')) }}>获取 Key · 微信 STL6121</button>}
            </div>
            {!tangmen && endpoint.apiKeyConfigured && !endpoint.clearApiKey && <p className="settings-hint">本用途正在使用独立密钥，可在高级连接设置中更改。</p>}
            {tangmen && provider.apiKeyConfigured && !provider.clearApiKey && <p className="settings-hint">本用途未填密钥时，沿用历史通用密钥；可在“管理服务”中清除。</p>}
            <details key={endpoint.id + '-advanced'} open={connectionOpen[endpoint.id] ?? !endpoint.baseUrl} onToggle={event => { const open = event.currentTarget.open; const id = endpoint.id; setConnectionOpen(old => old[id] === open ? old : { ...old, [id]: open }) }} className="settings-advanced-connection">
              <summary>高级连接设置</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="settings-label">接口协议<select aria-label="接口协议" value={endpoint.protocol} onChange={e => { changeEndpoint({ protocol: e.target.value as ModelProtocol }); setFound([]) }} className={field}>{MODEL_PROTOCOLS.map(p => <option key={p} value={p}>{PROTOCOL_LABELS[p]}</option>)}</select></label><label className="settings-label">API Base URL<input aria-label="端点 Base URL" value={endpoint.baseUrl} onChange={e => changeEndpoint({ baseUrl: e.target.value })} className={field} placeholder="例如 https://你的服务域名/v1" spellCheck={false} /></label></div>
              {!tangmen && <div className="mt-4"><SecretField value={endpoint} patch={changeEndpoint} label="端点独立 API Key" fallback /></div>}
              <div className="settings-management-footer"><span className="settings-hint">移除连接前，先移除或调整使用它的模型。</span><button className="settings-text-button settings-danger" disabled={provider.models.some(m => m.endpointId === endpoint.id)} onClick={() => { changeProvider({ endpoints: provider.endpoints.filter(e => e.id !== endpoint.id) }); setEndpointId('') }}>移除端点</button></div>
              {endpoint.protocol === 'json-video' && <details className="mt-4 rounded-lg border border-white/10 p-4"><summary className="cursor-pointer text-sm text-[#d7d4cb]">视频高级配置 · 提交与查询</summary><p className="mt-3 text-xs leading-6 text-[#b8b4c2]">Bearer 鉴权、JSON POST、GET 查询、MP4 下载。路径相对 Base URL；查询路径需包含 {'{id}'}。按实际接口文档填写。</p><div className="mt-4 grid gap-4 md:grid-cols-2">{([['submitPath', '提交路径'], ['queryPath', '查询路径'], ['downloadPath', '下载路径（可选）'], ['taskIdPath', '任务 ID 字段'], ['statusPath', '状态字段'], ['videoUrlPath', '视频 URL 字段'], ['successStatuses', '成功状态（逗号分隔）'], ['failedStatuses', '失败状态（逗号分隔）']] as const).map(([key, label]) => <label key={key} className="text-xs text-[#b8b4c2]">{label}<input aria-label={`端点视频${label}`} className={field} value={(endpoint.videoConfig || DEFAULT_RELAY_VIDEO_CONFIG)[key]} onChange={e => changeEndpoint({ videoConfig: { ...DEFAULT_RELAY_VIDEO_CONFIG, ...endpoint.videoConfig, baseUrl: endpoint.baseUrl, [key]: e.target.value } })} /></label>)}</div><label className="mt-4 block text-xs text-[#b8b4c2]">提交 JSON 模板<textarea aria-label="端点视频提交 JSON" className={`${field} min-h-40 font-mono`} value={(endpoint.videoConfig || DEFAULT_RELAY_VIDEO_CONFIG).submitBody} onChange={e => changeEndpoint({ videoConfig: { ...DEFAULT_RELAY_VIDEO_CONFIG, ...endpoint.videoConfig, baseUrl: endpoint.baseUrl, submitBody: e.target.value } })} /></label><p className="mt-2 text-xs leading-6 text-[#b8b4c2]">变量：{'{{model}}、{{prompt}}、{{duration}}、{{aspectRatio}}、{{image}}、{{images}}'}。变量独占字符串值；首帧按 data URI 发送。模板内勿填写密钥。</p></details>}
            </details>
            {found.length > 0 && <div className="settings-discovered"><select aria-label="发现的模型" className={field} value={foundId} onChange={e => setFoundId(e.target.value)}>{found.map(m => <option key={`${m.endpointId}:${m.id}`} value={m.id}>{m.capabilities?.includes('video') ? '视频 · ' : m.capabilities?.includes('image') ? '图片 · ' : ''}{m.name}</option>)}</select><button className={button} onClick={() => addModel(foundId)}>登记此模型</button>{mediaSite && <button className={button} onClick={registerAll}>登记全部模型</button>}</div>}
          </div>
        </> : <div className="settings-empty"><p>还没有连接，请在“管理服务”中添加。</p></div>}
        {notice && <p role="status" className="settings-notice">{notice}</p>}
        {endpoint && <div className="settings-models">
          <div className="settings-models-heading"><h3>{endpointName}模型 <span>{currentModels.length}</span></h3><button className="settings-text-button" onClick={() => addModel()}>手动添加模型</button></div>
          {!currentModels.length && <div className="settings-empty"><p>还没有{endpointName}模型</p><small>填写密钥后读取模型列表，或手动添加模型 ID。</small></div>}
          {provider.models.map((m, i) => {
            if (m.endpointId !== endpoint.id) return null
            const e = provider.endpoints.find(e => e.id === m.endpointId)
            const type = e ? purpose(e.protocol) : 'image'
            const patch = (part: Partial<ServiceModel>) => changeProvider({ models: provider.models.map(x => x.id === m.id ? { ...x, ...part } : x) })
            const supportsRefs = m.capabilities.includes(type === 'video' ? 'first-frame' : 'image-edit')
            const expanded = expandedModel === m.id
            const name = m.name || m.modelId || '未命名模型'
            return <div key={m.id} className="settings-model-item" aria-label={`登记模型 ${i + 1}`}>
              <button type="button" className="settings-model-summary" aria-label={`${expanded ? '收起' : '编辑'}模型 ${name}`} aria-expanded={expanded} onClick={() => setExpandedModel(expanded ? '' : m.id)}>
                <span className="settings-model-description"><strong>{name}</strong><small>{m.description || m.modelId || '填写模型名称和 ID'}</small></span>
                <span className="settings-model-tags">{m.durations?.length ? m.durations.join(' / ') + ' 秒' : supportsRefs ? type === 'video' ? '支持首帧' : '支持参考图' : ''}{Object.values(value.defaults).includes(modelWorkflowId(provider.id, m.id)) && <span className="settings-default-tag">默认</span>}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={expanded ? 'is-expanded' : ''}><path d="m9 5 7 7-7 7" /></svg>
              </button>
              {expanded && <div className="settings-model-editor">
              <div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-[#b8b4c2]">显示名称<input aria-label={`模型 ${i + 1} 名称`} className={field} value={m.name} onChange={e => patch({ name: e.target.value })} placeholder="例如 日常生图" /></label><label className="text-xs text-[#b8b4c2]">实际模型 ID<input aria-label={`模型 ${i + 1} ID`} className={field} value={m.modelId} onChange={e => patch({ modelId: e.target.value })} spellCheck={false} placeholder="按接口文档填写" /></label></div>
              <label className="mt-3 block text-xs text-[#b8b4c2]">使用端点<select aria-label={`模型 ${i + 1} 端点`} className={field} value={m.endpointId} onChange={event => { const ep = provider.endpoints.find(e => e.id === event.target.value)!; patch({ endpointId: ep.id, capabilities: [purpose(ep.protocol)], referenceLimit: 0, durations: undefined, aspectRatios: undefined, resolutions: undefined }) }}>{provider.endpoints.map(e => <option key={e.id} value={e.id}>{PROTOCOL_LABELS[e.protocol]}</option>)}</select></label>
              <label className="mt-3 block text-xs text-[#b8b4c2]">用途说明<input aria-label={`模型 ${i + 1} 用途说明`} className={field} maxLength={200} value={m.description ?? ''} onChange={e => patch({ description: e.target.value })} placeholder="用一句话告诉新手，这个模型适合做什么" /></label>
              {m.durations?.length && <p className="mt-3 text-xs leading-6 text-[#b8b4c2]">可选时长：{m.durations.join('、')} 秒{m.resolutions?.length ? `；清晰度：${m.resolutions[0]}` : ''}。画布按此模型的可选时长显示。</p>}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-[#c1bdca]"><span>{type === 'chat' ? '对话' : type === 'image' ? '图片生成' : '视频生成'}</span>{(type === 'chat' ? [['tools', '支持工具调用'], ['vision', '模型支持视觉（助手当前仅用文本）']] : type === 'image' ? [['image-edit', '支持参考图编辑']] : [['first-frame', '支持首帧']] as const).map(([cap, label]) => <label key={cap} className="flex items-center gap-2"><input type="checkbox" checked={m.capabilities.includes(cap as typeof m.capabilities[number])} onChange={event => patch({ capabilities: event.target.checked ? [...m.capabilities, cap as typeof m.capabilities[number]] : m.capabilities.filter(c => c !== cap), ...(!event.target.checked && ['image-edit', 'first-frame'].includes(cap) ? { referenceLimit: 0 } : {}) })} className="accent-[#d4af37]" />{label}</label>)}
                {type !== 'chat' && supportsRefs && <label className="flex items-center gap-2">参考图上限<input aria-label={`模型 ${i + 1} 参考图上限`} type="number" min={0} max={type === 'video' ? 1 : 14} value={m.referenceLimit} onChange={e => patch({ referenceLimit: Number(e.target.value) })} className="w-16 rounded border border-white/20 bg-[#09090e] px-2 py-1.5" /></label>}
                <button className={`${button} ml-auto`} onClick={() => onChange({ ...value, defaults: removeBindings([modelWorkflowId(provider.id, m.id)]), providers: value.providers.map(p => p.id === provider.id ? { ...p, models: p.models.filter(x => x.id !== m.id) } : p) })}>移除模型</button></div>
              </div>}
            </div>
          })}
        </div>}
      </div>
    </div>}
  </section>
}
