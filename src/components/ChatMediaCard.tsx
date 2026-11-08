import { useEffect, useRef, useState } from 'react'
import type { ChatMediaRecord } from '../shared/ipc.types'
import { useAppStore } from '../stores/app.store'
import { StudioIcon } from './StudioIcon'

export function ChatMediaCard({ media, onReuse, onPreviewReady }: { media: ChatMediaRecord; onReuse?: (media: ChatMediaRecord) => void; onPreviewReady?: () => void }) {
  const project = useAppStore(s => s.currentProject)
  const [copyState, setCopyState] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (previewOpen) dialog.current?.showModal(); return () => dialog.current?.close() }, [previewOpen])
  if (!project) return null
  const url = media.relativePath ? `workspace://${encodeURIComponent(project.id)}/${media.relativePath.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(media.nodeId)}` : ''
  const status = media.status === 'succeeded' ? '已完成' : media.status === 'failed' ? '生成失败' : media.status === 'unknown' ? '状态待确认' : '生成中'
  const fullPath = media.relativePath ? `${project.folderPath}/${media.relativePath}` : ''
  return <article className="studio-media" aria-label={`${media.kind === 'image' ? '图片' : '视频'}生成结果`}>
    <div className="studio-media-heading"><StudioIcon name={media.kind === 'image' ? 'image' : 'video'} /><span>{media.modelName}</span><span className={`studio-media-status is-${media.status}`}>{status}</span></div>
    {url && media.status === 'succeeded' ? <div className={`studio-media-preview ${media.aspectRatio === '9:16' ? 'is-portrait' : ''}`}>
      {media.kind === 'image' ? <button type="button" aria-label="查看原图" onClick={() => setPreviewOpen(true)}><img src={url} alt={media.prompt} loading="lazy" decoding="async" onLoad={onPreviewReady} /></button> : <video src={url} controls preload="metadata" playsInline aria-label="生成的视频" onLoadedMetadata={onPreviewReady} />}
    </div> : <div className="studio-media-pending"><div>{['submitting', 'running'].includes(media.status) ? <span className="studio-spinner" /> : <StudioIcon name={media.kind === 'image' ? 'image' : 'video'} width="28" height="28" />}</div><p>{media.status === 'failed' ? '这次没有生成成功' : media.status === 'unknown' ? '需要核实上次提交的状态' : '正在把想法变成作品'}</p><span>{media.error || '你可以继续对话，结果会保存在这里。'}</span></div>}
    {url && media.error && <p className="studio-result-error">{media.error}</p>}
    <div className="studio-media-actions"><span>{media.aspectRatio}{media.kind === 'video' && media.duration ? ` · ${media.duration} 秒` : ''}</span>
      {onReuse && <button type="button" onClick={() => onReuse(media)}><StudioIcon name="refresh" width="15" height="15" />复用设置</button>}
      <button type="button" onClick={() => { void navigator.clipboard.writeText(media.prompt).then(() => setCopyState('已复制')).catch(() => setCopyState('复制失败，请从上方消息选择文本')) }}><StudioIcon name="copy" width="15" height="15" />{copyState || '复制提示词'}</button>
      {fullPath && <button type="button" onClick={() => window.electronAPI.showItemInFolder(fullPath)}><StudioIcon name="folder" width="15" height="15" />打开文件位置</button>}
    </div>
    {previewOpen && <dialog className="studio-image-dialog" ref={dialog} aria-label="查看原图" onCancel={event => { event.preventDefault(); setPreviewOpen(false) }}><button type="button" onClick={() => setPreviewOpen(false)} aria-label="关闭原图"><StudioIcon name="close" /></button><img src={url} alt={media.prompt} /></dialog>}
  </article>
}
