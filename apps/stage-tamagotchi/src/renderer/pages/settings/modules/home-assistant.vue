<script setup lang="ts">
import type { HomeAssistantExposureMode } from '@proj-airi/stage-ui/libs/home-assistant/exposure'
import type { HomeAssistantEntitySummary } from '@proj-airi/stage-ui/libs/home-assistant/presentation'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { HomeAssistantEntityTile } from '@proj-airi/stage-ui/components/scenarios/home-assistant'
import { domainLabel, isTranslatableState, parseStateMoment, stateLabelKeys, summarizeDomains, summarizeEntities } from '@proj-airi/stage-ui/libs/home-assistant/presentation'
import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'
import { Button, FieldCheckbox, FieldInput, Input, Radio, ScrollableArea, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { homeAssistantGetConfig, homeAssistantSetConfig } from '../../../../shared/eventa/home-assistant'
import { useTamagotchiHomeAssistantStore } from '../../../stores/tools/home-assistant'

const { locale, t, te } = useI18n()
/**
 * Translates one key of this page.
 *
 * The status line stores a suffix rather than a translated string. Translating
 * here and again in the template passes an already-rendered message to `t()`,
 * which drops the interpolation parameters.
 */
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.home-assistant.${key}`, params ?? {})

const settings = useHomeAssistantStore()
const { enabled, exposureMode } = storeToRefs(settings)
const toolsStore = useTamagotchiHomeAssistantStore()
const getConfig = useElectronEventaInvoke(homeAssistantGetConfig)
const setConfig = useElectronEventaInvoke(homeAssistantSetConfig)

const baseUrl = ref('')
const token = ref('')
const hasToken = ref(false)
const tokenPreview = ref('')
const busy = ref(false)

/** The line under the buttons: a key suffix, and the values that key interpolates. */
const status = ref<{ suffix: string, params?: Record<string, unknown> } | null>(null)

/** Every device the instance reports, which the grid and the tab row both read. */
const entities = ref<HomeAssistantEntitySummary[]>([])
/** The domain tab the user opened. `null` means every domain. */
const activeDomain = ref<string | null>(null)
const entityQuery = ref('')
const loadingEntities = ref(false)
const entityError = ref('')

/**
 * The rows the grid and the tab row read.
 *
 * A device the user picked that Home Assistant stopped reporting keeps a row,
 * with an unavailable state. Without one, the id would sit in the list forever
 * and the user could never remove it.
 */
const gridEntities = computed(() => {
  const reported = new Set(entities.value.map(entity => entity.entityId))
  const missing = settings.selectedEntityIds.filter(entityId => !reported.has(entityId))
  if (!missing.length)
    return entities.value

  return [
    ...entities.value,
    ...summarizeEntities(missing.map(entityId => ({ entityId, state: 'unavailable', attributes: {} }))),
  ]
})

const selectedIds = computed(() => new Set(settings.selectedEntityIds))
const selectedCount = computed(() => settings.selectedEntityIds.length)

/**
 * The mode, as the radio group reads it.
 *
 * `Radio` models a plain string, and the store holds the three known modes. The
 * write side is the only place that needs the narrow type back.
 */
const modeSelection = computed({
  get: () => exposureMode.value,
  set: (value: string) => {
    exposureMode.value = value as HomeAssistantExposureMode
  },
})

const domainTabs = computed(() => summarizeDomains(gridEntities.value)
  .map(tab => ({ ...tab, label: domainLabel(t, tab.domain) }))
  .sort((left, right) => left.label.localeCompare(right.label)))

const visibleEntities = computed(() => {
  const query = entityQuery.value.trim().toLowerCase()
  return gridEntities.value
    .filter(entity => activeDomain.value === null || entity.domain === activeDomain.value)
    .filter(entity => !query
      || entity.name.toLowerCase().includes(query)
      || entity.entityId.toLowerCase().includes(query))
})

const allVisibleSelected = computed(() =>
  visibleEntities.value.length > 0 && visibleEntities.value.every(entity => selectedIds.value.has(entity.entityId)))

/** Formats a date without its time. */
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
/** Formats a date with its time. */
const dateTimeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))

/**
 * Names one state.
 *
 * Home Assistant names states per domain, so the table is asked for the domain
 * first. A state the table lacks stays as the instance reports it, which is the
 * honest answer for a reading such as a temperature.
 */
function translateState(domain: string, state: string): string | undefined {
  if (!isTranslatableState(state))
    return undefined

  for (const key of stateLabelKeys(domain, state)) {
    if (te(key) || te(key, 'en'))
      return t(key)
  }

  return undefined
}

/** The state a tile prints. */
function stateLabel(entity: HomeAssistantEntitySummary) {
  const named = translateState(entity.domain, entity.state)
  if (named)
    return named

  // Home Assistant reports a date or a timestamp as ISO 8601 text. A card reads
  // better with the date the page language writes.
  const moment = parseStateMoment(entity.state)
  if (moment)
    return (moment.kind === 'date' ? dateFormat.value : dateTimeFormat.value).format(moment.at)

  return entity.state
}

/** Mirrors what the main process holds, so the module card can show its state. */
function recordCredentials(saved: { baseUrl: string, hasToken: boolean }) {
  settings.setHasCredentials(Boolean(saved.baseUrl) && saved.hasToken)
}

/** Reads the device list. The policy does not apply, so a blocked device is still offered. */
async function loadEntities() {
  loadingEntities.value = true
  entityError.value = ''
  try {
    entities.value = await toolsStore.listEntities()
  }
  catch (error) {
    entityError.value = errorMessageFrom(error) ?? ''
  }
  finally {
    loadingEntities.value = false
  }
}

onMounted(async () => {
  const config = await getConfig()
  baseUrl.value = config.baseUrl
  hasToken.value = config.hasToken
  tokenPreview.value = config.tokenPreview
  recordCredentials(config)

  if (config.baseUrl && config.hasToken)
    await loadEntities()
})

/**
 * Writes the form into the main process.
 *
 * An empty token field keeps the stored token, so the user can change the
 * address without pasting the secret again.
 */
async function save() {
  const saved = await setConfig({
    baseUrl: baseUrl.value,
    ...(token.value ? { token: token.value } : {}),
  })

  baseUrl.value = saved.baseUrl
  token.value = ''
  hasToken.value = saved.hasToken
  tokenPreview.value = saved.tokenPreview
  recordCredentials(saved)
  // The tools live in the leader window. This action is synchronized, so the
  // leader mounts or unmounts them without a reload.
  await toolsStore.refresh()

  return saved
}

async function onSave() {
  busy.value = true
  try {
    await save()
    status.value = { suffix: 'status.saved' }
  }
  catch (error) {
    status.value = { suffix: 'status.failed', params: { message: errorMessageFrom(error) ?? '' } }
  }
  finally {
    busy.value = false
  }
}

async function onTest() {
  busy.value = true
  status.value = { suffix: 'status.testing' }
  try {
    await save()
    await loadEntities()
    status.value = { suffix: 'status.reachable', params: { count: entities.value.length } }
  }
  catch (error) {
    status.value = { suffix: 'status.failed', params: { message: errorMessageFrom(error) ?? '' } }
  }
  finally {
    busy.value = false
  }
}

// A user who opens a list before the first test needs the devices. Loading them
// here keeps the reload button for a second look.
watch(exposureMode, async (mode) => {
  if (mode === 'all' || entities.value.length || !hasToken.value)
    return

  await loadEntities()
})
</script>

<template>
  <div flex="~ col gap-4">
    <SettingsCard>
      <FieldCheckbox
        v-model="enabled"
        :label="tn('enable')"
        :description="tn('enable-description')"
      />

      <FieldInput
        v-model="baseUrl"
        :label="tn('base-url.label')"
        :description="tn('base-url.description')"
        :placeholder="tn('base-url.placeholder')"
        autocomplete="off"
      />

      <FieldInput
        v-model="token"
        type="password"
        :label="tn('token.label')"
        :description="hasToken ? tn('token.saved') : tn('token.description')"
        :placeholder="hasToken ? tokenPreview : tn('token.placeholder')"
        autocomplete="off"
      />

      <p text="sm neutral-500 dark:neutral-400">
        {{ tn('note') }}
      </p>

      <div flex="~ row items-center gap-3">
        <Button :disabled="busy" @click="onSave">
          {{ tn('actions.save') }}
        </Button>
        <Button :disabled="busy" variant="secondary" @click="onTest">
          {{ tn('actions.test') }}
        </Button>
        <span v-if="status" text="sm neutral-500 dark:neutral-400">
          {{ tn(status.suffix, status.params) }}
        </span>
      </div>
    </SettingsCard>

    <SettingsCard>
      <div>
        <div text="sm font-medium">
          {{ tn('access.label') }}
        </div>
        <div text="xs neutral-500 dark:neutral-400">
          {{ tn('access.description') }}
        </div>
      </div>

      <div flex="~ col gap-2">
        <Radio
          id="home-assistant-exposure-all"
          v-model="modeSelection"
          name="home-assistant-exposure"
          value="all"
          :title="tn('access.mode-all')"
        />
        <Radio
          id="home-assistant-exposure-allow"
          v-model="modeSelection"
          name="home-assistant-exposure"
          value="allow"
          :title="tn('access.mode-allow')"
        />
        <Radio
          id="home-assistant-exposure-deny"
          v-model="modeSelection"
          name="home-assistant-exposure"
          value="deny"
          :title="tn('access.mode-deny')"
        />
      </div>

      <template v-if="exposureMode === 'all'">
        <p text="sm neutral-500 dark:neutral-400">
          {{ tn('access.all-hint') }}
        </p>
      </template>

      <template v-else>
        <p text="sm neutral-500 dark:neutral-400">
          {{ exposureMode === 'allow' ? tn('access.rule-allow') : tn('access.rule-deny') }}
        </p>
        <p text="sm font-medium">
          {{ tn('access.selected-count', { count: selectedCount }) }}
        </p>
        <!--
          A plain Input, not FieldInput: FieldInput keeps the label row and the
          gap even with no label, which leaves the box 16px taller than the
          button beside it.
        -->
        <div class="flex flex-row items-center gap-2">
          <Input v-model="entityQuery" class="h-9 min-w-0 flex-1" :placeholder="tn('access.search')" />
          <Button :disabled="loadingEntities" variant="secondary" @click="loadEntities">
            {{ tn('access.reload') }}
          </Button>
        </div>

        <p v-if="entityError" text="sm red-500">
          {{ entityError }}
        </p>
        <p v-else-if="loadingEntities" text="sm neutral-500 dark:neutral-400">
          {{ tn('access.loading') }}
        </p>
        <p v-else-if="!gridEntities.length" text="sm neutral-500 dark:neutral-400">
          {{ tn('access.no-devices') }}
        </p>

        <template v-else>
          <div class="max-h-32 flex flex-row flex-wrap items-start gap-1 overflow-y-auto pb-1">
            <button
              type="button"
              class="shrink-0 rounded-md px-2.5 py-0.5 text-xs transition-colors"
              :class="activeDomain === null ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'bg-neutral-400/10 text-neutral-600 dark:text-neutral-300'"
              @click="activeDomain = null"
            >
              {{ tn('access.tab-all') }} · {{ gridEntities.length }}
            </button>
            <button
              v-for="tab in domainTabs"
              :key="tab.domain"
              type="button"
              class="shrink-0 rounded-md px-2.5 py-0.5 text-xs transition-colors"
              :class="activeDomain === tab.domain ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'bg-neutral-400/10 text-neutral-600 dark:text-neutral-300'"
              @click="activeDomain = tab.domain"
            >
              {{ tab.label }} · {{ tab.count }}
            </button>
          </div>

          <div flex="~ row items-center justify-between gap-2">
            <span text="xs neutral-500 dark:neutral-400">
              {{ tn('access.shown-count', { shown: visibleEntities.length, total: gridEntities.length }) }}
            </span>
            <div flex="~ row items-center gap-2">
              <Button
                variant="secondary"
                :disabled="allVisibleSelected"
                @click="settings.setEntitiesSelected(visibleEntities.map(entity => entity.entityId), true)"
              >
                {{ tn('access.select-shown') }}
              </Button>
              <Button
                variant="secondary"
                @click="settings.setEntitiesSelected(visibleEntities.map(entity => entity.entityId), false)"
              >
                {{ tn('access.clear-shown') }}
              </Button>
            </div>
          </div>

          <ScrollableArea class="max-h-96" orientation="vertical">
            <p v-if="!visibleEntities.length" text="sm neutral-500 dark:neutral-400" p-2>
              {{ tn('access.no-match') }}
            </p>
            <div v-else class="grid grid-cols-1 gap-2 pr-2 lg:grid-cols-3 sm:grid-cols-2">
              <HomeAssistantEntityTile
                v-for="entity in visibleEntities"
                :key="entity.entityId"
                :entity="entity"
                :selected="selectedIds.has(entity.entityId)"
                :state-label="stateLabel(entity)"
                @toggle="settings.setEntitySelected(entity.entityId, !selectedIds.has(entity.entityId))"
              />
            </div>
          </ScrollableArea>

          <p v-if="exposureMode === 'allow' && !selectedCount" text="sm amber-600 dark:amber-400">
            {{ tn('access.empty-warning') }}
          </p>
        </template>
      </template>
    </SettingsCard>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.home-assistant.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
