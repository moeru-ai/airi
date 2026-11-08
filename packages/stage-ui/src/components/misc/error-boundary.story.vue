<script setup lang="ts">
import { Button, ErrorBoundary } from '@proj-airi/ui'
import { defineComponent, h, shallowRef } from 'vue'

const fail = shallowRef(false)
const attempts = shallowRef(0)
const ExampleContent = defineComponent({
  setup() {
    return () => {
      if (fail.value)
        throw new Error('Story render failure')
      return h('p', 'The child content renders successfully.')
    }
  },
})

function prepareRetry() {
  fail.value = false
  attempts.value++
}
</script>

<template>
  <Story title="Error Boundary" group="misc">
    <Variant id="retry" title="Render failure and recovery">
      <div :class="['flex flex-col gap-4 p-4']">
        <Button label="Trigger render failure" @click="fail = true" />
        <ErrorBoundary title="Preview failed" @retry="prepareRetry">
          <ExampleContent />
        </ErrorBoundary>
        <p>Retries: {{ attempts }}</p>
      </div>
    </Variant>
    <Variant id="custom" title="Custom fallback">
      <div :class="['flex flex-col gap-4 p-4']">
        <Button label="Trigger render failure" @click="fail = true" />
        <ErrorBoundary>
          <ExampleContent />
          <template #fallback="{ retry }">
            <p>The preview failed. Restore it to continue.</p>
            <Button label="Restore preview" @click="prepareRetry(); retry()" />
          </template>
        </ErrorBoundary>
      </div>
    </Variant>
  </Story>
</template>
