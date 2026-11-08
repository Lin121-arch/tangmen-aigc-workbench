import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('offers the four bundled actors and lightweight model without the separately licensed legacy asset in student builds', async () => {
  vi.stubEnv('MODE', 'student')
  vi.resetModules()
  const { DIRECTOR_ACTOR_MODELS, displayDirectorActorModel } = await import('../src/features/director/actor-model')
  expect(DIRECTOR_ACTOR_MODELS.map(model => model.id)).toEqual([
    'storyboarder-adult-male', 'storyboarder-adult-female',
    'storyboarder-teen-male', 'storyboarder-teen-female', 'lightweight-v1',
  ])
  expect(displayDirectorActorModel('director-rig-v1')).toBe('storyboarder-adult-male')
  expect(displayDirectorActorModel()).toBe('storyboarder-adult-male')
  expect(displayDirectorActorModel('storyboarder-adult-female')).toBe('storyboarder-adult-female')
  expect(displayDirectorActorModel('lightweight-v1')).toBe('lightweight-v1')
})

it('keeps the legacy model available in the existing teacher build', async () => {
  vi.stubEnv('MODE', 'production')
  vi.resetModules()
  const { DIRECTOR_ACTOR_MODELS, displayDirectorActorModel } = await import('../src/features/director/actor-model')
  expect(DIRECTOR_ACTOR_MODELS.some(model => model.id === 'director-rig-v1')).toBe(true)
  expect(displayDirectorActorModel('director-rig-v1')).toBe('director-rig-v1')
})
