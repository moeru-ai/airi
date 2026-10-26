<script setup lang="ts">
import type { HomeAssistantExposureMode } from '@proj-airi/stage-ui/libs/home-assistant/exposure'
import type { HomeAssistantEntitySummary } from '@proj-airi/stage-ui/libs/home-assistant/presentation'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { HomeAssistantEntityTile } from '@proj-airi/stage-ui/components/scenarios/home-assistant'
import { useHomeAssistantStateLabel } from '@proj-airi/stage-ui/composables/use-home-assistant-state-label'
import { useSettingsSearchTarget } from '@proj-airi/stage-ui/composables/use-settings-search'
import { domainLabel, summarizeDomains, summarizeEntities } from '@proj-airi/stage-ui/libs/home-assistant/presentation'
import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'
import { Button, FieldCheckbox, FieldInput, GhostButton, Input, Radio, ScrollableArea, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { homeAssistantConfigRejections, homeAssistantGetConfig, homeAssistantSetConfig } from '../../../../shared/eventa/home-assistant'
import { useTamagotchiHomeAssistantStore } from '../../../stores/tools/home-assistant'
import { homeAssistantEntityOfSearchKey, homeAssistantEntitySearchKey } from './home-assistant.search'

const { t } = useI18n()
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
/**
 * True while a save owns the lists.
 *
 * A save that moves the address clears the lists and publishes them for the new
 * instance. An edit inside that window travels to the instance the user leaves.
 */
const publishing = ref(false)

/**
 * True while a save or a test owns the picker.
 *
 * A save publishes the lists, moves the address, and reloads the grid. A test
 * saves and then reloads the grid. An edit inside either run travels to the
 * instance the user leaves, or starts a load that takes the rows from the load
 * the run reads.
 */
const pickerHeld = computed(() => publishing.value || busy.value)

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
 * with an unavailable state. Without one, the id stays in the list forever and
 * the user cannot remove it.
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
    if (pickerHeld.value)
      return
    exposureMode.value = value as HomeAssistantExposureMode
    dropMissingDomain()
    void publishPolicy()
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

// A search result names one device. The grid mounts only a batch of the rows, so it filters to that device first.
const searchTarget = useSettingsSearchTarget()
watch(() => searchTarget.value.keys, (keys) => {
  const entityId = keys.map(homeAssistantEntityOfSearchKey).find(id => id !== undefined)
  if (!entityId)
    return
  activeDomain.value = null
  entityQuery.value = entityId
}, { immediate: true })

const allVisibleSelected = computed(() =>
  visibleEntities.value.length > 0 && visibleEntities.value.every(entity => selectedIds.value.has(entity.entityId)))

/**
 * How many rows the grid mounts at once.
 *
 * A large installation reports thousands of entities, and every mounted row is a
 * component. The count the picker prints stays the count of the filter.
 */
const GRID_BATCH = 60
const gridLimit = ref(GRID_BATCH)

/** The rows the grid mounts. The bulk buttons act on every row the filter holds. */
const mountedEntities = computed(() => visibleEntities.value.slice(0, gridLimit.value))

/** The rows the next page adds, which is the whole remainder when it is smaller. */
const nextBatch = computed(() => Math.min(GRID_BATCH, visibleEntities.value.length - mountedEntities.value.length))

const { stateLabel } = useHomeAssistantStateLabel()

/** Mirrors what the main process holds, so the module card can show its state. */
function recordCredentials(saved: { baseUrl: string, hasToken: boolean }) {
  settings.setHasCredentials(Boolean(saved.baseUrl) && saved.hasToken)
}

/**
 * A save that stopped before the address moved, because the leader window never
 * took the cleared list.
 */
class PolicyNotPublishedError extends Error {}

/** A refused save whose rollback did not reach the leader either. */
class PolicyRollbackError extends Error {}

/**
 * Applies the access policy of this window, and reports whether the leader holds it.
 *
 * `settings` is a local-storage mirror, so the window the user acts in moves at
 * once and the control answers without a round trip. The tools run in the leader
 * window, where the same policy arrives through a synchronized action, so a call
 * the model already holds cannot read a rule the user has replaced. The caller
 * waits for the leader.
 *
 * A push that fails leaves the leader on the storage event, which arrives on its
 * own schedule, so a caller that orders the policy against something else has to
 * read this result. A picker edit reports a failure through `publishPolicy`,
 * because the grid then shows a rule the model does not hold yet.
 */
async function applyPolicy(): Promise<boolean> {
  try {
    // This window is a follower, so the call travels to the leader over a
    // BroadcastChannel, and that clone rejects a Vue reactive proxy. A list the
    // store has not written yet reads back as a proxy, so the copies here are
    // what make the first publication possible.
    await toolsStore.setPolicy(exposureMode.value, [...settings.allowedEntities], [...settings.deniedEntities])
    return true
  }
  catch (error) {
    console.warn('[Home Assistant] Failed to publish the access policy to the leader:', error)
    return false
  }
}

/**
 * Publishes a picker edit and reports one that did not land.
 *
 * A click has no request after it, so a failed push leaves the leader on the
 * storage event. The line tells the user when the model still holds the rule
 * they replaced.
 */
async function publishPolicy() {
  status.value = await applyPolicy() ? null : { suffix: 'status.failed-policy-edit' }
}

/**
 * The text for each refusal the main process returns.
 *
 * The main process owns the rule, and only the message of its error crosses the
 * IPC boundary. The page reads the message and shows its own text.
 */
const rejectionKeys: Record<string, string> = {
  [homeAssistantConfigRejections.addressChanged]: 'status.rejected-address',
  [homeAssistantConfigRejections.tokenRequired]: 'status.rejected-token',
}

/** The line under the buttons after a save fails. */
function failureStatus(error: unknown): { suffix: string, params?: Record<string, unknown> } {
  if (error instanceof PolicyNotPublishedError)
    return { suffix: 'status.failed-policy' }
  if (error instanceof PolicyRollbackError)
    return { suffix: 'status.failed-policy-rollback' }

  const message = errorMessageFrom(error) ?? ''
  const key = rejectionKeys[message]
  return key ? { suffix: key } : { suffix: 'status.failed', params: { message } }
}

/** The number of the load in flight, so an earlier one cannot write over a later one. */
let loadGeneration = 0

/**
 * Drops the open tab when no row holds its domain.
 *
 * A tab without a row filters every row out, and the picker reports no match for
 * a device that is on screen. Rows change under a reload, under an address move,
 * and under an edit of the lists, because a selected device that the instance
 * stopped reporting keeps a row of its own.
 */
function dropMissingDomain() {
  if (activeDomain.value !== null && !gridEntities.value.some(entity => entity.domain === activeDomain.value))
    activeDomain.value = null
}

/** Replaces the device rows. */
function setEntities(next: HomeAssistantEntitySummary[]) {
  entities.value = next
  gridLimit.value = GRID_BATCH
  dropMissingDomain()
}

/**
 * Stops a load that is already in flight from writing.
 *
 * The settings page calls this the moment the address moves, so a row set from
 * the old instance can neither repopulate the grid nor report its error. A load
 * that loses its turn skips its own cleanup, so the flag it raised is cleared
 * here.
 */
function invalidateLoads() {
  loadGeneration += 1
  loadingEntities.value = false
  // The error belongs to the load that lost its turn. Keeping it leaves a failed
  // read beside a save that cleared the instance it came from.
  entityError.value = ''
}

/**
 * Reports whether the page shows the device grid.
 *
 * The grid is the only reader of the device list. Under `all` the page hides it,
 * and a large instance reports thousands of entities, which the read sends over
 * IPC to project into rows nobody sees.
 */
function gridIsOpen() {
  return exposureMode.value !== 'all'
}

/** Reads the device list. The policy does not apply, so a blocked device is still offered. */
async function loadEntities() {
  const generation = ++loadGeneration
  loadingEntities.value = true
  entityError.value = ''
  try {
    const loaded = await toolsStore.listEntities()
    // A load started for an earlier address can finish after a later one. Only
    // the latest writes, or the grid shows an instance the address left.
    if (generation !== loadGeneration)
      return
    setEntities(loaded)
  }
  catch (error) {
    if (generation !== loadGeneration)
      return
    entityError.value = errorMessageFrom(error) ?? ''
  }
  finally {
    if (generation === loadGeneration)
      loadingEntities.value = false
  }
}

onMounted(async () => {
  const config = await getConfig()
  baseUrl.value = config.baseUrl
  hasToken.value = config.hasToken
  tokenPreview.value = config.tokenPreview
  recordCredentials(config)

  if (config.baseUrl && config.hasToken && gridIsOpen())
    await loadEntities()
})

/**
 * Writes the form into the main process.
 *
 * An empty token field keeps the stored token, so a user can correct the address
 * to the same value without pasting the secret again. A token belongs to one
 * instance, so a save that changes the address needs a token for the new one. The
 * main process refuses the change without one.
 */
async function save() {
  // A save has several steps: it publishes a policy, moves the address in the main
  // process, and can roll the lists back. Each value below is read once, so every
  // step acts on one intent.
  const submittedAddress = baseUrl.value
  const submittedToken = token.value
  // The address the main process holds is read here, not at mount, because the
  // form answers from the first frame. A save before the mount read lands sees an
  // empty address, takes a move for a first configuration, and keeps the lists of
  // the instance the user leaves.
  const previousBaseUrl = (await getConfig()).baseUrl
  const willMove = Boolean(previousBaseUrl) && submittedAddress.trim().replace(/\/+$/, '') !== previousBaseUrl
  const previousAllowed = [...settings.allowedEntities]

  if (willMove) {
    // Only the allow list goes here. An empty allow list exposes nothing, so
    // this can only take reach away. An empty deny list exposes every device, so
    // clearing it before the move opens the old instance for the length of
    // the save. It goes after the move.
    settings.allowedEntities = []
    // The leader holds the list a model call reads, so the address must not move
    // while the old instance's allow list is still in force there.
    if (!await applyPolicy()) {
      settings.allowedEntities = [...previousAllowed]
      void applyPolicy()
      throw new PolicyNotPublishedError()
    }
    // The rows describe the old instance, so they go with the list, and a load
    // that is still in flight loses its right to write them back.
    invalidateLoads()
    setEntities([])
  }

  let saved
  try {
    saved = await setConfig({
      baseUrl: submittedAddress,
      ...(submittedToken ? { token: submittedToken } : {}),
    })
  }
  catch (error) {
    // The save was refused, so the instance did not move and the lists stand.
    if (willMove) {
      settings.allowedEntities = [...previousAllowed]
      // The leader holds the empty list this save opened with until the rollback
      // reaches it, so a publication that fails leaves the model without a device
      // while the page names the list it restored.
      const policyRestored = await applyPolicy()
      // The rows describe the instance the main process still holds, so they come
      // back. A closed grid reads no row, and the list of a large instance is not
      // worth sending to nobody.
      if (gridIsOpen())
        await loadEntities()
      if (!policyRestored)
        throw new PolicyRollbackError()
    }
    throw error
  }

  let policyPublished = true
  if (willMove) {
    // The address is home in the main process, so the list the old instance
    // wrote can no longer hold a device back. A push that fails leaves the leader
    // on that list until the storage event arrives.
    settings.deniedEntities = []
    policyPublished = await applyPolicy()
  }
  else if (submittedToken) {
    // Another token reaches another set of devices, and the load of that set can
    // fail. The rows of the credential the user replaced must not stay on screen
    // and selectable while it runs.
    invalidateLoads()
    setEntities([])
  }

  const movedAddress = Boolean(previousBaseUrl) && saved.baseUrl !== previousBaseUrl
  // Another token can reach another set of devices, so the grid is stale even
  // when the address stays.
  const replacedToken = Boolean(submittedToken) && !movedAddress

  baseUrl.value = saved.baseUrl
  token.value = ''
  hasToken.value = saved.hasToken
  tokenPreview.value = saved.tokenPreview
  recordCredentials(saved)
  // The tools live in the leader window. This action is synchronized, so the
  // leader mounts or unmounts them without a reload.
  await toolsStore.refresh()

  return { movedAddress, policyPublished, replacedToken, saved }
}

async function onSave() {
  busy.value = true
  try {
    const { movedAddress, policyPublished, replacedToken, saved } = await runSave()
    // The grid belongs to the instance and the credential the form now holds. A
    // save that cleared them has nothing to list, and a load reports the
    // instance as unconfigured.
    if ((movedAddress || replacedToken) && gridIsOpen() && saved.baseUrl && saved.hasToken)
      await loadEntities()
    // A save whose last publication did not land reports that instead of the clean
    // line, because the model holds the lists of the instance the user leaves
    // until the change arrives.
    status.value = policyPublished
      ? { suffix: movedAddress ? 'status.saved-cleared' : 'status.saved' }
      : { suffix: 'status.failed-policy-move' }
  }
  catch (error) {
    status.value = failureStatus(error)
  }
  finally {
    busy.value = false
  }
}

/** Selects or clears every device the current tab shows. */
async function setVisibleSelected(selected: boolean) {
  if (pickerHeld.value)
    return
  settings.setEntitiesSelected(visibleEntities.value.map(entity => entity.entityId), selected)
  dropMissingDomain()
  await publishPolicy()
}

/** Selects or clears one device. */
async function toggleEntity(entityId: string, selected: boolean) {
  if (pickerHeld.value)
    return
  settings.setEntitySelected(entityId, selected)
  dropMissingDomain()
  await publishPolicy()
}

async function onTest() {
  busy.value = true
  status.value = { suffix: 'status.testing' }
  try {
    const { policyPublished } = await runSave()
    await loadEntities()
    // `loadEntities` keeps its failure on the page so the picker can show it. A
    // test must not report the connection as good, and must not report the row
    // count of an earlier list.
    if (entityError.value)
      throw new Error(entityError.value)
    // A test that moved the address reports the connection only when its last
    // publication landed. A stale list beside a healthy connection reads as a
    // pass for the whole move.
    status.value = policyPublished
      ? { suffix: 'status.reachable', params: { count: entities.value.length } }
      : { suffix: 'status.failed-policy-move' }
  }
  catch (error) {
    status.value = failureStatus(error)
  }
  finally {
    busy.value = false
  }
}

/** Runs one save with the policy controls held. */
async function runSave() {
  publishing.value = true
  try {
    return await save()
  }
  finally {
    publishing.value = false
  }
}

// A filter that changed shows its own first page, not the page the last one left.
watch([activeDomain, entityQuery], () => {
  gridLimit.value = GRID_BATCH
})

// A user who opens a list before the first test needs the devices. Loading them
// here keeps the reload button for a second look.
watch(exposureMode, async (mode) => {
  if (mode === 'all' || entities.value.length || !hasToken.value)
    return

  await loadEntities()
})
</script>

<template>
  <div :class="['flex flex-col gap-4']">
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
        :disabled="publishing"
        autocomplete="off"
      />

      <FieldInput
        v-model="token"
        type="password"
        :label="tn('token.label')"
        :description="hasToken ? tn('token.saved') : tn('token.description')"
        :placeholder="hasToken ? tokenPreview : tn('token.placeholder')"
        :disabled="publishing"
        autocomplete="off"
      />

      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ tn('note') }}
      </p>

      <div :class="['flex flex-row items-center gap-3']">
        <Button :disabled="busy" @click="onSave">
          {{ tn('actions.save') }}
        </Button>
        <Button :disabled="busy" variant="secondary" @click="onTest">
          {{ tn('actions.test') }}
        </Button>
        <span v-if="status" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ tn(status.suffix, status.params) }}
        </span>
      </div>
    </SettingsCard>

    <SettingsCard>
      <div>
        <div :class="['text-sm font-medium']">
          {{ tn('access.label') }}
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ tn('access.description') }}
        </div>
      </div>

      <!-- A fieldset disables the whole group, and it reaches the radios the
           group holds. The mode setter drops an edit made during a run, so an
           enabled radio moves while the mode it shows stays. -->
      <fieldset
        :disabled="pickerHeld"
        :class="['m-0 min-w-0 border-0 p-0', 'flex flex-col gap-2', pickerHeld ? 'opacity-60' : '']"
      >
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
      </fieldset>

      <template v-if="exposureMode === 'all'">
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ tn('access.all-hint') }}
        </p>
      </template>

      <template v-else>
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ exposureMode === 'allow' ? tn('access.rule-allow') : tn('access.rule-deny') }}
        </p>
        <p :class="['text-sm font-medium']">
          {{ tn('access.selected-count', { count: selectedCount }) }}
        </p>
        <!--
          A plain Input, not FieldInput: FieldInput keeps the label row and the
          gap even with no label, which leaves the box 16px taller than the
          button beside it.
        -->
        <div :class="['flex flex-row items-center gap-2']">
          <Input v-model="entityQuery" :class="['h-9', 'min-w-0 flex-1']" :placeholder="tn('access.search')" />
          <Button :disabled="loadingEntities || pickerHeld || !hasToken" variant="secondary" @click="loadEntities">
            {{ tn('access.reload') }}
          </Button>
        </div>

        <p v-if="entityError" :class="['text-sm text-red-500']">
          {{ entityError }}
        </p>
        <p v-else-if="loadingEntities" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ tn('access.loading') }}
        </p>
        <p v-else-if="!gridEntities.length" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ tn('access.no-devices') }}
        </p>

        <template v-else>
          <div :class="['max-h-32', 'flex flex-row flex-wrap items-start gap-1', 'overflow-y-auto pb-1']">
            <GhostButton
              size="sm"
              :active="activeDomain === null"
              :aria-pressed="activeDomain === null"
              @click="activeDomain = null"
            >
              {{ tn('access.tab-all') }} · {{ gridEntities.length }}
            </GhostButton>
            <GhostButton
              v-for="tab in domainTabs"
              :key="tab.domain"
              size="sm"
              :active="activeDomain === tab.domain"
              :aria-pressed="activeDomain === tab.domain"
              @click="activeDomain = tab.domain"
            >
              {{ tab.label }} · {{ tab.count }}
            </GhostButton>
          </div>

          <div :class="['flex flex-row items-center justify-between gap-2']">
            <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ tn('access.shown-count', { shown: mountedEntities.length, total: visibleEntities.length }) }}
            </span>
            <div :class="['flex flex-row items-center gap-2']">
              <Button
                variant="secondary"
                :disabled="busy || publishing || allVisibleSelected"
                @click="setVisibleSelected(true)"
              >
                {{ tn('access.select-matching') }}
              </Button>
              <Button
                variant="secondary"
                :disabled="busy || publishing"
                @click="setVisibleSelected(false)"
              >
                {{ tn('access.clear-matching') }}
              </Button>
            </div>
          </div>

          <ScrollableArea class="max-h-96" orientation="vertical">
            <p v-if="!visibleEntities.length" :class="['text-sm text-neutral-500 dark:text-neutral-400', 'p-2']">
              {{ tn('access.no-match') }}
            </p>
            <div v-else :class="['grid gap-2 pr-2', 'grid-cols-1', 'lg:grid-cols-3 sm:grid-cols-2']">
              <HomeAssistantEntityTile
                v-for="entity in mountedEntities"
                :key="entity.entityId"
                :data-settings-search="homeAssistantEntitySearchKey(entity.entityId)"
                :entity="entity"
                :selected="selectedIds.has(entity.entityId)"
                :state-label="stateLabel(entity.domain, entity.state)"
                :disabled="pickerHeld"
                @toggle="toggleEntity(entity.entityId, !selectedIds.has(entity.entityId))"
              />
            </div>
          </ScrollableArea>

          <Button
            v-if="mountedEntities.length < visibleEntities.length"
            variant="secondary"
            @click="gridLimit += GRID_BATCH"
          >
            {{ tn('access.load-more', { count: nextBatch }) }}
          </Button>

          <p v-if="exposureMode === 'allow' && !selectedCount" :class="['text-sm text-amber-600 dark:text-amber-400']">
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
