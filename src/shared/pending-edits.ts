import type { BeforeCloseRequest } from './ipc.types'
type FlushOptions = Pick<BeforeCloseRequest, 'settingsAction'>
type Flusher = { flush: (options?: FlushOptions) => Promise<void>; priority: number }
export class UnsavedSettingsError extends Error {}
const flushers = new Set<Flusher>()
let barrierDepth = 0
let previouslyInert = false
/** Blocks new UI edits while a navigation/close transaction drains all drafts. */
export function beginEditBarrier(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (barrierDepth++ === 0) { previouslyInert = document.body.inert; document.body.inert = true }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--barrierDepth === 0) document.body.inert = previouslyInert
  }
}

/** Editors commit their drafts before the enclosing canvas writes its snapshot. */
export function registerEditFlusher(flush: Flusher['flush'], priority = 100): () => void {
  const entry = { flush, priority }
  flushers.add(entry)
  return () => { flushers.delete(entry) }
}

export async function flushPendingEdits(options?: FlushOptions): Promise<void> {
  for (const entry of [...flushers].sort((a, b) => a.priority - b.priority)) await entry.flush(options)
}
