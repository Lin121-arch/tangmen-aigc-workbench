import { ToolLoopAgent, stepCountIs, type ToolSet, type ModelMessage, type TextStreamPart } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { normalizeRelayAgentBaseUrl } from '../../../../src/shared/relay-agent-config'

export interface RelayAgentOptions {
  baseUrl: string
  apiKey: string
  model: string
  system?: string
  messages: ModelMessage[]
  tools: ToolSet
  signal?: AbortSignal
  onPart?: (part: TextStreamPart<ToolSet>) => void | Promise<void>
}

/** The upstream AI SDK runs the actual tool loop; requests are never retried automatically. */
export async function runRelayAgent(options: RelayAgentOptions): Promise<{ text: string; needsContinuation: boolean }> {
  if (!options.model.trim()) throw new Error('请先在系统配置中填写支持工具调用的对话模型 ID')
  options.signal?.throwIfAborted()
  const provider = createOpenAICompatible({
    name: 'tangmen-relay', baseURL: normalizeRelayAgentBaseUrl(options.baseUrl), ...(options.apiKey ? { apiKey: options.apiKey } : {}),
  })
  const agent = new ToolLoopAgent({
    model: provider.chatModel(options.model.trim()), instructions: options.system,
    tools: options.tools, stopWhen: stepCountIs(8), maxRetries: 0, maxOutputTokens: 4096,
    onError: () => { /* The stream consumer handles errors without logging request bodies. */ },
  })
  const result = await agent.stream({ messages: options.messages, abortSignal: options.signal, timeout: 180_000 })
  for await (const part of result.fullStream) {
    options.signal?.throwIfAborted()
    if (part.type === 'error') throw part.error
    await options.onPart?.(part)
  }
  options.signal?.throwIfAborted()
  return { text: await result.text, needsContinuation: (await result.finishReason) === 'tool-calls' }
}
