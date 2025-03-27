<script setup lang="ts">
import { IconItem } from '@proj-airi/stage-ui/components'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import IconAnimation from '../../components/IconAnimation.vue'

const router = useRouter()
const showIconAnimation = ref(false)
const iconAnimation = ref<InstanceType<typeof IconAnimation>>()
const resolveAnimation = ref<() => void>()
const { t } = useI18n()

const animationIcon = ref('')
const animationPosition = ref('')
const showAnimationComponent = ref(false)

function handleAnimationEnded() {
  resolveAnimation.value?.()
}

async function handleIconItemClick(event: MouseEvent, setting: typeof settings.value[0]) {
  const target = event.currentTarget as HTMLElement
  const iconElement = target.querySelector('.menu-icon-item-icon') as HTMLElement
  if (!iconElement)
    return

  // get the position of the icon element
  const rect = iconElement.getBoundingClientRect()
  const position = `${rect.left}px, ${rect.top}px`

  // set the icon and position
  animationIcon.value = setting.icon
  animationPosition.value = position

  // show the animation component
  showAnimationComponent.value = true

  // wait for the DOM to update
  await nextTick()

  // start the animation
  showIconAnimation.value = true
}

const removeBeforeEach = router.beforeEach(async (_, __, next) => {
  await new Promise<void>((resolve) => {
    resolveAnimation.value = resolve
  })
  removeBeforeEach()
  next()
})

const settings = computed(() => [
  {
    title: t('settings.pages.modules.title'),
    description: t('settings.pages.modules.description'),
    icon: 'i-lucide:blocks',
    to: '/settings/modules',
  },
  {
    title: t('settings.pages.models.title'),
    description: t('settings.pages.models.description'),
    icon: 'i-lucide:person-standing',
    to: '/settings/models',
  },
  {
    title: t('settings.pages.memory.title'),
    description: t('settings.pages.memory.description'),
    icon: 'i-lucide:sprout',
    to: '/settings/memory',
  },
  {
    title: t('settings.pages.providers.title'),
    description: t('settings.pages.providers.description'),
    icon: 'i-lucide:brain',
    to: '/settings/providers',
  },
  {
    title: t('settings.pages.themes.title'),
    description: t('settings.pages.themes.description'),
    icon: 'i-lucide:paintbrush',
    to: '/settings/appearance',
  },
])
</script>

<template>
  <div
    v-motion
    flex items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :duration="100"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 text-3xl>
      {{ $t('settings.title') }}
    </h1>
  </div>
  <div flex="~ col gap-4">
    <div flex="~ col gap-4">
      <IconItem
        v-for="(setting, index) in settings"
        :key="setting.to"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :style="{
          transitionDelay: `${index * 50}ms`, // delay between each item, unocss doesn't support dynamic generation of classes now
        }"
        :title="setting.title"
        :description="setting.description"
        :icon="setting.icon"
        :to="setting.to"
        @click="(e) => handleIconItemClick(e, setting)"
      />
    </div>
    <div text="neutral-200/50 dark:neutral-600/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
      <div v-motion text="60" i-lucide:cog />
    </div>
    <IconAnimation
      v-if="showAnimationComponent"
      ref="iconAnimation"
      :icon="animationIcon"
      :icon-size="6 * 1.2"
      :position="animationPosition"
      :duration="1000"
      text-color="text-neutral-400/50 dark:text-neutral-600/20"
      :started="showIconAnimation"
      @animation-ended.once="handleAnimationEnded"
    />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
