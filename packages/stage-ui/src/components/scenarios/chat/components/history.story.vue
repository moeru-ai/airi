<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem } from '../../../../types/chat'

import { computed, ref } from 'vue'

import ChatScrollVisualizer from '../composables/use-element-scroll-visualize.vue'
import ChatHistory from './history.vue'

const comprehensiveMessages = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: 'Plan a compact release update. Check the task list, inspect the weather for launch timing, and explain what changed.',
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      {
        type: 'text',
        text: 'I will collect the operational context first, then summarize the release status in a short update.',
      },
      {
        type: 'tool-call',
        toolCall: {
          toolName: 'fetch_tasks',
          args: JSON.stringify({ project: 'stage-ui', status: ['todo', 'in_progress'], limit: 4 }),
          toolCallId: 'normal-fetch-tasks',
          toolCallType: 'function',
        },
      },
      {
        type: 'tool-call',
        toolCall: {
          toolName: 'weather',
          args: JSON.stringify({ location: 'Tokyo', date: 'today' }),
          toolCallId: 'normal-weather',
          toolCallType: 'function',
        },
      },
      {
        type: 'tool-call-result',
        id: 'normal-weather',
        result: 'Tokyo is clear with light wind. No weather risk for the launch window.',
      },
      {
        type: 'tool-call',
        toolCall: {
          toolName: 'deploy_preview',
          args: JSON.stringify({ branch: 'release/chat-history-states', environment: 'preview' }),
          toolCallId: 'normal-deploy-preview',
          toolCallType: 'function',
        },
      },
      {
        type: 'tool-call-result',
        id: 'normal-deploy-preview',
        isError: true,
        result: 'Preview deployment failed: missing VITE_PUBLIC_STAGE_API_URL.',
      },
      {
        type: 'text',
        text: [
          'Here is the release update:',
          '',
          '- Task scan is still running, so I will keep that status visible.',
          '- Weather check succeeded; the launch window has no external timing concern.',
          '- Preview deploy failed because one environment variable is missing.',
        ].join('\n'),
      },
      {
        type: 'text',
        text: 'Next step: add `VITE_PUBLIC_STAGE_API_URL` to the preview environment, then rerun the deploy.',
      },
    ],
    tool_results: [],
    categorization: {
      speech: 'Here is the release update. Task scan succeeded, weather is clear, and preview deploy needs one missing environment variable.',
      reasoning: [
        'The user asked for a compact release update, so I should keep the final answer concise.',
        '',
        'I need to distinguish successful tool output from the failed preview deployment. The deploy error is actionable because it names the missing environment variable.',
      ].join('\n'),
    },
  },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'This assistant message has no `slices`, so the renderer falls back to the text part from array content.' },
    ],
    slices: [],
    tool_results: [],
  },
  {
    role: 'error',
    content: 'Provider stream aborted after the tool results were rendered. Retry from the previous user message if the final answer is incomplete.',
  },
])

const markdownMessages = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: 'Hey AIRI, can you summarize today\'s tasks?',
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      { type: 'text', text: 'Absolutely! Here is a **quick recap** with bullet points:\n\n- Finish UI polish\n- Ship the API client\n- Record the demo' },
    ],
    tool_results: [],
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      { type: 'tool-call', toolCall: { toolName: 'fetch_tasks', args: JSON.stringify({ limit: 5 }), toolCallId: '1', toolCallType: 'function' } },
      { type: 'text', text: 'Let me pull the latest tasks from the tracker.' },
    ],
    tool_results: [],
  },
])

const markdownMessagesMultipleLanguage = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: '你做梦了吗？',
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      { type: 'text', text: '嗯，我在这里的每一天都像是在做梦一样呢！ 我会想象各种有趣的事情，比如和朋友们一起去探险！你希望我梦到什么呢？' },
    ],
    tool_results: [],
  },
])

