<script setup lang="ts">
import { useLive2d } from '@proj-airi/stage-ui-live2d/stores'
import { Checkbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const live2dStore = useLive2d()
const { availableExpressions, parameterMetadata, modelParameters, expressionData } = storeToRefs(live2dStore)

console.info('🛠️ [Live2D-UI] Store State:', {
  expressions: availableExpressions.value.length,
  metadata: parameterMetadata.value.length,
  params: Object.keys(modelParameters.value).length,
  expData: expressionData.value.length,
})

// Categorize parameters based on metadata
const toggles = computed(() => {
  const result = parameterMetadata.value.filter(p =>
    p.groupName?.toLowerCase().includes('toggle')
    || p.name.toLowerCase().includes('off on')
    || p.id.toLowerCase().includes('onoff'),
  )
  return result
})

const sliders = computed(() => {
  const result = parameterMetadata.value.filter(p =>
    p.groupName?.toLowerCase().includes('slider')
    || (p.groupName && !toggles.value.some(t => t.id === p.id) && !isStandardParam(p.id)),
  )
  return result
})

const otherParams = computed(() => {
  const result = parameterMetadata.value.filter(p =>
    !toggles.value.some(t => t.id === p.id)
    && !sliders.value.some(s => s.id === p.id)
    && !isStandardParam(p.id),
  )
  return result
})

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

function setExpression(fileName: string) {
  console.info('🎭 [Live2D-UI] Applying expression:', fileName)

  // Find the pre-extracted expression data from the store
  const expData = expressionData.value.find((e: any) => e.fileName === fileName)?.data

  if (expData?.Parameters) {
    for (const param of expData.Parameters) {
      const id = param.Id || param.id
      const value = param.Value ?? param.value
      if (id !== undefined && value !== undefined) {
        modelParameters.value[id] = value
        console.info(`  → ${id} = ${value}`)
      }
    }
  }
  else {
    console.warn('⚠️ [Live2D-UI] No expression data found for:', fileName)
  }
}

// Helper for number/boolean conversion on toggles
function getToggleValue(id: string) {
  return modelParameters.value[id] > 0.5
}

function setToggleValue(id: string, value: boolean) {
  modelParameters.value[id] = value ? 1 : 0
}
</script>

<template>
  <div class="space-y-6">
    <!-- Expressions / Presets -->
    <div v-if="availableExpressions.length > 0" class="space-y-3">
      <h3 class="text-sm font-medium tracking-wider uppercase opacity-50">
        Presets & Expressions
      </h3>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="exp in availableExpressions"
          :key="exp.fileName"
          class="truncate border border-white/10 rounded-lg bg-white/5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/10"
          @click="setExpression(exp.fileName)"
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
      <h3 class="text-sm text-amber-500/80 font-medium tracking-wider uppercase opacity-50">
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
