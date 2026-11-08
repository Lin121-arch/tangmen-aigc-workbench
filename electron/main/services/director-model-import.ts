import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadProject } from './project.store'

export function validateDirectorGlb(data: Buffer) {
  if (data.length < 24 || data.length > 40 * 1024 * 1024 || data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw new Error('请选择完整的 GLB 2.0 模型（最大40MB）')
  const length = data.readUInt32LE(12)
  if (data.readUInt32LE(16) !== 0x4e4f534a || length > data.length - 20) throw new Error('GLB结构无效')
  const document = JSON.parse(data.toString('utf8', 20, 20 + length))
  for (const entry of [...(document.buffers || []), ...(document.images || [])]) {
    if (entry.uri && !/^data:/i.test(entry.uri)) throw new Error('模型引用了外部文件，请先导出为包含贴图的完整 GLB')
  }
}
export async function importDirectorModel(projectId: string, source: string) {
  const project = await loadProject(projectId)
  if (!project) throw new Error('项目不存在')
  if (path.extname(source).toLowerCase() !== '.glb') throw new Error('请使用 GLB 模型')
  const file = await fs.open(source, 'r')
  let data: Buffer
  try { const stat = await file.stat(); if (!stat.isFile() || stat.size > 40 * 1024 * 1024) throw new Error('模型文件无效或超过40MB'); data = await file.readFile() } finally { await file.close() }
  validateDirectorGlb(data)
  const dir = path.join(project.folderPath, 'uploads', 'models')
  await fs.mkdir(dir, { recursive: true })
  const relativePath = `uploads/models/${randomUUID()}.glb`
  await fs.writeFile(path.join(project.folderPath, relativePath), data, { flag: 'wx' })
  return { relativePath, name: path.basename(source, '.glb') }
}
