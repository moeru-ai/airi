<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useSceneStore } from '@proj-airi/stage-ui/stores/scene'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const sceneStore = useSceneStore()
const { activeBackgroundUrl } = storeToRefs(sceneStore)

const fileInputRef = ref<HTMLInputElement>()

function triggerUpload() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return

  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target?.result
    if (typeof result === 'string') {
      sceneStore.setBackground(result)
    }
  }
  reader.readAsDataURL(file)
}

function clearBackground() {
  sceneStore.clearBackground()
}
</script>

<template>
  <div flex="~ col gap-6" mx-auto max-w-2xl p-4>
    <Callout
      :label="t('settings.pages.scene.beta_label')"
      theme="orange"
      icon="i-solar:star-fall-bold-duotone"
    >
      <div>
        {{ t('settings.pages.scene.beta_description') }}
      </div>
    </Callout>

    <Section
      :title="t('settings.pages.scene.background_image.title')"
      icon="i-solar:gallery-bold-duotone"
      class="rounded-2xl bg-white/80 backdrop-blur-lg dark:bg-black/75"
    >
      <div flex="~ col gap-4" p-4>
        <!-- Preview Area -->
        <div

          border="2 dashed neutral-200 dark:neutral-800"
          relative aspect-video flex items-center justify-center overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900
        >
          <div
            v-if="activeBackgroundUrl"
            absolute inset-0 z-0
            :style="{
              backgroundImage: `url(${activeBackgroundUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }"
          />
          <div v-if="!activeBackgroundUrl" p-8 text-center text-neutral-400>
            <div i-solar:camera-add-bold-duotone mx-auto mb-2 text-4xl opacity-50 />
            <p text-sm>
              {{ t('settings.pages.scene.background_image.no_background') }}
            </p>
          </div>
        </div>

        <!-- Controls -->
        <div flex="~ gap-2">
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            hidden
            @change="handleFileChange"
          >
          <Button
            variant="primary"
            class="flex-1"
            @click="triggerUpload"
          >
            <div i-solar:upload-bold-duotone mr-2 />
            {{ activeBackgroundUrl ? t('settings.pages.scene.background_image.change') : t('settings.pages.scene.background_image.upload') }}
          </Button>
          <Button
            v-if="activeBackgroundUrl"
            variant="secondary"
            @click="clearBackground"
          >
            <div i-solar:trash-bin-trash-bold-duotone mr-2 />
            {{ t('settings.pages.scene.background_image.clear') }}
          </Button>
        </div>
      </div>
    </Section>

    <Callout theme="lime" :label="t('settings.pages.scene.tip.label')">
      <div v-html="t('settings.pages.scene.tip.description')" />
    </Callout>
  </div>

  <!-- Background Icon Decoration -->
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:armchair-2-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.scene.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.scene.description
  icon: i-solar:armchair-2-bold-duotone
  settingsEntry: true
  order: 3
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
