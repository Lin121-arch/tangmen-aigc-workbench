import { useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown'
import { copyPromptToClipboard } from '../shared/prompt-copy'
import { promptTutorialChapters, promptTutorialSources } from '../shared/prompt-tutorial'
import elements from '../content/prompt-sources/elements.zh.mdx?raw'
import tips from '../content/prompt-sources/tips.zh.mdx?raw'
import nano from '../content/prompt-sources/nanobanana-excerpts.md?raw'
import dairLicense from '../content/prompt-sources/DAIR-LICENSE.md?raw'
import nanoLicense from '../content/prompt-sources/NANOBANANA-LICENSE.md?raw'

// Read surface: inherit BeginnerTutorial's black/gold controls and protected dialog.
// Learners read one lesson, compare examples and copy a prompt without calling a model.
export function PromptTutorialButton() {
  const [open, setOpen] = useState(false)
  return <>
    <button aria-haspopup="dialog" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#e8c766] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#e8c766]">提示词教程</button>
    {open && <PromptTutorial onClose={() => setOpen(false)} />}
  </>
}

function PromptTutorial({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLElement>(null)
  const copyVersion = useRef(0)
  const [index, setIndex] = useState(0)
  const [message, setMessage] = useState('')
  const [copying, setCopying] = useState(false)
  const chapter = promptTutorialChapters[index]
  const source = promptTutorialSources.find(item => item.id === chapter.source)!
  useEffect(() => {
    dialog.current?.showModal()
    return () => { copyVersion.current += 1 }
  }, [])
  const close = () => { dialog.current?.close(); onClose() }
  const changeChapter = (next: number) => {
    copyVersion.current += 1
    setIndex(next)
    setMessage('')
    setCopying(false)
    body.current?.scrollTo(0, 0)
  }
  const copy = async () => {
    const version = ++copyVersion.current
    setCopying(true)
    const result = await copyPromptToClipboard(chapter.prompt, navigator.clipboard)
    if (version !== copyVersion.current) return
    setMessage(result === 'copied' ? '已复制，可粘贴到本节指定位置。' : '自动复制不可用，请在下方文本框中全选并手动复制。')
    setCopying(false)
  }
  return <dialog ref={dialog} data-canvas-node-editor-dialog aria-labelledby="prompt-tutorial-title" onCancel={event => { event.preventDefault(); close() }} className="fixed inset-0 m-auto max-h-[85vh] w-[880px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-white/10 bg-[#111119] p-0 text-[#e8e6df] shadow-2xl backdrop:bg-black/70">
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5">
        <h2 id="prompt-tutorial-title" className="text-lg font-semibold">提示词教程</h2>
        <button autoFocus onClick={close} aria-label="关闭提示词教程" className="rounded-lg px-3 py-2 text-sm text-[#b9b6c2] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#e8c766]">关闭</button>
      </header>
      <nav aria-label="提示词教程章节" className="mx-6 mt-3 flex shrink-0 flex-wrap gap-2 border-b border-white/10 pb-4">
        {promptTutorialChapters.map((item, i) => <button key={item.label} onClick={() => changeChapter(i)} aria-current={index === i ? 'step' : undefined} className={`rounded-lg px-3 py-2 text-xs leading-5 focus-visible:outline-2 focus-visible:outline-[#e8c766] ${index === i ? 'bg-[#d4af37]/15 text-[#e8c766]' : 'text-[#b9b6c2] hover:bg-white/5'}`}>{i + 1}. {item.label}</button>)}
      </nav>
      <section ref={body} aria-label="本节教程内容" className="min-h-0 overflow-y-auto px-6 py-6 text-sm leading-7">
        <h3 className="text-xl font-semibold">{chapter.title}</h3>
        <p className="mt-3 text-[#b9b6c2]">{chapter.intro}</p>
        <ol className="mt-5 list-decimal space-y-3 pl-5 marker:text-[#e8c766]">{chapter.points.map(point => <li key={point} className="pl-1">{point}</li>)}</ol>
        <dl className="mt-6 border-y border-white/10 py-4">
          <dt className="font-semibold text-[#b9b6c2]">模糊表达</dt><dd className="mt-1">{chapter.before}</dd>
          <dt className="mt-4 font-semibold text-[#e8c766]">改进方向</dt><dd className="mt-1">{chapter.after}</dd>
        </dl>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">可复制案例</h4><button onClick={() => void copy()} disabled={copying} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#e8c766] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#e8c766] disabled:opacity-50">{copying ? '正在复制…' : '复制提示词'}</button></div>
        <p className="mt-2 text-xs text-[#b9b6c2]">粘贴位置：{chapter.destination}</p>
        <textarea aria-label="本节提示词" readOnly value={chapter.prompt} rows={8} spellCheck={false} className="mt-3 w-full resize-y rounded-lg border border-white/15 bg-[#08080c] p-4 text-sm leading-7 text-[#e8e6df] selection:bg-[#d4af37]/30 focus-visible:outline-2 focus-visible:outline-[#e8c766]" />
        <p role="status" className="min-h-6 text-xs text-[#e8c766]">{message}</p>
        <h4 className="mt-5 font-semibold">跟着做一次</h4>
        <ol className="mt-3 list-decimal space-y-2 pl-5 marker:text-[#e8c766]">{chapter.steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol>
        <p className="mt-5"><strong className="font-semibold">完成检查：</strong>{chapter.check}</p>
        <p className="mt-4 text-xs leading-6 text-[#cdb064]">{chapter.note}</p>
        <p className="mt-3 text-xs text-[#b9b6c2]">方法来源：{source.name}。本节中文任务由唐门AI结合工作台流程改编。</p>
        <details className="mt-6 border-t border-white/10 pt-4">
          <summary className="cursor-pointer rounded py-2 font-semibold focus-visible:outline-2 focus-visible:outline-[#e8c766]">开源来源与许可</summary>
          <p className="mt-3 text-xs leading-6 text-[#b9b6c2]">Star 为 2026-11-02 查询快照。以下原文和许可随工作台保存，离线可读；外部项目页面需要联网。上游图片模型案例的效果不能直接视作当前模型已验证的效果。</p>
          {promptTutorialSources.map(item => <div key={item.id} className="mt-5 text-xs leading-6">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-words text-[#e8c766] underline underline-offset-4">{item.repo}</a>
            <p>Star：{item.stars} · 查询日期：{item.date}</p><p>{item.scope}</p><p>许可：{item.license}</p><p className="break-all text-[#b9b6c2]">固定版本：{item.revision}</p>
          </div>)}
          <p className="mt-4 text-xs leading-6">图片案例原作者：关键帧案例为 @underwoodxie96；商品场景与封面案例来自原文所列微信文章。中文改编简化了多镜头与网格输出，并调整为原创角色、无字封面和当前节点操作。按 CC BY 4.0 保留作者及来源、许可链接与修改说明。</p>
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="text-xs text-[#e8c766] underline underline-offset-4">CC BY 4.0 许可说明</a>
          {[
            ['查看提示词要素原文', elements], ['查看提示词设计建议原文', tips], ['查看图片案例原文节选与原始来源', nano], ['查看 DAIR MIT 许可', dairLicense], ['查看图片案例仓库 LICENSE 文件', nanoLicense],
          ].map(([title, content]) => <details key={title} className="mt-4 border-t border-white/10 pt-3"><summary className="cursor-pointer rounded py-1 text-xs text-[#e8c766] focus-visible:outline-2 focus-visible:outline-[#e8c766]">{title}</summary><Markdown className="mt-3 break-words text-xs leading-6">{content}</Markdown></details>)}
        </details>
      </section>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
        <button disabled={index === 0} onClick={() => changeChapter(index - 1)} className="rounded-lg border border-white/10 px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[#e8c766] disabled:opacity-35">上一节</button>
        <span className="text-xs tabular-nums text-[#b9b6c2]">{index + 1} / {promptTutorialChapters.length}</span>
        <button onClick={() => index === promptTutorialChapters.length - 1 ? close() : changeChapter(index + 1)} className="rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#241a05] hover:bg-[#e8c766] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c766]">{index === promptTutorialChapters.length - 1 ? '返回工作台' : '下一节'}</button>
      </footer>
    </div>
  </dialog>
}
