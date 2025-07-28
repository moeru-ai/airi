<script setup lang="ts">
import type { AssistantMessage, SystemMessage, ToolMessage, Message as UpstreamMessage, UserMessage } from '@xsai/shared-chat'
import type { Element, Root } from 'xast'

import { Input, Textarea } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { streamText } from '@xsai/stream-text'
import { ref, toRaw } from 'vue'

import { registerWidgets } from '../plugins/plugin-component-calling-weather'
// import { mockStreamText } from '../utils/xsai-testing'

interface ComponentCall {
  component: {
    name: string
    props: Record<string, any>
    propsLoading: boolean
  }
  index: number
  type: 'component'
}

interface AssistantCCMessage extends AssistantMessage {
  component_calls?: ComponentCall[]
}

interface UserHidableMessage extends UserMessage {
  hidden?: boolean
}

interface ErrorMessage {
  role: 'error'
  content: string
}

type Message = SystemMessage | ToolMessage | UserHidableMessage | AssistantCCMessage | ErrorMessage

const baseUrl = useLocalStorage('settings/llm/baseUrl', 'https://openrouter.ai/api/v1/')
const apiKey = useLocalStorage('settings/llm/apiKey', '')
const model = useLocalStorage('settings/llm/model', 'openai/gpt-4o-mini')

const widgets = registerWidgets()

const sendingMessage = ref('Hi, what is the weather today in Shanghai? We are in debug mode, you can use Shanghai for city, 29 for degree, cloudy for condition.')

// https://github.com/vllm-project/vllm/blob/2cc571199b1446f376ee019fcafda19155fc6b71/examples/tool_chat_template_deepseekv3.jinja
const capabilityComponentCalling = ''
  + `You are interacting with user from a UI that supports **Component Calling**. You may call one or more functions to assist with the user query.\n`
  + `Component Calling is similar to what you have learned Function Calling or tool call, tool use. In function calling, <tools> will be supplied.\n`
  + `In Component Calling, <components>will be supplied</components>, pick the right one to use.\n`
  + `For each function call, you should return object like:\n`
  + `<component_call><component_name>$componentName</component_name>
\`\`\`json
<component_props>$componentProps</component_props>
\`\`\`</component▁call>\n`

const capabilities = [
  { name: 'Component Calling', description: capabilityComponentCalling, inject: async () => `<components>
  ${(await Promise.all(widgets.components.map(async c => `<component_name>
    ${c.name}
  </component_name>
  <component_props>
    ${JSON.stringify(await c.schema)}
  </component_props>`))).join('\n')}
</component>` },
]

const messages = ref<Array<Message>>([
  {
    role: 'system',
    content: `You are a helpful assistant. You will gain powers from the following capabilities:\n\n## Capabilities\n\n${capabilities.map(cap => `### ${cap.name}\n\n${cap.description}`).join('\n')}\n\n`,
  },
])
const streamingMessage = ref<AssistantCCMessage>({ role: 'assistant', content: '' })
const waiting = ref(false)

interface ParserEvents {
  onComponentDiscovered?: (component: ComponentCall, index: number) => void
  onComponentPropsLoaded?: (component: ComponentCall, index: number) => void
}

interface XMLParser {
  consume: (char: string) => void
  end: () => Root
}

