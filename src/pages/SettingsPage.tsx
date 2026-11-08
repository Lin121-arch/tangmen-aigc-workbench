import { useEffect, useMemo, useState } from 'react';
import type { AppSettingsView, ComfyWorkflowInfo } from '../shared/ipc.types';
import { useAppStore } from '../stores/app.store';
import { listCachedComfyWorkflows } from '../shared/comfy-workflows';
import { registerEditFlusher, UnsavedSettingsError } from '../shared/pending-edits';
import { DEFAULT_LUNA_BASE_URL } from '../shared/luna-config';
import { DEFAULT_RELAY_VIDEO_CONFIG, type RelayVideoConfig } from '../shared/relay-video-config';
import { RelayVideoSettings } from '../components/RelayVideoSettings';
import { DEFAULT_RELAY_AGENT_BASE_URL } from '../shared/relay-agent-config';
import { ModelServicesSettings } from '../components/ModelServicesSettings';
import { emptyModelServices, type ModelServicesConfig } from '../shared/model-services';

const fieldClass = 'w-full rounded-lg border border-white/[0.1] bg-[#09090e] px-3.5 py-3 text-sm text-[#e8e6df] outline-none transition placeholder:text-[#4f4c59] focus:border-[#d4af37]/60 focus:ring-2 focus:ring-[#d4af37]/10';
const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_SEEDREAM_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

function hasQwenSettingsSupport(settings: AppSettingsView): boolean {
  return typeof settings.qwenBaseUrl === 'string'
    && typeof settings.qwenApiKey === 'string'
    && typeof settings.qwenApiKeyConfigured === 'boolean';
}

function hasGoogleAiSettingsSupport(settings: AppSettingsView): boolean {
  return typeof settings.googleAiApiKey === 'string'
    && typeof settings.googleAiApiKeyConfigured === 'boolean'
    && typeof settings.googleAiProxyUrl === 'string';
}

function hasSeedreamSettingsSupport(settings: AppSettingsView): boolean {
  return typeof settings.seedreamBaseUrl === 'string'
    && typeof settings.seedreamApiKey === 'string'
    && typeof settings.seedreamApiKeyConfigured === 'boolean';
}

