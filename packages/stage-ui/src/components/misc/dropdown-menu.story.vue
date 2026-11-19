<script setup lang="ts">
import { Button, DropdownMenu } from '@proj-airi/ui'
import { DropdownMenuItem } from 'reka-ui'
import { shallowRef } from 'vue'

const action = shallowRef('None')
</script>

<template>
  <Story title="Dropdown Menu" group="misc">
    <Variant id="variants" title="Default, blurry, and disabled">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <DropdownMenu v-for="variant in ['default', 'blurry'] as const" :key="variant" :variant="variant">
          <template #trigger>
            <Button :label="variant" />
          </template>
          <DropdownMenuItem :class="['rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-primary-100 dark:data-[highlighted]:bg-primary-900']" @select="action = 'Rename'">
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled :class="['px-3 py-2 opacity-50']">
            Delete disabled
          </DropdownMenuItem>
        </DropdownMenu>
        <DropdownMenu disabled>
          <template #trigger>
            <Button label="Disabled" disabled />
          </template>
        </DropdownMenu>
        <p>Last action: {{ action }}</p>
      </div>
    </Variant>
  </Story>
</template>
