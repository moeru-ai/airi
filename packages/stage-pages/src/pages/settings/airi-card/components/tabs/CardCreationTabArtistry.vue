<script setup lang="ts">
import type { ComfyUIWorkflowTemplate } from '@proj-airi/stage-ui/stores/modules/artistry'

import { REPLICATE_IMAGEGEN_PRESETS } from '@proj-airi/stage-shared'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { Button, Checkbox, FieldInput, FieldRange, Select } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  artistryProviderOptions: { value: string, label: string }[]
  defaultArtistryProviderPlaceholder: string
}>()

const selectedArtistryProvider = defineModel<string>('selectedArtistryProvider', { required: true })
const selectedArtistryModel = defineModel<string>('selectedArtistryModel', { required: true })
const selectedArtistryPromptPrefix = defineModel<string>('selectedArtistryPromptPrefix', { required: true })
const selectedArtistryWidgetInstruction = defineModel<string>('selectedArtistryWidgetInstruction', { required: true })
const selectedArtistryAutonomousEnabled = defineModel<boolean>('selectedArtistryAutonomousEnabled', { required: true })
const selectedArtistryAutonomousThreshold = defineModel<number>('selectedArtistryAutonomousThreshold', { required: true })
const selectedArtistrySpawnMode = defineModel<'bg' | 'widget' | 'inline' | 'bg_widget'>('selectedArtistrySpawnMode', { required: true })
const selectedArtistryConfigStr = defineModel<string>('selectedArtistryConfigStr', { required: true })

const { t } = useI18n()

const artistryStore = useArtistryStore()
const comfyuiWorkflows = computed(() => artistryStore.comfyuiSavedWorkflows || [])
const spawnModeOptions = computed(() => [
  { value: 'bg', label: t('settings.pages.modules.artistry.spawn_mode.options.bg') },
  { value: 'inline', label: t('settings.pages.modules.artistry.spawn_mode.options.inline') },
  { value: 'widget', label: t('settings.pages.modules.artistry.spawn_mode.options.widget') },
  { value: 'bg_widget', label: t('settings.pages.modules.artistry.spawn_mode.options.bg_widget') },
])

const pendingInstructionWf = ref<ComfyUIWorkflowTemplate | null>(null)

function handleModelSelect(model: (typeof REPLICATE_IMAGEGEN_PRESETS)[number]) {
  selectedArtistryModel.value = model.id
  selectedArtistryPromptPrefix.value = model.prompt || ''
  selectedArtistryConfigStr.value = JSON.stringify(model.preset, null, 2)
}

function handleComfyWorkflowSelect(wf: ComfyUIWorkflowTemplate) {
  selectedArtistryModel.value = wf.id
  selectedArtistryConfigStr.value = JSON.stringify({ template: wf.id }, null, 2)
  pendingInstructionWf.value = wf
}

function generateAgentInstructions(wf: ComfyUIWorkflowTemplate) {
  let fieldsStr = ''
  for (const [node, fields] of Object.entries(wf.exposedFields as Record<string, string[]>)) {
    fieldsStr += `- **${node}**: ${fields.join(', ')}\n`
  }

  const exampleKey = Object.keys(wf.exposedFields)[0] || 'NodeTitle'
  const exampleField = (wf.exposedFields[exampleKey] as string[])?.[0] || 'field'

  return `## Instruction: Widget Spawning (ComfyUI)
You have the ability to generate images using a custom ComfyUI workflow: **${wf.name}**.

### How to Use
**Step 1: Spawn a canvas (do this once)**
- Component name: \`artistry\`
- Give it a unique ID (e.g. \`art-01\`)

**Step 2: Generate an image**
Update the widget with \`status: "generating"\`, a \`prompt\`, and optional field overrides in the root of \`componentProps\`.

**Exposed Fields you can override:**
${fieldsStr}

**Example Update:**
\`\`\`json
{
  "status": "generating",
  "prompt": "your description",
  "template": "${wf.id}",
  "${exampleKey}": {
    "${exampleField}": "value"
  }
}
\`\`\`
`
}

