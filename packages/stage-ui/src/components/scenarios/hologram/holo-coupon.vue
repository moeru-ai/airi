<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAnnouncements } from '../../../composables/announcements'

const props = defineProps<{ client: 'web' | 'desktop' }>()
const { locale, t } = useI18n()
const { announcements } = useAnnouncements(() => props.client, locale)
const open = defineModel<boolean>('open', { default: false })
const triggerElement = ref<HTMLDivElement>()

// Electron tracks this element with native cursor coordinates. The open model
// keeps the window interactive while the portaled content is visible.
defineExpose({ triggerElement })
const current = ref(0)
const active = computed(() => announcements.value[current.value])

watch(announcements, (items) => {
  if (current.value >= items.length)
    current.value = 0
  if (items.length === 0)
    open.value = false
})
</script>

<template>
  <div v-if="active" ref="triggerElement" :class="['fixed bottom-10 left-6 z-50', 'pointer-events-auto']">
    <PopoverRoot v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          icon="i-solar:bell-bold-duotone"
          :aria-label="t('stage.announcements.open')"
          :title="t('stage.announcements.open')"
          shape="circle"
        />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          side="top" align="start" :side-offset="12"
          :aria-label="t('stage.announcements.title')"
          :class="[
            'z-60 w-90 max-w-[calc(100vw-3rem)] rounded-3xl p-5 shadow-xl',
            'border border-neutral-200 dark:border-neutral-700',
            'bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100',
          ]"
        >
          <header :class="['mb-4 flex items-center justify-between gap-3']">
            <span :class="['text-xs text-primary-600 font-semibold dark:text-primary-300']">{{ t('stage.announcements.title') }}</span>
            <PopoverClose as-child>
              <Button size="sm" icon="i-lucide:x" :aria-label="t('stage.announcements.close')" />
            </PopoverClose>
          </header>
          <article :class="['max-h-[50dvh] overflow-y-auto break-words']">
            <h2 :class="['mb-3 text-xl font-semibold']">
              {{ active.title }}
            </h2>
            <p :class="['whitespace-pre-wrap text-sm leading-relaxed', 'text-neutral-600 dark:text-neutral-300']">
              {{ active.body }}
            </p>
            <a
              v-if="active.actionUrl"
              :href="active.actionUrl" target="_blank" rel="noopener noreferrer"
              :class="['mt-5 inline-block rounded-xl px-4 py-2 text-sm font-semibold', 'bg-primary-500 text-white hover:bg-primary-600']"
            >{{ active.actionLabel }}</a>
          </article>
          <footer v-if="announcements.length > 1" :class="['mt-4 flex items-center justify-between gap-2']">
            <Button size="sm" icon="i-lucide:chevron-left" :disabled="current === 0" :aria-label="t('stage.announcements.previous')" @click="current--" />
            <span :class="['text-xs text-neutral-500']">{{ current + 1 }} / {{ announcements.length }}</span>
            <Button size="sm" icon="i-lucide:chevron-right" :disabled="current === announcements.length - 1" :aria-label="t('stage.announcements.next')" @click="current++" />
          </footer>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>