const markdownMessagesLong = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam dapibus risus quis ipsum mattis tristique. In blandit vestibulum libero, vel tincidunt ante porttitor et. Etiam purus ante, iaculis sed malesuada id, dictum eu est. Praesent dictum sagittis justo, pretium interdum mauris aliquam sed. Fusce maximus suscipit dapibus. Praesent et sem felis. Fusce dolor sapien, iaculis mollis posuere ut, ornare ac velit. Duis id volutpat justo. Nulla convallis magna ut metus hendrerit, eget bibendum orci blandit. Mauris ullamcorper ante sit amet quam auctor, at pellentesque nunc lobortis. Suspendisse et massa at enim porttitor egestas in vel nulla. Suspendisse sed erat accumsan, iaculis ligula nec, hendrerit ligula. Mauris vehicula quam libero, aliquam mollis odio laoreet eu. Integer accumsan ante vel dui pulvinar, a aliquet ex accumsan. Vivamus vehicula eleifend posuere. Etiam vitae dictum arcu.

Sed finibus velit vel dignissim sodales. Etiam bibendum blandit porta. Proin a purus ac erat aliquam accumsan et quis diam. Etiam sagittis nulla ac risus varius, sed blandit ante ullamcorper. Aliquam ultrices eros vitae metus vestibulum lobortis. Integer faucibus, urna eu cursus malesuada, odio enim varius lacus, non scelerisque justo eros ultricies libero. Quisque aliquam facilisis elementum. Integer at tortor in ipsum euismod tincidunt. Integer commodo nunc porta lectus porttitor, quis interdum odio tempus. Phasellus sodales eget turpis sit amet congue. Pellentesque aliquam, nisl vel malesuada pretium, turpis erat molestie justo, non ornare dui purus ut est. Aliquam rutrum imperdiet mollis.

Curabitur fringilla orci sed urna tempus pharetra. Cras elementum nulla eget sem mollis, in pretium nulla facilisis. Aliquam erat volutpat. Donec efficitur nibh finibus congue elementum. In vestibulum pharetra risus quis egestas. Ut vel scelerisque ipsum, et mollis augue. Sed blandit lacus et fermentum maximus. Aliquam massa lectus, pellentesque ut velit nec, tristique scelerisque nibh. Vivamus ultricies quam accumsan, aliquet ex et, semper ex. Donec at magna vel dolor cursus luctus.

Duis fringilla vestibulum nibh ut imperdiet. Nulla sed venenatis nibh, tempor varius arcu. Curabitur fringilla mauris hendrerit, varius justo eu, suscipit sem. Quisque tempor justo tincidunt orci egestas ultrices eu iaculis augue. Sed suscipit enim non ex ullamcorper, ut hendrerit justo laoreet. Suspendisse consectetur ex id augue euismod, a vehicula purus facilisis. Etiam pretium porta mi, id ultricies augue tristique eleifend. Nam ullamcorper placerat iaculis. Integer quis auctor tortor. In vitae tempus lorem. Praesent bibendum mi aliquet sem consequat, molestie congue neque interdum.

