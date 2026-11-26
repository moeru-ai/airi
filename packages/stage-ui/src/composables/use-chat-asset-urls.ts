import type { MaybeRefOrGetter } from 'vue'

import { onScopeDispose, shallowReactive, toValue, watch } from 'vue'

import { chatAssetIdFrom, readChatAsset } from '../libs/chat-assets'

/**
 * Looks up the object URL for a stored chat asset. Other URLs pass through.
 * An object URL stays valid while its source is in the list and the scope is active.
 */
export function useChatAssetUrls(sources: MaybeRefOrGetter<readonly (string | undefined)[]>) {
  const objectUrls = shallowReactive(new Map<string, string>())

  watch(() => [...toValue(sources)], (values, _, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    const assets = new Set(values.filter((value): value is string => !!value && !!chatAssetIdFrom(value)))
    for (const [source, url] of objectUrls) {
      if (!assets.has(source)) {
        URL.revokeObjectURL(url)
        objectUrls.delete(source)
      }
    }

    for (const source of assets) {
      if (objectUrls.has(source))
        continue

      void readChatAsset(source).then(({ blob }) => {
        if (!cancelled)
          objectUrls.set(source, URL.createObjectURL(blob))
      }, () => undefined)
    }
  }, { immediate: true })

  onScopeDispose(() => objectUrls.forEach(url => URL.revokeObjectURL(url)))

  return (source?: string) => source && chatAssetIdFrom(source) ? objectUrls.get(source) : source
}
