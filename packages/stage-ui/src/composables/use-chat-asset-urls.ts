import type { MaybeRefOrGetter } from 'vue'

import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { chatAssetIdFrom, readChatAsset } from '../libs/chat-assets'

/**
 * Turns message media sources into URLs that an `img` or `audio` element can load.
 *
 * An asset reference becomes an object URL of the stored bytes. It stays `undefined` while it loads, or when the asset
 * is missing. Any other source, such as a data URL, passes through. Object URLs are revoked after their source
 * leaves the list or when the scope ends.
 *
 * Use when:
 * - A chat message renders its images or recordings
 */
export function useChatAssetUrls(sources: MaybeRefOrGetter<readonly (string | undefined)[]>) {
  const urls = shallowRef<(string | undefined)[]>([])
  const objectUrls = new Map<string, string>()

  watch(() => [...toValue(sources)], async (values, _, onCleanup) => {
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

    const resolveUrls = () => values.map(value => value && assets.has(value) ? objectUrls.get(value) : value)
    urls.value = resolveUrls()
    const missing = [...assets].filter(source => !objectUrls.has(source))
    if (!missing.length)
      return

    const records = await Promise.all(missing.map(source => readChatAsset(source).catch(() => undefined)))
    if (cancelled)
      return

    for (const [index, record] of records.entries()) {
      if (record)
        objectUrls.set(missing[index], URL.createObjectURL(record.blob))
    }
    urls.value = resolveUrls()
  }, { immediate: true })

  onScopeDispose(() => objectUrls.forEach(url => URL.revokeObjectURL(url)))

  return urls
}
