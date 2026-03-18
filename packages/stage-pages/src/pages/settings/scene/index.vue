<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useSceneStore } from '@proj-airi/stage-ui/stores/scene'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const sceneStore = useSceneStore()
const { backgrounds, globalBackgroundId, activeBackgroundId } = storeToRefs(sceneStore)

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
      sceneStore.addBackground(result)
    }
  }
  reader.readAsDataURL(file)
}

function setAsGlobal(id: string) {
  sceneStore.setGlobalBackground(id)
}

function removeBackground(id: string) {
  sceneStore.removeBackground(id)
}

function clearGlobalDefault() {
  sceneStore.setGlobalBackground(null)
}
</script>

<template>
  <div :class="['flex flex-col gap-6', 'mx-auto max-w-2xl', 'p-4 pb-20']">
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
      :class="['rounded-2xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    >
      <div :class="['flex flex-col gap-4', 'p-4']">
        <!-- Upload Controls -->
        <div :class="['flex gap-2']">
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
            <div :class="['i-solar:upload-bold-duotone', 'mr-2']" />
            {{ t('settings.pages.scene.background_image.upload') }}
          </Button>
          <Button
            v-if="globalBackgroundId"
            variant="secondary"
            @click="clearGlobalDefault"
          >
            <div :class="['i-solar:trash-bin-trash-bold-duotone', 'mr-2']" />
            {{ t('settings.pages.scene.background_image.clear') }}
          </Button>
        </div>

        <!-- Gallery Grid -->
        <div v-if="backgrounds.size > 0" :class="['grid grid-cols-2 sm:grid-cols-3 gap-3']">
          <div
            v-for="[id, bg] in backgrounds"
            :key="id"
            :class="[
              'relative aspect-square overflow-hidden rounded-xl border-2 group transition-all',
              id === globalBackgroundId ? 'border-primary shadow-lg' : 'border-transparent bg-neutral-100 dark:bg-neutral-900',
            ]"
          >
            <!-- Background Image -->
            <div
              :class="['absolute inset-0 z-0']"
              :style="{
                backgroundImage: `url(${bg.url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }"
            />

            <!-- Badges -->
            <div :class="['absolute top-2 left-2', 'flex flex-col gap-1']">
              <div
                v-if="id === globalBackgroundId"
                :class="['bg-primary text-white text-xs px-1.5 py-0.5 rounded-md shadow-sm font-bold']"
              >
                {{ t('settings.pages.scene.gallery.global_badge') }}
              </div>
              <div
                v-if="id === activeBackgroundId"
                :class="['bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-md shadow-sm font-bold']"
              >
                {{ t('settings.pages.scene.gallery.active_badge') }}
              </div>
            </div>

            <!-- Hover Overlay -->
            <div
              :class="[
                'absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity',
                'flex items-center justify-center gap-2',
              ]"
            >
              <Button
                v-if="id !== globalBackgroundId"
                size="sm"
                variant="primary"
                @click="setAsGlobal(id)"
              >
                <div :class="['i-solar:check-read-bold-duotone']" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                :class="['!bg-red-500 hover:!bg-red-600 !text-white']"
                @click="removeBackground(id)"
              >
                <div :class="['i-solar:trash-bin-trash-bold-duotone']" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else
          :class="['border-2 border-dashed border-neutral-200 dark:border-neutral-800', 'p-12 text-center text-neutral-400 rounded-xl']"
        >
          <div :class="['i-solar:gallery-wide-bold-duotone', 'mx-auto mb-2 text-4xl opacity-50']" />
          <p :class="['text-sm']">
            {{ t('settings.pages.scene.gallery.empty') }}
          </p>
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
    :class="[
      'text-neutral-200/50 dark:text-neutral-600/20',
      'pointer-events-none fixed bottom-0 right--5 z--1',
      'size-60 flex items-center justify-center',
    ]"
    :style="{ top: 'calc(100dvh - 15rem)' }"
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
  >
    <div :class="['text-6xl', 'i-solar:armchair-2-bold-duotone']" />
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
