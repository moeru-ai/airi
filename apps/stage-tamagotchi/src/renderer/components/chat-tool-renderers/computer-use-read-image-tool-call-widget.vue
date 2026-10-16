<script setup lang="ts">
import { ChatToolCallScrollArea, MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

import ToolCallScreenshot from './tool-call-screenshot.vue'

import { useComputerUseScreenshots } from './use-computer-use-screenshots'

/**
 * The screenshot of one read image call, with its file name and pixel size.
 * A chat model without vision gets a description in place of the image. The card then reads the screenshot from its file and shows the description under it.
 */
const props = defineProps<{
  path?: string
  urls: string[]
  texts: Array<{ kind: 'description' | 'text', text: string } | { kind: 'failed' }>
}>()

const { t } = useI18n()
const KEY = 'tamagotchi.stage.computer-use-read-image-tool-call'

const files = useComputerUseScreenshots(() => props.urls.length === 0 && props.path ? [props.path] : undefined)
const screenshots = computed(() => props.urls.length > 0 ? props.urls : [...files.values()])
const fileName = computed(() => props.path?.split(/[\\/]/).at(-1) ?? '')

/** The pixel size of each screenshot, read when it loads. */
const sizes = reactive(new Map<string, string>())

function recordSize(url: string, event: Event) {
  const image = event.target as HTMLImageElement
  sizes.set(url, `${image.naturalWidth} × ${image.naturalHeight}`)
}
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <div v-for="url in screenshots" :key="url" :class="['flex flex-col gap-1.5']">
      <ToolCallScreenshot :url="url" :title="fileName" @load="recordSize(url, $event)" />
      <div :class="['flex justify-between gap-2 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
        <span :class="['min-w-0 truncate']">{{ fileName }}</span>
        <span :class="['shrink-0 tabular-nums']">{{ sizes.get(url) }}</span>
      </div>
    </div>
    <template v-for="(part, index) in props.texts" :key="index">
      <div
        v-if="part.kind === 'failed'"
        :class="['flex items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-xs', 'bg-white text-neutral-500 dark:bg-neutral-900/60 dark:text-neutral-400']"
      >
        <span :class="['i-mingcute:eye-close-line', 'shrink-0']" aria-hidden="true" />
        {{ t(`${KEY}.failed`) }}
      </div>
      <div v-else :class="['flex flex-col gap-1']">
        <span v-if="part.kind === 'description'" :class="['inline-flex items-center gap-1 text-xs', 'text-neutral-500 dark:text-neutral-400']">
          <span :class="['i-mingcute:eye-2-line']" aria-hidden="true" />
          {{ t(`${KEY}.description`) }}
        </span>
        <div :class="['rounded-[10px] px-2.5 py-2 text-xs', 'bg-white text-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-100']">
          <ChatToolCallScrollArea>
            <MarkdownRenderer :content="part.text" />
          </ChatToolCallScrollArea>
        </div>
      </div>
    </template>
  </div>
</template>
