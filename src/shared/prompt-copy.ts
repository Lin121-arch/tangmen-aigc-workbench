export async function copyPromptToClipboard(text: string, clipboard: Pick<Clipboard, 'writeText'> | undefined): Promise<'copied' | 'manual'> {
  try {
    if (!clipboard) return 'manual'
    await clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'manual'
  }
}
