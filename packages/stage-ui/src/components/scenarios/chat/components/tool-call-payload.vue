<script setup lang="ts">
import VueJsonPretty from 'vue-json-pretty'

import { IconButton, useTheme } from '@proj-airi/ui'
import { useClipboard } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ToolCallPayloadNode from './tool-call-payload-node.vue'
import ToolCallScrollArea from './tool-call-scroll-area.vue'

import { useSettingsDeveloper } from '../../../../stores/settings/developer'
import { formatToolPayload, parseToolPayload } from './tool-call-group'

/** Tool arguments or a tool result, shown as fields and values the same way for every tool. */
const props = defineProps<{
  label: string
  payload: unknown
}>()

const node = computed(() => formatToolPayload(props.payload))

const { showToolPayloadsAsJson } = storeToRefs(useSettingsDeveloper())
const { isDark } = useTheme()
// Tool arguments and results arrive as JSON, so the parsed payload is data that the tree can show.
const jsonData = computed(() => parseToolPayload(props.payload) as InstanceType<typeof VueJsonPretty>['$props']['data'])

const { t } = useI18n()
const { copy, copied } = useClipboard({ legacy: true })

// The copy keeps the payload as the tool sent it. A string stays as is, and an object becomes indented JSON.
function copyRaw() {
  void copy(typeof props.payload === 'string' ? props.payload : JSON.stringify(props.payload, null, 2))
}
</script>

<template>
  <div v-if="node" :class="['flex flex-col gap-1']">
    <div :class="['flex items-center gap-1']">
      <span :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ props.label }}</span>
      <!-- The icon sits in the slot, so it keeps the label size. The hit area reaches past it, so a finger still lands on it. -->
      <IconButton
        type="button"
        :aria-label="copied ? t('stage.chat.tool-calls.copied') : t('stage.chat.tool-calls.copy')"
        :title="copied ? t('stage.chat.tool-calls.copied') : t('stage.chat.tool-calls.copy')"
        :class="[
          'relative size-5 rounded-md outline-none',
          `after:absolute after:-inset-1.5 after:content-['']`,
          'text-neutral-400 hover:bg-neutral-200/70 hover:text-primary-600',
          'dark:text-neutral-500 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
          'focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="copyRaw"
      >
        <span :class="[copied ? 'i-mingcute:check-line' : 'i-mingcute:copy-2-line', 'block text-xs']" aria-hidden="true" />
      </IconButton>
    </div>
    <!-- The neutral panel of the group frames the details, so a payload has no box of its own. -->
    <ToolCallScrollArea>
      <!-- The developer setting shows the payload as a JSON tree, in the look of the tree library. -->
      <VueJsonPretty v-if="showToolPayloadsAsJson" :data="jsonData" :theme="isDark ? 'dark' : 'light'" />
      <ToolCallPayloadNode v-else :node="node" />
    </ToolCallScrollArea>
  </div>
</template>

<style>
@import 'vue-json-pretty/lib/styles.css';
</style>
