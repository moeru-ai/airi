<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useElementHover, useEventListener } from '@vueuse/core'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useDesktopCompanionStore } from '../stores/desktop-companion'

const emit = defineEmits<{ interactionChange: [active: boolean] }>()
const root = ref<HTMLElement>()
const hovered = useElementHover(root)

const desktop = useDesktopCompanionStore()
const { t } = useI18n()
const opened = ref(false)
const pending = ref(false)
const prefix = 'tamagotchi.settings.desktop-companion'
const interactive = computed(() => desktop.snapshot.notifications.length > 0 && (hovered.value || opened.value))
watch(interactive, active => emit('interactionChange', active), { immediate: true })
onUnmounted(() => emit('interactionChange', false))
useEventListener(window, 'keydown', (event) => {
  if (event.key === 'Escape')
    opened.value = false
})

async function run(action: () => Promise<void>) {
  if (pending.value)
    return
  pending.value = true
  try {
    await action()
  }
  catch {
    toast.error(t(`${prefix}.save-error`))
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div v-if="desktop.snapshot.notifications.length > 0" ref="root" :class="['absolute right-3 top-3 z-40 max-w-[calc(100%-1.5rem)]']">
    <Button
      icon="i-solar:bell-line-duotone"
      :label="t(`${prefix}.unread`, { count: desktop.snapshot.unreadCount })"
      :aria-expanded="opened"
      aria-controls="desktop-notification-inbox"
      @click="opened = !opened"
    />
    <section
      v-if="opened"
      id="desktop-notification-inbox"
      :aria-label="t(`${prefix}.title`)"
      :class="['mt-2 max-h-[70vh] w-80 max-w-full overflow-y-auto rounded-xl p-3 shadow-lg', 'bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100']"
    >
      <div :class="['mb-3 flex flex-wrap gap-2']">
        <Button size="sm" :label="t(`${prefix}.mark-all-read`)" :disabled="pending || desktop.snapshot.unreadCount === 0" @click="run(() => desktop.markRead())" />
        <Button size="sm" :label="t(`${prefix}.clear`)" :disabled="pending" @click="run(desktop.clear)" />
        <Button size="sm" :label="t(`${prefix}.close`)" @click="opened = false" />
      </div>
      <p v-if="desktop.snapshot.archivedUnreadCount > 0" :class="['text-xs text-neutral-600 dark:text-neutral-400']">
        {{ t(`${prefix}.archived-unread`, { count: desktop.snapshot.archivedUnreadCount }) }}
      </p>
      <ul :class="['m-0 grid list-none gap-3 p-0']">
        <li v-for="item in desktop.snapshot.notifications" :key="item.id" :class="['grid gap-1 rounded-lg p-2', 'bg-white dark:bg-neutral-800']">
          <p :class="['m-0 whitespace-pre-wrap break-words text-sm']">
            {{ item.body || t(`${prefix}.private-message`) }}
          </p>
          <p :class="['m-0 text-xs text-neutral-600 dark:text-neutral-400']">
            {{ t(`${prefix}.source.${item.source}`) }} · {{ new Date(item.updatedAt).toLocaleString() }}
            <span v-if="item.occurrences > 1"> · {{ t(`${prefix}.occurrences`, { count: item.occurrences }) }}</span>
          </p>
          <p :class="['m-0 text-xs text-neutral-600 dark:text-neutral-400']">
            {{ t(`${prefix}.delivery.${item.nativeState}`) }}
          </p>
          <Button v-if="!item.read" size="sm" :label="t(`${prefix}.mark-read`)" :disabled="pending" @click="run(() => desktop.markRead(item.id))" />
        </li>
      </ul>
    </section>
  </div>
</template>
