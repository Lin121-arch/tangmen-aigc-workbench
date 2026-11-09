import { useState } from 'react'
import { PROVIDER_PRESETS, type ProviderPreset } from '../shared/provider-presets'

export function ProviderCatalog({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [notice, setNotice] = useState('')
  const categories = [['all', '全部'], ['official', '官方厂商'], ['third-party', 'TangMen'], ['custom', '自定义']] as const
  const results = PROVIDER_PRESETS.filter(p => (group === 'all' || p.category === group) && (p.name + p.description).toLowerCase().includes(query.toLowerCase().trim()))
  function choose(p: ProviderPreset) { if (p.unavailable) setNotice(p.unavailable); else onSelect(p.id) }
  return <div className="p-6" aria-label="厂商预设目录">
    <div className="flex items-center gap-3"><label className="flex-1"><span className="sr-only">搜索厂商</span><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索厂商，例如 DeepSeek、火山、TangMen" className="w-full rounded-lg border border-white/15 bg-[#09090e] px-4 py-3 text-sm outline-none placeholder:text-[#9995a4] focus:border-[#d4af37]"/></label><button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-3 py-3 text-xs hover:border-[#d4af37]">返回已连接</button></div>
    <div className="mt-5 grid gap-6 md:grid-cols-[140px_minmax(0,1fr)]"><nav aria-label="厂商分类" className="flex gap-1 md:flex-col">{categories.map(([id, label]) => <button type="button" key={id} aria-pressed={group === id} onClick={() => setGroup(id)} className={`rounded-lg px-3 py-2.5 text-left text-sm ${group === id ? 'bg-[#d4af37]/15 text-[#f0d98c]' : 'text-[#b8b4c2] hover:bg-white/5'}`}>{label}</button>)}</nav>
    <div>{categories.filter(([id]) => id !== 'all').map(([id, label]) => {
      const providers = results.filter(p => p.category === id)
      return providers.length ? <section key={id} className="mb-6"><h3 className="mb-3 text-xs text-[#b8b4c2]">{label}</h3><div className="grid gap-3 lg:grid-cols-2">{providers.map(p => <button type="button" key={p.id} onClick={() => choose(p)} className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-4 text-left hover:border-[#d4af37]/70 focus-visible:outline-2 focus-visible:outline-[#d4af37]">
        {p.id === 'tangmen' ? <img src="./app-icon.png" alt="" className="h-9 w-9 shrink-0"/> : <svg className="h-8 w-8 shrink-0 text-[#c6bfad]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7Z M3 7l9 5 9-5M12 12v10"/></svg>}
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{p.name}</span><span className="mt-1 block text-xs leading-5 text-[#b8b4c2]">{p.description}</span></span>{p.unavailable && <span className="shrink-0 text-xs text-[#c6bfad]">接入说明</span>}
      </button>)}</div></section> : null
    })}{!results.length && <p className="py-8 text-sm text-[#b8b4c2]">没有匹配的厂商，换个名称试试。</p>}</div></div>
    {notice && <p role="status" className="mt-3 text-sm leading-6 text-[#e8c766]">{notice}</p>}
  </div>
}