function createParser(events?: ParserEvents): XMLParser {
  // Parser state
  let readBuffer: string = ''
  let parserSeekTag: 'call' | 'props' | 'name' | undefined
  let tagOpened = true
  let tagBracketOpened = false
  let inCodeBlock = false

  // Result tree
  const parsedNode: Root = {
    type: 'root',
    children: [] as Element[],
  } as Root

  let currentNode: Element | Root = parsedNode
  const parentStack: (Element | Root)[] = [parsedNode]

  // Component data
  const componentCalls: ComponentCall[] = []
  let currentComponentIndex = -1

  // Buffer for tracking sequential characters for code block detection
  let sequentialBackticks = 0

  function consume(char: string): void {
    // Handle code block markers (```)
    if (char === '`') {
      sequentialBackticks++

      if (sequentialBackticks === 3) {
        inCodeBlock = !inCodeBlock
        sequentialBackticks = 0
        return
      }

      // Wait for more backticks or add to buffer if not part of a code block marker
      if (sequentialBackticks < 3) {
        return
      }
    }
    else {
      // If we had some backticks but not enough for a code block marker,
      // add them to the buffer
      if (sequentialBackticks > 0) {
        readBuffer += '`'.repeat(sequentialBackticks)
        sequentialBackticks = 0
      }
    }

    // Handle XML parsing
    if (char === '<' && !tagBracketOpened) {
      // Starting a new tag
      if (readBuffer.trim()) {
        // Save any accumulated text content
        if (currentNode !== parsedNode) {
          (currentNode as Element).children = [
            ...(currentNode as Element).children || [],
            { type: 'text', value: readBuffer },
          ]
        }
        else {
          currentNode.children.push({
            type: 'text',
            value: readBuffer,
          } as any)
        }

        // If we're collecting component props, try to parse as JSON
        if (parserSeekTag === 'props' && inCodeBlock) {
          try {
            const props = JSON.parse(readBuffer.trim())

            // Update the component with the loaded props
            if (currentComponentIndex >= 0 && currentComponentIndex < componentCalls.length) {
              componentCalls[currentComponentIndex].component.props = props
              componentCalls[currentComponentIndex].component.propsLoading = false

              // Emit event for props loaded
              if (events?.onComponentPropsLoaded) {
                events.onComponentPropsLoaded(componentCalls[currentComponentIndex], currentComponentIndex)
              }
            }
          }
          catch (e) {
            console.error('Failed to parse component props:', e)
          }
        }
        else if (parserSeekTag === 'name') {
          const componentName = readBuffer.trim()

          // Create a new component with loading state
          const newComponent: ComponentCall = {
            component: {
              name: componentName,
              props: {},
              propsLoading: true,
            },
            index: componentCalls.length,
            type: 'component',
          }

          // Add to component calls and record the index
          componentCalls.push(newComponent)
          currentComponentIndex = componentCalls.length - 1

          // Emit event for component discovered
          if (events?.onComponentDiscovered) {
            events.onComponentDiscovered(newComponent, currentComponentIndex)
          }
        }
      }

      readBuffer = ''
      tagBracketOpened = true
      return
    }

    if (tagBracketOpened && char === '/') {
      // This is a closing tag
      tagOpened = false
      return
    }

    if (tagBracketOpened && char === '>') {
      // End of a tag (opening or closing)
      const tagName = readBuffer.trim()
      tagBracketOpened = false

      if (tagOpened) {
        // This was an opening tag
        const newElement: Element = {
          type: 'element',
          name: tagName,
          attributes: {},
          children: [],
        }

        currentNode.children.push(newElement)
        parentStack.push(currentNode)
        currentNode = newElement

        if (tagName === 'component_call') {
          parserSeekTag = 'call'
        }
        else if (tagName === 'component_name') {
          parserSeekTag = 'name'
        }
        else if (tagName === 'component_props') {
          parserSeekTag = 'props'
        }
      }
      else {
        // This was a closing tag
        if (tagName === 'component_call') {
          parserSeekTag = undefined
          currentComponentIndex = -1 // Reset current component index
        }
        else if (tagName === 'component_name') {
          parserSeekTag = 'call'
        }
        else if (tagName === 'component_props') {
          parserSeekTag = 'call'

          // If we didn't manage to parse the props (e.g., invalid JSON),
          // mark the component as no longer loading
          if (currentComponentIndex >= 0
            && currentComponentIndex < componentCalls.length
            && componentCalls[currentComponentIndex].component.propsLoading) {
            componentCalls[currentComponentIndex].component.propsLoading = false

            // Emit event for props loaded (even though they may be empty/invalid)
            if (events?.onComponentPropsLoaded) {
              events.onComponentPropsLoaded(componentCalls[currentComponentIndex], currentComponentIndex)
            }
          }
        }

        // Pop back to parent
        if (parentStack.length > 0) {
          currentNode = parentStack.pop()!
        }
      }

      readBuffer = ''
      tagOpened = true
      return
    }

    if (tagBracketOpened) {
      // Collecting tag name
      readBuffer += char
    }
    else {
      // Collecting content
      readBuffer += char
    }
  }

  function end(): Root {
    // Handle any remaining text
    if (readBuffer.trim()) {
      currentNode.children.push({
        type: 'text',
        value: readBuffer,
      } as any)

      // Try to parse any remaining props
      if (parserSeekTag === 'props' && inCodeBlock && currentComponentIndex >= 0) {
        try {
          const props = JSON.parse(readBuffer.trim())
          componentCalls[currentComponentIndex].component.props = props
          componentCalls[currentComponentIndex].component.propsLoading = false

          // Emit event for props loaded
          if (events?.onComponentPropsLoaded) {
            events.onComponentPropsLoaded(componentCalls[currentComponentIndex], currentComponentIndex)
          }
        }
        catch (e) {
          console.error('Failed to parse component props:', e)
        }
      }
    }

    return parsedNode
  }

  return {
    consume,
    end,
  }
}

