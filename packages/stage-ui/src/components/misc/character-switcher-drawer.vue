<script setup lang="ts">
import { Avatar, BasicButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { DrawerContent, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle, DrawerTrigger } from 'vaul-vue'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import CharacterRail from './character-rail.vue'

import { useCharacterPreviews } from '../../composables/use-character-previews'
import { useAiriCardStore } from '../../stores/modules/airi-card'

const { t } = useI18n()
const router = useRouter()
const { activeCard, activeCardId } = storeToRefs(useAiriCardStore())
const previews = useCharacterPreviews()
const activePreview = computed(() => previews.value.get(activeCardId.value))
const open = shallowRef(false)
const manageAfterClose = shallowRef(false)

// Vaul can emit a closed animation event during initialization. Only a real
// open-to-closed transition completes dismissal.
let closing = false
watch(open, (value, previous) => {
  closing = !value && previous
}, { flush: 'sync' })

function manageCharacters() {
  // Let the drawer release its focus and scroll locks before changing routes.
  manageAfterClose.value = true
  open.value = false
}

function keepFocusForNavigation(event: Event) {
  // The route changes next. Focus must not return to the trigger of the page that goes away.
  if (manageAfterClose.value)
    event.preventDefault()
}

function finishAnimation(value: boolean) {
  if (value || open.value || !closing)
    return
  closing = false
  if (manageAfterClose.value) {
    manageAfterClose.value = false
    void router.push('/settings/airi-card')
  }
}
</script>

<template>
  <div :class="['min-w-0 flex flex-1 justify-start pr-2']">
    <DrawerRoot v-model:open="open" direction="left" @animation-end="finishAnimation">
      <DrawerTrigger as-child>
        <BasicButton
          size="unset"
          data-testid="character-selector-button"
          :aria-label="`${t('stage.character-switcher.title')}: ${activeCard?.name ?? t('stage.character-switcher.empty')}`"
          :title="activeCard?.name"
          :class="[
            'pointer-events-auto h-11 min-w-0 max-w-full rounded-full pl-1.5 pr-3 backdrop-blur-md',
            'bg-neutral-50/70 text-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-200',
            'focus-visible:outline-2 focus-visible:outline-primary-500',
            '[&_.basic-button-content]:min-w-0',
          ]"
        >
          <!-- Display model previews are portrait. Align them to the top so the circle keeps the head. -->
          <Avatar :src="activePreview" :class="['size-8 shrink-0 rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800', '[&_[data-avatar-image]]:object-top']">
            <template #fallback>
              <span :class="['text-sm font-semibold']">{{ activeCard?.name.slice(0, 1) }}</span>
            </template>
          </Avatar>
          <span :class="['truncate text-base font-semibold']">{{ activeCard?.name ?? t('stage.character-switcher.empty') }}</span>
        </BasicButton>
      </DrawerTrigger>
      <DrawerPortal>
        <DrawerOverlay :class="['fixed inset-0 z-[9999] bg-black/35']" />
        <DrawerContent
          :aria-describedby="undefined"
          :class="[
            'pointer-events-auto fixed inset-y-0 left-0 z-[9999] w-[min(16rem,80vw)]',
            'flex flex-col rounded-r-[32px] outline-none shadow-xl',
            'bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100',
            'pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pt-[max(1rem,env(safe-area-inset-top))]',
            'motion-reduce:animate-none motion-reduce:transition-none',
          ]"
          @close-auto-focus="keepFocusForNavigation"
        >
          <DrawerTitle :class="['px-5 pb-3 pt-2 text-xl font-semibold tracking-tight']">
            {{ t('stage.character-switcher.title') }}
          </DrawerTitle>
          <CharacterRail
            labels
            :class="['min-h-0 flex-1 w-full! px-3']"
            @switched="open = false"
            @manage="manageCharacters"
          />
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  </div>
</template>
