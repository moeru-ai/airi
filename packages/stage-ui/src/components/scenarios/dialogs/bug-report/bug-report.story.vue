<script setup lang="ts">
import BugReportTrigger from './bug-report-trigger.vue'
</script>

<template>
  <Story
    title="Dialogs / Bug Report"
    group="dialogs"
  >
    <Variant
      id="default-trigger"
      title="Default Trigger"
    >
      <div
        :class="[
          'mx-auto max-w-xl p-4',
        ]"
      >
        <BugReportTrigger />
      </div>
    </Variant>

    <Variant
      id="chat-themed-trigger"
      title="Chat Themed Trigger"
    >
      <div
        :class="[
          'mx-auto max-w-2xl rounded-2xl border border-neutral-200/70 bg-white/60 p-4',
          'dark:border-neutral-700/70 dark:bg-neutral-900/70',
        ]"
      >
        <div
          :class="[
            'mb-3 text-sm text-neutral-600 dark:text-neutral-300',
          ]"
        >
          Use this to test reporting from a chat-like screen.
        </div>
        <BugReportTrigger trigger-label="Report Chat Bug" />
      </div>
    </Variant>
  </Story>
</template>
