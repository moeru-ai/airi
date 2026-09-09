<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { Button } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useNormalGeneration } from '../../../composables/use-normal-generation'

const { t } = useI18n()
const key = 'tamagotchi.settings.devtools.pages.live2d-ambient-light.normals'
const { status, runtime, error, phase, busy, neutralUrl, normalUrl, coverageUrl, refresh, generate, importBundle, exportBundle, cancel } = useNormalGeneration()
const dialog = useFileDialog({ accept: '.zip', multiple: false, reset: true })
dialog.onChange(async (files) => {
  if (files?.[0])
    await importBundle(files[0])
})
const previews = computed(() => [
  { name: 'neutral', url: neutralUrl.value },
  { name: 'normal', url: normalUrl.value },
  { name: 'coverage', url: coverageUrl.value },
])
const displayedPhase = computed(() => phase.value === 'idle' ? status.value?.phase ?? 'unloaded' : phase.value)
</script>

<template>
  <Section :title="t(`${key}.title`)" icon="i-solar:layers-bold-duotone" inner-class="gap-4">
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t(`${key}.description`) }}
    </p>
    <dl :class="['grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm']">
      <dt>{{ t(`${key}.model`) }}</dt>
      <dd :class="['break-all']">
        {{ status?.modelId ?? '—' }}
      </dd>
      <dt>{{ t(`${key}.fingerprint`) }}</dt>
      <dd :class="['break-all font-mono text-xs']">
        {{ status?.fingerprint ?? '—' }}
      </dd>
      <dt>{{ t(`${key}.saved`) }}</dt>
      <dd>{{ status?.attachment ? new Date(status.attachment.createdAt).toLocaleString() : t(`${key}.missing`) }}</dd>
      <dt>{{ t(`${key}.binding`) }}</dt>
      <dd>{{ t(`${key}.bindings.${status?.binding ?? 'proxy'}`) }}</dd>
    </dl>
    <p role="status" aria-live="polite" :class="['text-sm']">
      {{ t(`${key}.phases.${displayedPhase}`) }}
    </p>
    <p v-if="runtime && !runtime.available" :class="['text-sm text-amber-600 dark:text-amber-400']">
      {{ runtime.reason }}
    </p>
    <p v-if="error || status?.error" role="alert" :class="['whitespace-pre-wrap break-words text-sm text-red-600 dark:text-red-400']">
      {{ error || status?.error }}
    </p>
    <div :class="['flex flex-wrap gap-3']">
      <Button variant="primary" :disabled="busy || !runtime?.available || !status?.fingerprint || status.phase === 'unloaded'" @click="generate">
        {{ t(`${key}.${status?.attachment ? 'regenerate' : 'generate'}`) }}
      </Button>
      <Button :disabled="busy || !status?.fingerprint || status.phase === 'unloaded'" @click="dialog.open()">
        {{ t(`${key}.import`) }}
      </Button>
      <Button :disabled="busy || !status?.attachment" @click="exportBundle">
        {{ t(`${key}.export`) }}
      </Button>
      <Button :disabled="busy" @click="refresh">
        {{ t(`${key}.refresh`) }}
      </Button>
      <Button v-if="phase === 'capturing' || phase === 'generating'" @click="cancel">
        {{ t(`${key}.cancel`) }}
      </Button>
    </div>
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t(`${key}.portable-note`) }}
    </p>
    <p v-if="status?.attachment" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ status.attachment.generator.model }} · {{ status.attachment.generator.device }} · {{ status.attachment.generator.seconds.toFixed(1) }} s · {{ status.attachment.drawables.length }} {{ t(`${key}.drawables`) }}
    </p>
    <div v-if="neutralUrl || normalUrl" :class="['grid grid-cols-3 gap-3']">
      <figure v-for="preview in previews" :key="preview.name" :class="['min-w-0']">
        <img v-if="preview.url" :src="preview.url" :alt="t(`${key}.${preview.name}`)" :class="['w-full rounded-lg bg-neutral-900 object-contain']">
        <figcaption :class="['mt-2 text-center text-sm']">
          {{ t(`${key}.${preview.name}`) }}
        </figcaption>
      </figure>
    </div>
    <p v-if="coverageUrl" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t(`${key}.coverage-note`) }}
    </p>
  </Section>
</template>
