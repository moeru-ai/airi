<script setup lang="ts">
import type { Live2DExpressionDefinition } from '../../contexts/expressions'

import { shallowRef, watch } from 'vue'

import { parseLive2DExpression } from '../../contexts/expressions'
import { useLive2D } from '../../contexts/live2d'

const props = defineProps<{
  name: string
  fileName: string
  load: (fileName: string) => Promise<string>
}>()

const live2d = useLive2D()
const definition = shallowRef<Live2DExpressionDefinition>()

watch(
  [() => props.name, () => props.fileName, () => props.load],
  async ([name, fileName, load], _, onCleanup) => {
    let active = true
    let unregister: (() => void) | undefined
    definition.value = undefined

    onCleanup(() => {
      active = false
      unregister?.()
    })

    try {
      const source = await load(fileName)
      if (!active)
        return

      const nextDefinition = parseLive2DExpression(name, fileName, source)
      unregister = live2d.expressions.register(nextDefinition)
      definition.value = nextDefinition
    }
    catch (error) {
      if (active)
        live2d.reportError('expression', error)
    }
  },
  { immediate: true },
)
</script>

<template>
  <slot v-if="definition" :definition="definition" />
</template>
