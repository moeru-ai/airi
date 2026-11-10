<script setup lang="ts">
import type { Live2DValidationReport } from '@proj-airi/stage-ui-live2d'

import { Button } from '@proj-airi/ui'
import { reactive } from 'vue'

import ReportModal from './modal.vue'

interface ReportVariantState {
  open: boolean
  events: string[]
}

const validReport: Live2DValidationReport = {
  fileName: 'hiyori-production.model.zip',
  status: 'VALID',
  model: {
    type: 'model3',
    entryPoint: 'Hiyori/Hiyori.model3.json',
    archiveFileCount: 42,
    moc: { path: 'Hiyori/Hiyori.moc3', version: 5, size: 9164554 },
  },
  resources: {
    textures: { discovered: 4, referenced: 4 },
    motions: { discovered: 12, referenced: 12, parsed: 12 },
    expressions: { discovered: 8, referenced: 8, parsed: 8 },
    parameters: { parsed: 67, source: 'display-info' },
  },
  issues: [],
}

const warningReport: Live2DValidationReport = {
  fileName: 'elena-concert-heavy.zip',
  status: 'WARNING',
  model: {
    type: 'model3',
    entryPoint: 'model/elena.model3.json',
    archiveFileCount: 186,
    moc: { path: 'model/elena.moc3', version: 5, size: 47479521 },
  },
  resources: {
    textures: { discovered: 8, referenced: 8 },
    motions: { discovered: 20, referenced: 16, parsed: 20 },
    expressions: { discovered: 14, referenced: 12, parsed: 14 },
    parameters: { parsed: 93, source: 'display-info' },
  },
  issues: [
    {
      code: 'moc-performance-risk',
      severity: 'warning',
      message: 'The MOC file is 45.28 MB and can reduce rendering performance.',
      resolution: 'Reduce the model complexity or texture mesh density for better performance.',
    },
    {
      code: 'unreferenced-expressions',
      severity: 'warning',
      message: '2 expression files are not referenced by elena.model3.json.',
      resolution: 'Add the files to FileReferences.Expressions in elena.model3.json, or remove the unused files.',
    },
    {
      code: 'unreferenced-motions',
      severity: 'warning',
      message: '4 motion files are not referenced by elena.model3.json.',
      resolution: 'Add the files to FileReferences.Motions in elena.model3.json, or remove the unused files.',
    },
  ],
}

const invalidReport: Live2DValidationReport = {
  fileName: 'broken-archive.zip',
  status: 'INVALID',
  model: {
    type: 'model3',
    entryPoint: 'model/broken.model3.json',
    archiveFileCount: 17,
    moc: null,
  },
  resources: {
    textures: { discovered: 1, referenced: 2 },
    motions: { discovered: 3, referenced: 3, parsed: 3 },
    expressions: { discovered: 6, referenced: 6, parsed: 6 },
    parameters: { parsed: 0, source: 'unavailable' },
  },
  issues: [
    {
      code: 'missing-reference',
      severity: 'error',
      message: 'The referenced MOC file "broken.moc3" is missing.',
      resolution: 'Add the file at "model/broken.moc3", or update the MOC path in broken.model3.json.',
    },
    {
      code: 'missing-reference',
      severity: 'error',
      message: 'The referenced texture file "textures/texture_01.png" is missing.',
      resolution: 'Add the file at "model/textures/texture_01.png", or update the texture path in broken.model3.json.',
    },
    {
      code: 'missing-display-info',
      severity: 'warning',
      message: 'The display information file "broken.cdi3.json" is missing.',
      resolution: 'Add the file at "model/broken.cdi3.json", or remove DisplayInfo from broken.model3.json.',
    },
  ],
}

const validState = reactive<ReportVariantState>({ open: true, events: [] })
const warningState = reactive<ReportVariantState>({ open: true, events: [] })
const invalidState = reactive<ReportVariantState>({ open: true, events: [] })

function recordEvent(state: ReportVariantState, event: string) {
  state.events = [event, ...state.events].slice(0, 4)
}
</script>

<template>
  <Story title="Dialogs / Live2D Report Modal" group="dialogs">
    <Variant id="valid" title="Valid Report">
      <div :class="['mx-auto max-w-xl p-4', 'flex flex-col gap-3']">
        <Button @click="validState.open = true">
          Open Valid Report
        </Button>
        <div
          v-if="validState.events.length > 0"
          :class="[
            'rounded-lg bg-neutral-100/70 p-3 text-xs text-neutral-600',
            'dark:bg-neutral-900/70 dark:text-neutral-300',
          ]"
        >
          <div v-for="event in validState.events" :key="event">
            {{ event }}
          </div>
        </div>
        <ReportModal
          v-model:open="validState.open"
          :report="validReport"
          @close="recordEvent(validState, 'close')"
          @confirm="recordEvent(validState, 'confirm')"
        />
      </div>
    </Variant>

    <Variant id="warning" title="Warning Report">
      <div :class="['mx-auto max-w-xl p-4', 'flex flex-col gap-3']">
        <Button @click="warningState.open = true">
          Open Warning Report
        </Button>
        <div
          v-if="warningState.events.length > 0"
          :class="[
            'rounded-lg bg-neutral-100/70 p-3 text-xs text-neutral-600',
            'dark:bg-neutral-900/70 dark:text-neutral-300',
          ]"
        >
          <div v-for="event in warningState.events" :key="event">
            {{ event }}
          </div>
        </div>
        <ReportModal
          v-model:open="warningState.open"
          :report="warningReport"
          @close="recordEvent(warningState, 'close')"
          @confirm="recordEvent(warningState, 'confirm')"
        />
      </div>
    </Variant>

    <Variant id="invalid" title="Invalid Report">
      <div :class="['mx-auto max-w-xl p-4', 'flex flex-col gap-3']">
        <Button @click="invalidState.open = true">
          Open Invalid Report
        </Button>
        <div
          v-if="invalidState.events.length > 0"
          :class="[
            'rounded-lg bg-neutral-100/70 p-3 text-xs text-neutral-600',
            'dark:bg-neutral-900/70 dark:text-neutral-300',
          ]"
        >
          <div v-for="event in invalidState.events" :key="event">
            {{ event }}
          </div>
        </div>
        <ReportModal
          v-model:open="invalidState.open"
          :report="invalidReport"
          @close="recordEvent(invalidState, 'close')"
          @confirm="recordEvent(invalidState, 'confirm')"
        />
      </div>
    </Variant>
  </Story>
</template>
