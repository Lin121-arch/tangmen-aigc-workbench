import { ipcMain } from 'electron'
import { discoverServiceModels, discoverServiceModelCatalog } from '../services/model-services.store'
import type { ModelProvider } from '../../../src/shared/model-services'
import { IPC_CHANNELS } from '../../../src/shared/ipc.channels'
import type { SaveAppSettingsRequest, TestGoogleAiConnectionRequest, TestQwenConnectionRequest, TestSeedreamConnectionRequest, LunaModelsRequest, LunaModelsResult } from '../../../src/shared/ipc.types'
import {
  getAppSettingsView,
  getRuntimeSettings,
  saveAppSettings,
  testComfyUIConnection,
  testGoogleAiConnection,
  testQwenConnection,
  testSeedreamConnection,
} from '../services/settings.service'
import { queryLunaModels } from '../services/luna-image.service'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.settings.discoverServiceModels, (_event, provider: ModelProvider, endpointId: string) => discoverServiceModels(provider, endpointId))
  ipcMain.handle(IPC_CHANNELS.settings.discoverServiceModelCatalog, (_event, provider: ModelProvider, endpointId: string) => discoverServiceModelCatalog(provider, endpointId))
  ipcMain.handle(IPC_CHANNELS.settings.get, () => getAppSettingsView())
  ipcMain.handle(IPC_CHANNELS.settings.listLunaModels, async (_event, request: LunaModelsRequest): Promise<LunaModelsResult> => {
    try {
      const settings = await getRuntimeSettings()
      const models = await queryLunaModels(request.baseUrl, request.apiKey?.trim() || settings.lunaApiKey)
      return { success: true, message: `已读取 ${models.length} 个批量生图模型；未提交生成任务`, models }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '读取 Luna 模型失败', models: [] }
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.settings.save,
    (_event, request: SaveAppSettingsRequest) => saveAppSettings(request),
  )
  ipcMain.handle(
    IPC_CHANNELS.settings.testComfyUI,
    (_event, baseUrl: string) => testComfyUIConnection(baseUrl),
  )
  ipcMain.handle(
    IPC_CHANNELS.settings.testQwen,
    (_event, request: TestQwenConnectionRequest) => testQwenConnection(request),
  )
  ipcMain.handle(
    IPC_CHANNELS.settings.testGoogleAi,
    (_event, request: TestGoogleAiConnectionRequest) => testGoogleAiConnection(request),
  )
  ipcMain.handle(
    IPC_CHANNELS.settings.testSeedream,
    (_event, request: TestSeedreamConnectionRequest) => testSeedreamConnection(request),
  )
}
