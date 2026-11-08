import { _electron as electron, chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import * as asar from '@electron/asar'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'

const [exeArg, outputArg, label = 'installed'] = process.argv.slice(2)
if (!exeArg || !outputArg) throw new Error('Usage: node verify-student-artifact.mjs <exe> <evidence-folder> <label>')
const exe = path.resolve(exeArg), output = path.resolve(outputArg)
await fs.mkdir(output, { recursive: true })
const defaultProfile = label === 'default-profile'
const profile = defaultProfile ? path.join(process.env.APPDATA, 'tangmen-aigc-student') : await fs.mkdtemp(path.join(os.tmpdir(), 'TangmenStudentAcceptance-'))
if (defaultProfile) await fs.access(profile).then(() => { throw new Error('Default profile already exists; do not overwrite user data') }, error => { if (error.code !== 'ENOENT') throw error })
const env = { ...process.env, LUNA_API_KEY: 'teacher-env-sentinel-never-inherit', ANTHROPIC_BASE_URL: 'https://teacher-private.example/v1', ANTHROPIC_API_KEY: 'teacher-env-sentinel-never-inherit' }
let app, browser, portableProcess, page
if (label === 'portable') {
  // NSIS hides child stdout, so Electron's inspector discovery cannot attach through this wrapper.
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  portableProcess = spawn(exe, ['--user-data-dir=' + profile, '--remote-debugging-port=' + port], { env, stdio: 'ignore', windowsHide: true })
  const deadline = Date.now() + 120000
  while (!browser && Date.now() < deadline) {
    if (portableProcess.exitCode !== null) throw new Error('Portable exited: ' + portableProcess.exitCode)
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }) } catch { await new Promise(resolve => setTimeout(resolve, 500)) }
  }
  if (!browser) throw new Error('Portable did not expose its actual window within 120 seconds')
  page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].waitForEvent('page')
} else {
  app = await electron.launch({ executablePath: exe, args: defaultProfile ? [] : ['--user-data-dir=' + profile], env, timeout: 90000 })
  page = await app.firstWindow()
}
const errors = []
let results
try {
  page.on('pageerror', e => errors.push(e.message))
  await page.waitForFunction(() => !!window.electronAPI, null, { timeout: 60000 })
  await expect(page.getByText('今天，想创作什么？', { exact: true })).toBeVisible({ timeout: 60000 })
  await expect(page.locator('.aigc-startup')).toHaveCount(0)
  let application
  if (app) application = await app.evaluate(({ app }) => ({ version: app.getVersion(), name: app.getName(), isPackaged: app.isPackaged, exe: app.getPath('exe'), userData: app.getPath('userData') }))
  else {
    const loadedFile = fileURLToPath(page.url().split('?')[0])
    const archive = loadedFile.slice(0, loadedFile.indexOf('app.asar') + 'app.asar'.length)
    assert.ok(archive.endsWith('resources' + path.sep + 'app.asar'))
    const metadata = JSON.parse(asar.extractFile(archive, 'package.json'))
    application = { version: metadata.version, name: metadata.name, isPackaged: true, metadataSource: 'ASAR actually loaded by Portable', exe: path.join(path.dirname(path.dirname(archive)), '唐门AIGC工作台.exe'), wrapper: exe, userData: profile, payloadAsarSha256: crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex') }
  }
  assert.equal(application.version, '0.1.2'); assert.equal(application.isPackaged, true)
  const baseline = JSON.parse(await fs.readFile(path.join(path.dirname(output), '包内隐私与架构审查_最终成品.json'), 'utf8'))
  assert.equal(baseline.passed, true)
  let payloadFileCount = 0
  for (const file of baseline.files) {
    const actual = path.join(path.dirname(application.exe), file.file)
    if (label === 'portable' && file.file === 'resources/elevate.exe') continue
    const hash = crypto.createHash('sha256').update(await fs.readFile(actual)).digest('hex')
    assert.equal(hash, file.sha256, 'Installed or extracted payload differs: ' + file.file)
    payloadFileCount++
  }
  application.payloadFileCount = payloadFileCount
  application.payloadHashesMatchAuditedDirectory = true
  const settings = await page.evaluate(() => window.electronAPI.getAppSettings())
  for (const name of ['relayAgentBaseUrl', 'comfyuiBaseUrl', 'agentBaseUrl', 'qwenBaseUrl', 'seedreamBaseUrl', 'lunaBaseUrl']) assert.equal(settings[name], '', name)
  assert.equal(settings.relayVideoConfig.baseUrl, '')
  assert.deepEqual(settings.modelServices.providers, [])
  assert.deepEqual(settings.modelServices.defaults, {})
  for (const [name, value] of Object.entries(settings)) if (name.endsWith('Configured')) assert.equal(value, false, name)
  const index = await page.evaluate(() => window.electronAPI.listProjects())
  assert.equal(index.projects.length, 1)
  const project = index.projects[0]
  const actualProfile = await fs.realpath(profile)
  const actualProject = await fs.realpath(project.folderPath)
  const relativeProject = path.relative(actualProfile, actualProject)
  assert.ok(relativeProject && !relativeProject.startsWith('..') && !path.isAbsolute(relativeProject), 'Project must stay within the isolated profile')
  const history = await page.evaluate(folder => window.electronAPI.loadChatHistory(folder), project.folderPath)
  const snapshot = await page.evaluate(folder => window.electronAPI.loadCanvasSnapshot(folder), project.folderPath)
  assert.deepEqual(history, [])
  assert.equal(snapshot?.nodes?.length || 0, 0); assert.equal(snapshot?.edges?.length || 0, 0)
  await page.screenshot({ path: path.join(output, label + '-01-首次启动空会话.png') })
  await page.getByRole('button', { name: '模型与设置', exact: true }).click()
  await expect(page.getByRole('region', { name: '模型服务', exact: true })).toContainText('从你已有的模型服务开始')
  await page.screenshot({ path: path.join(output, label + '-02-模型服务为空.png') })
  await page.getByTitle('返回首页', { exact: true }).click()
  await page.getByRole('button', { name: '智能对话', exact: true }).click()
  await page.getByRole('button', { name: '无限画布', exact: true }).click()
  await expect(page.locator('.react-flow')).toBeVisible()
  assert.equal(await page.locator('.react-flow__node').count(), 0)
  await page.screenshot({ path: path.join(output, label + '-03-画布为空.png') })
  results = { checkedAt: new Date().toISOString(), label, os: { platform: os.platform(), release: os.release(), arch: os.arch() }, application, profile, settings, projectCount: index.projects.length, historicalMessageCount: history.length, canvasNodeCount: snapshot?.nodes?.length || 0, canvasEdgeCount: snapshot?.edges?.length || 0, errors, passed: true }
  assert.deepEqual(errors, [])
} finally {
  if (app) await app.close()
  if (browser) {
    const session = await browser.newBrowserCDPSession()
    await Promise.race([session.send('Browser.close').catch(() => undefined), new Promise(resolve => setTimeout(resolve, 1000))])
    await Promise.race([browser.close().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 1000))])
  }
}
if (portableProcess) {
  if (portableProcess.exitCode === null) await Promise.race([new Promise(resolve => portableProcess.once('exit', resolve)), new Promise((_, reject) => setTimeout(() => reject(new Error('Portable did not close within 10 seconds')), 10000))])
  assert.equal(portableProcess.exitCode, 0, 'Portable must close with code 0')
  results.normalExitCode = portableProcess.exitCode
}
await fs.writeFile(path.join(output, label + '-空数据验收.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify({ passed: true, label, application: results.application, normalExitCode: results.normalExitCode, evidence: output }))
