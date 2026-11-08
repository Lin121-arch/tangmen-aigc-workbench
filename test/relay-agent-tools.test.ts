import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const pushed = vi.hoisted(() => vi.fn(async () => ({ content: [{ type: 'text', text: 'saved' }] })))
vi.mock('../electron/main/services/agent/tools', () => ({ createCanvasTools: () => [{ name: 'PushArtifact', handler: pushed }] }))
import { createRelayTools } from '../electron/main/services/agent/relay-tools'

let temporary: string
let project: string
beforeEach(async () => { temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tm-agent-files-')); project = path.join(temporary, 'project'); await fs.mkdir(project); pushed.mockClear() })
afterEach(async () => { await fs.rm(temporary, { recursive: true, force: true }) })
const invoke = (tools: ReturnType<typeof createRelayTools>, name: string, input: any) => tools[name].execute!(input, { toolCallId: 'local-test', messages: [] })

it('reads project text, rejects hidden configuration, traversal and links outside the project', async () => {
  const tools = createRelayTools('p', project, new AbortController().signal)
  await fs.writeFile(path.join(project, 'script.txt'), '实物展示 → 目录导览')
  expect(await invoke(tools, 'ReadProjectText', { path: 'script.txt' })).toMatchObject({ truncated: false, content: expect.stringContaining('目录导览') })
  await fs.mkdir(path.join(project, '.aigc-line')); await fs.writeFile(path.join(project, '.aigc-line/settings.json'), 'private')
  await expect(invoke(tools, 'ReadProjectText', { path: '.aigc-line/settings.json' })).rejects.toThrow('内部配置')
  await fs.writeFile(path.join(temporary, 'outside.txt'), 'outside')
  await expect(invoke(tools, 'ReadProjectText', { path: '../outside.txt' })).rejects.toThrow('项目外')
  await fs.symlink(temporary, path.join(project, 'outside-link'), process.platform === 'win32' ? 'junction' : 'dir')
  await expect(invoke(tools, 'ReadProjectText', { path: 'outside-link/outside.txt' })).rejects.toThrow('项目外')
})

it('saves concurrent notes as unique files, displays them and never overwrites earlier work', async () => {
  const tools = createRelayTools('p', project, new AbortController().signal)
  const results = await Promise.all(['第一份脚本', '第二份脚本'].map(content => invoke(tools, 'SaveProjectNote', { title: '教材脚本', content }))) as Array<{ path: string; saved: boolean }>
  expect(new Set(results.map(result => result.path)).size).toBe(2)
  expect(results.every(result => result.saved)).toBe(true)
  expect(pushed).toHaveBeenCalledTimes(2)
  expect(await Promise.all(results.map(result => fs.readFile(path.join(project, result.path), 'utf8')))).toEqual(['第一份脚本', '第二份脚本'])
  expect(Object.keys(tools)).not.toContain('InvokeNodeAction')
})

it('does not save through an external generated-folder junction or after stop', async () => {
  const outside = path.join(temporary, 'outside'); await fs.mkdir(outside)
  await fs.symlink(outside, path.join(project, 'generated'), process.platform === 'win32' ? 'junction' : 'dir')
  const controller = new AbortController()
  const tools = createRelayTools('p', project, controller.signal)
  await expect(invoke(tools, 'SaveProjectNote', { title: '拒绝写入', content: 'text' })).rejects.toThrow('项目外')
  expect(await fs.readdir(outside)).toEqual([])
  controller.abort()
  await expect(invoke(tools, 'SaveProjectNote', { title: '已停止', content: 'text' })).rejects.toThrow()
  expect(pushed).not.toHaveBeenCalled()
})
