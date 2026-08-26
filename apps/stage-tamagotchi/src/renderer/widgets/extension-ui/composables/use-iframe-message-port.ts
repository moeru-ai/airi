import type { WidgetsIframeInitPayload } from '@proj-airi/plugin-sdk-tamagotchi/widgets'
import type { MaybeElementRef } from '@vueuse/core'
import type { ComputedRef } from 'vue'

import type { PluginHostModuleSummary } from '../../../../shared/eventa/plugin/host'

import { createContext } from '@moeru/eventa/adapters/window-message'
import { errorMessageFrom } from '@moeru/std'
import {
  widgetsIframeChannel,
  widgetsIframeInitEvent,
  widgetsIframePublishEvent,
  widgetsIframeReadyEvent,
} from '@proj-airi/plugin-sdk-tamagotchi/widgets'
import { unrefElement } from '@vueuse/core'
import { onBeforeUnmount, shallowRef, toRaw, watch } from 'vue'

/**
 * Normalizes extension iframe payload records into structured-clone-safe data.
 *
 * Before:
 * - Vue reactive proxy records containing nested proxies or callback fields
 *
 * After:
 * - Plain records that can be passed to `window.postMessage`
 */
export function toWidgetsIframePostMessageRecord(value: unknown): Record<string, unknown> {
  const normalized = toWidgetsIframePostMessageValue(value)
  return normalized && typeof normalized === 'object' && !Array.isArray(normalized)
    ? normalized as Record<string, unknown>
    : {}
}

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
    moduleConfig: ComputedRef<Record<string, unknown>>
    moduleId: ComputedRef<string | undefined>
    moduleSnapshot: ComputedRef<PluginHostModuleSummary | undefined>
    onPublish?: (event: Record<string, unknown>) => Promise<void> | void
    propsPayload: ComputedRef<Record<string, unknown>>
  },
) {
  const iframeLoadError = shallowRef<string>()
  const iframeReady = shallowRef(false)

  const iframeRuntime = createContext({
    channel: widgetsIframeChannel,
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

  function createInitPayload(): WidgetsIframeInitPayload {
    const module = options.moduleSnapshot.value
    return {
      config: toWidgetsIframePostMessageRecord(options.moduleConfig.value),
      module: module ? toWidgetsIframePostMessageRecord(module) : undefined,
      moduleId: module?.moduleId,
      props: toWidgetsIframePostMessageRecord(options.propsPayload.value),
    }
  }

  function emitInitPayload() {
    try {
      iframeRuntime.context.emit(widgetsIframeInitEvent, createInitPayload())
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to send extension UI iframe init payload.'
      iframeLoadError.value = message
      console.error('[extension-ui] Failed to emit iframe init payload', {
        error,
        errorMessage: message,
        moduleId: options.moduleId.value,
      })
    }
  }

  function onIframeLoad() {
    // NOTICE:
    // A host component can mount after an already-loaded iframe during dev HMR
    // or renderer remounts, which means the iframe's one-shot ready event may
    // have already been emitted. Treat load as the point where invokes may be
    // attempted; Eventa still owns request timeout/error handling if the iframe
    // has not registered its handler yet.
    iframeReady.value = true
    iframeLoadError.value = undefined
    emitInitPayload()
  }

  function onIframeError() {
    iframeReady.value = false
    iframeLoadError.value = 'Failed to load extension UI iframe source.'
  }

  iframeRuntime.context.on(widgetsIframeReadyEvent, () => {
    iframeReady.value = true
    emitInitPayload()
  })

  iframeRuntime.context.on(widgetsIframePublishEvent, (event) => {
    if (!event.body || typeof event.body !== 'object' || Array.isArray(event.body)) {
      return
    }

    void options.onPublish?.(event.body as Record<string, unknown>)
  })

  watch(options.moduleId, () => {
    iframeReady.value = false
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
    iframeReady,
    onIframeError,
    onIframeLoad,
  }
}

function toWidgetsIframePostMessageValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'bigint') {
    return value
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined
  }

  const raw = toRaw(value)
  if (!raw || typeof raw !== 'object') {
    return raw
  }

  if (seen.has(raw)) {
    return undefined
  }
  seen.add(raw)

  if (Array.isArray(raw)) {
    const arrayValue = raw.map(item => toWidgetsIframePostMessageValue(item, seen))
    seen.delete(raw)
    return arrayValue
  }

  if (raw instanceof Date) {
    seen.delete(raw)
    return raw.toISOString()
  }

  const recordValue = Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .map(([key, entry]) => [key, toWidgetsIframePostMessageValue(entry, seen)])
      .filter(([, entry]) => entry !== undefined),
  )
  seen.delete(raw)
  return recordValue
}
