import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), runtime: vi.fn() }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mocks.query }));
vi.mock('../electron/main/services/agent/claude-runtime', () => ({ getClaudeExecutablePath: mocks.runtime }));
vi.mock('../electron/main/services/agent/codex-session', () => ({ listCodexModels: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => '/home' } }));
import { listAgentModels } from '../electron/main/services/agent/models';

beforeEach(() => { vi.resetAllMocks(); mocks.runtime.mockReturnValue('/app.asar.unpacked/claude'); });

it('uses the real executable for discovery and closes the query', async () => {
  const close = vi.fn();
  mocks.query.mockReturnValue({ supportedModels: async () => [{ value: 'model', displayName: 'Model' }], close });
  expect(await listAgentModels('claude-code')).toEqual({ models: [{ id: 'model', name: 'Model' }] });
  expect(mocks.query.mock.calls[0][0].options.pathToClaudeCodeExecutable).toBe('/app.asar.unpacked/claude');
  expect(close).toHaveBeenCalledOnce();
});

it.each(['runtime', 'query'] as const)('reports synchronous %s startup failures through the model result', async source => {
  mocks[source].mockImplementation(() => { throw new Error('启动失败'); });
  expect(await listAgentModels('claude-code')).toEqual({ models: [], error: '启动失败' });
});
