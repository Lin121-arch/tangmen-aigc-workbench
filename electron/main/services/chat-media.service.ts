import path from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ChatMediaRecord, ChatMediaResult, ChatMessage, GenerationTaskSummary } from '../../../src/shared/ipc.types'
import { serviceWorkflows } from '../../../src/shared/model-services'
import { loadProject, readChatHistory, appendChatMessage, updateChatMessage } from './project.store'
import { getModelServicesView } from './model-services.store'
import { generateServiceImage, generateServiceVideo } from './model-services.runtime'
import { listProjectGenerationTasks } from './generation-task.service'
import { stageChatAttachments } from './chat-attachment.service'
import { messageHub } from './message-hub'

const schema = z.object({
  projectId: z.string().min(1).max(200), requestId: z.string().uuid(), kind: z.enum(['image', 'video']),
  workflowId: z.string().min(1).max(240), prompt: z.string().trim().min(1).max(30000),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']), duration: z.number().int().min(1).max(15).optional(),
  attachments: z.array(z.object({ name: z.string().max(300), type: z.string().max(30), path: z.string().max(4000) })).max(14).optional(),
}).strict()
const active = new Map<string, { fingerprint: string; promise: Promise<ChatMediaResult> }>()
const pending = (status: ChatMediaRecord['status']) => ['running', 'submitting', 'unknown'].includes(status)
function withTask(message: ChatMessage, task: Pick<GenerationTaskSummary, 'status' | 'relativePath' | 'error'>): ChatMessage {
  const media = { ...message.media!, status: task.status, relativePath: task.relativePath, error: task.error }
  return { ...message, media, content: media.status === 'succeeded' ? (media.kind === 'image' ? '图片已生成' : '视频已生成') : media.error || '正在生成' }
}

/** Explicit user submission only. Media shares the existing project history and task recovery. */
export function generateChatMedia(value: unknown): Promise<ChatMediaResult> {
  const request = schema.parse(value)
  const key = `${request.projectId}:${request.requestId}`
  const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex')
  const running = active.get(key)
  if (running) return running.fingerprint === fingerprint ? running.promise : Promise.reject(new Error('同一提交标识的参数不同，请重新发起创作'))
  const promise = (async () => {
    const project = await loadProject(request.projectId)
    if (!project) throw new Error('对话不存在或已被删除')
    const userId = `media-user-${request.requestId}`
    const messageId = `media-result-${request.requestId}`
    const history = await readChatHistory(project.folderPath)
    const existing = history.find(m => m.id === messageId)
    if (existing?.media) {
      const m = existing.media
      const user = history.find(item => item.id === userId)!
      if (m.submissionFingerprint !== fingerprint) throw new Error('同一提交标识的参数不同，请重新发起创作')
      // Never re-POST an existing turn, including failed or uncertain submissions.
      return { user, message: (await refreshChatMedia(project.id)).find(m => m.id === messageId) || existing }
    }
    const config = await getModelServicesView()
    const workflow = serviceWorkflows(config).find(w => w.id === request.workflowId)
    if (!workflow || (workflow.kind === 'image-to-video') !== (request.kind === 'video')) throw new Error('该模型未配置、已停用或不支持当前创作类型，请重新选择模型')
    const attachments = request.attachments || []
    if (attachments.length > (workflow.referenceLimit || 0)) throw new Error(`当前模型支持 ${workflow.referenceLimit || 0} 张参考图，请更换模型或移除参考图`)
    if (attachments.some(a => !['png', 'jpg', 'jpeg', 'webp'].includes(path.extname(a.path).slice(1).toLowerCase()))) throw new Error('参考图请使用 PNG、JPG 或 WebP 图片')
    if (workflow.aspectRatios?.length && !workflow.aspectRatios.includes(request.aspectRatio)) throw new Error('当前模型不支持这个画幅，请重新选择')
    if (request.kind === 'video' && (!request.duration || (workflow.durations?.length ? !workflow.durations.includes(request.duration) : request.duration < (workflow.minDuration || 1) || request.duration > (workflow.maxDuration || 15)))) throw new Error('当前模型不支持这个时长，请重新选择')
    const staged = await stageChatAttachments(project.folderPath, attachments)
    const referenceImagePaths = (staged || []).map(a => path.relative(project.folderPath, a.path).replace(/\\/g, '/'))
    const user: ChatMessage = { id: userId, role: 'user', content: request.prompt, timestamp: Date.now(), attachments: staged }
    let message: ChatMessage = { id: messageId, role: 'assistant', content: '正在生成', timestamp: Date.now(), media: {
      nodeId: `chat-${request.requestId}`, kind: request.kind, workflowId: workflow.id, modelName: workflow.name,
      submissionFingerprint: fingerprint,
      prompt: request.prompt, aspectRatio: request.aspectRatio, duration: request.duration, referenceImagePaths, status: 'submitting',
    } }
    await appendChatMessage(project.folderPath, user)
    await appendChatMessage(project.folderPath, message)
    messageHub.pushToFrontend(project.id, user)
    messageHub.pushToFrontend(project.id, message)
    const generation = { projectId: project.id, nodeId: message.media!.nodeId, workflowId: workflow.id, prompt: request.prompt, aspectRatio: request.aspectRatio, duration: request.duration, referenceImagePaths }
    try {
      const result = await (request.kind === 'image' ? generateServiceImage(generation) : generateServiceVideo(generation))
      message = withTask(message, result.success && result.relativePath ? { status: 'succeeded', relativePath: result.relativePath } : { status: 'failed', error: result.error || '生成失败，请检查模型配置后重新发起' })
    } catch (error) {
      const task = (await listProjectGenerationTasks(project.id)).find(t => t.nodeId === message.media!.nodeId)
      message = withTask(message, task || { status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
    await updateChatMessage(project.folderPath, message.id, () => message)
    messageHub.pushToFrontend(project.id, message)
    return { user, message }
  })()
  active.set(key, { fingerprint, promise })
  void promise.finally(() => { if (active.get(key)?.promise === promise) active.delete(key) }).catch(() => undefined)
  return promise
}

/** Reads/reconciles persisted tasks; the existing pipeline resumes remote IDs without new submissions. */
export async function refreshChatMedia(projectId: string): Promise<ChatMessage[]> {
  const project = await loadProject(projectId)
  if (!project) throw new Error('对话不存在或已被删除')
  const history = await readChatHistory(project.folderPath)
  const messages = history.filter(m => m.media && pending(m.media.status))
  if (!messages.length) return history.filter(m => m.media)
  const tasks = await listProjectGenerationTasks(projectId)
  for (const original of messages) {
    const task = tasks.find(t => t.nodeId === original.media!.nodeId)
    const inFlight = active.has(`${projectId}:${original.id.replace('media-result-', '')}`)
    if (!task && inFlight) continue
    const updated = withTask(original, task || { status: 'unknown', error: '上次提交已中断，状态尚未确认。请先在服务商处核实结果。' })
    if (JSON.stringify(updated) === JSON.stringify(original)) continue
    let committed = updated
    await updateChatMessage(project.folderPath, updated.id, current => {
      // A completion may commit after the task snapshot was read.
      committed = current.media && !pending(current.media.status) ? current : updated
      return committed
    })
    Object.assign(original, committed)
    messageHub.pushToFrontend(projectId, committed)
  }
  return history.filter(m => m.media)
}