Sed eu lacus rhoncus, venenatis libero vel, molestie tellus. Morbi porttitor, lectus sit amet imperdiet gravida, lacus nulla pulvinar turpis, ac maximus nulla purus a nibh. Donec ac scelerisque neque. Vestibulum ultrices varius purus, at consequat elit porta vitae. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Phasellus sit amet neque condimentum, laoreet justo non, placerat nulla. Ut volutpat urna pretium, semper ligula quis, lobortis est. Praesent eleifend vel ligula et facilisis. Quisque vehicula pellentesque ex, vel gravida ante pretium non.`,
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      { type: 'text', text: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam dapibus risus quis ipsum mattis tristique. In blandit vestibulum libero, vel tincidunt ante porttitor et. Etiam purus ante, iaculis sed malesuada id, dictum eu est. Praesent dictum sagittis justo, pretium interdum mauris aliquam sed. Fusce maximus suscipit dapibus. Praesent et sem felis. Fusce dolor sapien, iaculis mollis posuere ut, ornare ac velit. Duis id volutpat justo. Nulla convallis magna ut metus hendrerit, eget bibendum orci blandit. Mauris ullamcorper ante sit amet quam auctor, at pellentesque nunc lobortis. Suspendisse et massa at enim porttitor egestas in vel nulla. Suspendisse sed erat accumsan, iaculis ligula nec, hendrerit ligula. Mauris vehicula quam libero, aliquam mollis odio laoreet eu. Integer accumsan ante vel dui pulvinar, a aliquet ex accumsan. Vivamus vehicula eleifend posuere. Etiam vitae dictum arcu.

Sed finibus velit vel dignissim sodales. Etiam bibendum blandit porta. Proin a purus ac erat aliquam accumsan et quis diam. Etiam sagittis nulla ac risus varius, sed blandit ante ullamcorper. Aliquam ultrices eros vitae metus vestibulum lobortis. Integer faucibus, urna eu cursus malesuada, odio enim varius lacus, non scelerisque justo eros ultricies libero. Quisque aliquam facilisis elementum. Integer at tortor in ipsum euismod tincidunt. Integer commodo nunc porta lectus porttitor, quis interdum odio tempus. Phasellus sodales eget turpis sit amet congue. Pellentesque aliquam, nisl vel malesuada pretium, turpis erat molestie justo, non ornare dui purus ut est. Aliquam rutrum imperdiet mollis.

Curabitur fringilla orci sed urna tempus pharetra. Cras elementum nulla eget sem mollis, in pretium nulla facilisis. Aliquam erat volutpat. Donec efficitur nibh finibus congue elementum. In vestibulum pharetra risus quis egestas. Ut vel scelerisque ipsum, et mollis augue. Sed blandit lacus et fermentum maximus. Aliquam massa lectus, pellentesque ut velit nec, tristique scelerisque nibh. Vivamus ultricies quam accumsan, aliquet ex et, semper ex. Donec at magna vel dolor cursus luctus.

Duis fringilla vestibulum nibh ut imperdiet. Nulla sed venenatis nibh, tempor varius arcu. Curabitur fringilla mauris hendrerit, varius justo eu, suscipit sem. Quisque tempor justo tincidunt orci egestas ultrices eu iaculis augue. Sed suscipit enim non ex ullamcorper, ut hendrerit justo laoreet. Suspendisse consectetur ex id augue euismod, a vehicula purus facilisis. Etiam pretium porta mi, id ultricies augue tristique eleifend. Nam ullamcorper placerat iaculis. Integer quis auctor tortor. In vitae tempus lorem. Praesent bibendum mi aliquet sem consequat, molestie congue neque interdum.

Sed eu lacus rhoncus, venenatis libero vel, molestie tellus. Morbi porttitor, lectus sit amet imperdiet gravida, lacus nulla pulvinar turpis, ac maximus nulla purus a nibh. Donec ac scelerisque neque. Vestibulum ultrices varius purus, at consequat elit porta vitae. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Phasellus sit amet neque condimentum, laoreet justo non, placerat nulla. Ut volutpat urna pretium, semper ligula quis, lobortis est. Praesent eleifend vel ligula et facilisis. Quisque vehicula pellentesque ex, vel gravida ante pretium non.` },
    ],
    tool_results: [],
  },
])

const toolHeavyMessages = computed<ChatHistoryItem[]>(() => [
  {
    role: 'user',
    content: 'Grab the weather for Tokyo and Osaka.',
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      { type: 'tool-call', toolCall: { toolName: 'weather', args: JSON.stringify({ location: 'Tokyo' }), toolCallId: '2', toolCallType: 'function' } },
      { type: 'tool-call', toolCall: { toolName: 'weather', args: JSON.stringify({ location: 'Osaka' }), toolCallId: '3', toolCallType: 'function' } },
      { type: 'text', text: 'I will fetch both cities, one sec.' },
    ],
    tool_results: [],
  },
])

