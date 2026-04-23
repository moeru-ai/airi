import type { MaybeElementRef } from '@vueuse/core'
import type { ComputedRef } from 'vue'

import type { PluginHostModuleSummary } from '../../../../shared/eventa/plugin/host'

import { unrefElement } from '@vueuse/core'
import { onBeforeUnmount, shallowRef, watch } from 'vue'

import {
  extensionUiBridgeEventaChannel,
  extensionUiBridgeInitEvent,
  extensionUiBridgeReadyEvent,
} from '../shared/eventa'
import { createWindowMessageEventaContext } from '../shared/eventa-runtime'

/**
 * Manages typed parent-to-iframe messaging for one extension UI iframe.
 *
 * Use when:
 * - A renderer widget mounts an extension iframe and needs to keep it synchronized with host state
 * - A module iframe needs a typed postMessage transport for init and ready handshakes
 *
 * Expects:
 * - `target` resolves to the mounted iframe element when available
 * - `moduleId` changes when the mounted extension module changes
 * - `moduleSnapshot`, `moduleConfig`, and `propsPayload` stay structured-clone-safe for postMessage transport
 *
 * Returns:
 * - Eventa iframe context for optional host-side message handling
 * - Reactive iframe load error state
 * - iframe load/error handlers for the host component template
 */
export function useIframeMessagePort(
  target: MaybeElementRef,
  options: {
    moduleId: ComputedRef<string | undefined>
    moduleSnapshot: ComputedRef<PluginHostModuleSummary | undefined>
    moduleConfig: ComputedRef<Record<string, unknown>>
    propsPayload: ComputedRef<Record<string, unknown>>
  },
) {
  const iframeLoadError = shallowRef<string>()

  const iframeRuntime = createWindowMessageEventaContext({
    channel: extensionUiBridgeEventaChannel,
    currentWindow: window,
    expectedSource: () => {
      const iframeElement = unrefElement(target)
      return iframeElement instanceof HTMLIFrameElement ? iframeElement.contentWindow : null
    },
    targetWindow: () => {
      const iframeElement = unrefElement(target)
      return iframeElement instanceof HTMLIFrameElement ? iframeElement.contentWindow : null
    },
  })

  function createInitPayload() {
    return {
      moduleId: options.moduleSnapshot.value?.moduleId,
      module: options.moduleSnapshot.value,
      config: options.moduleConfig.value,
      props: options.propsPayload.value,
    }
  }

  function emitInitPayload() {
    iframeRuntime.context.emit(extensionUiBridgeInitEvent, createInitPayload())
  }

  function onIframeLoad() {
    iframeLoadError.value = undefined
    emitInitPayload()
  }

  function onIframeError() {
    iframeLoadError.value = 'Failed to load extension UI iframe source.'
  }

  iframeRuntime.context.on(extensionUiBridgeReadyEvent, () => {
    emitInitPayload()
  })

  watch(options.moduleId, () => {
    emitInitPayload()
  }, { immediate: true })

  watch(options.propsPayload, () => {
    emitInitPayload()
  })

  watch(options.moduleConfig, () => {
    emitInitPayload()
  })

  onBeforeUnmount(() => {
    iframeRuntime.dispose()
  })

  return {
    context: iframeRuntime.context,
    iframeLoadError,
    onIframeLoad,
    onIframeError,
  }
}
