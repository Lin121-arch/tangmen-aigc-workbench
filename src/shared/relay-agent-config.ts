export const DEFAULT_RELAY_AGENT_BASE_URL = import.meta.env.MODE === 'student' ? '' : 'https://api.example.invalid/v1'

export function normalizeRelayAgentBaseUrl(value: string): string {
  if (!value.trim() && import.meta.env.MODE === 'student') return ''
  const url = new URL(value.trim() || DEFAULT_RELAY_AGENT_BASE_URL)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('智能体地址需为不含账号、查询参数的 HTTP(S) 地址')
  }
  return url.toString().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
}
