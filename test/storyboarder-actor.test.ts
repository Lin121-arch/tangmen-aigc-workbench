import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { Group, Texture, Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createDirectorElement, createDefaultDirectorProject, normalizeDirectorProject, validateDirectorProject } from '../src/features/director/director-model'
import { directorProjectSchema } from '../src/shared/director-schema'
import { createStoryboarderActor, poseStoryboarderActor, storyboarderMotionPhase } from '../src/features/director/storyboarder-rig'

async function load(name: string) {
  // Node has no image decoder; real geometry, skinning and morph data remain intact.
  Object.assign(globalThis, { self: globalThis })
  const bytes = await readFile(new URL(`../public/models/storyboarder/${name}-lod.glb`, import.meta.url))
  const loader = new GLTFLoader().register(() => ({ name: 'test-image-decoder', loadTexture: async () => new Texture() }))
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
describe('Storyboarder characters', () => {
  it('uses authored clip duration for timeline playback and frame seeking', () => {
    expect(storyboarderMotionPhase(32, 24)).toBeCloseTo(1, 5)
    expect(storyboarderMotionPhase(22, 24, 'run')).toBeCloseTo(1, 5)
    expect(storyboarderMotionPhase(0, 24)).toBe(0)
  })
  it('round-trips new actor choices without losing existing shots or paths', () => {
    const project = createDefaultDirectorProject()
    const actor = { ...createDirectorElement('actor', 0), actorModelId: 'storyboarder-adult-female' as const }
    project.elements.push(actor)
    expect(directorProjectSchema.safeParse(project).success).toBe(true)
    expect(normalizeDirectorProject(JSON.parse(JSON.stringify(project)))).toEqual(project)
    expect(validateDirectorProject(project)).toEqual([])
    const legacy = { ...project, elements: [{ ...actor, actorModelId: 'director-rig-v1' }] }
    expect(normalizeDirectorProject(legacy).elements[0].actorModelId).toBe('director-rig-v1')
  })
  it.each(['adult-male', 'adult-female', 'teen-male', 'teen-female'])('poses real %s skin, shows one LOD and keeps instance resources separate', async name => {
    const original = await load(name)
    const a = createStoryboarderActor(original), b = createStoryboarderActor(original)
    poseStoryboarderActor(a, 'standard', 'stand')
    const standing = new Box3().setFromObject(a.scene, true)
    expect(standing.min.y).toBeCloseTo(0, 4)
    expect(standing.getSize(new Vector3()).y).toBeGreaterThan(1)
    let visible = 0
    a.scene.traverse(o => { if ('isSkinnedMesh' in o && o.isSkinnedMesh && o.visible) visible++ })
    expect(visible).toBe(1)
    const rest = b.scene.getObjectByName('RightArm')!.quaternion.clone()
    poseStoryboarderActor(a, 'heavy', 'wave')
    expect(a.scene.getObjectByName('RightArm')!.quaternion.equals(rest)).toBe(false)
    expect(b.scene.getObjectByName('RightArm')!.quaternion.equals(rest)).toBe(true)
    expect(new Box3().setFromObject(a.scene, true).min.y).toBeCloseTo(0, 4)
    poseStoryboarderActor(a, 'standard', 'walk', 0.25)
    const one = a.scene.getObjectByName('LeftUpLeg')!.quaternion.clone()
    poseStoryboarderActor(a, 'standard', 'walk', 0.75)
    expect(a.scene.getObjectByName('LeftUpLeg')!.quaternion.equals(one)).toBe(false)
    poseStoryboarderActor(a, 'standard', 'stand')
    const reset = new Box3().setFromObject(a.scene, true)
    expect(reset.getSize(new Vector3()).y).toBeCloseTo(standing.getSize(new Vector3()).y, 4)
  })
  it('anchors imported feet in actor-local space even on an elevated and scaled parent', async () => {
    const rig = createStoryboarderActor(await load('adult-male'))
    const parent = new Group(); parent.position.set(8, 3, -2); parent.scale.set(2, 2, 2); parent.add(rig.scene)
    poseStoryboarderActor(rig, 'standard', 'stand')
    expect(new Box3().setFromObject(parent, true).min.y).toBeCloseTo(3, 4)
    poseStoryboarderActor(rig, 'standard', 'wave')
    expect(new Box3().setFromObject(parent, true).min.y).toBeCloseTo(3, 4)
  })
  it('seats the knees in front of the hips instead of bending the thighs backwards', async () => {
    const rig = createStoryboarderActor(await load('adult-male'))
    poseStoryboarderActor(rig, 'standard', 'sit')
    const hip = rig.scene.getObjectByName('Hips')!.getWorldPosition(new Vector3())
    const knee = rig.scene.getObjectByName('LeftLeg')!.getWorldPosition(new Vector3())
    const ankle = rig.scene.getObjectByName('LeftFoot')!.getWorldPosition(new Vector3())
    expect(knee.z - hip.z).toBeGreaterThan(.2)
    expect(Math.abs(knee.y - hip.y)).toBeLessThan(.2)
    expect(ankle.y).toBeLessThan(knee.y - .2)
  })
  it('keeps the same local pose when the actor parent faces a different direction', async () => {
    const original = await load('adult-male')
    const a = createStoryboarderActor(original), b = createStoryboarderActor(original)
    const parent = new Group(); parent.rotation.y = Math.PI / 2; parent.add(b.scene)
    poseStoryboarderActor(a, 'standard', 'sit')
    poseStoryboarderActor(b, 'standard', 'sit')
    for (const name of ['LeftUpLeg', 'LeftLeg', 'RightArm']) {
      expect(a.bones.get(name)!.bone.quaternion.angleTo(b.bones.get(name)!.bone.quaternion)).toBeLessThan(.001)
    }
  })
  it.each(['adult-male', 'adult-female', 'teen-male', 'teen-female'])('keeps %s knees forward and hands above the floor in the seated clip', async name => {
    const rig = createStoryboarderActor(await load(name), '#b9c2cc', name)
    poseStoryboarderActor(rig, 'standard', 'sit')
    const hip = rig.scene.getObjectByName('Hips')!.getWorldPosition(new Vector3())
    for (const side of ['Left', 'Right']) {
      const knee = rig.scene.getObjectByName(side + 'Leg')!.getWorldPosition(new Vector3())
      const hand = rig.scene.getObjectByName(side + 'Hand')!.getWorldPosition(new Vector3())
      expect(knee.z - hip.z).toBeGreaterThan(.2)
      expect(hand.y).toBeGreaterThan(.25)
    }
  })
  it('samples a coordinated run separately from walking and seeks deterministically', async () => {
    const rig = createStoryboarderActor(await load('adult-male'))
    poseStoryboarderActor(rig, 'standard', 'walk', .25, 'walk')
    const walking = rig.bones.get('Spine2')!.bone.quaternion.clone()
    poseStoryboarderActor(rig, 'standard', 'walk', .25, 'run')
    expect(rig.bones.get('Spine2')!.bone.quaternion.angleTo(walking)).toBeGreaterThan(.02)
    const running = rig.bones.get('LeftLeg')!.bone.quaternion.clone()
    poseStoryboarderActor(rig, 'standard', 'walk', .5, 'run')
    poseStoryboarderActor(rig, 'standard', 'walk', .25, 'run')
    expect(rig.bones.get('LeftLeg')!.bone.quaternion.angleTo(running)).toBeLessThan(.00001)
    expect(Math.abs(rig.bones.get('Head')!.bone.quaternion.length() - 1)).toBeLessThan(.00001)
  })
  it('places hands at the waist and above the head without straight robot arms', async () => {
    const rig = createStoryboarderActor(await load('adult-male'))
    poseStoryboarderActor(rig, 'standard', 'hands-on-hips')
    for (const side of ['Left', 'Right']) {
      const wrist = rig.bones.get(side + 'Hand')!.bone.getWorldPosition(new Vector3())
      expect(wrist.y).toBeGreaterThan(.85)
      expect(wrist.y).toBeLessThan(1.2)
      expect(Math.abs(wrist.x)).toBeLessThan(.3)
    }
    poseStoryboarderActor(rig, 'standard', 'wave')
    const hand = rig.bones.get('RightHand')!.bone.getWorldPosition(new Vector3())
    const head = rig.bones.get('Head')!.bone.getWorldPosition(new Vector3())
    expect(hand.y).toBeGreaterThan(head.y)
  })
  it('uses the same ground baseline regardless of first seek and keeps lean legs supported', async () => {
    const original = await load('adult-male')
    const a = createStoryboarderActor(original), b = createStoryboarderActor(original)
    poseStoryboarderActor(a, 'standard', 'walk', .2, 'run')
    poseStoryboarderActor(b, 'standard', 'walk', .8, 'run')
    poseStoryboarderActor(a, 'standard', 'walk', .5, 'run')
    poseStoryboarderActor(b, 'standard', 'walk', .5, 'run')
    expect(a.model.position.y).toBeCloseTo(b.model.position.y, 8)
    poseStoryboarderActor(a, 'standard', 'stand')
    const feet = ['LeftFoot', 'RightFoot'].map(name => a.bones.get(name)!.bone.getWorldPosition(new Vector3()))
    poseStoryboarderActor(a, 'standard', 'lean')
    for (const [i, name] of ['LeftFoot', 'RightFoot'].entries()) expect(a.bones.get(name)!.bone.getWorldPosition(new Vector3()).distanceTo(feet[i])).toBeLessThan(.001)
    poseStoryboarderActor(a, 'standard', 'crouch')
    const leftKnee = a.bones.get('LeftLeg')!.bone.getWorldPosition(new Vector3())
    const rightKnee = a.bones.get('RightLeg')!.bone.getWorldPosition(new Vector3())
    expect(Math.abs(leftKnee.y - rightKnee.y)).toBeLessThan(.05)
    expect(Math.abs(leftKnee.z - rightKnee.z)).toBeLessThan(.05)
  })
})
