<script setup lang="ts">
import type { WidgetsIframeRequestPayload, WidgetsIframeRequestResultPayload, WidgetSnapshot } from '../../shared/eventa'

import { computed, defineAsyncComponent, defineComponent, h } from 'vue'

const props = defineProps<{
  widget: WidgetSnapshot
  pendingRequests: WidgetsIframeRequestPayload[]
}>()

const emit = defineEmits<{
  iframeRequestResult: [result: WidgetsIframeRequestResultPayload]
}>()

const Registry: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  'extension-ui': defineAsyncComponent(async () => (await import('../widgets/extension-ui')).ExtensionUi),
  'whiteboard-gamelet': defineAsyncComponent(async () => (await import('@proj-airi/airi-extension-whiteboard/ui')).WhiteboardGamelet),
  'map': defineAsyncComponent(async () => (await import('../widgets/map')).Map),
  'weather': defineAsyncComponent(async () => (await import('../widgets/weather')).Weather),
  'artistry': defineAsyncComponent(async () => (await import('../widgets/artistry')).Artistry),
}

const GenericWidget = defineComponent({
  name: 'GenericWidget',
  props: { title: { type: String, required: true }, modelValue: { type: Object, default: () => ({}) } },
  setup(genericProps) {
    return () => h('div', { class: [
      'h-full w-full flex flex-col gap-2 rounded-xl',
      'bg-[rgba(28,28,28,0.72)] p-3 text-neutral-100',
      'shadow-[0_8px_20px_rgba(0,0,0,0.35)] backdrop-blur-md',
    ] }, [
      h('div', { class: ['flex', 'items-center', 'justify-between'] }, [
        h('div', { class: ['text-sm', 'font-medium', 'opacity-90'] }, genericProps.title),
      ]),
      h('div', { class: [
        'pointer-events-auto max-h-full min-h-0 flex-1 overflow-auto rounded-md',
        'bg-black/10 p-2 text-[11px]',
      ] }, [
        h('pre', { class: ['whitespace-pre-wrap', 'break-words', 'opacity-80'] }, JSON.stringify(genericProps.modelValue, null, 2)),
      ]),
    ])
  },
})

const resolvedComponent = computed(() => {
  const key = props.widget.componentName?.trim()
  if (!key)
    return GenericWidget

  return Registry[key] ?? Registry[key.toLowerCase()] ?? GenericWidget
})

const normalizedComponentName = computed(() => props.widget.componentName.trim().toLowerCase())
const isWhiteboard = computed(() => normalizedComponentName.value === 'whiteboard-gamelet')
const isExtensionUi = computed(() => normalizedComponentName.value === 'extension-ui')

function handleIframeRequestResult(result: WidgetsIframeRequestResultPayload) {
  emit('iframeRequestResult', result)
}
</script>

<template>
  <component
    :is="resolvedComponent"
    v-bind="widget.componentProps"
    :id="widget.id"
    :key="widget.id"
    :title="widget.componentName"
    :model-value="widget.componentProps"
    :size="widget.size"
    :pending-requests="isWhiteboard ? pendingRequests : undefined"
    :pending-iframe-requests="isExtensionUi ? pendingRequests : undefined"
    @iframe-request-result="handleIframeRequestResult"
  />
</template>
