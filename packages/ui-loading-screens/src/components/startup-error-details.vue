<script setup lang="ts">
import { BasicButton, BottomDrawer } from '@proj-airi/ui'
import { useMediaQuery } from '@vueuse/core'
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { shallowRef, watch } from 'vue'

defineProps<{
  label: string
  closeLabel: string
  message: string
}>()

const isDesktop = useMediaQuery('(min-width: 768px)')
const open = shallowRef(false)

watch(isDesktop, () => open.value = false)
</script>

<template>
  <div class="startup-error-details">
    <TooltipProvider v-if="isDesktop" :delay-duration="250">
      <TooltipRoot v-model:open="open" disable-closing-trigger>
        <TooltipTrigger as-child>
          <BasicButton size="unset" class="startup-error-details-trigger" @click="open = true">
            <span i-solar:question-circle-linear aria-hidden="true" />
            {{ label }}
          </BasicButton>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent class="startup-error-details-tooltip" side="bottom" align="start" :side-offset="8">
            {{ message }}
            <TooltipArrow class="startup-error-details-tooltip-arrow" />
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>

    <BottomDrawer v-else v-model="open" :title="label" :layer="10001">
      <template #trigger>
        <BasicButton size="unset" class="startup-error-details-trigger">
          <span i-solar:question-circle-linear aria-hidden="true" />
          {{ label }}
        </BasicButton>
      </template>
      <template #header-action>
        <BasicButton
          size="unset"
          class="startup-error-details-close"
          :aria-label="closeLabel"
          @click="open = false"
        >
          <span i-solar:close-circle-linear aria-hidden="true" />
        </BasicButton>
      </template>
      <p class="startup-error-details-message">
        {{ message }}
      </p>
    </BottomDrawer>
  </div>
</template>

<style scoped>
.startup-error-details {
  width: fit-content;
  margin: 12px 24px 0;
}

.startup-error-details-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid #ef44443d;
  border-radius: 6px;
  background: #ef44440a;
  color: #dc2626;
  cursor: help;
  font: inherit;
  font-size: 11px;
}

.startup-error-details-trigger:focus-visible,
.startup-error-details-close:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}

:global(.startup-error-details-tooltip) {
  z-index: 10001;
  box-sizing: border-box;
  width: max-content;
  max-width: min(320px, calc(100vw - 48px));
  padding: 12px;
  border-radius: 8px;
  background: #171717;
  box-shadow: 0 8px 24px #0003;
  color: #fafafa;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

:global(.startup-error-details-tooltip-arrow) {
  fill: #171717;
}

:global(html.dark .startup-error-details-tooltip) {
  border: 1px solid #ffffff24;
  background: #262626;
}

:global(html.dark .startup-error-details-tooltip-arrow) {
  fill: #262626;
}

.startup-error-details-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #737373;
  font-size: 22px;
}

.startup-error-details-message {
  margin: 0;
  color: #525252;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

:global(html.dark .startup-error-details-trigger) {
  border-color: #f8717159;
  background: #f8717114;
  color: #f87171;
}

:global(html.dark .startup-error-details-message) {
  color: #d4d4d4;
}

@media (max-width: 600px) {
  .startup-error-details {
    margin-right: 16px;
    margin-left: 16px;
  }

  .startup-error-details-trigger {
    cursor: pointer;
  }
}
</style>
