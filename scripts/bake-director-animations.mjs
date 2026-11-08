// Reproducible offline retarget of CC0 Quaternius clips onto the four MIT actors.
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { AnimationMixer, Quaternion, Vector3, Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
globalThis.self = globalThis
globalThis.ProgressEvent ??= class { constructor(type, properties) { this.type = type; Object.assign(this, properties) } }
const sourceDir = new URL('../resources/director-animation-source/', import.meta.url)
const document = JSON.parse(await readFile(new URL('AnimationLibrary_Godot_Standard.gltf', sourceDir), 'utf8'))
document.buffers[0].uri = 'data:application/octet-stream;base64,' + (await readFile(new URL('AnimationLibrary_Godot_Standard.bin', sourceDir))).toString('base64')
const loader = new GLTFLoader().register(() => ({ name: 'offline-texture-decoder', loadTexture: async () => new Texture() }))
const source = await loader.parseAsync(JSON.stringify(document), '')
const mapping = { Hips: 'DEF-hips', Spine: 'DEF-spine001', Spine1: 'DEF-spine002', Spine2: 'DEF-spine003', Neck: 'DEF-neck', Head: 'DEF-head' }
for (const [side, suffix] of [['Left', 'L'], ['Right', 'R']]) {
  for (const [target, from] of Object.entries({ Shoulder: 'shoulder', Arm: 'upper_arm', ForeArm: 'forearm', Hand: 'hand', UpLeg: 'thigh', Leg: 'shin', Foot: 'foot', ToeBase: 'toe' })) mapping[side + target] = `DEF-${from}${suffix}`
  for (const [finger, from] of Object.entries({ Thumb: 'thumb', Index: 'f_index', Middle: 'f_middle', Ring: 'f_ring', Pinky: 'f_pinky' })) {
    for (let i = 1; i <= 3; i++) mapping[`${side}Hand${finger}${i}`] = `DEF-${from}0${i}${suffix}`
  }
}
const selected = { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sit: 'Sitting_Idle_Loop', crouch: 'Crouch_Idle_Loop', kneel: 'Fixing_Kneeling', talk: 'Idle_Talking_Loop', interact: 'Interact' }
const output = { author: 'Quaternius', license: 'CC0-1.0', version: 1, models: {} }
const sourceMixer = new AnimationMixer(source.scene)
for (const modelName of ['adult-male', 'adult-female', 'teen-male', 'teen-female']) {
  const bytes = await readFile(new URL(`../public/models/storyboarder/${modelName}-lod.glb`, import.meta.url))
  const target = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
  target.updateMatrixWorld(true)
  // Calibrate the A-pose actor to the source T-pose, in world space before baking.
  for (const side of ['Left', 'Right']) {
    for (const [name, childName] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand']]) {
      const bone = target.getObjectByName(side + name), child = target.getObjectByName(side + childName)
      const direction = child.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize()
      const delta = new Quaternion().setFromUnitVectors(direction, new Vector3(side === 'Left' ? 1 : -1, 0, 0))
      const world = bone.getWorldQuaternion(new Quaternion()).premultiply(delta)
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world))
      target.updateMatrixWorld(true)
    }
  }
  sourceMixer.stopAllAction(); sourceMixer.clipAction(source.animations.find(c => c.name === 'A_TPose')).play(); sourceMixer.setTime(0); source.scene.updateMatrixWorld(true)
  const calibration = Object.entries(mapping).filter(([to, from]) => target.getObjectByName(to) && source.scene.getObjectByName(from)).map(([to, from]) => ({
    target: target.getObjectByName(to), source: source.scene.getObjectByName(from),
    sourceRest: source.scene.getObjectByName(from).getWorldQuaternion(new Quaternion()),
    correction: source.scene.getObjectByName(from).getWorldQuaternion(new Quaternion()).invert().multiply(target.getObjectByName(to).getWorldQuaternion(new Quaternion())),
  }))
  // Parents before children: world rotations are converted back to the actor's own local axes.
  const depth = object => { let n = 0; for (; object.parent; object = object.parent) n++; return n }
  calibration.sort((a, b) => depth(a.target) - depth(b.target))
  const clips = {}
  for (const [name, sourceName] of Object.entries(selected)) {
    const clip = source.animations.find(c => c.name === sourceName)
    const frames = Math.ceil(clip.duration * 30), samples = []
    sourceMixer.stopAllAction(); sourceMixer.clipAction(clip).play()
    for (let frame = 0; frame <= frames; frame++) {
      const time = Math.min(clip.duration - .00001, frame / frames * clip.duration)
      sourceMixer.setTime(time); source.scene.updateMatrixWorld(true)
      if (name === 'crouch') {
        // The authored combat crouch leaves one knee behind. Mirror the forward
        // supporting leg for the editor's separate, two-foot crouch preset.
        const mirror = q => new Quaternion(q.x, -q.y, -q.z, q.w)
        for (const part of ['UpLeg', 'Leg', 'Foot', 'ToeBase']) {
          const left = calibration.find(item => item.target.name === 'Left' + part)
          const right = calibration.find(item => item.target.name === 'Right' + part)
          const desired = mirror(left.source.getWorldQuaternion(new Quaternion()))
            .multiply(mirror(left.sourceRest).invert()).multiply(right.sourceRest)
          right.source.quaternion.copy(right.source.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired))
          source.scene.updateMatrixWorld(true)
        }
      }
      const values = []
      for (const item of calibration) {
        const desired = item.source.getWorldQuaternion(new Quaternion()).multiply(item.correction)
        item.target.quaternion.copy(item.target.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired)).normalize()
        item.target.updateMatrixWorld(true)
        values.push(...item.target.quaternion.toArray().map(n => +n.toFixed(6)))
      }
      samples.push(values)
    }
    clips[name] = { source: sourceName, duration: clip.duration, bones: calibration.map(c => c.target.name), samples }
  }
  output.models[modelName] = clips
  console.log(`Retargeted ${modelName}: ${Object.keys(clips).length} clips`)
}
const destination = new URL('../src/features/director/data/', import.meta.url)
await mkdir(destination, { recursive: true })
await writeFile(new URL('quaternius-clips.json', destination), JSON.stringify(output))
const notices = new URL('../public/models/quaternius/', import.meta.url)
await mkdir(notices, { recursive: true })
for (const file of ['LICENSE', 'README.md', 'source.json']) await copyFile(new URL(file, sourceDir), new URL(file, notices))
