<script setup lang="ts">
import { Button, Collapsible } from '@proj-airi/ui'
import { shallowRef } from 'vue'

const open = shallowRef(false)
</script>

<template>
  <Story title="Collapsible" group="misc">
    <Variant id="default" title="Default trigger">
      <Collapsible label="Details" :class="['p-4']">
        <p :class="['p-4']">
          Additional settings appear here.
        </p>
      </Collapsible>
    </Variant>
    <Variant id="controlled" title="Controlled and custom trigger">
      <Collapsible v-model="open" :class="['p-4']">
        <template #trigger="{ visible, setVisible }">
          <Button :label="visible ? 'Hide details' : 'Show details'" :aria-expanded="visible" @click="setVisible(!visible)" />
        </template>
        <p :class="['p-4']">
          The parent owns the open state: {{ open }}.
        </p>
      </Collapsible>
    </Variant>
  </Story>
</template>
