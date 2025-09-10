<script setup lang="ts">
import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'

import Live2DScene from './Live2D.vue'
import VRMScene from './VRM.vue'

import { useLive2d } from '../../stores/live2d'
import { useSettings } from '../../stores/settings'
import { useVRM } from '../../stores/vrm'

withDefaults(defineProps<{
  paused?: boolean
  focusAt: { x: number, y: number }
  xOffset?: number | string
  yOffset?: number | string
  scale?: number
}>(), { paused: false, scale: 1 })

const db = ref<DuckDBWasmDrizzleDatabase>()
// const transformersProvider = createTransformers({ embedWorkerURL })

const vrmViewerRef = ref<InstanceType<typeof VRMScene>>()
const live2dSceneRef = ref<InstanceType<typeof Live2DScene>>()

const settingsStore = useSettings()
const { stageModelRenderer, stageViewControlsEnabled, live2dDisableFocus, stageModelSelectedUrl } = storeToRefs(settingsStore)

const live2dStore = useLive2d()
const vrmStore = useVRM()

const showStage = ref(true)

live2dStore.onShouldUpdateView(async () => {
  showStage.value = false
  await settingsStore.updateStageModel()
  setTimeout(() => {
    showStage.value = true
  }, 100)
})

vrmStore.onShouldUpdateView(async () => {
  showStage.value = false
  await settingsStore.updateStageModel()
  setTimeout(() => {
    showStage.value = true
  }, 100)
})

onUnmounted(() => {

})

onMounted(async () => {
  db.value = drizzle({ connection: { bundles: getImportUrlBundles() } })
  await db.value.execute(`CREATE TABLE memory_test (vec FLOAT[768]);`)
})

function canvasElement() {
  if (stageModelRenderer.value === 'live2d')
    return live2dSceneRef.value?.canvasElement()

  else if (stageModelRenderer.value === 'vrm')
    return vrmViewerRef.value?.canvasElement()
}

defineExpose({
  canvasElement,
})
</script>

<template>
  <div relative>
    <div h-full w-full>
      <Live2DScene
        v-if="stageModelRenderer === 'live2d' && showStage"
        ref="live2dSceneRef"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :focus-at="focusAt"
        :paused="paused"
        :x-offset="xOffset"
        :y-offset="yOffset"
        :scale="scale"
        :disable-focus-at="live2dDisableFocus"
      />
      <VRMScene
        v-if="stageModelRenderer === 'vrm' && showStage"
        ref="vrmViewerRef"
        :model-src="stageModelSelectedUrl"
        idle-animation="/assets/vrm/animations/idle_loop.vrma"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        @error="console.error"
      />
    </div>
  </div>
</template>
