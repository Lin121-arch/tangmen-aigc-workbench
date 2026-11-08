import type { GenerateImageRequest, GenerateVideoRequest } from '../../../src/shared/ipc.types'
import type { ModelAdapterContext } from './model-adapter-context'
import { resolveModelService } from './model-services.store'

async function connection(request: GenerateImageRequest | GenerateVideoRequest, purpose: 'image' | 'video') {
  const binding = await resolveModelService(request.workflowId, purpose, request.modelService)
  const context: ModelAdapterContext = { apiKey: binding.apiKey, baseUrl: binding.endpoint.baseUrl, model: binding.model.modelId, referenceLimit: binding.model.referenceLimit, videoConfig: binding.endpoint.videoConfig, durations: binding.model.durations, aspectRatios: binding.model.aspectRatios, resolutions: binding.model.resolutions }
  const refs = request.referenceImagePaths ?? (request.referenceImagePath ? [request.referenceImagePath] : [])
  if (purpose === 'video' && binding.endpoint.protocol === 'ark-video' && 'duration' in request && request.duration !== undefined && (request.duration < 4 || request.duration > 15)) throw new Error('当前方舟视频适配支持 4–15 秒，请调整时长后再生成')
  if (purpose === 'video' && context.durations?.length && 'duration' in request && request.duration !== undefined && !context.durations.includes(request.duration)) throw new Error(`该模型可选时长：${context.durations.join('、')} 秒，请重新选择`)
  if (context.aspectRatios?.length && !context.aspectRatios.includes(request.aspectRatio)) throw new Error(`该模型支持画幅：${context.aspectRatios.join('、')}`)
  if (refs.length > binding.model.referenceLimit) throw new Error(`该模型已登记的参考图上限为 ${binding.model.referenceLimit} 张，请核对模型能力或移除参考图`)
  if (purpose === 'video' && (('referenceVideoPaths' in request && request.referenceVideoPaths?.length) || ('referenceAudioPaths' in request && request.referenceAudioPaths?.length) || ('lastFrameImagePath' in request && request.lastFrameImagePath))) throw new Error('当前模型服务入口仅支持文字或一张首帧，其他视频参考类型请使用原生工作流')
  return { context, protocol: binding.endpoint.protocol, snapshot: binding.snapshot }
}
export async function generateServiceImage(request: GenerateImageRequest) {
  const { context, protocol, snapshot } = await connection(request, 'image')
  const effective = { ...request, modelService: snapshot }
  if (protocol === 'openai-image') return (await import('./standard-image.service')).generateStandardImage(effective, context)
  if (protocol === 'luna-image') return (await import('./luna-image.service')).generateImageWithLuna(effective, context)
  if (protocol === 'luna-media-image') return (await import('./luna-media.service')).generateLunaMedia(effective, context, 'image')
  if (protocol === 'gemini-image') return (await import('./google-image.service')).generateImageWithGoogle(effective, context)
  if (protocol === 'ark-image') return (await import('./seedream-image.service')).generateImageWithSeedream(effective, context)
  throw new Error('所选端点未实现图片生成协议')
}
export async function generateServiceVideo(request: GenerateVideoRequest) {
  const { context, protocol, snapshot } = await connection(request, 'video')
  const effective = { ...request, modelService: snapshot, referenceImagePaths: request.referenceImagePaths ?? (request.referenceImagePath ? [request.referenceImagePath] : []) }
  if (protocol === 'json-video') return (await import('./relay-video.service')).generateVideoWithRelay(effective, context)
  if (protocol === 'luna-media-video') return (await import('./luna-media.service')).generateLunaMedia(effective, context, 'video')
  if (protocol === 'ark-video') return (await import('./seedance-video.service')).generateVideoWithSeedance(effective, context)
  throw new Error('所选端点未实现视频生成协议')
}
