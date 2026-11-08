// Adapted from prompt-kit by Julien Thibeaut, MIT.
// Upstream: ibelick/prompt-kit@5a9496635cc0e1bf7679fe2a9e35d9b36b99c08a
// Changes: native textarea/tooltips, scoped styles, IME-safe Enter and control focus.
import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps, ReactNode, RefObject } from 'react'

type Context = { value: string; setValue: (value: string) => void; maxHeight: number; onSubmit?: () => void; disabled: boolean; textareaRef: RefObject<HTMLTextAreaElement | null> }
const PromptInputContext = createContext<Context | null>(null)
function usePromptInput() {
  const context = useContext(PromptInputContext)
  if (!context) throw new Error('PromptInputTextarea must be inside PromptInput')
  return context
}
export function PromptInput({ value, onValueChange, maxHeight = 200, onSubmit, children, disabled = false, className = '', ...props }: {
  value?: string; onValueChange?: (value: string) => void; maxHeight?: number; onSubmit?: () => void; children: ReactNode; disabled?: boolean
} & Omit<ComponentProps<'div'>, 'onSubmit'>) {
  const [internalValue, setInternalValue] = useState(value || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  return <PromptInputContext.Provider value={{ value: value ?? internalValue, setValue: onValueChange ?? setInternalValue, maxHeight, onSubmit, disabled, textareaRef }}>
    <div className={`prompt-kit-input ${className}`} onClick={event => { if (!disabled && event.target === event.currentTarget) textareaRef.current?.focus() }} {...props}>{children}</div>
  </PromptInputContext.Provider>
}
export function PromptInputTextarea(props: ComponentProps<'textarea'>) {
  const { value, setValue, maxHeight, onSubmit, disabled, textareaRef } = usePromptInput()
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value, maxHeight, textareaRef])
  return <textarea {...props} ref={textareaRef} value={value} onChange={event => setValue(event.target.value)} rows={2} disabled={disabled}
    onKeyDown={event => {
      props.onKeyDown?.(event)
      if (!event.defaultPrevented && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); onSubmit?.() }
    }} />
}
export function PromptInputActions({ className = '', ...props }: ComponentProps<'div'>) { return <div className={`prompt-kit-actions ${className}`} {...props} /> }
