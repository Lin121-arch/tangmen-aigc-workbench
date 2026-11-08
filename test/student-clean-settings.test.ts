import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ directory: `${process.cwd()}/test-results/student-clean-${process.pid}` }))
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() } }))
vi.mock('../electron/main/services/project.store', () => ({ getAppDataDir: () => fixture.directory }))
afterEach(async () => { vi.unstubAllEnvs(); vi.resetModules(); await fs.rm(fixture.directory, { recursive: true, force: true }) })

it('starts the student edition with no connections or credentials even when the teacher shell has API environment variables', async () => {
  vi.stubEnv('MODE', 'student')
  for (const name of ['RELAY_AGENT_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DASHSCOPE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ARK_API_KEY', 'LUNA_API_KEY', 'RELAY_VIDEO_API_KEY']) vi.stubEnv(name, 'teacher-secret-fixture')
  vi.stubEnv('ANTHROPIC_BASE_URL', 'https://teacher-private.example/v1')
  const { getAppSettingsView, saveAppSettings } = await import('../electron/main/services/settings.service')
  const first = await getAppSettingsView()
  for (const field of ['relayAgentBaseUrl', 'comfyuiBaseUrl', 'agentBaseUrl', 'qwenBaseUrl', 'seedreamBaseUrl', 'lunaBaseUrl'] as const) expect(first[field], field).toBe('')
  expect(first.relayVideoConfig.baseUrl).toBe('')
  expect(first.modelServices?.providers).toEqual([])
  expect(first.modelServices?.defaults).toEqual({})
  expect(JSON.stringify(first)).not.toContain('teacher-')
  for (const [field, value] of Object.entries(first)) if (field.endsWith('Configured')) expect(value, field).toBe(false)
  expect(await saveAppSettings(first)).toEqual(first)
  const { normalizeRelayVideoConfig } = await import('../src/shared/relay-video-config')
  expect(() => normalizeRelayVideoConfig({ ...first.relayVideoConfig, models: [{ id: 'unconfigured', name: 'unconfigured' }] })).toThrow()
  const own = await saveAppSettings({ ...first, lunaBaseUrl: 'https://student.example/v1', lunaApiKey: 'student-own-key' })
  expect(own.lunaBaseUrl).toBe('https://student.example/v1')
  expect(own.lunaApiKeyConfigured).toBe(true)
})
