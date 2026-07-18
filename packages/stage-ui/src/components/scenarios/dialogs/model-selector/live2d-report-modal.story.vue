<script setup lang="ts">
import type { Live2DValidationReport } from '@proj-airi/stage-ui-live2d'

import { Button } from '@proj-airi/ui'
import { reactive } from 'vue'

import Live2DReportModal from './Live2DReportModal.vue'

interface ReportVariantState {
  open: boolean
  events: string[]
}

const validReport: Live2DValidationReport = {
  fileName: 'hiyori-production.model.zip',
  totalFiles: 42,
  status: 'VALID',
  entryPoint: 'Hiyori/Hiyori.model3.json',
  structureType: 'Standard (model3.json)',
  errors: [],
  warnings: [],
  checks: [
    'Entry point identified: Hiyori/Hiyori.model3.json',
    'MOC3 Header Valid (Sub-version: 5, Size: 8.74 MB)',
  ],
  mocInfo: {
    header: 'MOC3',
    ver: 5,
    size: 9164554,
  },
}

const warningReport: Live2DValidationReport = {
  fileName: 'elena-concert-heavy.zip',
  totalFiles: 186,
  status: 'WARNING',
  entryPoint: 'model/elena.model3.json',
  structureType: 'Standard (model3.json)',
  errors: [],
  warnings: [
    'HEAVY RESOURCE: MOC file is 45.28 MB. This may cause performance issues in web browsers.',
    'Missing preview image. AIRI can still import this model, but the selector card will use a fallback preview.',
  ],
  checks: [
    'Entry point identified: model/elena.model3.json',
    'MOC3 Header Valid (Sub-version: 5, Size: 45.28 MB)',
  ],
  mocInfo: {
    header: 'MOC3',
    ver: 5,
    size: 47479521,
  },
}

const invalidReport: Live2DValidationReport = {
  fileName: 'broken-archive.zip',
  totalFiles: 17,
  status: 'INVALID',
  entryPoint: null,
  structureType: 'Unknown',
  errors: [
    'Invalid Structure: No .model3.json found and 0 .moc3 files encountered.',
    'Missing thumbnail referenced by model settings.',
    'BASENAME COLLISION: Filename "texture_00.png" exists in multiple locations: model/textures/texture_00.png, model/expressions/texture_00.png. This causes data loss in AIRI\'s loader.',
  ],
  warnings: [
    'Archive contains loose files at the root. Put the model files in one folder before zipping.',
  ],
  checks: [],
}

const validState = reactive<ReportVariantState>({ open: true, events: [] })
const warningState = reactive<ReportVariantState>({ open: true, events: [] })
const invalidState = reactive<ReportVariantState>({ open: true, events: [] })

function recordEvent(state: ReportVariantState, event: string) {
  state.events = [event, ...state.events].slice(0, 4)
}
</script>

<template>
  <Story
    title="Dialogs / Live2D Report Modal"
    group="dialogs"
  >
    <Variant
      id="valid"
      title="Valid Report"
    >
      <div
        :class="[
          'mx-auto max-w-xl p-4',
          'flex flex-col gap-3',
        ]"
      >
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
          <div
            v-for="event in validState.events"
            :key="event"
          >
            {{ event }}
          </div>
        </div>
        <Live2DReportModal
          v-model:open="validState.open"
          :report="validReport"
          @close="recordEvent(validState, 'close')"
          @confirm="recordEvent(validState, 'confirm')"
          @fix-error="error => recordEvent(validState, `fixError: ${error}`)"
        />
      </div>
    </Variant>

    <Variant
      id="warning"
      title="Warning Report"
    >
      <div
        :class="[
          'mx-auto max-w-xl p-4',
          'flex flex-col gap-3',
        ]"
      >
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
          <div
            v-for="event in warningState.events"
            :key="event"
          >
            {{ event }}
          </div>
        </div>
        <Live2DReportModal
          v-model:open="warningState.open"
          :report="warningReport"
          @close="recordEvent(warningState, 'close')"
          @confirm="recordEvent(warningState, 'confirm')"
          @fix-error="error => recordEvent(warningState, `fixError: ${error}`)"
        />
      </div>
    </Variant>

    <Variant
      id="invalid"
      title="Invalid Report"
    >
      <div
        :class="[
          'mx-auto max-w-xl p-4',
          'flex flex-col gap-3',
        ]"
      >
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
          <div
            v-for="event in invalidState.events"
            :key="event"
          >
            {{ event }}
          </div>
        </div>
        <Live2DReportModal
          v-model:open="invalidState.open"
          :report="invalidReport"
          @close="recordEvent(invalidState, 'close')"
          @confirm="recordEvent(invalidState, 'confirm')"
          @fix-error="error => recordEvent(invalidState, `fixError: ${error}`)"
        />
      </div>
    </Variant>
  </Story>
</template>
