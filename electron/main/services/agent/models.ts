import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { app } from 'electron';
import type { AgentModelsResult } from '../../../../src/shared/agent-config';
import { listCodexModels } from './codex-session';
import { getClaudeExecutablePath } from './claude-runtime';
import { getRuntimeSettings } from '../settings.service';

export async function listAgentModels(provider: unknown): Promise<AgentModelsResult> {
  if (provider === 'relay') {
    const { getModelServicesView } = await import('../model-services.store');
    const { modelWorkflowId } = await import('../../../../src/shared/model-services');
    const config = await getModelServicesView();
    const registered = config.providers.filter(p => p.enabled).flatMap(p => p.models.filter(m => m.capabilities.includes('chat') && m.capabilities.includes('tools')).map(m => ({ id: modelWorkflowId(p.id, m.id), name: `${p.name} · ${m.name}` })));
    const { relayAgentModel: model } = await getRuntimeSettings();
    const models = [...registered, ...(model ? [{ id: model, name: '原系统配置的对话模型' }] : [])];
    return models.length ? { models } : { models: [], error: '请在模型服务中登记支持工具调用的对话模型并配置密钥' };
  }
  if (provider === 'codex') return listCodexModels();
  if (provider !== 'claude-code') return { models: [], error: '不支持的 Agent 类型' };
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let stream: Query | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    stream = query({
      prompt: (async function* () { await wait; })(),
      options: {
        cwd: app.getPath('home'), settingSources: ['user'], env: { ...process.env },
        pathToClaudeCodeExecutable: getClaudeExecutablePath(),
      },
    });
    const models = await Promise.race([
      stream.supportedModels(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('读取 Claude 模型列表超时')), 20_000); }),
    ]);
    return { models: models.map(model => ({ id: model.value, name: model.displayName })) };
  } catch (error) {
    return { models: [], error: error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timer); release(); stream?.close(); }
}
