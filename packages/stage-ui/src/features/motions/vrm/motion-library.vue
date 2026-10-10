<script setup lang="ts">
import type { MotionMetadata } from '@proj-airi/stage-ui-three/motions'

import type { MotionPreferences } from './library'

import { errorMessageFrom } from '@moeru/std'
import { Button, Callout, FieldCheckbox, FieldInput, FieldInputFile, FieldRange, FieldSelect } from '@proj-airi/ui'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { Container } from '../../../components/data-pane'
import { useSettings } from '../../../stores/settings'
import { getMotionBus, motionCommandResult } from './bus'
import { MotionImportError } from './import'
import { defaultMotionPreferences } from './library'
import { useVrmMotionsStore } from './store'

const props = defineProps<{ disabled?: boolean }>()
const { t, te } = useI18n()
const settings = useSettings()
const store = useVrmMotionsStore()
const modelId = computed(() => settings.stageModelSelected)
const fallback = defaultMotionPreferences()
const preferences = computed(() => store.preferences[modelId.value] ?? fallback)
const search = ref('')
const page = ref(0)
const selectedId = ref('bow')
const loop = ref(false)
const speed = ref(1)
const duration = ref(15)
const files = ref<File[]>()
const importing = ref(false)
const error = ref('')
const status = ref('')
const pendingRequest = ref('')
const confirmRemove = ref(false)
const pageSize = 24
function motionName(entry: MotionMetadata) {
  const key = `settings.vrm.motions.names.${entry.id}`
  return entry.source === 'builtin' && te(key) ? t(key) : entry.name
}

