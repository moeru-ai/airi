<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'

import type { PluginHostModuleSummary, PluginModuleWidgetPayload } from '../../../../shared/eventa/plugin/host'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { isPlainObject } from 'es-toolkit'
import { computed, shallowRef } from 'vue'

import { widgetsIframePublish } from '../../../../shared/eventa'
import { electronPluginGetAssetBaseUrl } from '../../../../shared/eventa/plugin/assets'
import { electronPluginInspect } from '../../../../shared/eventa/plugin/host'
import { publishWidgetSparkNotifyReaction } from '../composables/use-bridge-spark'
import { useExtensionUIForModule } from '../composables/use-extension-ui-for-module'
import { useIframeMessagePort } from '../composables/use-iframe-message-port'
import { canRenderExtensionUi, sanitizeExtensionUiRenderProps } from '../host'

const props = withDefaults(defineProps<{
  title?: string
  modelValue?: Record<string, any>
  moduleId?: string
  componentProps?: Record<string, any>
  payload?: Record<string, any>
}>(), {
  title: 'Extension UI',
  modelValue: () => ({}),
  moduleId: undefined,
  componentProps: undefined,
  payload: undefined,
})

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }

    const normalized = value.trim()
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

function omitControlFields(record: Record<string, any>) {
  const {
    componentProps: _componentProps,
    moduleId: _moduleId,
    payload: _payload,
    title: _title,
    windowSize: _windowSize,
    ...rest
  } = record

  return rest
}

const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)
const getPluginAssetBaseUrl = useElectronEventaInvoke(electronPluginGetAssetBaseUrl)
const publishWidgetIframeEvent = useElectronEventaInvoke(widgetsIframePublish)
const contextBridgeStore = useContextBridgeStore()

const model = computed<PluginModuleWidgetPayload & Record<string, unknown>>(() => (
  isPlainObject(props.modelValue) ? props.modelValue as PluginModuleWidgetPayload & Record<string, unknown> : {} as PluginModuleWidgetPayload & Record<string, unknown>
))
const moduleId = computed(() => firstString(props.moduleId, model.value.moduleId))
const resolvedTitle = computed(() => firstString(props.title, model.value.title, moduleId.value) ?? 'Extension UI')
const resolvedWidgetProps = computed(() => sanitizeExtensionUiRenderProps({
  ...omitControlFields(model.value),
  ...(isPlainObject(model.value.componentProps) ? model.value.componentProps as Record<string, unknown> : {}),
  ...(isPlainObject(props.componentProps) ? props.componentProps as Record<string, unknown> : {}),
  ...(isPlainObject(props.payload) ? props.payload as Record<string, unknown> : {}),
  ...(isPlainObject(model.value.payload) ? model.value.payload as Record<string, unknown> : {}),
}))

const {
  loading,
  error,
  moduleSnapshot,
  moduleConfig,
  iframeConfig,
  iframeSrc,
  iframeSrcdoc,
  resolvedIframeSrc,
  iframeMountError,
} = useExtensionUIForModule({ moduleId, inspectPluginHost: () => inspectPluginHost(), getPluginAssetBaseUrl: () => getPluginAssetBaseUrl() })

const iframeSandbox = computed(() => firstString(
  iframeConfig.value.sandbox,
  model.value.iframeSandbox,
  'allow-scripts allow-same-origin allow-forms allow-popups',
))

const iframeElement = shallowRef<HTMLIFrameElement | null>(null)

const { context: iframeContext, iframeLoadError, onIframeError, onIframeLoad } = useIframeMessagePort(
  iframeElement,
  {
    moduleId,
    moduleSnapshot: computed(() => moduleSnapshot.value as PluginHostModuleSummary | undefined),
    moduleConfig,
    propsPayload: resolvedWidgetProps,
    onPublish: async (event) => {
      if (!moduleId.value) {
        return
      }

      const handled = await publishWidgetSparkNotifyReaction(event, {
        dispatchSparkNotifyReaction: options => contextBridgeStore.dispatchSparkNotifyReaction(options),
        emit: (eventDefinition, payload) => iframeContext.emit(eventDefinition, payload),
      })
      if (handled) {
        return
      }

      await publishWidgetIframeEvent({
        id: moduleId.value,
        event,
      })
    },
  },
)

