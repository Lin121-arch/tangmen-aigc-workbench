import { z } from 'zod';

export const projectAgentSchema = z.object({
  provider: z.enum(['claude-code', 'codex', 'relay']),
  model: z.string().trim().max(200).default(''),
}).strict();

export type ProjectAgentConfig = z.infer<typeof projectAgentSchema>;
export type AgentProvider = ProjectAgentConfig['provider'];
export interface AgentModelOption { id: string; name: string }
export interface AgentModelsResult { models: AgentModelOption[]; error?: string }
export type LocalAgentId = 'codex' | 'claude-code';
export interface LocalAgentStatus {
  agent: LocalAgentId;
  state: 'not-installed' | 'needs-login' | 'ready' | 'unknown' | 'error';
  version?: string;
  path?: string;
  message: string;
}

export function normalizeProjectAgent(value: unknown): ProjectAgentConfig {
  return value === undefined
    ? { provider: 'claude-code', model: '' }
    : projectAgentSchema.parse(value);
}

export function agentLabel(agent?: ProjectAgentConfig): string {
  if (agent?.provider === 'relay') return '唐门创作助手';
  return agent?.provider === 'codex' ? 'Codex' : 'Claude Code';
}
