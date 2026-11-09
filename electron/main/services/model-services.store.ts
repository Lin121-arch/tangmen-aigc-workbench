import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { safeStorage } from 'electron'
import { displayProviderName } from '../../../src/shared/provider-presets'
import { getAppDataDir } from './project.store'
import { emptyModelServices, modelWorkflowId, normalizeModelServices, type ModelServicesConfig, type ModelServiceSnapshot, type ModelPurpose, type ModelProvider, type DiscoveredServiceModel } from '../../../src/shared/model-services'

interface Stored { config: ModelServicesConfig; secrets: Record<string, string> }
const filename = () => path.join(getAppDataDir(), 'model-services.json')
const secretId = (p: string, e?: string) => e ? `${p}/${e}` : p
function decrypt(value?: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法读取模型密钥')
  return safeStorage.decryptString(Buffer.from(value, 'base64'))
}
function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，模型密钥未保存')
  return safeStorage.encryptString(value).toString('base64')
}
async function write(stored: Stored) {
  const file = filename(); await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(stored, null, 2), 'utf8'); await fs.rename(tmp, file)
}
let queue: Promise<unknown> = Promise.resolve()
const serialize = <T>(fn: () => Promise<T>): Promise<T> => { const result = queue.then(fn, fn); queue = result.catch(() => {}); return result }
async function read(): Promise<Stored> {
  try {
    const stored = JSON.parse(await fs.readFile(filename(), 'utf8')) as Stored
    return { config: normalizeModelServices(stored.config), secrets: stored.secrets || {} }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('模型服务配置无法读取，请保留原文件并检查配置')
  }
  const config = emptyModelServices(); const secrets: Record<string, string> = {}
  const { getRuntimeSettings } = await import('./settings.service'); const old = await getRuntimeSettings()
  const add = (p: ModelProvider, key: string, aliases: string[]) => {
    if (!key || !p.models.length) return
    config.providers.push(p); secrets[p.id] = encrypt(key)
    p.models.forEach((m, i) => { if (aliases[i]) config.legacyAliases[aliases[i]] = modelWorkflowId(p.id, m.id) })
  }
  const one = (id: string, name: string, protocol: ModelProvider['endpoints'][number]['protocol'], baseUrl: string, ids: string[], caps: ('chat'|'tools'|'image'|'image-edit'|'video'|'first-frame')[], limit: number): ModelProvider => ({ id, name, enabled: true, endpoints: [{ id: 'api', protocol, baseUrl }], models: ids.map((modelId, i) => ({ id: `m${i}`, name: modelId, modelId, endpointId: 'api', capabilities: caps, referenceLimit: limit })) })
  add(one('legacy-luna', 'Luna（已迁移）', 'luna-image', old.lunaBaseUrl, old.lunaImageModel ? [old.lunaImageModel] : [], ['image', ...(old.lunaImageModel.includes('pro-image') || old.lunaImageModel.includes('flash-image') ? ['image-edit' as const] : [])], old.lunaImageModel.includes('pro-image') ? 14 : old.lunaImageModel.includes('flash-image') ? 3 : 0), old.lunaApiKey, ['luna-batch-image'])
  add(one('legacy-agent', '原对话服务', 'chat-completions', old.relayAgentBaseUrl, old.relayAgentModel ? [old.relayAgentModel] : [], ['chat', 'tools'], 0), old.relayAgentApiKey, [])
  add(one('legacy-google', 'Google（已迁移）', 'gemini-image', 'https://generativelanguage.googleapis.com/v1', ['gemini-3.1-flash-image', 'gemini-3-pro-image'], ['image', 'image-edit'], 14), old.googleAiApiKey, ['google-gemini-3.1-flash-image', 'google-gemini-3-pro-image'])
  if (old.seedreamApiKey) {
    const { SEEDREAM_IMAGE_MODELS } = await import('./seedream-image.service')
    const { SEEDANCE_VIDEO_MODELS } = await import('./seedance-video.service')
    add(one('legacy-ark-image', '方舟图片（已迁移）', 'ark-image', old.seedreamBaseUrl, SEEDREAM_IMAGE_MODELS.map(m => m.model), ['image', 'image-edit'], 10), old.seedreamApiKey, SEEDREAM_IMAGE_MODELS.map(m => m.id))
    add(one('legacy-ark-video', '方舟视频（已迁移）', 'ark-video', old.seedreamBaseUrl, SEEDANCE_VIDEO_MODELS.map(m => m.model), ['video', 'first-frame'], 1), old.seedreamApiKey, SEEDANCE_VIDEO_MODELS.map(m => m.id))
  }
  const video = one('legacy-video', '原视频服务（已迁移）', 'json-video', old.relayVideoConfig.baseUrl, old.relayVideoConfig.models.map(m => m.id), ['video', 'first-frame'], 1)
  video.endpoints[0].videoConfig = old.relayVideoConfig
  add(video, old.relayVideoApiKey, old.relayVideoConfig.models.map(m => `relay-video:${encodeURIComponent(m.id)}`))
  if (config.legacyAliases[old.defaultImageWorkflowId]) config.defaults.image = config.legacyAliases[old.defaultImageWorkflowId]
  if (config.providers.some(p => p.id === 'legacy-agent')) config.defaults.chat = modelWorkflowId('legacy-agent', 'm0')
  const oldPath = path.join(getAppDataDir(), 'settings.json')
  try { await fs.copyFile(oldPath, path.join(getAppDataDir(), 'settings.pre-model-services.json'), fs.constants.COPYFILE_EXCL) } catch (e) { if (!['ENOENT', 'EEXIST'].includes((e as NodeJS.ErrnoException).code || '')) throw e }
  const stored = { config: normalizeModelServices(config), secrets }; await write(stored); return stored
}
function view(stored: Stored): ModelServicesConfig {
  return { ...stored.config, providers: stored.config.providers.map(p => ({ ...p, name: displayProviderName(p), apiKeyConfigured: !!stored.secrets[p.id], endpoints: p.endpoints.map(e => ({ ...e, apiKeyConfigured: !!stored.secrets[secretId(p.id, e.id)] })) })) }
}
export const getModelServicesView = () => serialize(async () => view(await read()))
export const saveModelServices = (input: unknown) => serialize(async () => {
  const config = normalizeModelServices(input); const old = await read(); const secrets: Record<string, string> = {}
  const raw = input as ModelServicesConfig
  for (const p of config.providers) {
    const original = raw.providers.find(x => x.id === p.id)!
    for (const [key, patch] of [[p.id, original], ...p.endpoints.map(e => [secretId(p.id, e.id), original.endpoints.find(x => x.id === e.id)!] as const)] as const) {
      const value = patch.clearApiKey ? '' : patch.apiKey?.trim() ? encrypt(patch.apiKey.trim()) : old.secrets[key]
      if (value) secrets[key] = value
    }
  }
  await write({ config, secrets }); return view({ config, secrets })
})
export async function resolveModelService(binding: string | undefined, purpose: ModelPurpose, snapshot?: ModelServiceSnapshot) {
  const stored = await serialize(read); const config = stored.config
  const target = binding || config.defaults[purpose]
  const resolved = target && (config.legacyAliases[target] || target)
  for (const provider of config.providers) for (const model of provider.models) {
    if (modelWorkflowId(provider.id, model.id) !== resolved) continue
    if (!provider.enabled || !model.capabilities.includes(purpose)) throw new Error('模型绑定已停用或能力不可用，请重新选择')
    const endpoint = provider.endpoints.find(e => e.id === model.endpointId)!
    const current: ModelServiceSnapshot = { providerId: provider.id, endpointId: endpoint.id, modelId: model.id, externalModelId: model.modelId, protocol: endpoint.protocol, baseUrl: endpoint.baseUrl }
    if (snapshot && JSON.stringify(current) !== JSON.stringify(snapshot)) throw new Error('任务原连接或模型已变更，请恢复原配置后继续查询，不能切换渠道重发')
    return { provider, model, endpoint, snapshot: current, apiKey: decrypt(stored.secrets[secretId(provider.id, endpoint.id)] || stored.secrets[provider.id]) }
  }
  throw new Error('模型绑定不可用或已删除，请在系统配置中重新选择')
}

