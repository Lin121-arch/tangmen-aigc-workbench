export const DEFAULT_LUNA_BASE_URL = import.meta.env.MODE === 'student' ? '' : 'https://api.example.invalid/v1'
export const LUNA_IMAGE_WORKFLOW_ID = 'luna-batch-image'

export function lunaImageReferenceLimit(model: string): number {
  return model.includes('pro-image') ? 14 : model.includes('flash-image') ? 3 : 0
}

export function normalizeLunaBaseUrl(value: string): string {
  if (!value.trim() && import.meta.env.MODE === 'student') return ''
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Luna 地址应为不含密钥或查询参数的 HTTP(S) API 地址')
  }
  let pathname = url.pathname.replace(/\/+$/, '').replace(/\/images\/batches(?:\/models)?$/, '')
  if (!pathname) pathname = '/v1'
  return `${url.origin}${pathname}`
}
