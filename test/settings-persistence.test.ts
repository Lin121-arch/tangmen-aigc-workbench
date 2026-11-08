import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  directory: `${process.cwd()}/test-results/settings-persistence-${process.pid}`,
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ''),
  },
}))

vi.mock('../electron/main/services/project.store', () => ({
  getAppDataDir: () => fixture.directory,
}))

vi.mock('../electron/main/services/google-network.service', () => ({
  fetchGoogleApi: vi.fn(),
  normalizeGoogleProxyUrl: (value: string) => value.trim().replace(/\/+$/, ''),
}))

import { getAppSettingsView, normalizeSeedreamBaseUrl, saveAppSettings } from '../electron/main/services/settings.service'
import { DEFAULT_RELAY_VIDEO_CONFIG } from '../src/shared/relay-video-config'

describe('settings secret persistence', () => {
  it('stores the relay Agent model and encrypted key, preserving and clearing the secret explicitly', async () => {
    const request = { comfyuiBaseUrl: 'http://127.0.0.1:8188', qwenBaseUrl: 'https://example.test/v1', seedreamBaseUrl: 'https://example.test/v3', defaultImageWorkflowId: 'luna-batch-image', relayAgentBaseUrl: 'https://api.example.invalid/v1/chat/completions', relayAgentModel: 'my-agent-model', relayAgentApiKey: 'agent-persistence-secret' }
    await saveAppSettings(request)
    await saveAppSettings({ ...request, relayAgentApiKey: undefined })
    expect(await getAppSettingsView()).toMatchObject({ relayAgentBaseUrl: 'https://api.example.invalid/v1', relayAgentModel: 'my-agent-model', relayAgentApiKeyConfigured: true })
    expect(JSON.stringify(await getAppSettingsView())).not.toContain('agent-persistence-secret')
    expect(await fs.readFile(path.join(fixture.directory, 'settings.json'), 'utf8')).not.toContain('agent-persistence-secret')
    await saveAppSettings({ ...request, relayAgentApiKey: undefined, clearRelayAgentApiKey: true })
    expect(await getAppSettingsView()).toMatchObject({ relayAgentApiKeyConfigured: false })
  })
  it('persists user-defined video models and protocol without exposing the encrypted key', async () => {
    const request = { comfyuiBaseUrl: 'http://127.0.0.1:8188', qwenBaseUrl: 'https://example.test/v1', seedreamBaseUrl: 'https://example.test/v3', defaultImageWorkflowId: 'luna-batch-image', relayVideoApiKey: 'video-persistence-secret', relayVideoConfig: { ...DEFAULT_RELAY_VIDEO_CONFIG, models: [{ id: 'actual-model-id', name: '我的模型' }], submitPath: '/create', queryPath: '/tasks/{id}' } }
    await saveAppSettings(request)
    await saveAppSettings({ ...request, relayVideoApiKey: undefined })
    const saved = await getAppSettingsView()
    expect(saved.relayVideoApiKeyConfigured).toBe(true)
    expect(saved.relayVideoConfig?.models).toEqual(request.relayVideoConfig.models)
    expect(JSON.stringify(saved)).not.toContain('video-persistence-secret')
    expect(await fs.readFile(path.join(fixture.directory, 'settings.json'), 'utf8')).not.toContain('video-persistence-secret')
    await saveAppSettings({ ...request, relayVideoApiKey: undefined, clearRelayVideoApiKey: true })
    expect((await getAppSettingsView()).relayVideoApiKeyConfigured).toBe(false)
  })
  it('encrypts a Luna key, exposes only its configured state, and preserves it on unrelated saves', async () => {
    const request = { comfyuiBaseUrl: 'http://127.0.0.1:8188', qwenBaseUrl: 'https://example.test/v1', seedreamBaseUrl: 'https://example.test/v3', defaultImageWorkflowId: 'luna-batch-image', lunaBaseUrl: 'https://api.example.invalid/', lunaImageModel: 'gemini-3-pro-image', lunaApiKey: 'luna-test-secret' }
    await saveAppSettings(request)
    await saveAppSettings({ ...request, lunaApiKey: undefined })
    const reloaded = await getAppSettingsView()
    expect(reloaded).toMatchObject({ lunaBaseUrl: 'https://api.example.invalid/v1', lunaImageModel: 'gemini-3-pro-image', lunaApiKeyConfigured: true })
    expect(JSON.stringify(reloaded)).not.toContain('luna-test-secret')
    const stored = await fs.readFile(path.join(fixture.directory, 'settings.json'), 'utf8')
    expect(stored).not.toContain('luna-test-secret')
    await saveAppSettings({ ...request, lunaApiKey: undefined, clearLunaApiKey: true })
    expect((await getAppSettingsView()).lunaApiKeyConfigured).toBe(false)
  })
  afterAll(async () => {
    await fs.rm(fixture.directory, { recursive: true, force: true })
  })

  it('persists the Seedream API key encrypted without returning plaintext', async () => {
    const request = {
      comfyuiBaseUrl: 'http://127.0.0.1:8188',
      agentBaseUrl: '',
      qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultImageWorkflowId: 'seedream-5.0-pro',
      googleAiProxyUrl: '',
      seedreamBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      seedreamApiKey: 'ark-test-secret',
    }

    const saved = await saveAppSettings(request)
    expect(saved.seedreamApiKeyConfigured).toBe(true)
    expect(saved.seedreamApiKey).toBe('')

    const reloaded = await getAppSettingsView()
    expect(reloaded.seedreamApiKeyConfigured).toBe(true)
    expect(reloaded.seedreamApiKey).toBe('')

    const stored = await fs.readFile(path.join(fixture.directory, 'settings.json'), 'utf8')
    expect(stored).not.toContain('ark-test-secret')
    expect(stored).toContain('encryptedSeedreamApiKey')
  })

  it('normalizes Seedream image endpoints to their API base URL', () => {
    expect(normalizeSeedreamBaseUrl('https://ark.cn-beijing.volces.com/api/v3/images/generations'))
      .toBe('https://ark.cn-beijing.volces.com/api/v3')
    expect(normalizeSeedreamBaseUrl('https://ark.cn-beijing.volces.com/api/plan/v3/images/generations/'))
      .toBe('https://ark.cn-beijing.volces.com/api/plan/v3')
    expect(normalizeSeedreamBaseUrl('https://ark.cn-beijing.volces.com/api/plan/v3/images/generations/images/generations'))
      .toBe('https://ark.cn-beijing.volces.com/api/plan/v3')
  })
})
