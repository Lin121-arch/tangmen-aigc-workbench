export interface RelayVideoConfig {
  baseUrl: string
  models: Array<{ id: string; name: string }>
  submitPath: string
  queryPath: string
  downloadPath: string
  taskIdPath: string
  statusPath: string
  videoUrlPath: string
  successStatuses: string
  failedStatuses: string
  submitBody: string
}
export const DEFAULT_RELAY_VIDEO_CONFIG: RelayVideoConfig = {
  baseUrl: import.meta.env.MODE === 'student' ? '' : 'https://api.example.invalid/v1', models: [],
  submitPath: '', queryPath: '', downloadPath: '',
  taskIdPath: 'id', statusPath: 'status', videoUrlPath: 'url',
  successStatuses: 'completed,succeeded,success', failedStatuses: 'failed,error,cancelled,expired',
  submitBody: '{\n  "model": "{{model}}",\n  "prompt": "{{prompt}}",\n  "duration": "{{duration}}"\n}',
}
export const relayVideoWorkflowId = (model: string) => `relay-video:${encodeURIComponent(model)}`
export const isRelayVideoWorkflow = (id?: string): boolean => !!id?.startsWith('relay-video:')

export function normalizeRelayVideoConfig(value: RelayVideoConfig): RelayVideoConfig {
  const config = { ...DEFAULT_RELAY_VIDEO_CONFIG, ...value }
  if (!config.baseUrl.trim() && !config.models.length && import.meta.env.MODE === 'student') return { ...config, baseUrl: '' }
  const url = new URL(config.baseUrl.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('视频接口地址必须为不含密钥或查询参数的 HTTP(S) 地址')
  config.baseUrl = url.toString().replace(/\/+$/, '')
  config.models = config.models.map(model => ({ id: model.id.trim(), name: model.name.trim() || model.id.trim() })).filter(model => model.id)
  if (new Set(config.models.map(model => model.id)).size !== config.models.length) throw new Error('视频模型 ID 不能重复')
  fillVideoBody(config.submitBody, { model: 'model', prompt: 'prompt', duration: 5, aspectRatio: '9:16', images: [], image: '' })
  return config
}

/** Parse before substitution: model prompts never become executable JSON syntax. */
export function fillVideoBody(template: string, values: Record<string, unknown>): unknown {
  let parsed: unknown
  try { parsed = JSON.parse(template) } catch { throw new Error('视频提交模板必须是有效 JSON；变量要放在双引号内') }
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const match = /^\{\{(\w+)\}\}$/.exec(value)
      if (match) {
        if (!Object.hasOwn(values, match[1])) throw new Error(`未知视频模板变量：${match[1]}`)
        return values[match[1]]
      }
      return value
    }
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child)]))
    return value
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('视频提交模板最外层必须为 JSON 对象')
  return walk(parsed)
}

export function videoResponseField(payload: unknown, field: string): unknown {
  return field.split('.').filter(Boolean).reduce<unknown>((current, key) =>
    current && typeof current === 'object' && Object.hasOwn(current, key)
      ? (current as Record<string, unknown>)[key] : undefined, payload)
}
