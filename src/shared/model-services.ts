import { z } from 'zod'
import type { ComfyWorkflowInfo } from './ipc.types'
import { DEFAULT_RELAY_VIDEO_CONFIG, normalizeRelayVideoConfig, type RelayVideoConfig } from './relay-video-config'

export const MODEL_PROTOCOLS = ['chat-completions', 'openai-image', 'luna-image', 'luna-media-image', 'luna-media-video', 'gemini-image', 'ark-image', 'ark-video', 'json-video'] as const
export const PROTOCOL_LABELS: Record<ModelProtocol, string> = { 'chat-completions': 'Chat Completions · 对话', 'openai-image': '标准 Images · 生图 / 编辑', 'luna-image': 'TangMen 旧版批量图片', 'luna-media-image': 'TangMen 图片任务', 'luna-media-video': 'TangMen 视频任务', 'gemini-image': 'Gemini 原生图片', 'ark-image': '方舟 Seedream 图片', 'ark-video': '方舟 Seedance 视频', 'json-video': '自定义 JSON 视频任务' }
export type ModelProtocol = typeof MODEL_PROTOCOLS[number]
export type ModelPurpose = 'chat' | 'image' | 'video'
export type ModelCapability = ModelPurpose | 'tools' | 'vision' | 'image-edit' | 'first-frame'
interface KeyPatch { apiKey?: string; clearApiKey?: boolean; apiKeyConfigured?: boolean }
export interface ModelEndpoint extends KeyPatch { id: string; protocol: ModelProtocol; baseUrl: string; videoConfig?: RelayVideoConfig }
export interface ServiceModel { id: string; name: string; description?: string; modelId: string; endpointId: string; capabilities: ModelCapability[]; referenceLimit: number; durations?: number[]; aspectRatios?: string[]; resolutions?: string[] }
export interface DiscoveredServiceModel { id: string; name: string; endpointId: string; capabilities?: ModelCapability[]; referenceLimit?: number; durations?: number[]; aspectRatios?: string[]; resolutions?: string[] }
export interface ModelProvider extends KeyPatch { id: string; name: string; enabled: boolean; endpoints: ModelEndpoint[]; models: ServiceModel[] }
export interface ModelServicesConfig { version: 1; providers: ModelProvider[]; defaults: Partial<Record<ModelPurpose, string>>; legacyAliases: Record<string, string> }
/** Non-secret task binding. Credentials are looked up in the main process only. */
export interface ModelServiceSnapshot { providerId: string; endpointId: string; modelId: string; externalModelId: string; protocol: ModelProtocol; baseUrl: string }
export const emptyModelServices = (): ModelServicesConfig => ({ version: 1, providers: [], defaults: {}, legacyAliases: {} })
export const modelWorkflowId = (provider: string, model: string) => `service-model:${provider}:${model}`
export const isServiceWorkflow = (id?: string) => !!id?.startsWith('service-model:')
const id = z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/)
const url = z.string().trim().max(1000).refine(s => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash } catch { return false } }, '请输入不含密钥和查询参数的 HTTP(S) Base URL').transform(s => s.replace(/\/+$/, ''))
const schema = z.object({
  version: z.literal(1),
  providers: z.array(z.object({ id, name: z.string().trim().min(1).max(100), enabled: z.boolean(),
    endpoints: z.array(z.object({ id, protocol: z.enum(MODEL_PROTOCOLS), baseUrl: url, videoConfig: z.unknown().optional() })).max(20),
    models: z.array(z.object({ id, name: z.string().trim().min(1).max(100), description: z.string().trim().max(200).optional(), modelId: z.string().trim().min(1).max(200), endpointId: id,
      capabilities: z.array(z.enum(['chat', 'image', 'video', 'tools', 'vision', 'image-edit', 'first-frame'])).min(1), referenceLimit: z.number().int().min(0).max(14).default(0),
      durations: z.array(z.number().int().min(1).max(15)).min(1).max(15).optional(),
      aspectRatios: z.array(z.string().regex(/^\d{1,2}:\d{1,2}$/)).min(1).max(20).optional(),
      resolutions: z.array(z.string().trim().min(1).max(40)).min(1).max(20).optional() })).max(100),
  })).max(50),
  defaults: z.object({ chat: z.string().optional(), image: z.string().optional(), video: z.string().optional() }),
  legacyAliases: z.record(z.string(), z.string()).default({}),
})
export function normalizeModelServices(value: unknown): ModelServicesConfig {
  const checked = schema.safeParse(value)
  if (!checked.success) {
    const issue = checked.error.issues[0]
    const labels: Record<string, string> = { providers: '服务商', endpoints: '端点', models: '模型', name: '显示名称', modelId: '模型 ID', baseUrl: 'Base URL', referenceLimit: '参考图上限', protocol: '接口协议' }
    const location = issue.path.map(part => typeof part === 'number' ? String(part + 1) : labels[String(part)] || String(part)).join(' / ')
    throw new Error(`请检查${location}：${issue.message}`)
  }
  const parsed = checked.data
  const seen = new Set<string>()
  for (const p of parsed.providers) {
    if (seen.has(p.id)) throw new Error('服务商内部 ID 重复'); seen.add(p.id)
    const endpoints = new Map(p.endpoints.map(e => [e.id, e]))
    if (endpoints.size !== p.endpoints.length || new Set(p.models.map(m => m.id)).size !== p.models.length) throw new Error('端点或模型内部 ID 重复')
    for (const e of p.endpoints) if (e.protocol === 'json-video') {
      const video = normalizeRelayVideoConfig({ ...DEFAULT_RELAY_VIDEO_CONFIG, ...(e.videoConfig as object || {}), baseUrl: e.baseUrl })
      e.videoConfig = Object.fromEntries(Object.keys(DEFAULT_RELAY_VIDEO_CONFIG).map(key => [key, video[key as keyof RelayVideoConfig]])) as unknown as RelayVideoConfig
    }
    for (const m of p.models) {
      const e = endpoints.get(m.endpointId); if (!e) throw new Error('模型的端点不存在')
      const purpose = e.protocol === 'chat-completions' ? 'chat' : e.protocol.endsWith('video') ? 'video' : 'image'
      if (!m.capabilities.includes(purpose) || m.capabilities.some(c => ['chat', 'image', 'video'].includes(c) && c !== purpose)) throw new Error('模型能力与端点协议不匹配')
      if (m.capabilities.includes('tools') && purpose !== 'chat') throw new Error('工具调用仅用于对话模型')
      if (m.capabilities.includes('image-edit') && purpose !== 'image') throw new Error('参考图编辑仅用于图片模型')
      if (m.capabilities.includes('first-frame') && purpose !== 'video') throw new Error('首帧仅用于视频模型')
      if (m.referenceLimit > 0 && !m.capabilities.includes(purpose === 'video' ? 'first-frame' : 'image-edit')) throw new Error('请先声明参考图能力')
      if (purpose === 'video' && m.referenceLimit > 1) throw new Error('当前视频接入最多支持一张首帧')
      if (e.protocol === 'ark-image' && m.referenceLimit > 10) throw new Error('当前方舟图片适配最多支持 10 张参考图')
      if (e.protocol === 'luna-image') {
        const limit = m.modelId.includes('pro-image') ? 14 : m.modelId.includes('flash-image') ? 3 : 0
        if (m.referenceLimit > limit) throw new Error(`当前批量图片适配为此模型支持 ${limit} 张参考图，请核对协议或使用其他图片端点`)
      }
    }
  }
  for (const purpose of ['chat', 'image', 'video'] as const) {
    const binding = parsed.defaults[purpose]; if (!binding) continue
    const found = parsed.providers.filter(p => p.enabled).flatMap(p => p.models.map(m => ({ p, m }))).find(({ p, m }) => modelWorkflowId(p.id, m.id) === binding)
    if (!found || !found.m.capabilities.includes(purpose) || (purpose === 'chat' && !found.m.capabilities.includes('tools'))) throw new Error('默认模型不可用或未声明所需能力（助手需要工具调用）')
  }
  return parsed as ModelServicesConfig
}
export function serviceWorkflows(config: ModelServicesConfig): ComfyWorkflowInfo[] {
  return config.providers.filter(p => p.enabled).flatMap(p => p.models.filter(m => m.capabilities.includes('image') || m.capabilities.includes('video')).map(m => ({
    id: modelWorkflowId(p.id, m.id), name: `${p.name} · ${m.name}`, description: m.description, kind: m.capabilities.includes('video') ? 'image-to-video' as const : 'text-to-image' as const,
    referenceLimit: m.referenceLimit, capabilities: m.capabilities,
    ...(['luna-media-image', 'openai-image'].includes(p.endpoints.find(e => e.id === m.endpointId)?.protocol || '') ? { outputLabel: '按模型输出' } : {}),
    ...(m.durations?.length ? { durations: m.durations, minDuration: Math.min(...m.durations), maxDuration: Math.max(...m.durations) } : {}),
    ...(m.aspectRatios ? { aspectRatios: m.aspectRatios } : {}),
    ...(m.resolutions ? { resolutions: m.resolutions } : {}),
    ...(p.endpoints.find(e => e.id === m.endpointId)?.protocol === 'ark-video' ? { minDuration: 4, maxDuration: 15 } : {}),
  })))
}
