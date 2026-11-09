import type { ModelProtocol, ModelProvider } from './model-services'

export interface ProviderPreset {
  id: string
  name: string
  category: 'official' | 'third-party' | 'custom'
  description: string
  website?: string
  unavailable?: string
  endpoints: { protocol: ModelProtocol; baseUrl: string }[]
}
const chat = (baseUrl: string) => ({ protocol: 'chat-completions' as const, baseUrl })
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', category: 'official', description: '对话 · 图片', website: 'https://platform.openai.com/api-keys', endpoints: [chat('https://api.openai.com/v1'), { protocol: 'openai-image', baseUrl: 'https://api.openai.com/v1' }] },
  { id: 'anthropic', name: 'Anthropic', category: 'official', description: '通过本机 Claude Code 接入', website: 'https://code.claude.com/docs/en/overview', unavailable: '请使用上方 Claude Code 入口；原生 Messages 云端接口暂未适配。', endpoints: [] },
  { id: 'google', name: 'Google', category: 'official', description: '对话 · 图片', website: 'https://aistudio.google.com/apikey', endpoints: [chat('https://generativelanguage.googleapis.com/v1beta/openai'), { protocol: 'gemini-image', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' }] },
  { id: 'deepseek', name: 'DeepSeek', category: 'official', description: '对话', website: 'https://platform.deepseek.com/api_keys', endpoints: [chat('https://api.deepseek.com/v1')] },
  { id: 'aliyun', name: '阿里云百炼', category: 'official', description: '对话 · 中国内地接入点', website: 'https://bailian.console.aliyun.com/', endpoints: [chat('https://dashscope.aliyuncs.com/compatible-mode/v1')] },
  { id: 'ark', name: '火山引擎', category: 'official', description: '对话 · 图片 · 视频', website: 'https://console.volcengine.com/ark', endpoints: [chat('https://ark.cn-beijing.volces.com/api/v3'), { protocol: 'ark-image', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }, { protocol: 'ark-video', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }] },
  { id: 'kimi', name: 'Kimi', category: 'official', description: '对话 · 中国内地接入点', website: 'https://platform.moonshot.cn/console/api-keys', endpoints: [chat('https://api.moonshot.cn/v1')] },
  { id: 'zhipu', name: '智谱', category: 'official', description: '对话', website: 'https://open.bigmodel.cn/', endpoints: [chat('https://open.bigmodel.cn/api/paas/v4')] },
  { id: 'minimax', name: 'MiniMax', category: 'official', description: '对话 · 兼容接口', website: 'https://platform.minimaxi.com/', endpoints: [chat('https://api.minimaxi.com/v1')] },
  { id: 'tangmen', name: 'TangMen', category: 'third-party', description: '图片 · 视频，密钥分别开通', endpoints: [
    { protocol: 'openai-image', baseUrl: 'https://image.luna.it.com/v1' },
    { protocol: 'luna-media-video', baseUrl: 'https://img.luna.it.com' },
  ] },
  { id: 'custom', name: '自定义连接', category: 'custom', description: '手动填写地址与协议', endpoints: [chat('')] },
]
export function createPresetProvider(presetId: string): ModelProvider {
  const preset = PROVIDER_PRESETS.find(p => p.id === presetId)
  if (!preset) throw new Error('未知厂商预设')
  if (preset.unavailable) throw new Error(preset.unavailable)
  return { id: crypto.randomUUID(), name: preset.name, enabled: true, endpoints: preset.endpoints.map(e => ({ ...e, id: crypto.randomUUID() })), models: [] }
}
export function endpointPurpose(protocol: ModelProtocol): 'chat' | 'image' | 'video' {
  return protocol === 'chat-completions' ? 'chat' : protocol.endsWith('video') ? 'video' : 'image'
}
export const PURPOSE_NAMES = { chat: '对话', image: '图片', video: '视频' } as const

export function isTangMenProvider(provider?: ModelProvider): boolean {
  return !!provider && (provider.name.startsWith('TangMen') || provider.endpoints.some(endpoint => {
    try { return ['image.luna.it.com', 'img.luna.it.com', 'luna.it.com'].includes(new URL(endpoint.baseUrl).hostname) }
    catch { return false }
  }))
}
/** Presentation only: keep stored IDs, connection details and credentials unchanged. */
export function displayProviderName(provider: ModelProvider): string {
  return isTangMenProvider(provider) ? provider.name.replace(/^Luna\b/i, 'TangMen').replace(/^唐门\s*AI/i, 'TangMen') : provider.name
}
