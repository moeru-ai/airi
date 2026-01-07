<script setup lang="ts">
import { Button, Checkbox, TransitionVertical } from '@proj-airi/ui'
import { refDebounced, useDark, useMouseInElement } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import VideoTutorialFadeOnHoverDark from '../../assets/videos/tutorial/tutorial-fade-on-hover.dark.mp4'
import VideoTutorialFadeOnHoverLight from '../../assets/videos/tutorial/tutorial-fade-on-hover.light.mp4'

import { noticeWindowEventa } from '../../../shared/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '../../composables/electron-vueuse'
import { useControlsIslandStore } from '../../stores/controls-island'

const context = useElectronEventaContext()
const sendAction = useElectronEventaInvoke(noticeWindowEventa.windowAction, context.value)
const notifyMounted = useElectronEventaInvoke(noticeWindowEventa.pageMounted, context.value)
const notifyUnmounted = useElectronEventaInvoke(noticeWindowEventa.pageUnmounted, context.value)
const route = useRoute()
const { t } = useI18n()

const controlsIslandStore = useControlsIslandStore()
const dontShowItAgainNoticeFadeOnHoverPending = ref(false)
const { dontShowItAgainNoticeFadeOnHover } = storeToRefs(controlsIslandStore)

const descriptionContainerRef = ref<HTMLDivElement>()
const { isOutside } = useMouseInElement(descriptionContainerRef)
const descriptionOpenImmediate = computed(() => !isOutside.value)
const descriptionOpen = refDebounced(descriptionOpenImmediate, 80)

const isDark = useDark({ disableTransition: false })

const requestId = ref<string | null>(null)
const waitingForRequest = computed(() => !requestId.value)

onMounted(async () => {
  try {
    const id = typeof route.query.id === 'string'
      ? route.query.id
      : Array.isArray(route.query.id)
        ? route.query.id[0]
        : null
    const pending = await notifyMounted({ id: id ?? undefined })
    if (pending?.id && pending.type === 'fade-on-hover')
      requestId.value = pending.id
  }
  catch (error) {
    console.warn('Failed to notify notice window mounted:', error)
  }
})

onBeforeUnmount(async () => {
  try {
    await notifyUnmounted({ id: undefined })
  }
  catch {
    /* noop */
  }
})

async function handleAction(action: 'confirm' | 'cancel' | 'close') {
  const id = requestId.value
  if (!id) {
    window.close()
    return
  }

  try {
    if (action === 'confirm')
      dontShowItAgainNoticeFadeOnHover.value = dontShowItAgainNoticeFadeOnHoverPending.value
    await sendAction({ id, action })
  }
  catch (error) {
    console.warn('Failed to notify main process of notice action:', error)
  }
  finally {
    window.close()
  }
}
</script>

