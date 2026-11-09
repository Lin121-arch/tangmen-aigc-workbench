import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { build, Platform, Arch } from 'electron-builder'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32') throw new Error('Windows 安装包请在 Windows 上构建。')
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version
const buildTag = process.argv.find(value => value.startsWith('--build-tag='))?.slice('--build-tag='.length)
const runtimeArg = process.argv.find(value => value.startsWith('--electron-dist='))
if (!runtimeArg) throw new Error('必须显式提供经官方 SHA-256 校验的 --electron-dist=<目录>，禁止复用未核验的开发运行时。')
const electronDist = path.resolve(runtimeArg.slice('--electron-dist='.length))
await fs.access(path.join(electronDist, 'electron.exe'))
const runtimeVersion = (await fs.readFile(path.join(electronDist, 'version'), 'utf8')).trim()
if (runtimeVersion !== '42.11.18') throw new Error('工作台固定使用已核验的 Electron 42.11.18 x64')
const runtimeHashes = {
  'electron.exe': 'd91b374ab299b88d406e7e2b6865445a3d795d141a8a36cf2c05b4ec02d0ca4d',
  'd3dcompiler_47.dll': 'a05f99734f7c4822fefc12b367af21fd0976ed6608752fb1e1e80b6ece7ecbbb',
  'dxcompiler.dll': 'b25b6c8bc64c9ff17ed16e0d272bf0bd7b305f3e19f792a72c8145a6bf624584',
  'dxil.dll': '77e039c905030a641e53658a008b74e90635a5ea9b6b79eabd0f2003bdfca59a',
  'ffmpeg.dll': '1b9d751721a40fc8fba2355172382d0e0c210e54c7f2862ebd8a6b6a093f832f',
  'libEGL.dll': 'fa8cf715db0e2a7a0f20a2b583221e439c484390b400ec70ff5956ea70d55aae',
  'libGLESv2.dll': 'b6548524109b605155fcccccac8836c3d29dde3f1f6337f67a2bfb7931b9e0a0',
  'vk_swiftshader.dll': '4bd642ea08bd933014cd5c44911c4422bd6f69c8569f494de79054536a6469e0',
  'vulkan-1.dll': '95785b9eb4ca4cca1a140041042f6007be1cbe08b4ad537b7b52ccc3d3939124',
}
for (const [name, expected] of Object.entries(runtimeHashes)) {
  const data = await fs.readFile(path.join(electronDist, name))
  if (crypto.createHash('sha256').update(data).digest('hex') !== expected) throw new Error(`运行时与已核验官方归档不一致：${name}`)
}
const redistUrl = 'https://aka.ms/vs/17/release/14.44.35211/VC_redist.x64.exe'
const redistSha256 = 'cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b'
const redistResponse = await fetch(redistUrl)
if (!redistResponse.ok || new URL(redistResponse.url).hostname !== 'download.visualstudio.microsoft.com') {
  throw new Error('无法从 Microsoft 官方地址获取 VC++ 运行库。')
}
const redistBytes = Buffer.from(await redistResponse.arrayBuffer())
if (crypto.createHash('sha256').update(redistBytes).digest('hex') !== redistSha256) {
  throw new Error('Microsoft VC++ 运行库校验失败，拒绝打包。')
}
const buildTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'tangmen-vc-redist-'))
const redistPath = path.join(buildTemp, 'vc_redist_x64.exe')
await fs.writeFile(redistPath, redistBytes)
try {
await build({
  projectDir: root,
  targets: Platform.WINDOWS.createTarget(process.argv.includes('--dir') ? ['dir'] : ['nsis', 'portable'], Arch.x64),
  publish: 'never',
  config: {
    electronDist,
    electronVersion: runtimeVersion,
    appId: 'cn.tsai.aigcworkbench.student',
    extraMetadata: { name: 'tangmen-aigc-student', version },
    extraResources: [
      { from: 'resources/comfyui-workflows', to: 'comfyui-workflows' },
      { from: 'resources/claude-plugin', to: 'claude-plugin' },
      { from: 'resources/diagnostics', to: 'diagnostics' },
    ],
    asarUnpack: [
      'node_modules/@anthropic-ai/claude-agent-sdk-*/**',
      'node_modules/@openai/codex-*/**',
    ],
    nsis: {
      include: path.join(root, 'resources/installer.nsh'),
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      deleteAppDataOnUninstall: false,
      shortcutName: '唐门AIGC工作台',
    },
    afterPack: async context => {
      await fs.mkdir(path.join(context.appOutDir, 'resources'), { recursive: true })
      await fs.copyFile(redistPath, path.join(context.appOutDir, 'resources/vc_redist_x64.exe'))
    },
    directories: { output: `release/${version}-student${buildTag ? `-${buildTag}` : ''}` },
    files: ['THIRD_PARTY_NOTICES.md', 'LICENSE', 'dist-electron', 'dist', '!dist/models/ue-mannequin-retopology.*'],
  },
})
} finally {
  await fs.rm(buildTemp, { recursive: true, force: true })
}
