import log from 'electron-log/main'
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function getStartupLogDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA
    || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(localAppData, 'tangmen-aigc', 'logs')
}

export function initializeStartupDiagnostics(): void {
  const directory = getStartupLogDirectory()
  fs.mkdirSync(directory, { recursive: true })
  log.transports.file.resolvePathFn = () => path.join(directory, 'main.log')
  log.initialize()
  process.on('uncaughtException', error => {
    log.error('[Startup] uncaughtException', error)
    app.exit(1)
  })
  process.on('unhandledRejection', reason => {
    log.error('[Startup] unhandledRejection', reason)
  })
  log.info('[Startup] diagnostics initialized', {
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    versions: process.versions,
    execPath: process.execPath,
    logPath: path.join(directory, 'main.log'),
  })
}