<template>
  <div class="h-100dvh w-100dvw">
    <div class="relative h-full w-full flex flex-col gap-4 text-neutral-900 dark:text-neutral-100">
      <div class="absolute inset-0 z-0 h-full w-full overflow-hidden text-xs text-neutral-600 dark:text-neutral-400">
        <video :src="isDark ? VideoTutorialFadeOnHoverDark : VideoTutorialFadeOnHoverLight" autoplay muted loop class="h-full w-full object-cover" />
      </div>
      <div
        :class="[
          'pointer-events-none absolute left-0 top-0',
          'h-100dvh w-100dvw',
        ]"
        class="heading-backdrop"
      />
      <div class="relative z-1 h-full w-full flex flex-col">
        <div class="mb-2 flex items-center justify-between gap-2 px-4 pt-4">
          <div
            v-motion
            :initial="{ opacity: 0 }"
            :enter="{ opacity: 1 }"
            :duration="250"
            class="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-[11px] text-primary-900 font-semibold tracking-[0.14em] uppercase dark:bg-primary-500 dark:text-primary-100"
          >
            Tutorial
            <div class="h-1.5 w-1.5 rounded-full bg-primary-300 shadow-[0_0_12px_rgba(0,0,0,0.35)]" />
          </div>
        </div>
        <div
          v-motion
          :initial="{ opacity: 0, x: -28 }"
          :enter="{ opacity: 1, x: 0 }"
          :duration="500"
          transition="all ease-out"
          :class="[
            'w-fit',
            'pl-4 pr-5 py-4 text-2xl font-semibold leading-tight',
            'rounded-r-xl',
            'bg-neutral-200/80 dark:bg-neutral-800/80',
            'backdrop-blur-sm',
          ]"
        >
          {{ t('tamagotchi.stage.notice.fade-on-hover.title') }}
        </div>
        <div class="flex-1" />
        <div class="w-full px-4 pb-4">
          <div
            ref="descriptionContainerRef"
            v-motion
            :initial="{ opacity: 0, x: -16, width: '25%' }"
            :enter="{ opacity: 1, x: 0, width: '75%' }"
            :duration="650"
            :delay="100"
            transition="all ease-out"
            :class="[
              'flex flex-col overflow-hidden',
              'w-full',
              'bg-white/90 dark:bg-neutral-700/90',
              'backdrop-blur-sm shadow-lg',
              'px-3 py-2 sm:px-4 sm:py-3',
              'rounded-lg',
            ]"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-3">
                <div class="line-clamp-1 min-h-full flex-1 overflow-hidden text-ellipsis text-lg font-semibold">
                  <template v-if="!descriptionOpen">
                    <i18n-t keypath="tamagotchi.stage.notice.fade-on-hover.opacity" tag="div">
                      <template #value>
                        <span class="text-primary-600 font-semibold dark:text-primary-100">
                          {{ t('tamagotchi.stage.notice.fade-on-hover.value') }}
                        </span>
                      </template>
                      <template #targets>
                        <span class="text-primary-600 font-semibold dark:text-primary-100">
                          {{ t('tamagotchi.stage.notice.fade-on-hover.targets') }}
                        </span>
                      </template>
                    </i18n-t>
                    <i18n-t keypath="tamagotchi.stage.notice.fade-on-hover.toggle" tag="div">
                      <template #controls>
                        <span class="inline text-nowrap text-primary-600 font-semibold dark:text-primary-100">
                          {{ t('tamagotchi.stage.notice.fade-on-hover.controls-label') }}
                        </span>
                      </template>
                      <template #icon>
                        <div
                          i-ph:eye-slash
                          class="inline-block align-middle"
                          :aria-label="t('tamagotchi.stage.notice.fade-on-hover.icon-label')"
                        />
                      </template>
                    </i18n-t>
                  </template>
                </div>
                <Button
                  v-if="!descriptionOpen"
                  size="sm"
                  :label="t('tamagotchi.stage.notice.fade-on-hover.confirm')"
                />
              </div>
              <TransitionVertical>
                <div v-if="descriptionOpen" class="overflow-hidden space-y-2">
                  <div>
                    {{ t('tamagotchi.stage.notice.fade-on-hover.intro') }}
                  </div>
                  <i18n-t keypath="tamagotchi.stage.notice.fade-on-hover.opacity" tag="div">
                    <template #value>
                      <span class="text-primary-600 font-semibold dark:text-primary-100">
                        {{ t('tamagotchi.stage.notice.fade-on-hover.value') }}
                      </span>
                    </template>
                    <template #targets>
                      <span class="text-primary-600 font-semibold dark:text-primary-100">
                        {{ t('tamagotchi.stage.notice.fade-on-hover.targets') }}
                      </span>
                    </template>
                  </i18n-t>
                  <i18n-t keypath="tamagotchi.stage.notice.fade-on-hover.toggle" tag="div">
                    <template #controls>
                      <span class="inline text-nowrap text-primary-600 font-semibold dark:text-primary-100">
                        {{ t('tamagotchi.stage.notice.fade-on-hover.controls-label') }}
                      </span>
                    </template>
                    <template #icon>
                      <div
                        i-ph:eye-slash
                        class="inline-block align-middle text-primary-600 dark:text-primary-100"
                        :aria-label="t('tamagotchi.stage.notice.fade-on-hover.icon-label')"
                      />
                    </template>
                  </i18n-t>

                  <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="primary"
                      size="md"
                      block
                      :label="t('tamagotchi.stage.notice.fade-on-hover.confirm')"
                      :disabled="waitingForRequest"
                      :loading="waitingForRequest"
                      @click="handleAction('confirm')"
                    />
                    <div class="flex items-center gap-2 whitespace-nowrap px-2">
                      <Checkbox v-model="dontShowItAgainNoticeFadeOnHoverPending" />
                      <div class="whitespace-nowrap text-sm">
                        {{ t('tamagotchi.stage.notice.fade-on-hover.dont-show-again') }}
                      </div>
                    </div>
                  </div>
                </div>
              </TransitionVertical>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heading-backdrop {
  mask-image: radial-gradient(200% 150% at top left, black 20%, transparent 30%);
  -webkit-mask-image: radial-gradient(200% 150% at top left, black 20%, transparent 30%);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-position: top left;
  -webkit-mask-position: top left;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  backdrop-filter: blur(12px);
}
</style>
