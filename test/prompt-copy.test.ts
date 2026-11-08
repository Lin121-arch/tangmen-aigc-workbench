import { describe, expect, it } from 'vitest'
import { copyPromptToClipboard } from '../src/shared/prompt-copy'

describe('tutorial prompt copying', () => {
  it('reports copied only after the complete prompt was accepted by the clipboard', async () => {
    let clipboardText = ''
    let finish!: () => void
    const accepted = new Promise<void>(resolve => { finish = resolve })
    let settled = false
    const result = copyPromptToClipboard('角色：小埼\n动作：指向书本', { writeText: async text => { await accepted; clipboardText = text } }).then(status => { settled = true; return status })
    await Promise.resolve()
    expect(settled).toBe(false)
    finish()
    expect(await result).toBe('copied')
    expect(clipboardText).toBe('角色：小埼\n动作：指向书本')
  })
  it('offers manual copying when the operating system refuses clipboard access', async () => {
    expect(await copyPromptToClipboard('完整提示词', { writeText: async () => { throw new Error('permission denied') } })).toBe('manual')
  })
  it('offers manual copying when the clipboard API is unavailable', async () => {
    expect(await copyPromptToClipboard('完整提示词', undefined)).toBe('manual')
  })
})
