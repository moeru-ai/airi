<script setup lang="ts">
import Alert from './alert.vue'
import ErrorContainer from './error-container.vue'
import Wip from './wip.vue'

const error = new Error('The model failed to load.')
</script>

<template>
  <Story title="Business Alerts" group="misc">
    <Variant id="tones" title="Status tones">
      <div :class="['flex flex-col gap-4 p-4']">
        <Alert v-for="tone in ['error', 'warning', 'success', 'info', 'loading'] as const" :key="tone" :type="tone">
          <template #title>
            {{ tone }}
          </template>
          <template #content>
            Context for the current operation.
          </template>
        </Alert>
      </div>
    </Variant>
    <Variant id="error" title="Error details">
      <ErrorContainer title="Model load failed" :error="error" :class="['m-4']" />
    </Variant>
    <Variant id="wip" title="Work in progress">
      <Wip :class="['m-4']" />
    </Variant>
  </Story>
</template>
