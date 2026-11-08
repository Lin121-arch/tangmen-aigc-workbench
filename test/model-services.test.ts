import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ directory: `${process.cwd()}/test-results/model-services-${process.pid}` }))
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`encrypted:${s}`), decryptString: (b: Buffer) => b.toString().replace(/^encrypted:/, '') } }))
vi.mock('../electron/main/services/project.store', () => ({ getAppDataDir: () => fixture.directory }))
import { emptyModelServices, modelWorkflowId, normalizeModelServices, serviceWorkflows } from '../src/shared/model-services'
import { getModelServicesView, saveModelServices, resolveModelService } from '../electron/main/services/model-services.store'
const provider = (id: string, key = '') => ({ id, name: id, enabled: true, apiKey: key, endpoints: [{ id: 'images', protocol: 'openai-image', baseUrl: `https://${id}.example/v1` }], models: [{ id: 'image', name: '同名模型', modelId: 'same-external-id', endpointId: 'images', capabilities: ['image'] }] })
it('isolates identical model IDs, encrypts secrets, preserves empty keys, and explicitly clears them', async () => {
  await saveModelServices({ ...emptyModelServices(), providers: [provider('a', 'secret-a'), provider('b', 'secret-b')], defaults: { image: modelWorkflowId('b', 'image') } })
  expect((await resolveModelService(modelWorkflowId('a', 'image'), 'image')).apiKey).toBe('secret-a')
  expect((await resolveModelService(modelWorkflowId('b', 'image'), 'image')).apiKey).toBe('secret-b')
  const view = await getModelServicesView()
  expect(serviceWorkflows(view).map(x => x.id)).toEqual([modelWorkflowId('a', 'image'), modelWorkflowId('b', 'image')])
  expect(JSON.stringify(view)).not.toContain('secret-')
  expect(await fs.readFile(path.join(fixture.directory, 'model-services.json'), 'utf8')).not.toContain('secret-')
  await saveModelServices({ ...view, providers: view.providers.map(p => ({ ...p, apiKey: '' })) })
  expect((await resolveModelService(modelWorkflowId('a', 'image'), 'image')).apiKey).toBe('secret-a')
  await saveModelServices({ ...view, providers: view.providers.map(p => ({ ...p, clearApiKey: p.id === 'a' })) })
  expect((await resolveModelService(modelWorkflowId('a', 'image'), 'image')).apiKey).toBe('')
  expect((await resolveModelService(modelWorkflowId('b', 'image'), 'image')).apiKey).toBe('secret-b')
})
it('rejects invalid capability defaults, unknown adapters and duplicate internal IDs', () => {
  expect(() => normalizeModelServices({ ...emptyModelServices(), providers: [provider('a')], defaults: { video: modelWorkflowId('a', 'image') } })).toThrow()
  expect(() => normalizeModelServices({ ...emptyModelServices(), providers: [provider('a'), provider('a')] })).toThrow()
  const p = provider('a'); p.endpoints[0].protocol = 'anything'
  expect(() => normalizeModelServices({ ...emptyModelServices(), providers: [p] })).toThrow()
})
it('refuses a deleted or disabled explicit binding instead of falling back', async () => {
  const view = await getModelServicesView()
  await saveModelServices({ ...view, defaults: {}, providers: view.providers.map(p => ({ ...p, enabled: false })) })
  await expect(resolveModelService(modelWorkflowId('b', 'image'), 'image')).rejects.toThrow(/停用|不可用/)
  await expect(resolveModelService(modelWorkflowId('missing', 'image'), 'image')).rejects.toThrow()
})
it('keeps endpoint overrides independent and clearing them restores the provider key', async () => {
  const p = provider('override', 'common-key')
  await saveModelServices({ ...emptyModelServices(), providers: [{ ...p, endpoints: [{ ...p.endpoints[0], apiKey: 'endpoint-key' }] }] })
  expect((await resolveModelService('service-model:override:image', 'image')).apiKey).toBe('endpoint-key')
  const view = await getModelServicesView()
  await saveModelServices({ ...view, providers: view.providers.map(p => ({ ...p, endpoints: p.endpoints.map(e => ({ ...e, clearApiKey: true })) })) })
  expect((await resolveModelService('service-model:override:image', 'image')).apiKey).toBe('common-key')
})
it('migrates legacy credentials once, backs up the original file and leaves existing settings intact', async () => {
  const old = { lunaBaseUrl: 'https://legacy.example/v1', lunaImageModel: 'gemini-3-pro-image', encryptedLunaApiKey: Buffer.from('encrypted:migration-key').toString('base64'), defaultImageWorkflowId: 'luna-batch-image' }
  const raw = JSON.stringify(old)
  await fs.writeFile(path.join(fixture.directory, 'settings.json'), raw)
  await fs.unlink(path.join(fixture.directory, 'model-services.json'))
  const migrated = await getModelServicesView()
  expect(migrated.defaults.image).toBe('service-model:legacy-luna:m0')
  expect((await resolveModelService('luna-batch-image', 'image')).apiKey).toBe('migration-key')
  expect(await fs.readFile(path.join(fixture.directory, 'settings.pre-model-services.json'), 'utf8')).toBe(raw)
  expect(await fs.readFile(path.join(fixture.directory, 'settings.json'), 'utf8')).toBe(raw)
  await saveModelServices({ ...migrated, providers: [], defaults: {} })
  expect((await getModelServicesView()).providers).toEqual([])
})
afterAll(() => fs.rm(fixture.directory, { recursive: true, force: true }))