export function SettingsPage() {
  const [modelServices, setModelServices] = useState<ModelServicesConfig>(emptyModelServices);
  const [relayAgentBaseUrl, setRelayAgentBaseUrl] = useState(DEFAULT_RELAY_AGENT_BASE_URL);
  const [relayAgentModel, setRelayAgentModel] = useState('');
  const [relayAgentApiKey, setRelayAgentApiKey] = useState('');
  const [clearRelayAgentApiKey, setClearRelayAgentApiKey] = useState(false);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const [workflows, setWorkflows] = useState<ComfyWorkflowInfo[]>([]);
  const [savedSettings, setSavedSettings] = useState<AppSettingsView | null>(null);
  const [comfyuiBaseUrl, setComfyuiBaseUrl] = useState('http://127.0.0.1:8188');
  const [qwenBaseUrl, setQwenBaseUrl] = useState(DEFAULT_QWEN_BASE_URL);
  const [qwenApiKey, setQwenApiKey] = useState('');
  const [showQwenApiKey, setShowQwenApiKey] = useState(false);
  const [clearQwenApiKey, setClearQwenApiKey] = useState(false);
  const [googleAiApiKey, setGoogleAiApiKey] = useState('');
  const [showGoogleAiApiKey, setShowGoogleAiApiKey] = useState(false);
  const [clearGoogleAiApiKey, setClearGoogleAiApiKey] = useState(false);
  const [googleAiProxyUrl, setGoogleAiProxyUrl] = useState('');
  const [seedreamBaseUrl, setSeedreamBaseUrl] = useState(DEFAULT_SEEDREAM_BASE_URL);
  const [seedreamApiKey, setSeedreamApiKey] = useState('');
  const [showSeedreamApiKey, setShowSeedreamApiKey] = useState(false);
  const [clearSeedreamApiKey, setClearSeedreamApiKey] = useState(false);
  const [lunaBaseUrl, setLunaBaseUrl] = useState(DEFAULT_LUNA_BASE_URL);
  const [lunaApiKey, setLunaApiKey] = useState('');
  const [clearLunaApiKey, setClearLunaApiKey] = useState(false);
  const [lunaImageModel, setLunaImageModel] = useState('');
  const [relayVideoConfig, setRelayVideoConfig] = useState<RelayVideoConfig>(DEFAULT_RELAY_VIDEO_CONFIG);
  const [relayVideoApiKey, setRelayVideoApiKey] = useState('');
  const [clearRelayVideoApiKey, setClearRelayVideoApiKey] = useState(false);
  const [lunaModels, setLunaModels] = useState<string[]>([]);
  const [loadingLunaModels, setLoadingLunaModels] = useState(false);
  const [lunaResult, setLunaResult] = useState<{ success: boolean; message: string } | null>(null);
  const [defaultImageWorkflowId, setDefaultImageWorkflowId] = useState('krea2-turbo-t2i');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingQwen, setTestingQwen] = useState(false);
  const [testingGoogleAi, setTestingGoogleAi] = useState(false);
  const [testingSeedream, setTestingSeedream] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [qwenTestResult, setQwenTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [googleAiTestResult, setGoogleAiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [seedreamTestResult, setSeedreamTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const dirty = !!savedSettings && (
    JSON.stringify(modelServices) !== JSON.stringify(savedSettings.modelServices ?? emptyModelServices()) ||
    relayAgentBaseUrl !== (savedSettings.relayAgentBaseUrl ?? DEFAULT_RELAY_AGENT_BASE_URL)
    || relayAgentModel !== (savedSettings.relayAgentModel ?? '') || !!relayAgentApiKey || clearRelayAgentApiKey ||
    comfyuiBaseUrl !== savedSettings.comfyuiBaseUrl || qwenBaseUrl !== savedSettings.qwenBaseUrl
    || qwenApiKey !== savedSettings.qwenApiKey || googleAiApiKey !== savedSettings.googleAiApiKey
    || googleAiProxyUrl !== savedSettings.googleAiProxyUrl || seedreamBaseUrl !== savedSettings.seedreamBaseUrl
    || seedreamApiKey !== savedSettings.seedreamApiKey || defaultImageWorkflowId !== savedSettings.defaultImageWorkflowId
    || clearQwenApiKey || clearGoogleAiApiKey || clearSeedreamApiKey
    || lunaBaseUrl !== (savedSettings.lunaBaseUrl ?? DEFAULT_LUNA_BASE_URL)
    || lunaImageModel !== (savedSettings.lunaImageModel ?? '') || !!lunaApiKey || clearLunaApiKey
    || JSON.stringify(relayVideoConfig) !== JSON.stringify(savedSettings.relayVideoConfig ?? DEFAULT_RELAY_VIDEO_CONFIG)
    || !!relayVideoApiKey || clearRelayVideoApiKey
  );
  useEffect(() => {
    Promise.all([window.electronAPI.getAppSettings(), listCachedComfyWorkflows(true)])
      .then(([settings, availableWorkflows]) => {
        const qwenSettingsSupported = hasQwenSettingsSupport(settings);
        const googleAiSettingsSupported = hasGoogleAiSettingsSupport(settings);
        const seedreamSettingsSupported = hasSeedreamSettingsSupport(settings);
        setSavedSettings(settings);
        setModelServices(settings.modelServices ?? emptyModelServices());
        setRelayAgentBaseUrl(settings.relayAgentBaseUrl ?? DEFAULT_RELAY_AGENT_BASE_URL);
        setRelayAgentModel(settings.relayAgentModel ?? '');
        setComfyuiBaseUrl(settings.comfyuiBaseUrl);
        setQwenBaseUrl(qwenSettingsSupported ? settings.qwenBaseUrl : DEFAULT_QWEN_BASE_URL);
        setQwenApiKey(qwenSettingsSupported ? settings.qwenApiKey : '');
        setGoogleAiApiKey(googleAiSettingsSupported ? settings.googleAiApiKey : '');
        setGoogleAiProxyUrl(googleAiSettingsSupported ? settings.googleAiProxyUrl : '');
        setSeedreamBaseUrl(seedreamSettingsSupported ? settings.seedreamBaseUrl : DEFAULT_SEEDREAM_BASE_URL);
        setSeedreamApiKey(seedreamSettingsSupported ? settings.seedreamApiKey : '');
        setLunaBaseUrl(settings.lunaBaseUrl ?? DEFAULT_LUNA_BASE_URL);
        setLunaImageModel(settings.lunaImageModel ?? '');
        setRelayVideoConfig(settings.relayVideoConfig ?? DEFAULT_RELAY_VIDEO_CONFIG);
        setDefaultImageWorkflowId(settings.defaultImageWorkflowId);
        setWorkflows(availableWorkflows);
        if (!qwenSettingsSupported || !googleAiSettingsSupported || !seedreamSettingsSupported) {
          setNotice('检测到 Electron 主进程仍是旧版本，新配置暂时无法保存。请完全退出应用后重新启动。');
        }
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : '设置加载失败，请重试'))
      .finally(() => setLoading(false));
  }, []);

  const textToImageWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.kind === 'text-to-image'),
    [workflows],
  );

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await window.electronAPI.testComfyUIConnection(comfyuiBaseUrl));
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : '连接测试失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice('');
    try {
      await window.electronAPI.saveAppSettings({
        modelServices,
        relayAgentBaseUrl, relayAgentModel, relayAgentApiKey: relayAgentApiKey.trim() || undefined, clearRelayAgentApiKey,
        comfyuiBaseUrl,
        qwenBaseUrl,
        defaultImageWorkflowId,
        qwenApiKey: qwenApiKey.trim() || undefined,
        clearQwenApiKey,
        googleAiApiKey: googleAiApiKey.trim() || undefined,
        clearGoogleAiApiKey,
        googleAiProxyUrl,
        seedreamBaseUrl,
        seedreamApiKey: seedreamApiKey.trim() || undefined,
        clearSeedreamApiKey,
        lunaBaseUrl,
        lunaImageModel,
        lunaApiKey: lunaApiKey.trim() || undefined,
        clearLunaApiKey,
        relayVideoConfig,
        relayVideoApiKey: relayVideoApiKey.trim() || undefined,
        clearRelayVideoApiKey,
      });
      // Verify through a second IPC read so the UI reflects what actually reached disk,
      // rather than trusting only the save handler's immediate return value.
      const next = await window.electronAPI.getAppSettings();
      if (typeof next.relayAgentApiKeyConfigured !== 'boolean') throw new Error('主进程未接收创作助手配置，请完全重启工作台。');
      if (!clearRelayAgentApiKey && relayAgentApiKey.trim() && !next.relayAgentApiKeyConfigured) throw new Error('创作助手密钥保存后校验失败，输入内容已保留。');
      if (!next.relayVideoConfig || typeof next.relayVideoApiKeyConfigured !== 'boolean') throw new Error('主进程未接收视频配置，请完全重启工作台。');
      if (!clearRelayVideoApiKey && relayVideoApiKey.trim() && !next.relayVideoApiKeyConfigured) throw new Error('视频密钥保存后校验失败，输入内容已保留。');
      if (typeof next.lunaApiKeyConfigured !== 'boolean' || typeof next.lunaBaseUrl !== 'string') {
        throw new Error('主进程未接收 Luna 配置，请完全退出工作台后重新启动。');
      }
      if (!clearLunaApiKey && lunaApiKey.trim() && !next.lunaApiKeyConfigured) {
        throw new Error('Luna API Key 保存后校验失败，输入内容已保留。');
      }
      if (!hasQwenSettingsSupport(next)) {
        throw new Error('Electron 主进程仍是旧版本，未接收 Qwen 配置。请完全退出应用后重新启动，再重新保存。');
      }
      if (!hasGoogleAiSettingsSupport(next)) {
        throw new Error('Electron 主进程仍是旧版本，未接收 Google AI 配置。请完全退出应用后重新启动，再重新保存。');
      }
      if (!hasSeedreamSettingsSupport(next)) {
        throw new Error('Electron 主进程仍是旧版本，未接收 Seedream 配置。请完全退出应用后重新启动，再重新保存。');
      }
      if (qwenApiKey.trim() && !next.qwenApiKeyConfigured) {
        throw new Error('Qwen API Key 保存后校验失败，输入内容已保留，请重试。');
      }
      if (googleAiApiKey.trim() && !next.googleAiApiKeyConfigured) {
        throw new Error('Google AI Studio API Key 保存后校验失败，输入内容已保留，请重试。');
      }
      if (seedreamApiKey.trim() && !next.seedreamApiKeyConfigured) {
        throw new Error('Seedream API Key 保存后校验失败，输入内容已保留，请重试。');
      }
      setSavedSettings(next);
      setModelServices(next.modelServices ?? emptyModelServices());
      setRelayAgentBaseUrl(next.relayAgentBaseUrl ?? DEFAULT_RELAY_AGENT_BASE_URL);
      setRelayAgentModel(next.relayAgentModel ?? '');
      setRelayAgentApiKey(''); setClearRelayAgentApiKey(false);
      setComfyuiBaseUrl(next.comfyuiBaseUrl);
      setQwenBaseUrl(next.qwenBaseUrl);
      setDefaultImageWorkflowId(next.defaultImageWorkflowId);
      setQwenApiKey(next.qwenApiKey);
      setClearQwenApiKey(false);
      setGoogleAiApiKey(next.googleAiApiKey);
      setClearGoogleAiApiKey(false);
      setGoogleAiProxyUrl(next.googleAiProxyUrl);
      setSeedreamBaseUrl(next.seedreamBaseUrl);
      setSeedreamApiKey(next.seedreamApiKey);
      setClearSeedreamApiKey(false);
      setLunaBaseUrl(next.lunaBaseUrl ?? DEFAULT_LUNA_BASE_URL);
      setLunaImageModel(next.lunaImageModel ?? '');
      setLunaApiKey('');
      setClearLunaApiKey(false);
      setRelayVideoConfig(next.relayVideoConfig ?? DEFAULT_RELAY_VIDEO_CONFIG);
      setRelayVideoApiKey('');
      setClearRelayVideoApiKey(false);
      setWorkflows(await listCachedComfyWorkflows(true));
      setNotice(next.relayAgentApiKeyConfigured || next.qwenApiKeyConfigured || next.googleAiApiKeyConfigured || next.seedreamApiKeyConfigured || next.lunaApiKeyConfigured || next.relayVideoApiKeyConfigured
        ? '配置已保存，API Key 持久化校验通过'
        : '配置已保存，将在下一次生成或 Agent 对话时生效');
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => registerEditFlusher(async (options) => {
    if (!dirty || options?.settingsAction === 'discard') return;
    if (options?.settingsAction === 'save') {
      if (!await handleSave()) throw new Error('配置保存失败，修改仍保留在当前页面，请检查提示后重试。');
      return;
    }
    throw new UnsavedSettingsError('系统配置有未保存修改。');
  }, 5), [dirty, handleSave]);

  const handleQwenTest = async () => {
    setTestingQwen(true);
    setQwenTestResult(null);
    try {
      setQwenTestResult(await window.electronAPI.testQwenConnection({
        baseUrl: qwenBaseUrl,
        apiKey: qwenApiKey.trim() || undefined,
      }));
    } catch (error) {
      setQwenTestResult({ success: false, message: error instanceof Error ? error.message : '连接测试失败' });
    } finally {
      setTestingQwen(false);
    }
  };

  const handleLunaModels = async () => {
    setLoadingLunaModels(true);
    setLunaResult(null);
    try {
      const result = await window.electronAPI.listLunaModels({ baseUrl: lunaBaseUrl, apiKey: lunaApiKey.trim() || undefined });
      setLunaModels(result.models);
      setLunaResult(result);
      if (result.success && !result.models.includes(lunaImageModel)) setLunaImageModel(result.models[0] ?? '');
    } catch (error) {
      setLunaResult({ success: false, message: error instanceof Error ? error.message : '读取模型失败' });
    } finally { setLoadingLunaModels(false); }
  };

  const handleGoogleAiTest = async () => {
    setTestingGoogleAi(true);
    setGoogleAiTestResult(null);
    try {
      setGoogleAiTestResult(await window.electronAPI.testGoogleAiConnection({
        apiKey: googleAiApiKey.trim() || undefined,
        proxyUrl: googleAiProxyUrl,
      }));
    } catch (error) {
      setGoogleAiTestResult({ success: false, message: error instanceof Error ? error.message : '连接测试失败' });
    } finally {
      setTestingGoogleAi(false);
    }
  };

  const handleSeedreamTest = async () => {
    setTestingSeedream(true);
    setSeedreamTestResult(null);
    try {
      setSeedreamTestResult(await window.electronAPI.testSeedreamConnection({
        baseUrl: seedreamBaseUrl,
        apiKey: seedreamApiKey.trim() || undefined,
      }));
    } catch (error) {
      setSeedreamTestResult({ success: false, message: error instanceof Error ? error.message : '连接测试失败' });
    } finally {
      setTestingSeedream(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0a0f]">
      <header className="relative flex items-center justify-between border-b border-white/[0.08] bg-[#0d0d14] px-8 py-4">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/40 to-transparent" />
        <div className="flex items-center gap-4">
          <button onClick={() => dirty ? setLeaveOpen(true) : setCurrentPage('home')} className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-[#8a8794] transition hover:border-[#d4af37]/40 hover:text-[#e8c766]" title="返回首页">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="font-display text-lg font-semibold tracking-[0.22em] text-[#e8c766]">系统配置</h1>
            <p className="mt-1 text-xs text-[#9a97a3]">{dirty ? '有未保存修改' : '图片、视频与分析服务'}</p>
          </div>
        </div>
        {notice && <p role="status" aria-live="polite" className="mx-4 max-w-[50vw] text-xs leading-5 text-[#e8c766]">{notice}</p>}
        <button onClick={handleSave} disabled={saving || loading} className="shrink-0 rounded-lg border border-[#d4af37]/50 bg-gradient-to-b from-[#e8c766] to-[#b08d2a] px-6 py-2.5 text-[13px] font-semibold tracking-widest text-[#241a05] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? '保存中…' : '保存配置'}
        </button>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl space-y-5 px-6 py-8 lg:px-8">
          {!loading && <ModelServicesSettings value={modelServices} onChange={setModelServices} />}
          <h2 className="pt-3 text-sm font-medium text-[#b8b4c2]">其他服务与旧版连接（兼容已有项目）</h2>

          <div className="space-y-5">
            <div className="grid auto-rows-fr items-stretch gap-5 lg:grid-cols-1">
          <div className="lg:col-span-3">
            <SettingsCard title="唐门创作助手 · Agent 对话" description="沿用右侧聊天栏，通过对话编写脚本、整理提示词、创建并连接画布节点、保存创作文档。使用兼容 OpenAI Chat Completions 且支持工具调用的模型。">
              <div className="grid gap-5 md:grid-cols-3">
                <label className="text-xs text-[#a3a0ae]">API Base URL<input aria-label="创作助手 API 地址" className={`${fieldClass} mt-2`} value={relayAgentBaseUrl} onChange={event => setRelayAgentBaseUrl(event.target.value)} placeholder={DEFAULT_RELAY_AGENT_BASE_URL} spellCheck={false} /></label>
                <label className="text-xs text-[#a3a0ae]">对话模型 ID<input aria-label="创作助手模型 ID" className={`${fieldClass} mt-2`} value={relayAgentModel} onChange={event => setRelayAgentModel(event.target.value)} maxLength={200} placeholder="填写中转站实际支持的模型 ID" spellCheck={false} /></label>
                <div><label className="text-xs text-[#a3a0ae]">API Key {savedSettings?.relayAgentApiKeyConfigured && <span className="text-emerald-400">· 已配置</span>}<input aria-label="创作助手 API Key" type="password" className={`${fieldClass} mt-2`} value={relayAgentApiKey} onChange={event => { setRelayAgentApiKey(event.target.value); setClearRelayAgentApiKey(false); }} placeholder={savedSettings?.relayAgentApiKeyConfigured ? '留空保留原密钥，输入则替换' : '输入对话模型密钥'} autoComplete="off" spellCheck={false} /></label>
                  <label className="mt-3 flex items-center gap-2 text-xs text-[#8a8794]"><input aria-label="清除创作助手密钥" type="checkbox" checked={clearRelayAgentApiKey} onChange={event => { setClearRelayAgentApiKey(event.target.checked); if (event.target.checked) setRelayAgentApiKey(''); }} className="accent-[#d4af37]" />清除已保存的密钥</label>
                </div>
              </div>
              <p className="mt-4 text-xs leading-6 text-[#777482]">密钥由 Windows 安全存储加密；保存配置不会调用模型。图片和视频通过现有节点确认生成。每轮最多 8 个步骤，可随时停止；当前支持文本附件。</p>
            </SettingsCard>
          </div>
          <SettingsCard title="ComfyUI 服务" description="本地图片工作流、视频生成与视频放大请求发送到此服务器。修改后可先测试连接。">
            <label className="text-xs tracking-wider text-[#9a97a3]">HTTP 地址</label>
            <div className="mt-2 flex gap-3">
              <input aria-label="ComfyUI HTTP 地址" value={comfyuiBaseUrl} onChange={(event) => { setComfyuiBaseUrl(event.target.value); setTestResult(null); }} className={fieldClass} placeholder="http://127.0.0.1:8188" spellCheck={false} />
              <button onClick={handleTest} disabled={testing || !comfyuiBaseUrl.trim()} className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.05] px-5 text-sm text-[#d7d4cb] transition hover:border-[#d4af37]/40 hover:text-[#e8c766] disabled:opacity-40">
                {testing ? '测试中…' : '测试连接'}
              </button>
            </div>
            {testResult && <p className={`mt-2.5 text-xs ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>{testResult.message}</p>}
          </SettingsCard>



            </div>
            <div className="grid auto-rows-fr items-stretch gap-5 xl:grid-cols-3">

          <SettingsCard title="Qwen 音视频审查" description="固定使用 Qwen3.5-Omni Plus 同时理解视频画面、对白、环境音和音效，并输出带时间戳的审查报告。API Key 保存在本机，重新打开设置页时会自动回填。">
            <div className="grid gap-5">
              <div>
                <label className="text-xs tracking-wider text-[#9a97a3]">OpenAI 兼容 API 地址</label>
                <input aria-label="Qwen API 地址" value={qwenBaseUrl} onChange={(event) => { setQwenBaseUrl(event.target.value); setQwenTestResult(null); }} className={`${fieldClass} mt-2`} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" spellCheck={false} />
              </div>
              <div>
                <label className="text-xs tracking-wider text-[#9a97a3]">固定模型</label>
                <div className="mt-2 rounded-lg border border-[#d4af37]/20 bg-[#d4af37]/[0.06] px-3.5 py-3 font-mono text-sm text-[#e8c766]">qwen3.5-omni-plus</div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs tracking-wider text-[#9a97a3]">DASHSCOPE_API_KEY</label>
                  {savedSettings?.qwenApiKeyConfigured && !clearQwenApiKey && <span className="text-[11px] text-emerald-400">已安全配置</span>}
                </div>
                <div className="relative mt-2">
                  <input type={showQwenApiKey ? 'text' : 'password'} aria-label="Qwen API Key" value={qwenApiKey} onChange={(event) => { setQwenApiKey(event.target.value); setClearQwenApiKey(false); setQwenTestResult(null); }} className={`${fieldClass} pr-16`} placeholder="输入 API Key" autoComplete="off" spellCheck={false} />
                  <button type="button" onClick={() => setShowQwenApiKey((value) => !value)} className="absolute inset-y-0 right-0 px-4 text-xs text-[#777482] hover:text-[#e8c766]">{showQwenApiKey ? '隐藏' : '显示'}</button>
                </div>
                {savedSettings?.qwenApiKeyConfigured && (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#777482]">
                    <input type="checkbox" checked={clearQwenApiKey} onChange={(event) => { setClearQwenApiKey(event.target.checked); if (event.target.checked) setQwenApiKey(''); }} className="accent-[#d4af37]" />
                    清除已保存的 API Key
                  </label>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleQwenTest} disabled={testingQwen || !qwenBaseUrl.trim() || (clearQwenApiKey && !qwenApiKey.trim())} className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-5 py-2.5 text-sm text-[#d7d4cb] transition hover:border-[#d4af37]/40 hover:text-[#e8c766] disabled:opacity-40">
                  {testingQwen ? '测试中…' : '测试 Qwen 连接'}
                </button>
                {qwenTestResult && <p className={`text-xs ${qwenTestResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>{qwenTestResult.message}</p>}
              </div>
              <p className="text-[11px] leading-5 text-[#5f5c68]">审查服务固定使用 qwen3.5-omni-plus，同时理解画面与完整音轨。默认使用中国大陆 DashScope 端点；其他地域需填写与 API Key 所属地域一致的 Base URL。</p>
            </div>
          </SettingsCard>

          <SettingsCard title="Google AI 图片生成" description="Nano Banana 2 与 Nano Banana Pro 共用一个 Google AI Studio API Key；两个模型均以 2K 输出，并支持文生图和连接参考图后的图生图。">
            <div className="grid gap-5">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs tracking-wider text-[#9a97a3]">GEMINI_API_KEY</label>
                  {savedSettings?.googleAiApiKeyConfigured && !clearGoogleAiApiKey && <span className="text-[11px] text-emerald-400">已安全配置</span>}
                </div>
                <div className="relative mt-2">
                  <input type={showGoogleAiApiKey ? 'text' : 'password'} aria-label="Google AI Studio API Key" value={googleAiApiKey} onChange={(event) => { setGoogleAiApiKey(event.target.value); setClearGoogleAiApiKey(false); setGoogleAiTestResult(null); }} className={`${fieldClass} pr-16`} placeholder="输入 Google AI Studio API Key" autoComplete="off" spellCheck={false} />
                  <button type="button" onClick={() => setShowGoogleAiApiKey((value) => !value)} className="absolute inset-y-0 right-0 px-4 text-xs text-[#777482] hover:text-[#e8c766]">{showGoogleAiApiKey ? '隐藏' : '显示'}</button>
                </div>
                {savedSettings?.googleAiApiKeyConfigured && (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#777482]">
                    <input type="checkbox" checked={clearGoogleAiApiKey} onChange={(event) => { setClearGoogleAiApiKey(event.target.checked); if (event.target.checked) setGoogleAiApiKey(''); }} className="accent-[#d4af37]" />
                    清除已保存的 API Key
                  </label>
                )}
              </div>
              <div>
                <label className="text-xs tracking-wider text-[#9a97a3]">Google API 代理（可选）</label>
                <input aria-label="Google AI 代理地址" value={googleAiProxyUrl} onChange={(event) => { setGoogleAiProxyUrl(event.target.value); setGoogleAiTestResult(null); }} className={`${fieldClass} mt-2`} placeholder="例如 http://127.0.0.1:7890" spellCheck={false} />
                <p className="mt-2 text-[11px] leading-5 text-[#5f5c68]">留空时使用 Electron/系统网络配置；无法直连 Google 时可填写本地 HTTP、HTTPS 或 SOCKS 代理。</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleGoogleAiTest} disabled={testingGoogleAi || (clearGoogleAiApiKey && !googleAiApiKey.trim())} className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-5 py-2.5 text-sm text-[#d7d4cb] transition hover:border-[#d4af37]/40 hover:text-[#e8c766] disabled:opacity-40">
                  {testingGoogleAi ? '测试中…' : '测试 Google AI 连接'}
                </button>
                {googleAiTestResult && <p className={`text-xs ${googleAiTestResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>{googleAiTestResult.message}</p>}
              </div>
              <p className="text-[11px] leading-5 text-[#5f5c68]">调用 Google Gemini API：gemini-3.1-flash-image 与 gemini-3-pro-image。API Key 使用操作系统安全存储加密。</p>
            </div>
          </SettingsCard>

          <SettingsCard title="方舟图片 / 视频生成" description="使用同一套方舟 Base URL 与 API Key 调用 Seedream 5.0 图片生成和 Seedance 2.0 全模态视频生成；Agent Plan 使用专属地址与 Key。">
            <div className="grid gap-5">
              <div>
                <label className="text-xs tracking-wider text-[#9a97a3]">方舟 API Base URL</label>
                <input aria-label="火山方舟 API 地址" value={seedreamBaseUrl} onChange={(event) => { setSeedreamBaseUrl(event.target.value); setSeedreamTestResult(null); }} className={`${fieldClass} mt-2`} placeholder={DEFAULT_SEEDREAM_BASE_URL} spellCheck={false} />
                <p className="mt-2 text-[11px] leading-5 text-[#5f5c68]">普通 API 填 <span className="font-mono">…/api/v3</span>，Agent Plan 填 <span className="font-mono">…/api/plan/v3</span>；无需附加 <span className="font-mono">/images/generations</span>，粘贴完整地址时会自动移除。</p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs tracking-wider text-[#9a97a3]">ARK_API_KEY</label>
                  {savedSettings?.seedreamApiKeyConfigured && !clearSeedreamApiKey && <span className="text-[11px] text-emerald-400">已保存</span>}
                </div>
                <div className="relative mt-2">
                  <input type={showSeedreamApiKey ? 'text' : 'password'} aria-label="火山方舟 API Key" value={seedreamApiKey} onChange={(event) => { setSeedreamApiKey(event.target.value); setClearSeedreamApiKey(false); setSeedreamTestResult(null); }} className={`${fieldClass} pr-16`} placeholder="输入火山方舟 API Key" autoComplete="off" spellCheck={false} />
                  <button type="button" onClick={() => setShowSeedreamApiKey((value) => !value)} className="absolute inset-y-0 right-0 px-4 text-xs text-[#777482] hover:text-[#e8c766]">{showSeedreamApiKey ? '隐藏' : '显示'}</button>
                </div>
                {savedSettings?.seedreamApiKeyConfigured && (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#777482]">
                    <input type="checkbox" checked={clearSeedreamApiKey} onChange={(event) => { setClearSeedreamApiKey(event.target.checked); if (event.target.checked) setSeedreamApiKey(''); }} className="accent-[#d4af37]" />
                    清除已保存的 API Key
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleSeedreamTest} disabled={testingSeedream || !seedreamBaseUrl.trim() || (clearSeedreamApiKey && !seedreamApiKey.trim())} className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-5 py-2.5 text-sm text-[#d7d4cb] transition hover:border-[#d4af37]/40 hover:text-[#e8c766] disabled:opacity-40">
                  {testingSeedream ? '测试中…' : '测试方舟连接'}
                </button>
                {seedreamTestResult && <p className={`text-xs ${seedreamTestResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>{seedreamTestResult.message}</p>}
              </div>
              <p className="text-[11px] leading-5 text-[#5f5c68]">图片：Seedream 5.0 Pro / Lite；视频：Seedance 2.0（Agent Plan，720p、4–15 秒、同步音频）。API Key 明文保存在本机 settings.json，也可通过 ARK_API_KEY 环境变量提供。</p>
            </div>
          </SettingsCard>
            </div>
          </div>

          <SettingsCard title="Luna 中转 · 批量生图" description="使用 Luna 已公开的异步图片接口，结果直接回到画布。先读取当前 Key 可用的模型，再选择并保存。">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-xs tracking-wider text-[#9a97a3]">API Base URL</label>
                <input aria-label="Luna API 地址" value={lunaBaseUrl} onChange={event => { setLunaBaseUrl(event.target.value); setLunaModels([]); setLunaResult(null); }} className={`${fieldClass} mt-2`} placeholder={DEFAULT_LUNA_BASE_URL} spellCheck={false} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs tracking-wider text-[#9a97a3]">API Key</label>
                  {savedSettings?.lunaApiKeyConfigured && !clearLunaApiKey && <span className="text-[11px] text-emerald-400">已保存</span>}
                </div>
                <input type="password" aria-label="Luna API Key" value={lunaApiKey} onChange={event => { setLunaApiKey(event.target.value); setClearLunaApiKey(false); setLunaModels([]); setLunaResult(null); }} className={`${fieldClass} mt-2`} placeholder={savedSettings?.lunaApiKeyConfigured ? '留空保留已保存密钥，输入则替换' : '输入 Luna API Key'} autoComplete="off" spellCheck={false} />
                {savedSettings?.lunaApiKeyConfigured && <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#777482]">
                  <input type="checkbox" aria-label="清除 Luna 密钥" checked={clearLunaApiKey} onChange={event => { setClearLunaApiKey(event.target.checked); if (event.target.checked) setLunaApiKey(''); }} className="accent-[#d4af37]" />
                  清除已保存的 Luna API Key
                </label>}
              </div>
              <div>
                <label className="text-xs tracking-wider text-[#9a97a3]">批量生图模型 ID</label>
                <select aria-label="Luna 生图模型" value={lunaImageModel} onChange={event => setLunaImageModel(event.target.value)} className={`${fieldClass} mt-2`}>
                  <option value="">请先读取可用模型</option>
                  {[...new Set([lunaImageModel, ...lunaModels].filter(Boolean))].map(model => <option key={model} value={model}>{model}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleLunaModels} disabled={loadingLunaModels || !lunaBaseUrl.trim() || (clearLunaApiKey && !lunaApiKey.trim())} className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-5 py-2.5 text-sm text-[#d7d4cb] transition hover:border-[#d4af37]/40 hover:text-[#e8c766] disabled:opacity-40">{loadingLunaModels ? '读取中…' : '读取 Luna 可用模型'}</button>
                {lunaResult && <p role="status" className={`text-xs ${lunaResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>{lunaResult.message}</p>}
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-[#5f5c68]">密钥由 Windows 安全存储加密保存；读取列表不会提交生成任务。此入口需要支持批量生图的 Key 分组，不能据此确认 image2 或视频模型可用。画幅通过提示词描述，实际尺寸由模型返回。</p>
          </SettingsCard>

          <SettingsCard title="中转视频 · 自定义接口与模型" description="自行填写服务地址、模型 ID 和接口协议，保存后通过原有视频节点调用。">
            <RelayVideoSettings config={relayVideoConfig} onChange={setRelayVideoConfig} apiKey={relayVideoApiKey} setApiKey={setRelayVideoApiKey} configured={!!savedSettings?.relayVideoApiKeyConfigured} clearKey={clearRelayVideoApiKey} setClearKey={setClearRelayVideoApiKey} fieldClass={fieldClass} />
          </SettingsCard>

          <SettingsCard title="默认生图模型" description="新建图片节点及未单独指定模型的生成任务默认使用此工作流。">
            <div className="grid gap-3 sm:grid-cols-2">
              {textToImageWorkflows.map((workflow) => {
                const selected = workflow.id === defaultImageWorkflowId;
                return (
                  <button key={workflow.id} onClick={() => setDefaultImageWorkflowId(workflow.id)} className={`rounded-xl border p-4 text-left transition ${selected ? 'border-[#d4af37]/65 bg-[#d4af37]/[0.09] shadow-[0_0_20px_rgba(212,175,55,0.08)]' : 'border-white/[0.09] bg-white/[0.025] hover:border-white/[0.18]'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-sm font-medium ${selected ? 'text-[#e8c766]' : 'text-[#d8d6cf]'}`}>{workflow.name}</span>
                      <span className={`h-3.5 w-3.5 rounded-full border ${selected ? 'border-[#e8c766] bg-[#e8c766] shadow-[inset_0_0_0_3px_#18140b]' : 'border-[#5f5c68]'}`} />
                    </div>
                    <p className="mt-2 font-mono text-[10px] text-[#666371]">{workflow.id}</p>
                  </button>
                );
              })}
            </div>
          </SettingsCard>
        </div>
      </main>
      {leaveOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6 app-no-drag">
        <section role="dialog" aria-modal="true" aria-label="未保存的配置" className="w-full max-w-md space-y-5 rounded-2xl border border-white/15 bg-[#17171e] p-6">
          <h2 className="text-base font-semibold">配置尚未保存</h2>
          <p className="text-sm text-white/65">保存后返回，或放弃这次修改。</p>
          <div className="flex flex-wrap justify-end gap-3 text-sm">
            <button autoFocus onClick={() => setLeaveOpen(false)} className="rounded-lg border border-white/15 px-3 py-2">继续编辑</button>
            <button disabled={saving} onClick={() => setCurrentPage('home')} className="rounded-lg border border-white/15 px-3 py-2">放弃修改</button>
            <button disabled={saving} onClick={async () => { if (await handleSave()) setCurrentPage('home'); else setLeaveOpen(false); }} className="rounded-lg bg-[#d4af37] px-3 py-2 text-black">{saving ? '保存中…' : '保存后返回'}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="flex h-full min-w-0 flex-col rounded-2xl border border-white/[0.08] bg-[#111118] p-6 shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
      <div className="mb-5 border-b border-white/[0.07] pb-4">
        <h2 className="text-sm font-semibold tracking-[0.14em] text-[#e8e6df]">{title}</h2>
        <p className="mt-2 text-xs leading-5 text-[#777482]">{description}</p>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}
