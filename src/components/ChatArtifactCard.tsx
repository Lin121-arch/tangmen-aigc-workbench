import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Artifact } from '../shared/ipc.types';
import { useAppStore } from '../stores/app.store';

const ArtifactRenderer = lazy(() => import('./ArtifactRenderer').then(module => ({ default: module.ArtifactRenderer })));

function ArtifactDialog({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addReference = useAppStore(state => state.addArtifactReference);
  const referenced = useAppStore(state => state.referencedArtifacts.some(item => item.id === artifact.id));
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return createPortal(
    <dialog ref={dialogRef} aria-label={`阅读产物：${artifact.title}`} data-canvas-node-editor-dialog data-document-artifact-dialog
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="app-no-drag fixed inset-x-0 top-[56px] bottom-4 m-auto h-[calc(100vh-80px)] w-[calc(100vw-32px)] max-w-6xl overflow-hidden rounded-2xl border border-white/15 bg-[#0a0a0f] p-0 text-[#e8e6df] shadow-2xl backdrop:bg-black/70">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-3">
          <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium">{artifact.title}</h2><p className="mt-1 truncate text-xs text-white/40" title={artifact.path}>{artifact.path}</p></div>
          <button disabled={referenced} onClick={() => addReference({ id: artifact.id, type: artifact.type, title: artifact.title, path: artifact.path })}
            className="shrink-0 rounded-lg border border-[#d4af37]/25 px-3 py-2 text-xs text-[#e8c766] hover:bg-[#d4af37]/10 disabled:opacity-50">{referenced ? '已添加到对话' : '添加到对话'}</button>
          <button autoFocus onClick={onClose} className="shrink-0 rounded-lg border border-white/10 px-4 py-2 text-xs hover:bg-white/5">关闭</button>
        </header>
        <div className="min-h-0 flex-1 p-4">
          <Suspense fallback={<p className="p-4 text-sm text-white/50">正在加载产物…</p>}><ArtifactRenderer artifact={artifact} /></Suspense>
        </div>
      </div>
    </dialog>, document.body,
  );
}

/** The chat row mounts artifact content only when the user opens its dialog. */
export function ChatArtifactCard({ artifact }: { artifact: Artifact }) {
  const projectId = useAppStore(state => state.currentProject?.id);
  const latest = useAppStore(state => state.artifacts.find(item => item.id === artifact.id || (
    !!artifact.path && item.path?.replace(/\\/g, '/') === artifact.path.replace(/\\/g, '/')
  )));
  const current = latest && latest.timestamp >= artifact.timestamp ? latest : artifact;
  const [openedProject, setOpenedProject] = useState<string | null>(null);
  return <>
    <button type="button" data-chat-artifact={artifact.id} aria-label={`查看产物：${current.title}`}
      onClick={() => setOpenedProject(projectId ?? null)}
      className="group flex w-full items-center gap-3 rounded-lg border border-[#d4af37]/20 bg-[#d4af37]/[0.06] px-3 py-3 text-left transition hover:border-[#d4af37]/50 hover:bg-[#d4af37]/10 focus-visible:outline-2 focus-visible:outline-[#d4af37]">
      <svg className="h-5 w-5 shrink-0 text-[#e8c766]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-[#e8e6df]">{current.title}</span><span className="mt-1 block text-[10px] text-[#8a8794]">点击放大阅读</span></span>
      <span className="shrink-0 rounded bg-[#d4af37]/15 px-1.5 py-0.5 text-[10px] text-[#e8c766]">{current.type === 'image' ? '图片' : current.type === 'storyboard' ? '分镜表' : current.type === 'html' ? 'HTML' : 'Markdown'}</span>
    </button>
    {openedProject && openedProject === projectId && <ArtifactDialog artifact={current} onClose={() => setOpenedProject(null)} />}
  </>;
}
