import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, type RootState } from '@react-three/fiber'

class RendererBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

function FirstFrame({ onReady }: { onReady: () => void }) {
  const requested = useRef(false)
  const pending = useRef<number | undefined>(undefined)
  useEffect(() => () => { if (pending.current !== undefined) cancelAnimationFrame(pending.current) }, [])
  useFrame(({ size }) => {
    if (requested.current || size.width <= 0 || size.height <= 0) return
    requested.current = true
    // Report readiness after the renderer has had a chance to draw its first frame.
    pending.current = requestAnimationFrame(onReady)
  })
  return null
}

/** Keep render failures local to the viewport so the project can still be saved. */
export function DirectorViewport({ children, onCreated, onPointerMissed, onReadyChange }: {
  children: ReactNode
  onCreated: (state: RootState) => void
  onPointerMissed: () => void
  onReadyChange: (ready: boolean) => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const ready = useCallback(() => { if (mounted.current) setState(current => current === 'loading' ? 'ready' : current) }, [])
  const fail = useCallback(() => { if (mounted.current) setState('error') }, [])
  useEffect(() => { onReadyChange(state === 'ready') }, [state, onReadyChange])
  useEffect(() => {
    if (state !== 'loading') return
    const timer = setTimeout(fail, 15000)
    return () => clearTimeout(timer)
  }, [state, attempt, fail])
  useEffect(() => {
    if (!canvas) return
    const lost = (event: Event) => { event.preventDefault(); fail() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [canvas, fail])

  return <div className="absolute inset-0" data-director-viewport-state={state}>
    <RendererBoundary key={attempt} onError={fail}>
      <Canvas shadows camera={{ position: [7, 5, 9], fov: 48 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={root => { setCanvas(root.gl.domElement); onCreated(root) }}
        onPointerMissed={onPointerMissed}>
        <FirstFrame onReady={ready} />
        {children}
      </Canvas>
    </RendererBoundary>
    {state !== 'ready' && <div role={state === 'error' ? 'alert' : 'status'} aria-live="polite" className="absolute inset-0 z-20 flex items-center justify-center bg-[#10131b] p-6">
      <div className="max-w-md text-center text-sm leading-7 text-white/75">
        <p>{state === 'loading' ? '正在打开3D视图…' : '3D视图未能显示或图形连接已中断'}</p>
        {state === 'error' && <><p className="mt-2 text-xs text-white/50">可以重新加载视图；工程内容保留，也可以保存后关闭。若仍失败，请提供本页截图及设备显卡信息。</p><button type="button" onClick={() => { setCanvas(null); setState('loading'); setAttempt(value => value + 1) }} className="mt-4 rounded-lg border border-[#d4af37]/50 px-4 py-2 text-xs text-[#e8c766]">重新加载3D视图</button></>}
      </div>
    </div>}
  </div>
}
