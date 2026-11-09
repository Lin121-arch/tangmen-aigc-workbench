import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('student startup safety', () => {
  test('native agent SDKs are not statically imported by startup services', () => {
    const startupSources = [
      read('electron/main/services/agent/models.ts'),
      read('electron/main/services/agent/session-manager.ts'),
      read('electron/main/services/agent/tools.ts'),
      read('electron/main/services/agent/codex-session.ts'),
    ].join('\n')

    expect(startupSources).not.toMatch(/import\s+(?!type\s)[^;]*from\s+['"]@anthropic-ai\/claude-agent-sdk['"]/)
    expect(startupSources).not.toMatch(/import\s+(?!type\s)[^;]*from\s+['"]@openai\/codex-sdk['"]/)
    expect(startupSources).toMatch(/import\(['"]@anthropic-ai\/claude-agent-sdk['"]\)/)
    expect(startupSources).toMatch(/import\(['"]@openai\/codex-sdk['"]\)/)
  })

  test('diagnostic startup logging has a stable local app-data target', () => {
    const source = read('electron/main/startup-diagnostics.ts')
    expect(source).toContain('LOCALAPPDATA')
    expect(source).toContain('tangmen-aigc')
    expect(source).toContain('logs')
    expect(source).toContain('uncaughtException')
    expect(source).toContain('unhandledRejection')
  })

  test('Windows diagnostic launcher remains compatible with PowerShell 5.1', () => {
    const source = read('resources/diagnostics/launch-student-diagnostic.ps1')
    expect(source).not.toMatch(/\?\s*['"][^:]+['"]\s*:/)
    expect(source).toContain('Get-WinEvent')
    expect(source).toContain('ExitCode')
  })

  test('Windows build downloads and verifies the official redistributable before packaging', () => {
    const source = read('scripts/build-student-release.mjs')
    expect(source.match(/\n\s*nsis:\s*\{/g)?.length).toBe(1)
    expect(source).toContain("include: path.join(root, 'resources/installer.nsh')")
    expect(source).toContain('https://aka.ms/vs/17/release/14.44.35211/VC_redist.x64.exe')
    expect(source).toContain('cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b')
    expect(source).toContain("new URL(redistResponse.url).hostname !== 'download.visualstudio.microsoft.com'")
    expect(source).toContain("vc_redist_x64.exe'))")
    expect(source).toContain("afterPack: async context =>")
    expect(source).toContain("shortcutName: '唐门AIGC工作台'")
    expect(JSON.parse(read('electron-builder.json')).productName).toBe('唐门AIGC工作台')
  })

  test('installer runs the bundled redistributable silently and stops on installation errors', () => {
    const source = read('resources/installer.nsh')
    expect(source).toContain('vc_redist_x64.exe" /install /quiet /norestart')
    expect(source).toContain('IntCmp $0 3010 vcRuntimeReady')
    expect(source).toContain('Abort')
  })
})
