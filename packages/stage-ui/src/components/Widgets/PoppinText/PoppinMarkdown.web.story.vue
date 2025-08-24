<script setup lang="ts">
import { FieldRange } from '@proj-airi/ui'
import { ref } from 'vue'

import PoppinMarkdown from './PoppinMarkdown.web.vue'

import {
  createCutePopupAnimator,
  createFadeAnimator,
  createFloatAnimator,
  createPopupAnimator,
  createStackAnimator,
} from './animators'

const duration = ref(750)

// Sample markdown content
const markdownText = ref(`# Hello World

This is **bold text** and *italic text*.

Here's a list:
- Item 1
- Item 2
- Item 3

\`\`\`javascript
console.log('Hello, world!');
\`\`\`

> This is a blockquote with some **bold** content.

And here's a [link](https://example.com) and some inline \`code\`.`)

const chatMarkdown = ref(`Hi! I can help you with **markdown**. Here are some examples:

- *Italics* and **bold** text
- \`inline code\` snippets
- Even [links](https://example.com)

\`\`\`typescript
function greet(name: string) {
  console.log(\`Hello, \${name}!\`);
}
\`\`\`

What would you like to know?`)

function createMarkdownStream(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(text)
      let index = 0
      const interval = setInterval(() => {
        if (index < bytes.length) {
          controller.enqueue(bytes.subarray(index, index + 1))
          index++
        }
        else {
          clearInterval(interval)
          controller.close()
        }
      }, 30 + 50 * Math.random()) // Faster for better demo
    },
  })
}

const streamingMarkdown = createMarkdownStream(`# Streaming Markdown Demo

This text is being **streamed** character by character!

## Features

- Real-time *markdown* rendering
- **Character-by-character** animation
- Support for \`code\` and other elements

\`\`\`javascript
// Code blocks appear as complete units
const message = "Hello from streaming markdown!";
console.log(message);
\`\`\`

> Blockquotes work too with **mixed** formatting.

Pretty cool, right?`)

const chatStreamingMarkdown = createMarkdownStream(`🤖 **AI Assistant**: Hello! I can help you with various tasks.

Here's what I can do:
- Answer questions about **programming**
- Help with \`code debugging\`
- Explain *technical concepts*

\`\`\`python
# Example: Python function
def greet_user(name):
    return f"Hello, {name}! How can I help?"

print(greet_user("Developer"))
\`\`\`

> 💡 **Tip**: I stream my responses in real-time for a better experience!

What would you like to work on today?`)
</script>

<template>
  <Story
    title="PoppinMarkdown"
    group="widgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <div px-2>
        <FieldRange
          v-model.number="duration"
          :min="50"
          :max="3000"
          :step="50"
          label="Animation Duration"
        />
      </div>
    </template>

    <Variant
      id="static-markdown"
      title="Static Markdown"
    >
      <div h-auto max-w-2xl w-full p-4>
        <PoppinMarkdown
          :text="markdownText"
          :animator="createFadeAnimator({ duration })"
          class="prose-sm prose dark:prose-invert"
        />
      </div>
    </Variant>

    <Variant
      id="streaming-markdown"
      title="Streaming Markdown"
    >
      <div h-auto max-w-2xl w-full p-4>
        <PoppinMarkdown
          :text="streamingMarkdown"
          :animator="createFadeAnimator({ duration: 100 })"
          class="prose-sm prose dark:prose-invert"
        />
      </div>
    </Variant>

    <Variant
      id="chat-style"
      title="Chat Style"
    >
      <div h-auto max-w-2xl w-full p-4>
        <div
          class="border-2 border-primary-200/50 rounded-lg border-solid bg-primary-50/50 p-4 dark:border-primary-500/50 dark:bg-primary-950/70"
        >
          <PoppinMarkdown
            :text="chatMarkdown"
            :animator="createFadeAnimator({ duration: 150 })"
            class="prose-sm prose prose-primary dark:prose-invert"
          />
        </div>
      </div>
    </Variant>

    <Variant
      id="streaming-chat"
      title="Streaming Chat Response"
    >
      <div h-auto max-w-2xl w-full p-4>
        <div
          class="border-2 border-primary-200/50 rounded-lg border-solid bg-primary-50/50 p-4 dark:border-primary-500/50 dark:bg-primary-950/70"
        >
          <PoppinMarkdown
            :text="chatStreamingMarkdown"
            :animator="createFadeAnimator({ duration: 80 })"
            class="prose-sm prose prose-primary dark:prose-invert"
          />
        </div>
      </div>
    </Variant>

    <Variant
      id="popup-animation"
      title="Popup Animation"
    >
      <div h-auto max-w-2xl w-full p-4>
        <PoppinMarkdown
          :text="markdownText"
          :animator="createPopupAnimator({ duration })"
          class="prose-sm prose dark:prose-invert"
        />
      </div>
    </Variant>

    <Variant
      id="float-animation"
      title="Float Animation"
    >
      <div h-auto max-w-2xl w-full p-4>
        <PoppinMarkdown
          :text="markdownText"
          :animator="createFloatAnimator({ duration })"
          class="prose-sm prose dark:prose-invert"
        />
      </div>
    </Variant>

    <Variant
      id="cute-popup"
      title="Cute Popup"
    >
      <div h-auto max-w-2xl w-full p-4>
        <PoppinMarkdown
          :text="chatMarkdown"
          :animator="createCutePopupAnimator({ duration })"
          class="prose-sm prose dark:prose-invert"
        />
      </div>
    </Variant>

    <Variant
      id="stack-animation"
      title="Stack Animation"
    >
      <div h-auto max-w-2xl w-full p-4>
        <PoppinMarkdown
          :text="markdownText"
          :animator="createStackAnimator({ duration })"
          class="prose-sm prose dark:prose-invert"
        />
      </div>
    </Variant>

    <Variant
      id="no-markdown"
      title="Plain Text Mode"
    >
      <div h-auto max-w-2xl w-full p-4>
        <PoppinMarkdown
          :text="markdownText"
          :markdown="false"
          :animator="createFadeAnimator({ duration })"
          class="text-sm font-mono"
        />
      </div>
    </Variant>
  </Story>
</template>
