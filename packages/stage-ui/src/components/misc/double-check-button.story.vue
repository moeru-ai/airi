<script setup lang="ts">
import { DoubleCheckButton } from '@proj-airi/ui'
import { ref } from 'vue'

const actionLog = ref('Waiting for action...')

function note(message: string) {
  actionLog.value = message
}
</script>

<template>
  <Story
    title="Double Check Button"
    group="misc"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="basic"
      title="Inline confirmation"
    >
      <div class="flex flex-wrap items-center gap-4">
        <DoubleCheckButton
          @confirm="note('Confirmed delete')"
          @cancel="note('Cancelled delete')"
        >
          Delete chats
          <template #confirm>
            Confirm delete
          </template>
        </DoubleCheckButton>
        <DoubleCheckButton
          variant="caution"
          @confirm="note('Confirmed reset')"
          @cancel="note('Cancelled reset')"
        >
          Reset modules
          <template #confirm>
            Confirm reset
          </template>
        </DoubleCheckButton>
      </div>
      <p class="text-sm text-neutral-600 dark:text-neutral-300">
        {{ actionLog }}
      </p>
    </Variant>

    <Variant
      id="custom-cancel"
      title="Custom cancel button"
    >
      <DoubleCheckButton
        block
        @confirm="note('All data wipe confirmed')"
        @cancel="note('All data wipe cancelled')"
      >
        Delete everything
        <template #confirm>
          Wipe all data
        </template>
        <template #cancel>
          Never mind
        </template>
        <template #cancel-botton-icon>
          <div class="i-solar:close-square-line-duotone h-4 w-4" />
        </template>
      </DoubleCheckButton>
    </Variant>
  </Story>
</template>
