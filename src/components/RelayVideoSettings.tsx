import type { RelayVideoConfig } from '../shared/relay-video-config';

interface Props {
  config: RelayVideoConfig;
  onChange: (config: RelayVideoConfig) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  configured: boolean;
  clearKey: boolean;
  setClearKey: (value: boolean) => void;
  fieldClass: string;
}

export function RelayVideoSettings({ config, onChange, apiKey, setApiKey, configured, clearKey, setClearKey, fieldClass }: Props) {
  const patch = (fields: Partial<RelayVideoConfig>) => onChange({ ...config, ...fields });
  const input = (label: string, key: keyof Omit<RelayVideoConfig, 'models'>, placeholder = '') => (
    <label className="block text-xs text-[#9a97a3]" key={key}>{label}
      <input aria-label={label} value={config[key]} onChange={event => patch({ [key]: event.target.value })} className={`${fieldClass} mt-2`} placeholder={placeholder} spellCheck={false} />
    </label>
  );
  return <div className="grid gap-5">
    <div className="grid gap-5 md:grid-cols-2">
      {input('视频 API Base URL', 'baseUrl', '填写你的服务商地址')}
      <div>
        <div className="flex items-center justify-between text-xs text-[#9a97a3]">视频 API Key{configured && !clearKey && <span className="text-[11px] text-emerald-400">已保存</span>}</div>
        <input aria-label="中转视频 API Key" type="password" value={apiKey} onChange={event => { setApiKey(event.target.value); setClearKey(false); }} className={`${fieldClass} mt-2`} placeholder={configured ? '留空保留已保存密钥' : '输入视频接口密钥'} autoComplete="off" spellCheck={false} />
        {configured && <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#777482]">
          <input aria-label="清除中转视频密钥" type="checkbox" checked={clearKey} onChange={event => { setClearKey(event.target.checked); if (event.target.checked) setApiKey(''); }} className="accent-[#d4af37]" />清除已保存的视频密钥
        </label>}
      </div>
    </div>
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#9a97a3]">视频模型（保存后显示在视频节点的模型菜单）</p>
        <button type="button" onClick={() => patch({ models: [...config.models, { name: '', id: '' }] })} className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs text-[#d7d4cb] hover:text-[#e8c766]">添加视频模型</button>
      </div>
      {config.models.length === 0 && <p className="text-xs text-[#777482]">尚未添加。按中转站实际文档填写模型 ID，显示名称可以自行命名。</p>}
      {config.models.map((model, index) => <div className="flex items-center gap-3" key={index}>
        <input aria-label={`视频模型 ${index + 1} 显示名称`} value={model.name} onChange={event => patch({ models: config.models.map((item, offset) => offset === index ? { ...item, name: event.target.value } : item) })} className={fieldClass} placeholder="显示名称，如 MiniMax H3" />
        <input aria-label={`视频模型 ${index + 1} ID`} value={model.id} onChange={event => patch({ models: config.models.map((item, offset) => offset === index ? { ...item, id: event.target.value } : item) })} className={fieldClass} placeholder="文档中的实际模型 ID" spellCheck={false} />
        <button aria-label={`移除视频模型 ${index + 1}`} onClick={() => patch({ models: config.models.filter((_, offset) => offset !== index) })} className="shrink-0 px-2 text-xs text-[#777482] hover:text-rose-400">移除</button>
      </div>)}
    </div>
    <details className="rounded-lg border border-white/[0.09] p-4">
      <summary className="cursor-pointer text-sm text-[#d7d4cb]">高级配置 · 按中转站文档填写提交与查询协议</summary>
      <p className="mt-3 text-[11px] leading-5 text-[#777482]">当前适配 Bearer 鉴权、JSON POST 提交、GET 查询和 MP4 下载。路径相对于上方 Base URL，查询/下载路径中的 {'{id}'} 会替换为任务 ID；返回字段使用 data.task_id、data.output.url 等点分路径，数组可写 data.0.url。以下默认字段仅为填写示例，不代表 Luna 实际协议。</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {input('视频提交路径', 'submitPath', '/videos')}
        {input('视频查询路径', 'queryPath', '/videos/{id}')}
        {input('任务 ID 返回字段', 'taskIdPath', 'data.task_id')}
        {input('任务状态返回字段', 'statusPath', 'data.status')}
        {input('视频地址返回字段', 'videoUrlPath', 'data.url')}
        {input('视频下载路径（可选）', 'downloadPath', '/videos/{id}/content')}
        {input('成功状态值（逗号分隔）', 'successStatuses', 'completed,succeeded')}
        {input('失败状态值（逗号分隔）', 'failedStatuses', 'failed,cancelled')}
      </div>
      <label className="mt-4 block text-xs text-[#9a97a3]">提交 JSON 模板
        <textarea aria-label="视频提交 JSON 模板" value={config.submitBody} onChange={event => patch({ submitBody: event.target.value })} className={`${fieldClass} mt-2 min-h-48 font-mono text-xs`} spellCheck={false} />
      </label>
      <p className="mt-2 text-[11px] leading-5 text-[#777482]">可用变量：{'{{model}}'}、{'{{prompt}}'}、{'{{duration}}'}、{'{{aspectRatio}}'}、{'{{image}}'}、{'{{images}}'}。变量独占 JSON 字符串值，执行时会保留数字或数组类型。image 为首帧 data URI，images 为其数组；仅在接口支持时添加对应字段。模板中不要放密钥。</p>
    </details>
    <p className="text-[11px] leading-5 text-[#5f5c68]">配置保存不触发模型调用。填写完成后，在视频节点选择模型并主动生成；支持已有任务恢复。其他鉴权、multipart 上传、同步视频返回等格式需要另行适配，不能仅靠改字段完成。</p>
  </div>;
}
