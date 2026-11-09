import { expect, it } from 'vitest'
import { createPresetProvider, PROVIDER_PRESETS, displayProviderName } from '../src/shared/provider-presets'
import { emptyModelServices, normalizeModelServices } from '../src/shared/model-services'

it('adds TangMen with separate image/video credentials and no inherited common key', () => {
  const a = createPresetProvider('tangmen')
  const b = createPresetProvider('tangmen')
  expect(a.id).not.toBe(b.id)
  expect(a.endpoints.map(e => e.protocol)).toEqual(['openai-image', 'luna-media-video'])
  expect(a.endpoints[0].baseUrl).not.toBe(a.endpoints[1].baseUrl)
  expect(a.apiKey).toBeUndefined()
  expect(a.endpoints.every(e => !e.apiKey)).toBe(true)
  expect(a.models).toEqual([])
  expect(a.endpoints.some(e => e.protocol === 'chat-completions')).toBe(false)
  const legacy = { ...a, name: 'Luna 图片专站' }
  expect(displayProviderName(legacy)).toBe('TangMen 图片专站')
  expect(legacy.name).toBe('Luna 图片专站')
  expect(displayProviderName({ ...a, name: '自己的连接', endpoints: [] })).toBe('自己的连接')
})

it('only creates supported presets and produces valid independently editable connections', () => {
  expect(() => createPresetProvider('anthropic')).toThrow(/Claude Code/)
  for (const preset of PROVIDER_PRESETS.filter(p => !p.unavailable && p.id !== 'tangmen' && p.id !== 'custom')) {
    const p = createPresetProvider(preset.id)
    expect(() => normalizeModelServices({ ...emptyModelServices(), providers: [p] })).not.toThrow()
    expect(p.models).toEqual([])
  }
})
