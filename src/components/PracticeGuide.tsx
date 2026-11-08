import { useState } from 'react'
import { getPracticeSteps } from '../shared/canvas-workflow-tools'
import type { CanvasNodeSnapshot } from '../shared/ipc.types'

export function PracticeGuide({ nodes, onLocate }: { nodes: CanvasNodeSnapshot[]; onLocate: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const steps = getPracticeSteps(nodes)
  const next = steps.find(step => !step.done)!
  return <div className="absolute left-3 top-3 z-30 text-xs">
    <button onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="practice-guide" className="rounded-lg border border-white/10 bg-[#17171c] px-3 py-2 text-[#e8c766] hover:bg-[#22222a] focus-visible:outline-2 focus-visible:outline-[#e8c766]">{open ? '收起指引' : '实操指引'}</button>
    {open && <aside id="practice-guide" aria-label="实操指引" className="nowheel mt-2 max-h-[calc(100vh-260px)] w-[310px] max-w-[calc(100vw-56px)] overflow-auto rounded-xl border border-white/10 bg-[#17171c] p-4 shadow-xl">
      <h3 className="text-sm font-semibold text-[#e8e6df]">下一步：{next.title}</h3>
      <p className="mt-2 leading-5 text-[#aaa7b4]">先跑通一个镜头，再扩展。状态只反映已有素材，质量需要人工检查。</p>
      <ol className="mt-4 divide-y divide-white/10">{steps.map((step, index) => <li key={step.id} className="py-3 first:pt-0">
        <div className="flex items-start justify-between gap-2"><span className="font-medium text-[#e8e6df]">{index + 1}. {step.title}</span><span className={`shrink-0 ${step.done ? 'text-emerald-300' : 'text-[#cdb064]'}`}>{step.done ? '已就绪' : step.id === 'review' ? '人工检查' : '待完成'}</span></div>
        <p className="mt-2 leading-5 text-[#aaa7b4]">{step.detail}</p>
        {step.nodeId && !step.done && <button onClick={() => { setOpen(false); onLocate(step.nodeId!) }} className="mt-2 rounded-md border border-[#d4af37]/30 px-2 py-1.5 text-[#e8c766] hover:bg-[#d4af37]/10">定位节点</button>}
      </li>)}</ol>
      <p className="border-t border-white/10 pt-3 leading-5 text-[#aaa7b4]">尚未配置接口？打开顶部「画布教程」，切换到「新手教程」里的模型配置一节。本指引不会自动生成。</p>
    </aside>}
  </div>
}