const filtered = computed(() => {
  const query = search.value.toLocaleLowerCase().trim()
  return store.entries.filter(entry => `${entry.id} ${motionName(entry)} ${entry.category}`.toLocaleLowerCase().includes(query))
})
const visible = computed(() => filtered.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
const selected = computed(() => store.entries.find(entry => entry.id === selectedId.value))
const idleOptions = computed(() => [
  { value: 'default-idle', label: t('settings.vrm.motions.default-idle') },
  ...store.entries.filter(entry => entry.category === 'idle' || entry.source === 'imported').map(entry => ({ value: entry.id, label: motionName(entry) })),
])
const selectionOptions = computed(() => visible.value.map(entry => ({ value: entry.id, label: `${motionName(entry)} (${entry.duration.toFixed(1)}s)` })))
const aiEnabled = computed({
  get: () => preferences.value.aiEnabled,
  set: (value) => { void save({ aiEnabled: value }) },
})
const idleId = computed({
  get: () => preferences.value.idleId,
  set: (value) => { void save({ idleId: value }) },
})
const aiEligible = computed({
  get: () => preferences.value.aiMotionIds.includes(selectedId.value),
  set: (value) => {
    const ids = preferences.value.aiMotionIds.filter(id => id !== selectedId.value)
    if (value)
      ids.push(selectedId.value)
    if (ids.length > 32) {
      error.value = t('settings.vrm.motions.ai-limit')
      return
    }
    void save({ aiMotionIds: ids })
  },
})

async function save(patch: Partial<MotionPreferences>) {
  error.value = ''
  try {
    await store.savePreferences(modelId.value, patch)
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.vrm.motions.error')
  }
}

watch(modelId, (id) => {
  pendingRequest.value = ''
  status.value = ''
  error.value = ''
  void store.loadPreferences(id).catch((cause) => {
    error.value = errorMessageFrom(cause) ?? t('settings.vrm.motions.error')
  })
}, { immediate: true })
watch(search, () => {
  page.value = 0
})
watch(visible, (entries) => {
  if (!entries.some(entry => entry.id === selectedId.value))
    selectedId.value = entries[0]?.id ?? ''
})
watch(selectedId, () => {
  confirmRemove.value = false
  loop.value = selected.value?.loop ?? false
})
watch(() => store.entries.length, () => {
  page.value = Math.min(page.value, Math.max(0, Math.ceil(filtered.value.length / pageSize) - 1))
})

async function importFiles() {
  if (importing.value || !files.value?.length)
    return
  importing.value = true
  error.value = ''
  let imported = 0
  try {
    for (const file of files.value) {
      const entry = await store.add(file)
      selectedId.value = entry.id
      imported++
    }
    files.value = undefined
    status.value = t('settings.vrm.motions.imported', { count: imported })
  }
  catch (cause) {
    error.value = cause instanceof MotionImportError
      ? t(`settings.vrm.motions.errors.${cause.code}`)
      : errorMessageFrom(cause) ?? t('settings.vrm.motions.error')
    status.value = t('settings.vrm.motions.imported', { count: imported })
  }
  finally {
    importing.value = false
  }
}

function play(mode: 'replace' | 'queue') {
  if (!selected.value || props.disabled)
    return
  error.value = ''
  status.value = t('settings.vrm.motions.requested')
  pendingRequest.value = store.play(modelId.value, selectedId.value, { mode, loop: loop.value, speed: speed.value, duration: duration.value })
}

async function remove() {
  if (selected.value?.source !== 'imported')
    return
  try {
    store.stop(modelId.value)
    await store.remove(selectedId.value)
    selectedId.value = 'bow'
    confirmRemove.value = false
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.vrm.motions.error')
  }
}

const unsubscribe = getMotionBus().on(motionCommandResult, ({ body }) => {
  if (body?.requestId !== pendingRequest.value || body?.modelId !== modelId.value)
    return
  status.value = t(body.accepted ? 'settings.vrm.motions.accepted' : 'settings.vrm.motions.rejected')
})
onScopeDispose(unsubscribe)
</script>

<template>
  <Container :title="t('settings.vrm.motions.title')" icon="i-solar:running-round-bold-duotone">
    <div :class="['flex flex-col gap-4']">
      <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.vrm.motions.description') }}
      </p>
      <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.vrm.orbit-pivot.hint') }}
      </p>
      <FieldSelect v-model="idleId" :label="t('settings.vrm.motions.idle')" :description="t('settings.vrm.motions.idle-description')" :options="idleOptions" />
      <FieldCheckbox v-model="aiEnabled" :label="t('settings.vrm.motions.ai-enabled')" />
      <FieldInput v-model="search" :label="t('settings.vrm.motions.search')" />
      <FieldSelect v-model="selectedId" :label="t('settings.vrm.motions.select')" :options="selectionOptions" />
      <div :class="['flex items-center justify-between gap-2']">
        <Button size="sm" :disabled="page === 0" @click="page--">
          {{ t('settings.vrm.motions.previous') }}
        </Button>
        <span :class="['text-xs']">{{ t('settings.vrm.motions.results', { count: filtered.length, page: page + 1 }) }}</span>
        <Button size="sm" :disabled="(page + 1) * pageSize >= filtered.length" @click="page++">
          {{ t('settings.vrm.motions.next') }}
        </Button>
      </div>
      <template v-if="selected">
        <p :class="['text-xs', 'break-all font-mono']">
          {{ selected.id }}
        </p>
        <FieldCheckbox v-model="aiEligible" :label="t('settings.vrm.motions.ai-selected')" :description="t('settings.vrm.motions.ai-selection-description')" />
        <FieldCheckbox v-model="loop" :label="t('settings.vrm.motions.loop')" />
        <FieldRange v-model="speed" :label="t('settings.vrm.motions.speed')" :min="0.5" :max="2" :step="0.1" />
        <FieldRange v-model="duration" :label="t('settings.vrm.motions.duration')" :min="1" :max="30" :step="1" />
        <div :class="['flex flex-wrap gap-2']">
          <Button :disabled="disabled" @click="play('replace')">
            {{ t('settings.vrm.motions.play') }}
          </Button>
          <Button :disabled="disabled" @click="play('queue')">
            {{ t('settings.vrm.motions.queue') }}
          </Button>
          <Button :disabled="disabled" @click="store.stop(modelId)">
            {{ t('settings.vrm.motions.stop') }}
          </Button>
          <Button v-if="selected.source === 'imported'" @click="confirmRemove = true">
            {{ t('settings.vrm.motions.remove') }}
          </Button>
        </div>
        <div v-if="confirmRemove" :class="['flex flex-wrap items-center gap-2']">
          <span :class="['text-xs']">{{ t('settings.vrm.motions.confirm-remove') }}</span>
          <Button @click="remove">
            {{ t('settings.vrm.motions.remove') }}
          </Button>
          <Button @click="confirmRemove = false">
            {{ t('settings.vrm.motions.cancel') }}
          </Button>
        </div>
      </template>
      <FieldInputFile v-model="files" accept=".vrma" multiple :label="t('settings.vrm.motions.import')" :description="t('settings.vrm.motions.import-description')" :placeholder="t('settings.vrm.motions.choose-files')" />
      <Button :disabled="importing || !files?.length" :loading="importing" @click="importFiles">
        {{ t('settings.vrm.motions.import') }}
      </Button>
      <p v-if="status" role="status" :class="['text-xs']">
        {{ status }}
      </p>
      <Callout v-if="error" :label="t('settings.vrm.motions.error')">
        {{ error }}
      </Callout>
    </div>
  </Container>
</template>