/** Explicit read-only discovery. Does not generate, guess capabilities or follow redirects with keys. */
export async function discoverServiceModels(input: ModelProvider, endpointId: string): Promise<string[]> {
  return (await discoverServiceModelCatalog(input, endpointId)).map(m => m.id)
}
export async function discoverServiceModelCatalog(input: ModelProvider, endpointId: string): Promise<DiscoveredServiceModel[]> {
  const provider = normalizeModelServices({ ...emptyModelServices(), providers: [{ ...input, models: [] }] }).providers[0]
  const endpoint = provider.endpoints.find(e => e.id === endpointId)
  if (!endpoint) throw new Error('请先选择一个有效端点')
  const stored = await serialize(read)
  const patch = input.endpoints.find(e => e.id === endpointId)!
  const providerKey = input.clearApiKey ? '' : input.apiKey?.trim() || decrypt(stored.secrets[provider.id])
  const key = patch.clearApiKey ? providerKey : patch.apiKey?.trim() || decrypt(stored.secrets[secretId(provider.id, endpointId)]) || providerKey
  const headers: Record<string, string> = key ? endpoint.protocol === 'gemini-image' ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` } : {}
  const media = endpoint.protocol.startsWith('luna-media-')
  const route = media ? '/api/media/models' : endpoint.protocol === 'luna-image' ? '/images/batches/models' : '/models'
  const response = await fetch(`${endpoint.baseUrl}${route}`, { headers, redirect: 'error', signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`读取模型失败（HTTP ${response.status}）。可按服务商文档手动添加；读取失败不代表生成不可用。`)
  const text = await response.text(); if (text.length > 2 * 1024 * 1024) throw new Error('模型列表过大')
  const payload = JSON.parse(text)
  if (media) {
    const video = endpoint.protocol === 'luna-media-video'
    const items = payload[video ? 'videos' : 'images']
    if (!Array.isArray(items)) throw new Error('新站没有返回图片／视频模型目录，请核对地址')
    return items.slice(0, 100).flatMap((m: any): DiscoveredServiceModel[] => {
      if (typeof m?.id !== 'string' || !m.id.trim() || m.id.length > 200) return []
      const durations = Array.isArray(m.durations) ? [...new Set<number>(m.durations.filter((d: unknown): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 15))].sort((a, b) => a - b) : []
      const aspects = Array.isArray(m.aspects) ? m.aspects.filter((a: unknown) => typeof a === 'string' && /^\d{1,2}:\d{1,2}$/.test(a)).slice(0, 20) : []
      const resolutions = Array.isArray(m.resolutions) ? m.resolutions.filter((a: unknown) => typeof a === 'string' && a.length > 0 && a.length <= 40).slice(0, 20) : []
      return [{ id: m.id, name: typeof m.label === 'string' && m.label.trim() ? m.label.slice(0, 100) : m.id, endpointId,
        capabilities: video ? ['video', ...(m.max_images > 0 ? ['first-frame' as const] : [])] : ['image', 'image-edit'], referenceLimit: video ? m.max_images > 0 ? 1 : 0 : 1,
        ...(video && durations.length ? { durations } : {}), ...(aspects.length ? { aspectRatios: aspects } : {}), ...(resolutions.length ? { resolutions } : {}),
      }]
    })
  }
  const items: unknown[] = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : []
  return [...new Set(items.flatMap(item => { const value = item as { id?: string; name?: string }; const model = typeof item === 'string' ? item : value?.id || value?.name?.replace(/^models\//, ''); return typeof model === 'string' && model.trim() && model.length <= 200 ? [model] : [] }))].slice(0, 500).map(id => ({ id, name: id, endpointId }))
}