function setIframeElement(element: Element | ComponentPublicInstance | null) {
  iframeElement.value = element instanceof HTMLIFrameElement ? element : null
}

const canRenderIframe = computed(() => canRenderExtensionUi({
  loading: loading.value,
  error: error.value,
  iframeLoadError: iframeLoadError.value,
  iframeMountError: iframeMountError.value,
  moduleSnapshot: moduleSnapshot.value,
  iframeSrc: resolvedIframeSrc.value,
  iframeSrcdoc: iframeSrcdoc.value,
}))
</script>

<template>
  <div :class="['h-full', 'w-full']">
    <iframe
      v-if="canRenderIframe"
      :ref="setIframeElement"
      :src="resolvedIframeSrc"
      :srcdoc="iframeSrcdoc"
      :sandbox="iframeSandbox"
      :class="['h-full', 'w-full', 'rounded-xl', 'bg-transparent']"
      allowtransparency="true"
      :style="{ colorScheme: 'auto' }"
      @load="onIframeLoad"
      @error="onIframeError"
    />

    <div
      v-else
      :class="[
        'h-full',
        'w-full',
        'flex',
        'flex-col',
        'gap-3',
        'rounded-xl',
        'bg-[rgba(28,28,28,0.72)]',
        'p-4',
        'text-neutral-100',
        'shadow-[0_8px_20px_rgba(0,0,0,0.35)]',
        'backdrop-blur-md',
      ]"
    >
      <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
        <div>
          <div :class="['text-sm', 'font-semibold']">
            {{ resolvedTitle }}
          </div>
          <div :class="['text-xs', 'opacity-70']">
            {{ moduleId ?? 'No module id provided' }}
          </div>
        </div>
        <div
          v-if="moduleSnapshot"
          :class="['rounded-full', 'bg-white/10', 'px-2', 'py-1', 'text-[11px]', 'uppercase', 'tracking-[0.08em]']"
        >
          {{ moduleSnapshot.state }}
        </div>
      </div>

      <div v-if="loading" :class="['text-sm', 'opacity-80']">
        Loading extension UI...
      </div>

      <div v-else-if="error" :class="['rounded-lg', 'bg-amber-500/12', 'p-3', 'text-sm', 'text-amber-100']">
        {{ error }}
      </div>

      <div v-else-if="iframeLoadError" :class="['rounded-lg', 'bg-amber-500/12', 'p-3', 'text-sm', 'text-amber-100']">
        {{ iframeLoadError }}
      </div>

      <div v-else-if="iframeMountError" :class="['rounded-lg', 'bg-amber-500/12', 'p-3', 'text-sm', 'text-amber-100']">
        {{ iframeMountError }}
      </div>

      <div v-else-if="!iframeSrc && !iframeSrcdoc" :class="['text-sm', 'opacity-80']">
        This module is registered, but it did not declare an iframe source to mount yet.
      </div>

      <dl v-if="moduleSnapshot" :class="['grid', 'grid-cols-[auto_1fr]', 'gap-x-3', 'gap-y-2', 'text-xs', 'opacity-80']">
        <dt>Kit</dt>
        <dd>{{ moduleSnapshot.kitId }}</dd>
        <dt>Type</dt>
        <dd>{{ moduleSnapshot.kitModuleType }}</dd>
        <dt>Runtime</dt>
        <dd>{{ moduleSnapshot.runtime }}</dd>
        <dt>Revision</dt>
        <dd>{{ moduleSnapshot.revision }}</dd>
        <dt>Iframe</dt>
        <dd>{{ iframeSrc ? 'src configured' : (iframeSrcdoc ? 'srcdoc configured' : 'unresolved') }}</dd>
      </dl>

      <div :class="['min-h-0', 'flex-1', 'overflow-auto', 'rounded-lg', 'bg-black/15', 'p-3']">
        <pre :class="['whitespace-pre-wrap', 'break-words', 'text-[11px]', 'opacity-80']">{{ JSON.stringify({
          config: moduleConfig,
          props: resolvedWidgetProps,
        }, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>
