<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { onClickOutside, useMediaQuery } from '@vueuse/core'
import { DrawerContent, DrawerDescription, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle } from 'vaul-vue'
import { shallowRef, useTemplateRef, watch } from 'vue'

defineProps<{
  label: string
  closeLabel: string
  message: string
}>()

const isDesktop = useMediaQuery('(min-width: 768px)')
const open = shallowRef(false)
const rootElement = useTemplateRef('rootElement')

onClickOutside(rootElement, () => {
  if (isDesktop.value)
    open.value = false
})
watch(isDesktop, () => open.value = false)
</script>

<template>
  <div ref="rootElement" class="startup-error-details">
    <Button
      type="button"
      size="unset"
      color="red"
      variant="secondary"
      :outline="false"
      class="startup-error-details-trigger"
      :aria-expanded="open"
      :aria-controls="isDesktop ? 'startup-error-details-tooltip' : 'startup-error-details-drawer'"
      :aria-describedby="isDesktop && open ? 'startup-error-details-tooltip' : undefined"
      :aria-haspopup="isDesktop ? undefined : 'dialog'"
      @click="open = !open"
      @keydown.esc="open = false"
    >
      <span i-solar:question-circle-linear aria-hidden="true" />
      {{ label }}
    </Button>
    <div v-if="isDesktop && open" id="startup-error-details-tooltip" role="tooltip" class="startup-error-details-tooltip">
      {{ message }}
    </div>
  </div>

  <DrawerRoot v-if="!isDesktop" v-model:open="open" handle-only>
    <DrawerPortal>
      <DrawerOverlay class="startup-error-details-overlay" />
      <DrawerContent id="startup-error-details-drawer" class="startup-error-details-drawer">
        <DrawerHandle class="startup-error-details-handle" />
        <div class="startup-error-details-drawer-heading">
          <DrawerTitle class="startup-error-details-drawer-title">
            {{ label }}
          </DrawerTitle>
          <button type="button" class="startup-error-details-close" :aria-label="closeLabel" @click="open = false">
            <span i-solar:close-circle-linear aria-hidden="true" />
          </button>
        </div>
        <DrawerDescription class="startup-error-details-message">
          {{ message }}
        </DrawerDescription>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>

<style scoped>
.startup-error-details {
  position: relative;
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

.startup-error-details-tooltip {
  position: relative;
  z-index: 2;
  box-sizing: border-box;
  width: max-content;
  max-width: min(320px, calc(100vw - 48px));
  margin-top: 8px;
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

.startup-error-details-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 12px;
  border-right: 6px solid transparent;
  border-bottom: 6px solid #171717;
  border-left: 6px solid transparent;
}

.startup-error-details-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: #0006;
}

.startup-error-details-drawer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10002;
  box-sizing: border-box;
  max-height: 70dvh;
  padding: 12px 20px max(24px, env(safe-area-inset-bottom));
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  background: #fafafa;
  box-shadow: 0 -8px 24px #0002;
  color: #262626;
  outline: none;
}

.startup-error-details-handle {
  margin-bottom: 16px;
  background: #d4d4d4;
}

.startup-error-details-drawer-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.startup-error-details-drawer-title {
  font-size: 18px;
  font-weight: 700;
}

.startup-error-details-close {
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: #737373;
  cursor: pointer;
  font-size: 22px;
}

.startup-error-details-message {
  margin: 16px 0 0;
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

:global(html.dark .startup-error-details-drawer) {
  background: #262626;
  color: #f5f5f5;
}

:global(html.dark .startup-error-details-handle) {
  background: #525252;
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
