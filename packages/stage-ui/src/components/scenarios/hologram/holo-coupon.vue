<script setup lang="ts">
import { BasicButton, BottomDrawer, Button } from '@proj-airi/ui'
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AnnouncementCarousel from './announcement-carousel.vue'

import { useAnnouncements } from '../../../composables/announcements'

const props = withDefaults(defineProps<{
  client: 'web' | 'desktop'
  /** The mobile header owns a drawer trigger; desktop stages use a floating popover. @default 'popover' */
  presentation?: 'popover' | 'drawer'
}>(), { presentation: 'popover' })
const { locale, t } = useI18n()
const { announcements } = useAnnouncements(() => props.client, locale)
const open = defineModel<boolean>('open', { default: false })
const selectedId = ref('')
const triggerElement = ref<HTMLDivElement>()

// Electron tracks the floating trigger with native cursor coordinates and keeps
// input active while its portaled popover is open. The mobile header owns its trigger.
defineExpose({ triggerElement })
watch(announcements, (items) => {
  if (items.length === 0) {
    open.value = false
    selectedId.value = ''
  }
})
</script>

<template>
  <BottomDrawer v-if="announcements.length && presentation === 'drawer'" v-model="open" :title="t('stage.announcements.title')">
    <template #trigger>
      <BasicButton
        size="unset" :aria-label="t('stage.announcements.open')" :title="t('stage.announcements.open')"
        :class="[
          'pointer-events-auto size-11 shrink-0 rounded-full backdrop-blur-md',
          'bg-neutral-50/70 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-300',
          'focus-visible:outline-2 focus-visible:outline-primary-500',
        ]"
      >
        <span aria-hidden="true" :class="['i-solar:bell-outline size-6']" />
      </BasicButton>
    </template>
    <AnnouncementCarousel v-if="open" v-model:selected-id="selectedId" :items="announcements" mobile />
  </BottomDrawer>
  <Teleport v-else-if="announcements.length" to="body">
    <div ref="triggerElement" :class="['fixed bottom-10 left-6 z-50', 'pointer-events-auto']">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger as-child>
          <Button icon="i-solar:bell-outline" :aria-label="t('stage.announcements.open')" :title="t('stage.announcements.open')" shape="circle" />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            side="top" align="start" :side-offset="12"
            :aria-label="t('stage.announcements.title')"
            :class="['relative z-60 w-108 max-w-[calc(100vw-3rem)] outline-none']"
            @open-auto-focus.prevent
          >
            <PopoverClose as-child>
              <button
                type="button" :aria-label="t('stage.announcements.close')"
                :class="[
                  'absolute right-0 -top-10 z-30 size-8 flex items-center justify-center rounded-full',
                  'bg-neutral-900/85 text-white/80 shadow-md hover:text-white',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-200',
                ]"
              >
                <span :class="['i-lucide:x size-5']" />
              </button>
            </PopoverClose>
            <AnnouncementCarousel v-model:selected-id="selectedId" :items="announcements" />
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
  </Teleport>
</template>