async function handleChatSendMessage() {
  if (!sendingMessage.value.trim()) {
    return
  }

  streamingMessage.value = { role: 'assistant', content: '' }
  messages.value.push({ role: 'user', content: `## Context of capabilities\n\n${(await Promise.all(capabilities.map(async cap => `### ${cap.name}\n\n${await cap.inject()}`))).join('\n')}`, hidden: true })
  messages.value.push({ role: 'user', content: sendingMessage.value })
  messages.value.push(streamingMessage.value)
  sendingMessage.value = ''

  const parser = createParser({
    onComponentDiscovered: (component, index) => {
      if (!streamingMessage.value.component_calls) {
        streamingMessage.value.component_calls = []
      }

      streamingMessage.value.component_calls[index] = {
        component: {
          name: component.component.name,
          props: {},
          propsLoading: true,
        },
        index,
        type: 'component',
      }
    },
    onComponentPropsLoaded: (component, index) => {
      if (streamingMessage.value.component_calls && streamingMessage.value.component_calls[index]) {
        streamingMessage.value.component_calls[index].component.props = component.component.props
        streamingMessage.value.component_calls[index].component.propsLoading = false
      }
    },
  })

  try {
    waiting.value = true

    const response = await streamText({
      baseURL: baseUrl.value,
      apiKey: apiKey.value,
      model: model.value,
      messages: messages.value.slice(0, messages.value.length - 1).map(msg => toRaw(msg)) as UpstreamMessage[],
    })
    // const response = mockStreamText()

    waiting.value = false

    for await (const chunk of response.fullStream) {
      if (chunk.type === 'text-delta') {
        streamingMessage.value.content += chunk.text

        try {
          if (chunk.text.length > 1) {
            for (const char of chunk.text) {
              parser.consume(char)
            }
          }
          else {
            parser.consume(chunk.text)
          }
        }
        catch {
        }
      }
    }
  }
  catch (err) {
    const errorMessage: ErrorMessage = {
      role: 'error',
      content: err.message,
    }

    messages.value.push(errorMessage)
  }
  finally {
    waiting.value = false
  }
}
</script>

<template>
  <div h-full flex flex-col gap-2>
    <div flex="~ col" h-full gap-2>
      <div flex flex-col gap-2>
        <div>
          <span text-neutral-500 dark:text-neutral-400>LLM</span>
        </div>
        <div grid grid-cols-2 gap-2>
          <label flex items-center gap-2>
            <span text-nowrap>
              Base URL
            </span>
            <Input v-model="baseUrl" />
          </label>
          <label flex items-center gap-2>
            <span text-nowrap>
              API Key
            </span>
            <Input v-model="apiKey" type="password" />
          </label>
          <label flex items-center gap-2>
            <span text-nowrap>
              Model
            </span>
            <Input v-model="model" />
          </label>
        </div>
      </div>
      <div v-if="false">
        <template v-for="(componentDef, index) of widgets.components" :key="index">
          <component :is="componentDef.component" v-bind="componentDef.exampleProps" :props-loading="true" />
          <component :is="componentDef.component" v-bind="componentDef.exampleProps" :props-loading="false" />
        </template>
      </div>
      <div bg="neutral-50/20 dark:neutral-950/20" flex flex-1 flex-col gap-2 rounded-xl p-4 backdrop-blur-lg>
        <div v-for="(message, index) of messages" :key="index">
          <div v-if="message.role === 'error'" bg="red-100 dark:red-900" w-fit break-words rounded-lg px-3 py-1>
            <span>
              {{ message.content }}
            </span>
          </div>
          <div v-if="message.role === 'user' && !message.hidden" bg="primary-100 dark:primary-900" w-fit break-words rounded-lg px-3 py-1>
            <span>
              {{ message.content }}
            </span>
          </div>
          <template v-if="message.role === 'assistant' && message.component_calls && message.component_calls.length">
            <template v-for="(componentCall) of message.component_calls" :key="componentCall.index">
              <component
                :is="widgets.components.find(c => c.name === componentCall.component.name)?.component"
                :props-loading="componentCall.component.propsLoading"
                v-bind="componentCall.component.props"
              />
            </template>
          </template>
          <template v-else-if="message.role === 'assistant' && !message.component_calls">
            <div bg="neutral-100 dark:neutral-800" w-fit break-words rounded-lg px-3 py-1>
              <div v-if="index === messages.length - 1 && waiting">
                <div i-svg-spinners:3-dots-scale />
              </div>
              <div v-else-if="message.content">
                <span>
                  {{ message.content }}
                </span>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div w-full>
        <div>
          <Textarea v-model="sendingMessage" @submit="handleChatSendMessage" />
        </div>
        <button bg="primary-200 dark:primary-900" w-full rounded-lg px-4 py-2 outline-none @click="handleChatSendMessage">
          Send
        </button>
      </div>
    </div>
  </div>
</template>
