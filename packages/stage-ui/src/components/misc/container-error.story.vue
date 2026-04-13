<script setup lang="ts">
import { ContainerError } from '@proj-airi/ui'
import { ref } from 'vue'

const actionLog = ref('No action yet')

const sampleError = new Error('Request failed with status code 500')

function noteCopy(content: string) {
  actionLog.value = `Copied ${content.length} characters`
}

function noteFeedback() {
  actionLog.value = 'Feedback action clicked'
}
</script>

<template>
  <Story
    title="Error Message Panel"
    group="misc"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="message-only"
      title="Message Only"
    >
      <div class="max-w-3xl">
        <ContainerError message="Unable to load project settings. Please try again." />
      </div>
    </Variant>

    <Variant
      id="with-stack"
      title="With Stack Trace"
    >
      <div class="max-w-3xl">
        <ContainerError :error="sampleError" height-preset="lg" />
      </div>
    </Variant>

    <Variant
      id="actions"
      title="Action Callbacks"
    >
      <div class="max-w-3xl flex flex-col gap-3">
        <ContainerError :error="sampleError" @copy="noteCopy" @feedback="noteFeedback" />
        <div class="text-sm text-neutral-600 dark:text-neutral-300">
          {{ actionLog }}
        </div>
      </div>
    </Variant>
  </Story>
</template>
