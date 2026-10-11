import type { MaybeRefOrGetter } from 'vue'

import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { chatAssetIdFrom, readChatAsset } from '../libs/chat-assets'

/**
 * Turns message media sources into URLs that an `img` or `audio` element can load.
 *
 * An asset reference becomes an object URL of the stored bytes. It stays `undefined` while it loads, or when the asset
 * is missing. Any other source, such as a data URL, passes through. Object URLs are revoked when the sources change
 * and when the scope ends.
 *
 * Use when:
 * - A chat message renders its images or recordings
 */
export function useChatAssetUrls(sources: MaybeRefOrGetter<readonly string[]>) {
  const urls = shallowRef<(string | undefined)[]>([])
  let created: string[] = []

  function revoke() {
    created.forEach(url => URL.revokeObjectURL(url))
    created = []
  }

  watch(() => [...toValue(sources)], async (values, _, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    urls.value = values.map(value => chatAssetIdFrom(value) ? undefined : value)
    const loaded = await Promise.all(values.map(async (value) => {
      if (!chatAssetIdFrom(value))
        return value
      const record = await readChatAsset(value).catch(() => undefined)
      return record ? URL.createObjectURL(record.blob) : undefined
    }))
    const fresh = loaded.filter((url, index): url is string => !!url && url !== values[index])
    if (cancelled) {
      fresh.forEach(url => URL.revokeObjectURL(url))
      return
    }
    revoke()
    created = fresh
    urls.value = loaded
  }, { immediate: true })

  onScopeDispose(revoke)

  return urls
}
