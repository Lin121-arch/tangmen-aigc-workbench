import { Bone, Box3, Color, Group, MeshStandardMaterial, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { DirectorBodyType, DirectorPoseId } from '../../shared/director.types'
import animationData from './data/quaternius-clips.json'

type Rest = { bone: Bone; position: Vector3; quaternion: Quaternion; scale: Vector3 }
type BakedClip = { duration: number; bones: string[]; samples: number[][] }
type ModelClips = Record<string, BakedClip>
/** Deterministic timeline time, using the baked clip's authored duration. */
export function storyboarderMotionPhase(frame: number, fps: number, motion: 'walk' | 'run' = 'walk') {
  return frame / fps / animationData.models['adult-male'][motion].duration
}
export interface StoryboarderRig { scene: Group; model: Object3D; bones: Map<string, Rest>; meshes: SkinnedMesh[]; height: number; offsets: Map<string, number>; clips: ModelClips }
/** Upstream files contain five overlapping LODs. Keep only LOD0, not five actors. */
export function createStoryboarderActor(source: Object3D, color = '#b9c2cc', modelName = 'adult-male'): StoryboarderRig {
  const scene = new Group(), model = clone(source)
  scene.add(model)
  const meshes: SkinnedMesh[] = [], remove: Object3D[] = [], bones = new Map<string, Rest>()
  model.traverse(object => {
    if (object instanceof Bone) bones.set(object.name, { bone: object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() })
    if (!(object instanceof SkinnedMesh)) return
    if (/LOD[1-9]/i.test(object.name)) { remove.push(object); return }
    object.material = Array.isArray(object.material) ? object.material.map(m => m.clone()) : object.material.clone()
    object.userData.directorMaterialIsolated = true
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial) {
        // Preserve authored face/body texture. Color is a restrained identification tint.
        material.color.lerp(new Color(color), 0.22); material.roughness = 0.8; material.metalness = 0
      }
    }
    object.castShadow = object.receiveShadow = true; object.frustumCulled = false
    meshes.push(object)
  })
  remove.forEach(object => object.removeFromParent())
  scene.updateMatrixWorld(true); meshes.forEach(mesh => mesh.skeleton.update())
  const height = new Box3().setFromObject(scene, true).getSize(new Vector3()).y
  if (!meshes.length || !bones.has('Hips') || !Number.isFinite(height) || height <= 0) throw new Error('人物模型缺少可用骨骼或几何')
  const clips = (animationData.models as Record<string, ModelClips>)[modelName] || animationData.models['adult-male']
  return { scene, model, meshes, bones, height, offsets: new Map(), clips }
}

/** Apply rotations in character/world axes, independent of the imported local bone axes. */
function rotate(rig: StoryboarderRig, name: string, axis: 'x' | 'y' | 'z', degrees: number) {
  const bone = rig.bones.get(name)?.bone
  if (!bone || !degrees) return
  rig.scene.updateMatrixWorld(true)
  const parent = bone.parent!.getWorldQuaternion(new Quaternion())
  const world = bone.getWorldQuaternion(new Quaternion())
  const direction = new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).applyQuaternion(rig.scene.getWorldQuaternion(new Quaternion()))
  world.premultiply(new Quaternion().setFromAxisAngle(direction, degrees * Math.PI / 180))
  bone.quaternion.copy(parent.invert().multiply(world))
}

function applyClip(rig: StoryboarderRig, name: string, phase = 0) {
  const clip = rig.clips[name], at = ((phase % 1) + 1) % 1 * (clip.samples.length - 1)
  const index = Math.floor(at), a = clip.samples[index], b = clip.samples[Math.min(index + 1, clip.samples.length - 1)]
  const end = new Quaternion()
  clip.bones.forEach((name, i) => {
    const bone = rig.bones.get(name)?.bone
    if (bone) bone.quaternion.fromArray(a, i * 4).slerp(end.fromArray(b, i * 4), at - index).normalize()
  })
  rig.scene.updateMatrixWorld(true)
}

// Two-bone arm solve: move the wrist to a meaningful body-relative target,
// keeping segment lengths and a bent elbow rather than guessing local angles.
function reach(rig: StoryboarderRig, side: 'Left' | 'Right', target: Vector3, pole: Vector3) {
  const upper = rig.bones.get(side + 'Arm')!.bone, lower = rig.bones.get(side + 'ForeArm')!.bone, hand = rig.bones.get(side + 'Hand')!.bone
  rig.scene.updateMatrixWorld(true)
  const inverse = rig.scene.matrixWorld.clone().invert()
  const local = (bone: Bone) => bone.getWorldPosition(new Vector3()).applyMatrix4(inverse)
  const shoulder = local(upper), elbow = local(lower), wrist = local(hand)
  const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist), direction = target.clone().sub(shoulder)
  const distance = Math.max(Math.abs(a - b) + .001, Math.min(a + b - .005, direction.length()))
  direction.normalize()
  const along = (a * a - b * b + distance * distance) / (2 * distance)
  const bend = pole.clone().sub(shoulder); bend.addScaledVector(direction, -bend.dot(direction)).normalize()
  const solvedElbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)))
  const solvedWrist = shoulder.clone().addScaledVector(direction, distance)
  for (const [bone, child, point] of [[upper, lower, solvedElbow], [lower, hand, solvedWrist]] as const) {
    const start = bone.getWorldPosition(new Vector3()), from = child.getWorldPosition(new Vector3()).sub(start).normalize()
    const to = rig.scene.localToWorld(point.clone()).sub(start).normalize()
    const desired = bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(from, to))
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(desired))
    rig.scene.updateMatrixWorld(true)
  }
}