function applyRecommendedInstructions() {
  if (!pendingInstructionWf.value)
    return
  selectedArtistryWidgetInstruction.value = generateAgentInstructions(pendingInstructionWf.value)
  pendingInstructionWf.value = null
}

function getExposedFieldsCount(wf: ComfyUIWorkflowTemplate) {
  if (!wf.exposedFields)
    return 0
  return Object.values(wf.exposedFields).reduce((n: number, arr) => n + (arr?.length || 0), 0)
}

function openReplicateModel() {
  if (!selectedArtistryModel.value)
    return
  window.open(`https://replicate.com/${selectedArtistryModel.value}`, '_blank')
}
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3">
      {{ t('settings.pages.modules.artistry.card.description') }}
    </p>

    <!-- Autonomous Artist Section -->
    <div :class="['mb-6', 'p-4', 'rounded-2xl', 'bg-primary-500/5', 'border-2', 'border-primary-500/10']">
      <div :class="['flex', 'items-center', 'justify-between', 'mb-2']">
        <label :class="['flex', 'items-center', 'gap-2', 'font-bold', 'text-primary-600', 'dark:text-primary-400']">
          <div i-solar:magic-stick-bold-duotone />
          {{ t('settings.pages.modules.artistry.autonomous.title') }}
        </label>
        <Checkbox v-model="selectedArtistryAutonomousEnabled" />
      </div>
      <p :class="['text-xs', 'text-neutral-500', 'mb-4']">
        {{ t('settings.pages.modules.artistry.autonomous.description') }}
      </p>

      <div v-if="selectedArtistryAutonomousEnabled" :class="['space-y-4', 'animate-in', 'fade-in', 'slide-in-from-top-2']">
        <FieldRange
          v-model="selectedArtistryAutonomousThreshold"
          :label="t('settings.pages.modules.artistry.autonomous.threshold')"
          :description="t('settings.pages.modules.artistry.autonomous.threshold_description', {
            min: t('settings.pages.modules.artistry.autonomous.threshold_min'),
            max: t('settings.pages.modules.artistry.autonomous.threshold_max'),
          })"
          :min="0"
          :max="100"
          :step="1"
          :format-value="value => `${value}%`"
        />
      </div>
    </div>

    <div :class="['grid', 'grid-cols-1', 'gap-4', 'ml-auto', 'mr-auto', 'w-90%']">
      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:image />
          {{ t('settings.pages.modules.artistry.provider') }}
        </label>
        <Select
          v-model="selectedArtistryProvider"
          :options="artistryProviderOptions"
          :placeholder="defaultArtistryProviderPlaceholder"
          class="w-full"
        />
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-solar:route-bold-duotone />
          {{ t('settings.pages.modules.artistry.spawn_mode.label') }}
        </label>
        <Select
          v-model="selectedArtistrySpawnMode"
          :options="spawnModeOptions"
          class="w-full"
        />
        <p :class="['text-[10px]', 'text-neutral-400', 'px-1']">
          {{ t('settings.pages.modules.artistry.spawn_mode.description') }}
        </p>
      </div>

      <div v-if="selectedArtistryProvider === 'replicate'" class="grid grid-cols-3 mb-2 gap-3">
        <Button
          v-for="model in REPLICATE_IMAGEGEN_PRESETS"
          :key="model.id"
          variant="secondary"
          :class="[
            'h-auto min-h-20 flex flex-col items-center justify-center rounded-xl border p-3 transition-all',
            selectedArtistryModel === model.id
              ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
              : 'border-neutral-200 bg-white hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-800',
          ]"
          @click="handleModelSelect(model)"
        >
          <span class="text-xs font-bold">{{ model.label }}</span>
          <span class="mt-1 text-[10px] opacity-60">{{ model.cost }}</span>
        </Button>
      </div>

      <div
        v-if="selectedArtistryProvider === 'comfyui'"
        class="mb-2 flex flex-col gap-3"
      >
        <div
          v-if="comfyuiWorkflows.length === 0"
          :class="['flex flex-row items-center gap-3 rounded-xl border-2 border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-600 dark:text-amber-400']"
        >
          <div i-solar:info-circle-bold-duotone class="shrink-0 text-lg" />
          <p>
            {{ t('settings.pages.modules.artistry.card.comfyui_empty') }}
          </p>
        </div>
        <div v-else class="grid grid-cols-2 gap-3">
          <Button
            v-for="wf in comfyuiWorkflows"
            :key="wf.id"
            variant="secondary"
            :class="[
              'h-auto min-h-20 flex flex-col items-center justify-center rounded-xl border p-3 transition-all',
              selectedArtistryModel === wf.id
                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
                : 'border-neutral-200 bg-white hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-800',
            ]"
            @click="handleComfyWorkflowSelect(wf)"
          >
            <span class="text-xs font-bold">{{ wf.name }}</span>
            <span class="mt-1 text-[10px] opacity-60">{{ t('settings.pages.modules.artistry.card.exposed_fields', { count: getExposedFieldsCount(wf) }) }}</span>
          </Button>
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-5">
        <div class="relative">
          <FieldInput
            v-model="selectedArtistryModel"
            :label="t('settings.pages.modules.artistry.model.label')"
            :description="t('settings.pages.modules.artistry.model.description')"
            placeholder="e.g. black-forest-labs/flux-schnell"
          />
          <Button
            v-if="selectedArtistryProvider === 'replicate' && selectedArtistryModel"
            variant="ghost"
            size="sm"
            shape="square"
            :class="[
              'absolute right-3 top-9',
            ]"
            :title="t('settings.pages.modules.artistry.card.open_on_replicate')"
            @click="openReplicateModel"
          >
            <div i-solar:link-round-bold-duotone class="text-xl" />
          </Button>
        </div>

        <div
          v-if="pendingInstructionWf"
          class="flex flex-col gap-3 border-2 border-indigo-500/20 rounded-xl bg-indigo-500/5 p-4"
        >
          <div class="flex items-center gap-2 text-sm text-indigo-600 font-bold dark:text-indigo-400">
            <div i-solar:magic-stick-bold-duotone />
            {{ t('settings.pages.modules.artistry.card.instruction_sync.title') }}
          </div>
          <p class="text-xs text-neutral-600 dark:text-neutral-400">
            {{ t('settings.pages.modules.artistry.card.instruction_sync.description', { workflowName: pendingInstructionWf.name }) }}
          </p>
          <div class="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              @click="applyRecommendedInstructions"
            >
              {{ t('settings.pages.modules.artistry.card.instruction_sync.apply') }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              @click="pendingInstructionWf = null"
            >
              {{ t('settings.pages.modules.artistry.card.instruction_sync.keep') }}
            </Button>
          </div>
        </div>

        <FieldInput
          v-model="selectedArtistryPromptPrefix"
          :label="t('settings.pages.modules.artistry.prompt-prefix.label')"
          :description="t('settings.pages.modules.artistry.prompt-prefix.description')"
          placeholder="e.g. Masterpiece, high quality, 1girl, anime,"
        />
        <FieldInput
          v-model="selectedArtistryWidgetInstruction"
          :label="t('settings.pages.modules.artistry.widget-instructions.label')"
          :description="t('settings.pages.modules.artistry.widget-instructions.description')"
          :single-line="false"
          :rows="12"
        />
        <FieldInput
          v-model="selectedArtistryConfigStr"
          :label="t('settings.pages.modules.artistry.options.label')"
          :single-line="false"
        />
      </div>
    </div>
  </div>
</template>
