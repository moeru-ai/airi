<script setup lang="ts">
import { useLive2d } from '@proj-airi/stage-ui-live2d/stores'
import { Checkbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const live2dStore = useLive2d()
const {
  availableExpressions,
  parameterMetadata,
  modelParameters,
  expressionData,
  activeExpressions,
} = storeToRefs(live2dStore)

// === Categorize parameters ===
const toggles = computed(() =>
  parameterMetadata.value.filter(p =>
    p.groupName?.toLowerCase().includes('toggle')
    || p.name.toLowerCase().includes('off on')
    || p.id.toLowerCase().includes('onoff'),
  ),
)

const sliders = computed(() =>
  parameterMetadata.value.filter(p =>
    p.groupName?.toLowerCase().includes('slider')
    || (p.groupName && !toggles.value.some(t => t.id === p.id) && !isStandardParam(p.id)),
  ),
)

const otherParams = computed(() =>
  parameterMetadata.value.filter(p =>
    !toggles.value.some(t => t.id === p.id)
    && !sliders.value.some(s => s.id === p.id)
    && !isStandardParam(p.id),
  ),
)

function isStandardParam(id: string) {
  const standardIds = [
    'ParamAngleX',
    'ParamAngleY',
    'ParamAngleZ',
    'ParamEyeLOpen',
    'ParamEyeROpen',
    'ParamEyeSmile',
    'ParamBrowLX',
    'ParamBrowRX',
    'ParamBrowLY',
    'ParamBrowRY',
    'ParamBrowLAngle',
    'ParamBrowRAngle',
    'ParamBrowLForm',
    'ParamBrowRForm',
    'ParamMouthOpenY',
    'ParamMouthForm',
    'ParamCheek',
    'ParamBodyAngleX',
    'ParamBodyAngleY',
    'ParamBodyAngleZ',
    'ParamBreath',
  ]
  return standardIds.includes(id)
}

// === Layer 1: Toggle Expression ===
function isActive(fileName: string): boolean {
  return (activeExpressions.value[fileName] || 0) > 0
}

function toggleExpression(fileName: string) {
  if (isActive(fileName)) {
    // Turn OFF — un-apply the expression's parameters
    unapplyExpression(fileName)
    activeExpressions.value = { ...activeExpressions.value, [fileName]: 0 }
  }
  else {
    // Turn ON — apply the expression's parameters
    applyExpression(fileName)
    activeExpressions.value = { ...activeExpressions.value, [fileName]: 1 }
  }
}

function applyExpression(fileName: string) {
  const expData = expressionData.value.find((e: any) => e.fileName === fileName)?.data
  if (expData?.Parameters) {
    for (const param of expData.Parameters) {
      const id = param.Id || param.id
      const value = param.Value ?? param.value
      if (id !== undefined && value !== undefined) {
        modelParameters.value[id] = value
      }
    }
  }
}

function unapplyExpression(fileName: string) {
  const expData = expressionData.value.find((e: any) => e.fileName === fileName)?.data
  if (expData?.Parameters) {
    for (const param of expData.Parameters) {
      const id = param.Id || param.id
      if (id !== undefined) {
        modelParameters.value[id] = 0
      }
    }
  }
}

function resetAll() {
  // Zero out all custom parameters
  for (const fileName of Object.keys(activeExpressions.value)) {
    unapplyExpression(fileName)
  }
  // Reset toggle params too
  for (const param of toggles.value) {
    modelParameters.value[param.id] = 0
  }
  activeExpressions.value = {}
}

// === Toggle helpers ===
function getToggleValue(id: string) {
  return modelParameters.value[id] > 0.5
}

function setToggleValue(id: string, value: boolean) {
  modelParameters.value[id] = value ? 1 : 0
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header with Reset -->
    <div
      v-if="availableExpressions.length > 0 || toggles.length > 0"
      class="flex items-center justify-between"
    >
      <span class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ availableExpressions.length + toggles.length }} options
      </span>
      <button
        class="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 transition-colors dark:bg-neutral-800 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700"
        @click="resetAll"
      >
        Reset All
      </button>
    </div>

    <!-- Expressions / Presets -->
    <div v-if="availableExpressions.length > 0" class="space-y-3">
      <h3 class="text-sm font-medium tracking-wider uppercase opacity-50">
        Presets & Expressions
      </h3>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="exp in availableExpressions"
          :key="exp.fileName"
          :class="[
            'relative rounded-md px-2 py-1 text-xs transition-all duration-150',
            'border border-solid select-none',
            isActive(exp.fileName)
              ? 'bg-primary-500/20 border-primary-400 text-primary-600 dark:text-primary-300 font-medium'
              : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700',
          ]"
          @click="toggleExpression(exp.fileName)"
        >
          {{ exp.name }}
        </button>
      </div>
    </div>

    <!-- Toggles -->
    <div v-if="toggles.length > 0" class="space-y-3">
      <h3 class="text-sm font-medium tracking-wider uppercase opacity-50">
        Toggles
      </h3>
      <div class="grid grid-cols-1 gap-4">
        <div v-for="param in toggles" :key="param.id" class="flex items-center justify-between">
          <span class="text-sm text-neutral-600 font-medium dark:text-neutral-400">{{ param.name }}</span>
          <Checkbox
            :model-value="getToggleValue(param.id)"
            @update:model-value="(val) => setToggleValue(param.id, val)"
          />
        </div>
      </div>
    </div>

    <!-- Sliders -->
    <div v-if="sliders.length > 0" class="space-y-3">
      <h3 class="text-sm font-medium tracking-wider uppercase opacity-50">
        Customization Sliders
      </h3>
      <div class="space-y-4">
        <FieldRange
          v-for="param in sliders"
          :key="param.id"
          v-model="modelParameters[param.id]"
          as="div"
          :label="param.name"
          :min="-1"
          :max="1"
          :step="0.01"
        />
      </div>
    </div>

    <!-- Other Params -->
    <div v-if="otherParams.length > 0" class="space-y-3">
      <h3 class="text-sm text-amber-500/80 font-medium tracking-wider uppercase opacity-80">
        Other Parameters
      </h3>
      <div class="space-y-4">
        <FieldRange
          v-for="param in otherParams"
          :key="param.id"
          v-model="modelParameters[param.id]"
          as="div"
          :label="param.name"
          :min="-1"
          :max="1"
          :step="0.01"
        />
      </div>
    </div>
  </div>
</template>