export function poseStoryboarderActor(rig: StoryboarderRig, body: DirectorBodyType, pose: DirectorPoseId, phase?: number, motion: 'walk' | 'run' = 'walk') {
  const key = `${body}:${pose}:${motion}`
  // Always establish the same held-frame baseline, even when the first render
  // seeks into a cycle. Preserve airborne run frames; never ground each phase.
  if (phase !== undefined && !rig.offsets.has(key)) poseStoryboarderActor(rig, body, pose, undefined, motion)
  rig.model.position.y = 0
  for (const { bone, position, quaternion, scale } of rig.bones.values()) { bone.position.copy(position); bone.quaternion.copy(quaternion); bone.scale.copy(scale) }
  for (const mesh of rig.meshes) {
    const dict = mesh.morphTargetDictionary || {}, weights = mesh.morphTargetInfluences || []
    weights.fill(0)
    if (body === 'heavy' && dict.Obese !== undefined) weights[dict.Obese] = 0.8
    if (body === 'slim' && dict.Skinny !== undefined) weights[dict.Skinny] = 0.85
  }
  const scaleBone = (name: string, x: number, y: number, z: number) => rig.bones.get(name)?.bone.scale.multiply(new Vector3(x, y, z))
  if (body === 'short' || body === 'tall') {
    const short = body === 'short'
    for (const side of ['Left', 'Right']) { scaleBone(side + 'UpLeg', 1, short ? .83 : 1.12, 1); scaleBone(side + 'Arm', 1, short ? .9 : 1.07, 1) }
    scaleBone('Head', short ? 1.1 : .94, short ? 1.1 : .94, short ? 1.1 : .94)
  }
  const turn = (name: string, axis: 'x' | 'y' | 'z', angle: number) => rotate(rig, name, axis, angle)
  // Full body clips include coordinated shoulders, spine, wrists, knees and feet.
  const clip = pose === 'walk' ? motion : pose === 'sit' || pose === 'crouch' || pose === 'kneel' ? pose : 'idle'
  applyClip(rig, clip, phase ?? (pose === 'walk' ? .15 : pose === 'kneel' ? .4 : 0))
  if (pose === 'walk') {
    // Root travel comes only from the project's path; the clip is in-place.
  } else if (pose === 'wave' || pose === 'hands-up') {
    for (const side of pose === 'wave' ? ['Right'] as const : ['Left', 'Right'] as const) {
      const sign = side === 'Left' ? 1 : -1
      reach(rig, side, new Vector3(sign * .36, 1.82, .1), new Vector3(sign * .55, 1.38, .08))
      for (const { bone, quaternion } of rig.bones.values()) if (bone.name.startsWith(side + 'Hand') && bone.name !== side + 'Hand') bone.quaternion.copy(quaternion)
    }
  } else if (pose === 'point') { reach(rig, 'Right', new Vector3(-.12, 1.4, .65), new Vector3(-.35, 1.22, .2)) }
  else if (pose === 'arms-crossed') {
    reach(rig, 'Left', new Vector3(-.16, 1.28, .19), new Vector3(.32, 1.13, .18))
    reach(rig, 'Right', new Vector3(.16, 1.33, .23), new Vector3(-.32, 1.13, .22))
  } else if (pose === 'hands-on-hips') {
    reach(rig, 'Left', new Vector3(.21, 1.02, .03), new Vector3(.48, 1.2, -.02))
    reach(rig, 'Right', new Vector3(-.21, 1.02, .03), new Vector3(-.48, 1.2, -.02))
  } else if (pose === 'lean') { turn('Spine', 'x', 15); turn('Spine1', 'x', 10) }
  else if (pose === 'look-back') { turn('Spine2', 'y', 25); turn('Head', 'y', 45) }
  rig.scene.updateMatrixWorld(true); rig.meshes.forEach(mesh => mesh.skeleton.update())
  let offset = rig.offsets.get(key)
  if (offset === undefined) {
    // Measure in the actor's own frame, not scene/world Y (parent may be rotated).
    const inverse = rig.scene.matrixWorld.clone().invert(), vertex = new Vector3()
    let lowest = Infinity
    for (const mesh of rig.meshes) {
      const count = mesh.geometry.attributes.position.count
      for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse)
        lowest = Math.min(lowest, vertex.y)
      }
    }
    offset = -lowest
    rig.offsets.set(key, offset)
  }
  rig.model.position.y = offset
  rig.scene.updateMatrixWorld(true)
}
