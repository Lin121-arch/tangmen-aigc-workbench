import { useEffect, useRef, useState } from 'react'
import { MODEL_PROTOCOLS, PROTOCOL_LABELS, modelWorkflowId, type ModelServicesConfig, type ModelProvider, type ModelEndpoint, type ModelProtocol, type ServiceModel, type DiscoveredServiceModel } from '../shared/model-services'
import { DEFAULT_RELAY_VIDEO_CONFIG } from '../shared/relay-video-config'

const field = 'mt-2 w-full min-w-0 rounded-lg border border-white/10 bg-[#09090e] px-3 py-2.5 text-sm text-[#e8e6df] outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] placeholder:text-[#9995a4]'
const button = 'rounded-lg border border-white/15 px-3 py-2 text-xs text-[#d7d4cb] hover:border-[#d4af37]/60 hover:text-[#e8c766] focus-visible:outline-2 focus-visible:outline-[#d4af37] disabled:opacity-50'
const uid = () => crypto.randomUUID()
const purpose = (protocol: ModelProtocol) => protocol === 'chat-completions' ? 'chat' : protocol.endsWith('video') ? 'video' : 'image'
function SecretField({ value, patch, label, fallback }: { value: ModelProvider | ModelEndpoint; patch: (value: { apiKey?: string; clearApiKey?: boolean }) => void; label: string; fallback?: boolean }) {
  return <div><label className="text-xs text-[#b8b4c2]">{label}{value.apiKeyConfigured && !value.clearApiKey && <span className="ml-2 text-emerald-300">已保存</span>}
    <input aria-label={label} type="password" autoComplete="off" value={value.apiKey || ''} onChange={e => patch({ apiKey: e.target.value, clearApiKey: false })} placeholder={value.apiKeyConfigured ? '留空保留已保存的密钥' : fallback ? '留空使用服务商通用密钥' : '输入 API Key；本地无鉴权服务可留空'} className={field} spellCheck={false} /></label>
    {value.apiKeyConfigured && <label className="mt-2 flex items-center gap-2 text-xs text-[#b8b4c2]"><input type="checkbox" checked={!!value.clearApiKey} onChange={e => patch({ clearApiKey: e.target.checked, apiKey: '' })} className="accent-[#d4af37]" />{fallback ? '清除独立密钥，改用通用密钥' : '清除该服务商已保存的密钥'}</label>}
  </div>
}
export function ModelServicesSettings({ value, onChange }: { value: ModelServicesConfig; onChange: (config: ModelServicesConfig) => void }) {
  const [selected, setSelected] = useState(''); const [endpointId, setEndpointId] = useState('')
  const [preset, setPreset] = useState('compatible'); const [found, setFound] = useState<DiscoveredServiceModel[]>([]); const [foundId, setFoundId] = useState(''); const [notice, setNotice] = useState(''); const [reading, setReading] = useState(false)
  const provider = value.providers.find(p => p.id === selected) || value.providers[0]
  const endpoint = provider?.endpoints.find(e => e.id === endpointId) || provider?.endpoints[0]
  const mediaSite = !!provider?.endpoints.length && provider.endpoints.every(e => e.protocol.startsWith('luna-media-'))
  const discoveryKey = JSON.stringify([provider?.id, endpoint?.id, endpoint?.baseUrl, endpoint?.protocol, provider?.apiKey, provider?.clearApiKey, endpoint?.apiKey, endpoint?.clearApiKey])
  const activeDiscovery = useRef(discoveryKey); activeDiscovery.current = discoveryKey
  const discoverySequence = useRef(0)
  useEffect(() => { discoverySequence.current++; setReading(false); setFound([]); setFoundId('') }, [discoveryKey])
  function changeProvider(patch: Partial<ModelProvider>) {
    if (!provider) return
    const providers = value.providers.map(p => p.id === provider.id ? { ...p, ...patch } : p)
    const defaults = Object.fromEntries(Object.entries(value.defaults).filter(([type, binding]) => !binding || providers.some(p => p.enabled && p.models.some(m => modelWorkflowId(p.id, m.id) === binding && m.capabilities.includes(type as 'chat' | 'image' | 'video') && (type !== 'chat' || m.capabilities.includes('tools'))))))
    if (JSON.stringify(defaults) !== JSON.stringify(value.defaults)) setNotice('已取消不再适用的默认模型，请在下方“默认用途”重新选择。')
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
      const ids = (await Promise.all((mediaSite ? provider.endpoints : [endpoint]).map(e => window.electronAPI.discoverServiceModelCatalog(provider, e.id)))).flat()
      if (activeDiscovery.current !== origin || discoverySequence.current !== token) return
      setFound(ids); setFoundId(ids[0]?.id || ''); setNotice(mediaSite ? `已读取 ${ids.filter(m => m.capabilities?.includes('image')).length} 个图片、${ids.filter(m => m.capabilities?.includes('video')).length} 个视频模型。登记后可在画布选择；读取列表不产生生成费用。` : `已读取 ${ids.length} 个模型名称，仅证明列表可读；请登记能力并通过节点手动验证生成。`)
    } catch (e) { if (activeDiscovery.current === origin && discoverySequence.current === token) setNotice(e instanceof Error ? e.message : String(e)) }
    finally { if (activeDiscovery.current === origin && discoverySequence.current === token) setReading(false) }
  }
  function removeBindings(ids: string[]) { return Object.fromEntries(Object.entries(value.defaults).filter(([, id]) => !ids.includes(id!))) }
  function addProvider() {
    const id = uid()
    const presets: Record<string, { name: string; endpoints: { protocol: ModelProtocol; baseUrl: string }[] }> = {
      compatible: { name: '自定义兼容服务', endpoints: [{ protocol: 'chat-completions', baseUrl: '' }] },
      luna: { name: 'Luna', endpoints: [{ protocol: 'luna-image', baseUrl: import.meta.env.MODE === 'student' ? '' : 'https://api.example.invalid/v1' }, { protocol: 'json-video', baseUrl: import.meta.env.MODE === 'student' ? '' : 'https://api.example.invalid/v1' }] },
      'luna-media': { name: 'Luna 图片／视频新站', endpoints: [{ protocol: 'luna-media-image', baseUrl: import.meta.env.MODE === 'student' ? '' : 'https://api.example.invalid' }, { protocol: 'luna-media-video', baseUrl: import.meta.env.MODE === 'student' ? '' : 'https://api.example.invalid' }] },
      'luna-image-site': { name: 'Luna 图片专站', endpoints: [{ protocol: 'openai-image', baseUrl: import.meta.env.MODE === 'student' ? '' : 'https://api.example.invalid/v1' }] },
      google: { name: 'Google AI', endpoints: [{ protocol: 'gemini-image', baseUrl: 'https://generativelanguage.googleapis.com/v1' }] },
      ark: { name: '火山方舟', endpoints: [{ protocol: 'ark-image', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }, { protocol: 'ark-video', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }] },
    }
    const choice = presets[preset]
    const endpoints = choice.endpoints.map(e => ({ id: uid(), ...e }))
    const presetModels: ServiceModel[] = import.meta.env.MODE !== 'student' && preset === 'luna-image-site' ? ['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'].map(modelId => ({ id: uid(), name: modelId.replace('gpt-', ''), modelId, endpointId: endpoints[0].id, capabilities: modelId.endsWith('sunburst') ? ['image', 'image-edit'] : ['image'], referenceLimit: modelId.endsWith('sunburst') ? 1 : 0 })) : []
    onChange({ ...value, providers: [...value.providers, { id, name: choice.name, enabled: true, endpoints, models: presetModels }] }); setSelected(id); setEndpointId(''); setFound([]); setNotice(presetModels.length ? '已预填 3 个实测图片模型。填写专站 Key，选择默认图片模型并保存；Sunburst 可接一张参考图。' : '')
  }
  function addModel(modelId = '') {
    if (!provider || !endpoint) return
    const type = purpose(endpoint.protocol)
    const discovered = found.find(m => m.id === modelId)
    if (modelId && provider.models.some(m => m.endpointId === (discovered?.endpointId || endpoint.id) && m.modelId === modelId)) { setNotice('此模型已经登记，可在下方修改名称或能力。'); return }
    const model: ServiceModel = { id: uid(), name: modelId, modelId, endpointId: endpoint.id, capabilities: type === 'chat' ? ['chat', 'tools'] : [type], referenceLimit: 0,
      ...(discovered ? { ...discovered, id: uid(), modelId: discovered.id } : {}) }
    changeProvider({ models: [...provider.models, model] })
  }
  function registerAll() {
    if (!provider) return
    const added = found.filter(m => !provider.models.some(x => x.endpointId === m.endpointId && x.modelId === m.id)).map(m => ({ ...m, id: uid(), modelId: m.id, capabilities: m.capabilities || [purpose(provider.endpoints.find(e => e.id === m.endpointId)!.protocol)], referenceLimit: m.referenceLimit || 0 } satisfies ServiceModel))
    changeProvider({ models: [...provider.models, ...added] }); setNotice(`已新增 ${added.length} 个模型。请在下方选择默认图片、视频模型，再点击顶部“保存配置”。`)
  }
  const models = value.providers.filter(p => p.enabled).flatMap(p => p.models.map(m => ({ p, m, id: modelWorkflowId(p.id, m.id) })))
  return <section aria-label="模型服务" className="overflow-hidden rounded-2xl border border-white/10 bg-[#111117]">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-6">
      <div><h2 className="text-base font-semibold text-[#e8c766]">模型服务</h2><p className="mt-2 max-w-[70ch] text-xs leading-6 text-[#b8b4c2]">分别连接官方或中转服务，为助手、图片和视频选择模型。不同服务商、不同账号可以同时保留。</p></div>
      <div className="flex flex-wrap items-center gap-2"><select aria-label="服务商预设" value={preset} onChange={e => setPreset(e.target.value)} className={field} style={{ width: 'auto', marginTop: 0 }}><option value="compatible">自定义兼容服务</option><option value="luna-image-site">Luna 图片专站</option><option value="luna-media">Luna 图片／视频新站</option><option value="luna">Luna 旧站</option><option value="google">Google AI</option><option value="ark">火山方舟</option></select><button className={button} onClick={addProvider}>添加服务商</button></div>
    </div>
    <div className="grid min-h-64 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="服务商列表" className="border-b border-white/10 p-3 lg:border-r lg:border-b-0">
        {value.providers.length ? value.providers.map(p => <button key={p.id} aria-pressed={p.id === provider?.id} onClick={() => { setSelected(p.id); setEndpointId(''); setFound([]); setNotice('') }} className={`mb-1 w-full rounded-lg px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-[#d4af37] ${p.id === provider?.id ? 'bg-[#d4af37]/15 text-[#f0d98c]' : 'text-[#c1bdca] hover:bg-white/5'}`}><span className="block break-words text-sm">{p.name || '未命名服务商'}</span><span className="mt-1 block text-xs text-[#b8b4c2]">{p.models.length} 个模型 · {p.enabled ? '启用' : '停用'}</span></button>) : <p className="p-3 text-xs leading-6 text-[#b8b4c2]">先选预设并添加服务商，再填写密钥、连接地址和实际模型 ID。</p>}
      </nav>
      <div className="min-w-0 p-6">
        {!provider ? <div className="py-6"><h3 className="text-sm font-medium text-[#e8e6df]">从你已有的模型服务开始</h3><p className="mt-3 max-w-[65ch] text-sm leading-7 text-[#b8b4c2]">只做图片，可以先接图片模型；已有图片做视频，只需接视频模型。助手使用独立的对话模型，三者可以来自不同供应商。</p><p className="mt-4 text-xs text-[#b8b4c2]">添加与保存配置不会生成内容，费用以实际服务商账单为准。</p></div> : <>
          <div className="flex flex-wrap items-center gap-4"><label className="min-w-52 flex-1 text-xs text-[#b8b4c2]">服务商名称<input aria-label="服务商名称" value={provider.name} onChange={e => changeProvider({ name: e.target.value })} className={field} maxLength={100} /></label><label className="flex items-center gap-2 text-xs text-[#c1bdca]"><input type="checkbox" checked={provider.enabled} onChange={e => { const next = !e.target.checked ? removeBindings(provider.models.map(m => modelWorkflowId(provider.id, m.id))) : value.defaults; onChange({ ...value, defaults: next, providers: value.providers.map(p => p.id === provider.id ? { ...p, enabled: e.target.checked } : p) }) }} className="accent-[#d4af37]" />启用服务商</label><button className={button} onClick={() => { onChange({ ...value, defaults: removeBindings(provider.models.map(m => modelWorkflowId(provider.id, m.id))), providers: value.providers.filter(p => p.id !== provider.id) }); setSelected(''); setEndpointId(''); setFound([]) }}>移除服务商</button></div>
          <div className="mt-5"><SecretField value={provider} patch={changeProvider} label="服务商通用 API Key" /></div>
          {mediaSite && <p className="mt-3 text-xs leading-6 text-[#b8b4c2]">图片／视频新站已预填连接。填写这个站的 Key → 读取模型列表 → 登记全部模型 → 选择默认用途并保存。与旧站对话服务分别配置，当前视频入口支持文字或单张首帧。</p>}
          <div className="mt-7 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-[#e8e6df]">连接端点</h3><button className={button} onClick={() => { const id = uid(); changeProvider({ endpoints: [...provider.endpoints, { id, protocol: 'openai-image', baseUrl: '' }] }); setEndpointId(id); setFound([]) }}>添加端点</button></div>
            <p className="mt-2 text-xs leading-6 text-[#b8b4c2]">每个端点选择实际协议。同一服务可为对话、图片、视频分别填写地址和密钥。</p>
            {endpoint && <>
              <select aria-label="当前端点" value={endpoint.id} onChange={e => { setEndpointId(e.target.value); setFound([]); setNotice('') }} className={field}>{provider.endpoints.map((e, i) => <option key={e.id} value={e.id}>{i + 1}. {PROTOCOL_LABELS[e.protocol]}</option>)}</select>
              <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-xs text-[#b8b4c2]">接口协议<select aria-label="接口协议" value={endpoint.protocol} onChange={e => { changeEndpoint({ protocol: e.target.value as ModelProtocol }); setFound([]) }} className={field}>{MODEL_PROTOCOLS.map(p => <option key={p} value={p}>{PROTOCOL_LABELS[p]}</option>)}</select></label><label className="text-xs text-[#b8b4c2]">API Base URL<input aria-label="端点 Base URL" value={endpoint.baseUrl} onChange={e => changeEndpoint({ baseUrl: e.target.value })} className={field} placeholder="例如 https://你的服务域名/v1" spellCheck={false} /></label></div>
              <details className="mt-4"><summary className="cursor-pointer text-xs text-[#d7d4cb]">独立密钥与端点管理</summary><div className="mt-4"><SecretField value={endpoint} patch={changeEndpoint} label="端点独立 API Key" fallback /></div><button className={`${button} mt-3`} disabled={provider.models.some(m => m.endpointId === endpoint.id)} onClick={() => { changeProvider({ endpoints: provider.endpoints.filter(e => e.id !== endpoint.id) }); setEndpointId('') }}>移除端点</button><p className="mt-2 text-xs text-[#b8b4c2]">移除前先移除或调整使用此端点的模型。清除独立密钥后使用通用密钥。</p></details>
              {endpoint.protocol === 'json-video' && <details className="mt-4 rounded-lg border border-white/10 p-4"><summary className="cursor-pointer text-sm text-[#d7d4cb]">视频高级配置 · 提交与查询</summary><p className="mt-3 text-xs leading-6 text-[#b8b4c2]">Bearer 鉴权、JSON POST、GET 查询、MP4 下载。路径相对 Base URL；查询路径需包含 {'{id}'}。按实际接口文档填写。</p><div className="mt-4 grid gap-4 md:grid-cols-2">{([['submitPath', '提交路径'], ['queryPath', '查询路径'], ['downloadPath', '下载路径（可选）'], ['taskIdPath', '任务 ID 字段'], ['statusPath', '状态字段'], ['videoUrlPath', '视频 URL 字段'], ['successStatuses', '成功状态（逗号分隔）'], ['failedStatuses', '失败状态（逗号分隔）']] as const).map(([key, label]) => <label key={key} className="text-xs text-[#b8b4c2]">{label}<input aria-label={`端点视频${label}`} className={field} value={(endpoint.videoConfig || DEFAULT_RELAY_VIDEO_CONFIG)[key]} onChange={e => changeEndpoint({ videoConfig: { ...DEFAULT_RELAY_VIDEO_CONFIG, ...endpoint.videoConfig, baseUrl: endpoint.baseUrl, [key]: e.target.value } })} /></label>)}</div><label className="mt-4 block text-xs text-[#b8b4c2]">提交 JSON 模板<textarea aria-label="端点视频提交 JSON" className={`${field} min-h-40 font-mono`} value={(endpoint.videoConfig || DEFAULT_RELAY_VIDEO_CONFIG).submitBody} onChange={e => changeEndpoint({ videoConfig: { ...DEFAULT_RELAY_VIDEO_CONFIG, ...endpoint.videoConfig, baseUrl: endpoint.baseUrl, submitBody: e.target.value } })} /></label><p className="mt-2 text-xs leading-6 text-[#b8b4c2]">变量：{'{{model}}、{{prompt}}、{{duration}}、{{aspectRatio}}、{{image}}、{{images}}'}。变量独占字符串值；首帧按 data URI 发送。模板内勿填写密钥。</p></details>}
              <div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={reading} className={button} onClick={() => void readModels()}>{reading ? '读取中…' : '读取模型列表'}</button><button className={button} onClick={() => addModel()}>手动添加模型</button><span className="text-xs text-[#b8b4c2]">只读列表，不触发生成</span></div>
              {found.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-3"><select aria-label="发现的模型" className={`${field} mt-0 flex-1`} value={foundId} onChange={e => setFoundId(e.target.value)}>{found.map(m => <option key={`${m.endpointId}:${m.id}`} value={m.id}>{m.capabilities?.includes('video') ? '视频 · ' : m.capabilities?.includes('image') ? '图片 · ' : ''}{m.name}</option>)}</select><button className={`${button} shrink-0`} onClick={() => addModel(foundId)}>登记此模型</button>{mediaSite && <button className={`${button} shrink-0`} onClick={registerAll}>登记全部模型</button>}</div>}
              {notice && <p role="status" className="mt-3 text-xs leading-6 text-[#e8c766]">{notice}</p>}
            </>}
          </div>
          <div className="mt-7 border-t border-white/10 pt-5"><h3 className="text-sm font-medium text-[#e8e6df]">已登记模型</h3><p className="mt-2 text-xs leading-6 text-[#b8b4c2]">名称用于菜单展示，模型 ID 填服务商实际值。能力请按文档登记，不按名称推断。</p>
            {!provider.models.length && <p className="mt-4 text-sm text-[#b8b4c2]">还没有模型。读取列表后登记，或手动添加。</p>}
            {provider.models.map((m, i) => { const e = provider.endpoints.find(e => e.id === m.endpointId); const type = e ? purpose(e.protocol) : 'image'; const patch = (part: Partial<ServiceModel>) => changeProvider({ models: provider.models.map(x => x.id === m.id ? { ...x, ...part } : x) }); const supportsRefs = m.capabilities.includes(type === 'video' ? 'first-frame' : 'image-edit'); return <div key={m.id} className="mt-5 border-t border-white/10 pt-4" aria-label={`登记模型 ${i + 1}`}>
              <div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-[#b8b4c2]">显示名称<input aria-label={`模型 ${i + 1} 名称`} className={field} value={m.name} onChange={e => patch({ name: e.target.value })} placeholder="例如 日常生图" /></label><label className="text-xs text-[#b8b4c2]">实际模型 ID<input aria-label={`模型 ${i + 1} ID`} className={field} value={m.modelId} onChange={e => patch({ modelId: e.target.value })} spellCheck={false} placeholder="按接口文档填写" /></label></div>
              <label className="mt-3 block text-xs text-[#b8b4c2]">使用端点<select aria-label={`模型 ${i + 1} 端点`} className={field} value={m.endpointId} onChange={event => { const ep = provider.endpoints.find(e => e.id === event.target.value)!; patch({ endpointId: ep.id, capabilities: [purpose(ep.protocol)], referenceLimit: 0, durations: undefined, aspectRatios: undefined, resolutions: undefined }) }}>{provider.endpoints.map(e => <option key={e.id} value={e.id}>{PROTOCOL_LABELS[e.protocol]}</option>)}</select></label>
              <label className="mt-3 block text-xs text-[#b8b4c2]">用途说明<input aria-label={`模型 ${i + 1} 用途说明`} className={field} maxLength={200} value={m.description ?? ''} onChange={e => patch({ description: e.target.value })} placeholder="用一句话告诉新手，这个模型适合做什么" /></label>
              {m.durations?.length && <p className="mt-3 text-xs leading-6 text-[#b8b4c2]">可选时长：{m.durations.join('、')} 秒{m.resolutions?.length ? `；清晰度：${m.resolutions[0]}` : ''}。画布按此模型的可选时长显示。</p>}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-[#c1bdca]"><span>{type === 'chat' ? '对话' : type === 'image' ? '图片生成' : '视频生成'}</span>{(type === 'chat' ? [['tools', '支持工具调用'], ['vision', '模型支持视觉（助手当前仅用文本）']] : type === 'image' ? [['image-edit', '支持参考图编辑']] : [['first-frame', '支持首帧']] as const).map(([cap, label]) => <label key={cap} className="flex items-center gap-2"><input type="checkbox" checked={m.capabilities.includes(cap as typeof m.capabilities[number])} onChange={event => patch({ capabilities: event.target.checked ? [...m.capabilities, cap as typeof m.capabilities[number]] : m.capabilities.filter(c => c !== cap), ...(!event.target.checked && ['image-edit', 'first-frame'].includes(cap) ? { referenceLimit: 0 } : {}) })} className="accent-[#d4af37]" />{label}</label>)}
                {type !== 'chat' && supportsRefs && <label className="flex items-center gap-2">参考图上限<input aria-label={`模型 ${i + 1} 参考图上限`} type="number" min={0} max={type === 'video' ? 1 : 14} value={m.referenceLimit} onChange={e => patch({ referenceLimit: Number(e.target.value) })} className="w-16 rounded border border-white/20 bg-[#09090e] px-2 py-1.5" /></label>}
                <button className={`${button} ml-auto`} onClick={() => onChange({ ...value, defaults: removeBindings([modelWorkflowId(provider.id, m.id)]), providers: value.providers.map(p => p.id === provider.id ? { ...p, models: p.models.filter(x => x.id !== m.id) } : p) })}>移除模型</button></div>
            </div> })}
          </div>
        </>}
      </div>
    </div>
    <div className="border-t border-white/10 p-6"><h3 className="text-sm font-medium text-[#e8e6df]">默认用途</h3><p className="mt-2 text-xs leading-6 text-[#b8b4c2]">用于新节点和模板的初始选择。已有项目明确选择的模型保持原绑定，生成任务继续使用原连接。</p><div className="mt-4 grid gap-4 md:grid-cols-3">{(['chat', 'image', 'video'] as const).map(type => <label key={type} className="min-w-0 text-xs text-[#b8b4c2]">{type === 'chat' ? '创作助手（需工具调用）' : type === 'image' ? '图片生成' : '视频生成'}<select aria-label={`默认${type === 'chat' ? '对话' : type === 'image' ? '图片' : '视频'}模型`} className={field} value={value.defaults[type] || ''} onChange={e => onChange({ ...value, defaults: { ...value.defaults, [type]: e.target.value || undefined } })}><option value="">暂不设置，沿用旧设置或手动选择</option>{models.filter(({ m }) => m.capabilities.includes(type) && (type !== 'chat' || m.capabilities.includes('tools'))).map(({ p, m, id }) => <option key={id} value={id}>{p.name} · {m.name || m.modelId}</option>)}</select></label>)}</div><p className="mt-4 text-xs leading-6 text-[#b8b4c2]">修改后点击页面顶部“保存配置”。标准图片走 JSON 生图 / multipart 编辑；原生 Gemini、方舟与自定义视频使用各自协议。其他原生对话协议需单独适配。</p></div>
  </section>
}
