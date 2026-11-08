import type { ComfyWorkflowInfo } from './ipc.types'

export interface TemplateModelSelection { imageWorkflowId?: string; videoWorkflowId?: string }
export const isTemplateImageWorkflow = (id: string) => id.startsWith('service-model:') || ['luna-batch-image', 'google-gemini-3.1-flash-image', 'google-gemini-3-pro-image', 'seedream-5.0-pro', 'seedream-5.0-lite'].includes(id)
export const isTemplateVideoWorkflow = (id: string) => id.startsWith('service-model:') || id === 'seedance-2.0' || (id.startsWith('relay-video:') && id !== 'relay-video:template-select-model' && id.length > 12)

export function normalizeTemplateModels(value: unknown, available?: ComfyWorkflowInfo[]): TemplateModelSelection {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模板模型配置无效')
  const result: TemplateModelSelection = {}
  for (const [field, accepts, kind] of [['imageWorkflowId', isTemplateImageWorkflow, 'text-to-image'], ['videoWorkflowId', isTemplateVideoWorkflow, 'image-to-video']] as const) {
    const id = (value as Record<string, unknown>)[field]
    if (id === undefined || id === '') continue
    if (typeof id !== 'string' || id.length > 300 || !accepts(id) || (available && !available.some(item => item.id === id && item.kind === kind))) throw new Error('模板模型不可用，请重新选择或先在系统配置中添加模型')
    result[field] = id
  }
  return result
}
