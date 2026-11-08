export const IPC_CHANNELS = {
  app: {
    closeReady: 'app:closeReady',
  },
  project: {
    createConversation: 'project:createConversation',
    create: 'project:create',
    list: 'project:list',
    search: 'project:search',
    load: 'project:load',
    setAgent: 'project:setAgent',
    close: 'project:close',
    delete: 'project:delete',
    importAudio: 'project:importAudio',
    importMedia: 'project:importMedia',
    listMedia: 'project:listMedia',
  },
  chat: {
    generateMedia: 'chat:generateMedia',
    refreshMedia: 'chat:refreshMedia',
    sendMessage: 'chat:sendMessage',
    receiveMessage: 'chat:receiveMessage',
    loadHistory: 'chat:loadHistory',
    savePastedImage: 'chat:savePastedImage',
    saveTextAttachment: 'chat:saveTextAttachment',
    listSkills: 'chat:listSkills',
    listModels: 'chat:listModels',
    clearContext: 'chat:clearContext',
    interrupt: 'chat:interrupt',
    codexQueue: 'chat:codexQueue',
    codexSendNow: 'chat:codexSendNow',
  },
  canvas: {
    importDirectorModel: 'canvas:importDirectorModel',
    save: 'canvas:save',
    load: 'canvas:load',
    saveDirectorStill: 'canvas:saveDirectorStill',
    saveDirectorVideo: 'canvas:saveDirectorVideo',
    saveImageEdit: 'canvas:saveImageEdit',
    saveBoardPreview: 'canvas:saveBoardPreview',
    commandResult: 'canvas:commandResult',
  },
  artifact: {
    push: 'artifact:push',
    save: 'artifact:save',
  },
  comfyui: {
    listGenerationTasks: 'comfyui:listGenerationTasks',
    acknowledgeGenerationTask: 'comfyui:acknowledgeGenerationTask',
    dismissGenerationTask: 'comfyui:dismissGenerationTask',
    listWorkflows: 'comfyui:listWorkflows',
    generateImage: 'comfyui:generateImage',
    generateVideo: 'comfyui:generateVideo',
    extractVideoAudio: 'comfyui:extractVideoAudio',
    upscaleVideo: 'comfyui:upscaleVideo',
  },
  settings: {
    discoverServiceModels: 'settings:discoverServiceModels',
    discoverServiceModelCatalog: 'settings:discoverServiceModelCatalog',
    get: 'settings:get',
    save: 'settings:save',
    testComfyUI: 'settings:testComfyUI',
    testQwen: 'settings:testQwen',
    testGoogleAi: 'settings:testGoogleAi',
    testSeedream: 'settings:testSeedream',
    listLunaModels: 'settings:listLunaModels',
  },
  push: {
    beforeClose: 'app:beforeClose',
    closeCancelled: 'app:closeCancelled',
    chatMessage: 'chat:receiveMessage',
    artifact: 'artifact:receive',
    turnEnd: 'chat:turnEnd',
    canvasCommand: 'canvas:command',
  },
} as const;

export type IpcChannel =
  | (typeof IPC_CHANNELS.app)[keyof typeof IPC_CHANNELS.app]
  | (typeof IPC_CHANNELS.project)[keyof typeof IPC_CHANNELS.project]
  | (typeof IPC_CHANNELS.chat)[keyof typeof IPC_CHANNELS.chat]
  | (typeof IPC_CHANNELS.canvas)[keyof typeof IPC_CHANNELS.canvas]
  | (typeof IPC_CHANNELS.artifact)[keyof typeof IPC_CHANNELS.artifact]
  | (typeof IPC_CHANNELS.comfyui)[keyof typeof IPC_CHANNELS.comfyui]
  | (typeof IPC_CHANNELS.settings)[keyof typeof IPC_CHANNELS.settings]
  | (typeof IPC_CHANNELS.push)[keyof typeof IPC_CHANNELS.push];
