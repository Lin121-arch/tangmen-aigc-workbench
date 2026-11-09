// Explicitly approved public presets. Never exempt credentials or user data.
const approved = new Set(['https://image.luna.it.com/v1', 'https://img.luna.it.com'])
export function hasPrivateSupplierEndpoint(text) {
  const remaining = text.replace(/https?:\/\/[^\s"'<>`\\]+/gi, url => approved.has(url) ? '' : url)
  return /https?:\/\/[^\s"'<>]*luna\.it\.com/i.test(remaining)
}