const hybridToolFailureMessages = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: 'Start a chess game for me, then recover if the setup fails.',
  },
  {
    role: 'assistant',
    content: '',
    slices: [
      {
        type: 'tool-call',
        toolCall: {
          toolName: 'play_chess',
          args: JSON.stringify({ mode: 'focus' }),
          toolCallId: 'hybrid-play-chess-focus',
          toolCallType: 'function',
        },
      },
      {
        type: 'text',
        text: 'I found the chess widget and brought it forward. I will try to bootstrap a fresh L1 match now.',
      },
      {
        type: 'tool-call',
        toolCall: {
          toolName: 'play_chess',
          args: JSON.stringify({
            difficultyLevel: 'L1',
            difficultyMode: 'manual',
            fen: null,
            mode: 'new',
            notes: 'L1 game started; assistant plays White and will move first.',
            opening: null,
            pgn: null,
            side: 'white',
          }),
          toolCallId: 'hybrid-play-chess-new-failed',
          toolCallType: 'function',
        },
      },
      {
        type: 'text',
        text: 'That setup attempt failed because focus mode rejected mutation inputs. I will keep the board open and retry with a clean new-game payload next.',
      },
    ],
    tool_results: [
      {
        id: 'hybrid-play-chess-focus',
        result: 'Focused the existing chess gamelet.',
      },
      {
        id: 'hybrid-play-chess-new-failed',
        isError: true,
        result: 'Focus mode does not accept game-state mutation inputs.',
      },
    ],
  },
])

const errorMessages = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: 'Push the deployment now.',
  },
  {
    role: 'error',
    content: 'Deployment failed: upstream gateway timed out. Please try again in a minute.',
  },
])

const errorOverflowMessages = ref<ChatHistoryItem[]>([
  {
    role: 'user',
    content: 'Retry the provider call and tell me exactly what failed.',
  },
  {
    role: 'error',
    content: 'Remote sent 400 response: {"error":{"message":"This model is not available in your region.","type":"invalid_request_error","param":"model","code":"region_not_supported"},"request_id":"req_01K8F0R7X1W2Y3Z4A5B6C7D8E9","endpoint":"https://api.example.invalid/v1/chat/completions","provider":"openai-compatible"}',
  },
])

const streamingMessage = ref<ChatAssistantMessage>({
  role: 'assistant',
  content: '',
  slices: [
    { type: 'text', text: 'Working on it...' },
  ],
  tool_results: [],
})
</script>

<template>
  <Story
    title="Chat / History"
    group="chat"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="all-normal-message-parts"
      title="All Normal Message Parts"
    >
      <div class="font-cute">
        <ChatHistory :messages="comprehensiveMessages" />
      </div>
    </Variant>

    <Variant
      id="with-tools-desktop"
      title="With Tools"
    >
      <div class="font-cute">
        <ChatHistory :messages="markdownMessages" />
      </div>
    </Variant>

    <Variant
      id="with-tools-desktop-multiple-languages"
      title="With Tools (Multiple Languages)"
    >
      <div class="font-cute">
        <ChatHistory :messages="markdownMessagesMultipleLanguage" />
      </div>
    </Variant>

    <Variant
      id="with-tools-desktop-long"
      title="With Tools (Long)"
    >
      <div class="font-cute">
        <ChatHistory :messages="markdownMessagesLong" />
      </div>
    </Variant>

    <Variant
      id="with-tools-mobile"
      title="With Tools (Mobile)"
    >
      <div class="font-cute">
        <ChatHistory
          :messages="markdownMessages"
          variant="mobile"
        />
      </div>
    </Variant>

    <Variant
      id="multiple-tools"
      title="Multiple Tools"
    >
      <div class="font-cute">
        <ChatHistory :messages="toolHeavyMessages" />
      </div>
    </Variant>

    <Variant
      id="hybrid-tool-failure"
      title="Hybrid Tool Failure"
    >
      <div class="font-cute">
        <ChatHistory :messages="hybridToolFailureMessages" />
      </div>
    </Variant>

    <Variant
      id="streaming"
      title="Streaming"
    >
      <div class="font-cute">
        <ChatHistory
          :messages="[]"
          :sending="true"
          :streaming-message="streamingMessage"
          variant="mobile"
        />
      </div>
    </Variant>

    <Variant
      id="error"
      title="Error"
    >
      <div class="font-cute">
        <ChatHistory
          :messages="errorMessages"
        />
      </div>
    </Variant>

    <Variant
      id="error-overflow"
      title="Error (Overflow)"
    >
      <div :class="['font-cute', 'w-72', 'max-w-full']">
        <ChatHistory
          :messages="errorOverflowMessages"
          variant="mobile"
        />
      </div>
    </Variant>

    <Variant
      id="scroll-visualizer"
      title="Scroll Visualizer"
    >
      <ChatScrollVisualizer />
    </Variant>
  </Story>
</template>
