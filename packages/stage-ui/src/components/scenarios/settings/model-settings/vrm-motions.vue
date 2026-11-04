<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { defaultVrmMotionLibrary } from '@proj-airi/stage-ui-three/assets/vrm'
import { Button, Input } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVrmMotionsStore } from '../../../../stores/vrm-motions'
import { Container } from '../../../data-pane'

const { t } = useI18n()
const vrmMotions = useVrmMotionsStore()
const { imported } = storeToRefs(vrmMotions)

const importError = ref('')
const builtInEmotes = computed(() => defaultVrmMotionLibrary.emotes)

const vrmaDialog = useFileDialog({ accept: '.vrma', multiple: true, reset: true })
vrmaDialog.onChange(async (files) => {
  if (!files)
    return
  importError.value = ''
  for (const file of Array.from(files)) {
    try {
      await vrmMotions.importMotion(file)
    }
    catch (error) {
      importError.value = errorMessageFrom(error) ?? t('settings.vrm.motions.import-failed')
    }
  }
})

function saveDetails(id: string, name: string, description: string) {
  void vrmMotions.updateMotion(id, { name, description })
}

onMounted(() => {
  void vrmMotions.load()
})
</script>

<template>
  <Container
    :title="t('settings.vrm.motions.title')"
    icon="i-solar:running-round-bold-duotone"
    inner-class="text-sm"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
  >
    <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.vrm.motions.description') }}
    </p>
    <Button :class="['my-2']" data-testid="vrm-motions-import" @click="vrmaDialog.open()">
      {{ t('settings.vrm.motions.import') }}
    </Button>
    <p v-if="importError" :class="['text-xs', 'text-red-500 dark:text-red-400']">
      {{ importError }}
    </p>

    <div v-if="imported.length > 0" :class="['flex', 'flex-col', 'gap-2', 'mb-3']" data-testid="vrm-motions-imported">
      <div
        v-for="motion in imported"
        :key="motion.id"
        :class="['flex', 'flex-col', 'gap-1', 'rounded-lg', 'p-2', 'bg-neutral-100 dark:bg-neutral-800/60']"
      >
        <Input
          :model-value="motion.name"
          size="sm"
          :placeholder="t('settings.vrm.motions.name')"
          :aria-label="t('settings.vrm.motions.name')"
          @change="saveDetails(motion.id, ($event.target as HTMLInputElement).value, motion.description)"
        />
        <Input
          :model-value="motion.description"
          size="sm"
          :placeholder="t('settings.vrm.motions.description-field')"
          :aria-label="t('settings.vrm.motions.description-field')"
          @change="saveDetails(motion.id, motion.name, ($event.target as HTMLInputElement).value)"
        />
        <div :class="['flex', 'justify-end', 'gap-1']">
          <Button size="sm" @click="vrmMotions.requestPlay(motion.id)">
            {{ t('settings.vrm.motions.play') }}
          </Button>
          <Button size="sm" :aria-label="t('settings.vrm.motions.remove')" @click="vrmMotions.removeMotion(motion.id)">
            <div i-solar:trash-bin-minimalistic-bold-duotone />
          </Button>
        </div>
      </div>
    </div>

    <div :class="['text-xs', 'text-neutral-500 dark:text-neutral-400', 'mb-1']">
      {{ t('settings.vrm.motions.built-in') }}
    </div>
    <div :class="['flex', 'flex-col', 'gap-1']">
      <div
        v-for="emote in builtInEmotes"
        :key="emote.id"
        :class="['flex', 'items-center', 'justify-between', 'gap-2']"
      >
        <div :class="['min-w-0']">
          <div :class="['truncate']">
            {{ emote.name }}
          </div>
          <div :class="['truncate', 'text-xs', 'text-neutral-500 dark:text-neutral-400']">
            {{ emote.description }}
          </div>
        </div>
        <Button size="sm" :class="['shrink-0']" @click="vrmMotions.requestPlay(emote.id)">
          {{ t('settings.vrm.motions.play') }}
        </Button>
      </div>
    </div>
  </Container>
</template>
