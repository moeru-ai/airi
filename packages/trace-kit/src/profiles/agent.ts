import { ATTR_AIRI_TOPIC_ID } from '../conventions'
import {
  defineAttribute,
  defineEndReason,
  defineIdKey,
  defineLink,
  defineMetric,
  definePreset,
  defineProfile,
  defineTrack,
} from '../core/define'

/** Track path patterns of the agent profile. Fill them with `trackPath`. */
export const AgentTracks = {
  State: 'agents/{agent}/state',
  Turn: 'agents/{agent}/turn',
  LLM: 'agents/{agent}/llm',
  Tools: 'agents/{agent}/tools',
  Control: 'agents/{agent}/control',
  Decision: 'background/decision',
  Memory: 'background/memory',
} as const

export const AgentIdKeys = {
  Topic: 'topic',
  Round: 'round',
  Request: 'request',
  Message: 'message',
  ToolCall: 'toolCall',
  ToolGroup: 'toolGroup',
  Intent: 'intent',
  Decision: 'decision',
  Job: 'job',
  Agent: 'agent',
  Run: 'run',
  /** The chat domain `causation.rootId`. */
  CausationRoot: 'causationRoot',
  /** The chat domain `causation.chainId`. */
  CausationChain: 'causationChain',
} as const

/** Span and instant names. Instants use `<object>.<past-tense verb>`. */
export const AgentNames = {
  ChatTurn: 'chat-turn',
  ModelRequest: 'chat',
  ToolCall: 'execute_tool',
  ControlDispatch: 'control.dispatch',
  LLMFirstChunk: 'llm.first_chunk',
  LLMFirstAnswer: 'llm.first_answer',
  AgentHandedOff: 'agent.handed_off',
  IntentEmitted: 'intent.emitted',
  ControlParsed: 'control.parsed',
  ControlRejected: 'control.rejected',
  ControlHandlerStarted: 'control.handler_started',
  ControlHandlerEnded: 'control.handler_ended',
  ControlHandlerFailed: 'control.handler_failed',
} as const

export const AgentAttributes = {
  LLMTtftMs: 'llm.ttft_ms',
  LLMTtfatMs: 'llm.ttfat_ms',
  LLMInputMessageCount: 'llm.input_message_count',
  LLMInputMessageRoles: 'llm.input_message_roles',
  LLMInputUserMessageCount: 'llm.input_user_message_count',
  LLMOutputChunkCount: 'llm.output_chunk_count',
  LLMOutputChunkLengths: 'llm.output_chunk_lengths',
  LLMTextLength: 'llm.text_length',
  /** The text of the user input of a chat turn. */
  TurnInputText: 'turn.input_text',
  ControlCallName: 'control.call_name',
  ControlHandlerCount: 'control.handler_count',
  ControlMatched: 'control.matched',
  ControlParameter: 'control.parameter',
  ControlParsed: 'control.parsed',
  ControlParserName: 'control.parser_name',
  ControlReason: 'control.reason',
  ControlRawToken: 'control.raw_token',
  ControlTokenLength: 'control.token_length',
  ControlTokenType: 'control.token_type',
} as const

