import { useLoader } from '@react-three/fiber'
import { useMemo } from 'react'
import { Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useAppStore } from '../../stores/app.store'

export function ImportedDirectorModel({ path, height = 1.72 }: { path: string; height?: number }) {
  const projectId = useAppStore(s => s.currentProject?.id)
  const gltf = useLoader(GLTFLoader, `workspace://${encodeURIComponent(projectId || '')}/${path}`)
  const scene = useMemo(() => {
    const model = clone(gltf.scene)
    const bounds = new Box3().setFromObject(model, true), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3())
    const scale = height / Math.max(size.y, .001)
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
    model.scale.multiplyScalar(scale)
    return model
  }, [gltf.scene, height])
  return <primitive object={scene} />
}
