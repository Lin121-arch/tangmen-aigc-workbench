import { useLoader } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { DirectorActorModelId, DirectorBodyType, DirectorPoseId } from '../../shared/director.types'
import { createStoryboarderActor, poseStoryboarderActor } from './storyboarder-rig'
import { disposeDirectorRig } from './director-rig-resources'

export function StoryboarderActorModel({ modelId, color, height = 1.72, bodyType = 'standard', poseId = 'stand', motionPhase, motionKind }: {
  modelId: DirectorActorModelId; color: string; height?: number; bodyType?: DirectorBodyType; poseId?: DirectorPoseId; motionPhase?: number; motionKind?: 'walk' | 'run'
}) {
  const file = modelId.replace('storyboarder-', '')
  const gltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}models/storyboarder/${file}-lod.glb`)
  const rig = useMemo(() => createStoryboarderActor(gltf.scene, color, file), [gltf.scene, color, file])
  useEffect(() => () => disposeDirectorRig(rig.scene), [rig])
  useLayoutEffect(() => { poseStoryboarderActor(rig, bodyType, poseId, motionPhase, motionKind) }, [rig, bodyType, poseId, motionPhase, motionKind])
  return <group scale={height / rig.height}><primitive object={rig.scene} /></group>
}