export const agentProfile = defineProfile({
  key: 'agent',
  version: '1',
  label: { 'en': 'Agent', 'zh-Hans': '智能体' },
  description: {
    'en': 'Chat turns, model requests, tools, sub-agents, and async work such as memory decisions.',
    'zh-Hans': '聊天轮次、模型请求、工具、子智能体，以及记忆决策这类异步工作。',
  },
  tracks: [
    defineTrack({ path: AgentTracks.State, entity: 'agent', group: 'agents', order: 0, render: ['state'], states: ['running', 'paused', 'waiting', 'done'], label: { 'en': 'State', 'zh-Hans': '状态' } }),
    defineTrack({ path: AgentTracks.Turn, entity: 'agent', activity: 'waiting', group: 'agents', order: 10, render: ['spans'], color: '#64748b', icon: 'i-mingcute:chat-2-line', label: { 'en': 'Chat turn', 'zh-Hans': '聊天轮次' } }),
    defineTrack({ path: AgentTracks.LLM, entity: 'agent', activity: 'thinking', activitySplit: { instant: 'llm.first_chunk', activity: 'active' }, group: 'agents', order: 20, render: ['spans', 'instants'], color: '#a855f7', icon: 'i-mingcute:ai-line', label: { 'en': 'Model', 'zh-Hans': '模型' } }),
    defineTrack({ path: AgentTracks.Tools, entity: 'agent', activity: 'active', itemLabel: 'name', group: 'agents', order: 30, render: ['spans'], color: '#0ea5e9', icon: 'i-mingcute:tool-line', label: { 'en': 'Tools', 'zh-Hans': '工具' } }),
    defineTrack({ path: AgentTracks.Control, entity: 'agent', group: 'agents', order: 40, render: ['spans', 'instants'], color: '#06b6d4', icon: 'i-mingcute:signal-line', label: { 'en': 'Streaming control', 'zh-Hans': '流式控制' } }),
    defineTrack({ path: AgentTracks.Decision, activity: 'thinking', group: 'background', order: 0, render: ['spans'], color: '#eab308', icon: 'i-mingcute:git-branch-line', label: { 'en': 'Decisions', 'zh-Hans': '决策' } }),
    defineTrack({ path: AgentTracks.Memory, activity: 'active', group: 'background', order: 10, render: ['spans', 'instants'], color: '#84cc16', icon: 'i-mingcute:storage-line', label: { 'en': 'Memory', 'zh-Hans': '记忆' } }),
  ],
  idKeys: Object.values(AgentIdKeys).map(key => defineIdKey({ key })),
  links: [
    defineLink({ rel: 'handed-off-to', label: { 'en': 'Handed off to', 'zh-Hans': '移交给' } }),
  ],
  endReasons: [
    defineEndReason({ reason: 'max-steps', label: { 'en': 'Max steps', 'zh-Hans': '达到步数上限' } }),
    defineEndReason({ reason: 'handed-off', label: { 'en': 'Handed off', 'zh-Hans': '已移交' } }),
    defineEndReason({ reason: 'awaiting-input', label: { 'en': 'Awaiting input', 'zh-Hans': '等待输入' } }),
  ],
  attributes: [
    defineAttribute({ key: AgentAttributes.TurnInputText, type: 'string', sensitivity: 'content' }),
    defineAttribute({ key: AgentAttributes.ControlRawToken, type: 'string', sensitivity: 'content' }),
    defineAttribute({ key: AgentAttributes.ControlParameter, type: 'string', sensitivity: 'content' }),
    defineAttribute({ key: AgentAttributes.LLMTtftMs, type: 'number', unit: 'ms', sensitivity: 'none', aggregatable: true }),
    defineAttribute({ key: ATTR_AIRI_TOPIC_ID, type: 'string', sensitivity: 'none' }),
  ],
  metrics: [
    defineMetric({
      key: 'llm.ttft_ms',
      label: { 'en': 'Time to first token', 'zh-Hans': '首 token 延迟' },
      description: { 'en': 'From the model request to the first content chunk.', 'zh-Hans': '从发出模型请求到收到第一个内容块。' },
      unit: 'ms',
      better: 'lower',
      value: { kind: 'attribute', track: AgentTracks.LLM, record: 'span.end', attribute: AgentAttributes.LLMTtftMs },
    }),
    defineMetric({
      key: 'llm.ttfat_ms',
      label: { 'en': 'Time to first answer', 'zh-Hans': '首个回答延迟' },
      description: { 'en': 'From the model request to the first answer token or tool call, after reasoning.', 'zh-Hans': '从发出模型请求到推理之后的第一个回答 token 或工具调用。' },
      unit: 'ms',
      better: 'lower',
      value: { kind: 'attribute', track: AgentTracks.LLM, record: 'span.end', attribute: AgentAttributes.LLMTtfatMs },
    }),
  ],
  presets: [
    definePreset({ key: 'agent.memory', label: { 'en': 'Memory', 'zh-Hans': '记忆' }, tracks: [AgentTracks.Turn, AgentTracks.Decision, AgentTracks.Memory] }),
  ],
})
