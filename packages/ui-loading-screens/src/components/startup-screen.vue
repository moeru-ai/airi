<script setup lang="ts">
import { Button, Progress } from '@proj-airi/ui'
import { onClickOutside } from '@vueuse/core'
import { shallowRef, useTemplateRef, watch } from 'vue'

import '@fontsource-variable/comfortaa/wght.css'

/** Shows startup progress and retains failures until the user retries. */
const props = defineProps<{
  phase: 'splash' | 'loading' | 'error' | 'done'
  progress: number
  logoSrc: string
  label: string
  errorTitle: string
  errorStatusLabel: string
  errorHint: string
  errorMessage?: string
  errorDetailsLabel: string
  retryLabel: string
  alternativeLabel?: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'alternative'): void
}>()

const detailsOpen = shallowRef(false)
const detailsElement = useTemplateRef('detailsElement')

onClickOutside(detailsElement, () => detailsOpen.value = false)
watch(() => props.phase, (phase) => {
  if (phase !== 'error')
    detailsOpen.value = false
})
</script>

<template>
  <Teleport to="body">
    <Transition name="startup-exit">
      <section v-if="phase !== 'done'" class="startup-screen" :class="{ 'startup-screen-error': phase === 'error' }">
        <div class="startup-brand">
          <img class="startup-logo" :src="logoSrc" alt="">
          <strong class="startup-name">AIRI</strong>
        </div>
        <div class="startup-status" :class="{ 'startup-status-error': phase === 'error' }" :role="phase === 'error' ? 'alert' : undefined">
          <span v-if="phase === 'loading'" class="startup-label">{{ label }}</span>
          <div v-if="phase === 'error'" class="startup-error">
            <div class="startup-error-header">
              <span i-solar:danger-triangle-bold-duotone class="startup-error-symbol" aria-hidden="true" />
              <span>{{ errorStatusLabel }}</span>
            </div>
            <div v-if="errorMessage" ref="detailsElement" class="startup-error-details" @keydown.esc="detailsOpen = false">
              <button
                type="button"
                class="startup-error-details-trigger"
                :aria-label="errorDetailsLabel"
                :aria-expanded="detailsOpen"
                aria-controls="startup-error-details-content"
                @click="detailsOpen = !detailsOpen"
              >
                <span i-solar:info-circle-linear aria-hidden="true" />
              </button>
              <div v-if="detailsOpen" id="startup-error-details-content" class="startup-error-details-content">
                <div class="startup-error-details-heading">
                  {{ errorDetailsLabel }}
                </div>
                <div class="startup-error-details-message">
                  {{ errorMessage }}
                </div>
              </div>
            </div>
            <h2 class="startup-error-title">
              {{ errorTitle }}
            </h2>
            <p class="startup-error-hint">
              {{ errorHint }}
            </p>
            <div class="startup-error-progress-heading" aria-hidden="true">
              <span class="startup-error-mark">!</span>
              <span>{{ progress }}%</span>
            </div>
          </div>
          <div
            class="startup-track"
            :class="{ 'startup-track-loading': phase === 'loading' || phase === 'error' }"
            :role="phase === 'loading' || phase === 'error' ? 'progressbar' : undefined"
            :aria-label="phase === 'error' ? errorTitle : label"
            :aria-valuemin="phase === 'loading' || phase === 'error' ? 0 : undefined"
            :aria-valuemax="phase === 'loading' || phase === 'error' ? 100 : undefined"
            :aria-valuenow="phase === 'loading' || phase === 'error' ? progress : undefined"
          >
            <Progress v-if="phase === 'loading' || phase === 'error'" :progress="progress" :bar-class="phase === 'error' ? 'bg-red-500 dark:bg-red-400' : undefined" class="startup-progress" />
          </div>
        </div>
        <div v-if="phase === 'error'" class="startup-error-recovery">
          <Button class="startup-error-action" color="primary" variant="primary" @click="emit('retry')">
            {{ retryLabel }}
          </Button>
          <Button v-if="alternativeLabel" class="startup-error-action" @click="emit('alternative')">
            {{ alternativeLabel }}
          </Button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.startup-screen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  box-sizing: border-box;
  background: #fff;
  color: #262626;
  font-family: "Comfortaa Variable", "Comfortaa", ui-sans-serif, system-ui, sans-serif;
}

:global(html.dark .startup-screen) {
  background: #171717;
  color: #f5f5f5;
}

.startup-brand {
  position: absolute;
  top: max(calc(env(safe-area-inset-top) + 48px), calc(40vh - 82px));
  left: 50%;
  width: 180px;
  height: 156px;
  transform: translateX(-50%);
  transition: top 500ms cubic-bezier(0.22, 1, 0.36, 1), left 500ms cubic-bezier(0.22, 1, 0.36, 1), transform 500ms cubic-bezier(0.22, 1, 0.36, 1), width 500ms ease, height 500ms ease;
}

.startup-logo {
  position: absolute;
  top: 0;
  left: 50%;
  width: 96px;
  height: 96px;
  filter: hue-rotate(calc(var(--chromatic-hue, 220.44) * 1deg));
  transform: translateX(-50%);
  transition: left 500ms ease, width 500ms ease, height 500ms ease, transform 500ms ease;
}

.startup-name {
  position: absolute;
  top: 116px;
  left: 50%;
  padding-left: 0.07em;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.07em;
  white-space: nowrap;
  -webkit-text-stroke: 0.5px currentColor;
  transform: translateX(-50%);
  transition: top 500ms ease, left 500ms ease, transform 500ms ease, font-size 500ms ease, letter-spacing 500ms ease;
}

.startup-screen-error .startup-brand {
  top: calc(env(safe-area-inset-top) + 24px);
  left: 24px;
  width: 140px;
  height: 36px;
  transform: none;
}

.startup-screen-error .startup-logo {
  left: 0;
  width: 36px;
  height: 36px;
  transform: none;
}

.startup-screen-error .startup-name {
  top: 7px;
  left: 46px;
  font-size: 20px;
  letter-spacing: 0.04em;
  transform: none;
}

.startup-status {
  position: absolute;
  top: calc(100% - env(safe-area-inset-bottom) - clamp(48px, 8vh, 96px) - 44px);
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: min(220px, 60vw);
  height: 44px;
  transform: translateX(-50%);
  transition: top 500ms cubic-bezier(0.22, 1, 0.36, 1), width 500ms cubic-bezier(0.22, 1, 0.36, 1), transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}

.startup-status-error {
  top: max(calc(env(safe-area-inset-top) + 96px), 26vh);
  box-sizing: border-box;
  align-items: stretch;
  width: 100%;
  height: auto;
  transform: translateX(-50%);
}

.startup-track {
  position: relative;
  width: 48px;
  height: 3px;
  margin-top: 28px;
  overflow: hidden;
  border-radius: 999px;
  opacity: 0;
  transition: width 500ms cubic-bezier(0.34, 1.36, 0.64, 1), height 500ms cubic-bezier(0.34, 1.36, 0.64, 1), opacity 250ms ease-out;
}

.startup-track-loading {
  width: 100%;
  height: 16px;
  opacity: 1;
}

.startup-status-error .startup-track {
  width: calc(100% - 96px);
  margin: 8px 48px 0;
}

.startup-progress {
  width: 100%;
}

.startup-label {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  overflow: hidden;
  color: #737373;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.startup-error {
  animation: startup-error-enter 400ms 100ms both;
}

.startup-error-recovery {
  animation: startup-error-fade-in 400ms 100ms both;
}

.startup-error-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 0 48px;
  border-top: 1px solid #ef4444;
  border-bottom: 1px solid #ef444466;
  background: linear-gradient(90deg, #ef444420, #ef444406 72%, transparent);
  color: #dc2626;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.startup-error {
  position: relative;
}

.startup-error-header::after {
  content: '';
  width: 90px;
  height: 10px;
  margin-left: auto;
  background: repeating-linear-gradient(110deg, currentColor 0 7px, transparent 7px 14px);
  opacity: 0.52;
}

.startup-error-symbol {
  flex: none;
  font-size: 30px;
}

.startup-error-title {
  margin: 24px 48px 0;
  font-size: clamp(20px, 4vw, 26px);
  font-weight: 700;
  line-height: 1.35;
}

.startup-error-hint {
  max-width: 560px;
  margin: 10px 48px 0;
  color: #737373;
  font-size: 13px;
  line-height: 1.6;
}

.startup-error-progress-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 28px 48px 0;
  color: #dc2626;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.startup-error-mark {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.startup-error-recovery {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom) + clamp(48px, 8vh, 96px));
  left: 50%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: calc(100% - 48px);
  transform: translateX(-50%);
}

.startup-error-action {
  min-width: 180px;
}

.startup-error-details {
  position: absolute;
  top: 14px;
  right: 150px;
  z-index: 1;
}

.startup-error-details-trigger {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
  font-size: 20px;
}

.startup-error-details-trigger:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}

.startup-error-details-content {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  z-index: 1;
  box-sizing: border-box;
  width: min(360px, calc(100vw - 48px));
  max-height: 40dvh;
  padding: 14px 16px;
  overflow: auto;
  border: 1px solid #ef444466;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px #1717171a;
  overflow-wrap: anywhere;
}

.startup-error-details-heading {
  margin-bottom: 8px;
  color: #dc2626;
  font-size: 12px;
  font-weight: 700;
}

.startup-error-details-message {
  color: #525252;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
}

:global(html.dark .startup-error-header),
:global(html.dark .startup-error-progress-heading) {
  color: #f87171;
}

:global(html.dark .startup-error-header) {
  border-color: #f87171;
  border-bottom-color: #f8717159;
  background: linear-gradient(90deg, #f8717124, #f8717108 72%, transparent);
}

:global(html.dark .startup-error-hint) {
  color: #a3a3a3;
}

:global(html.dark .startup-error-details-trigger) {
  color: #f87171;
}

:global(html.dark .startup-error-details-content) {
  border-color: #f8717159;
  background: #262626;
  box-shadow: 0 8px 24px #0006;
}

:global(html.dark .startup-error-details-heading) {
  color: #f87171;
}

:global(html.dark .startup-error-details-message) {
  color: #d4d4d4;
}

@keyframes startup-error-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes startup-error-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

:global(html.dark .startup-label) {
  color: #a3a3a3;
}

.startup-exit-leave-active {
  transition: opacity 250ms ease-out;
}

.startup-exit-leave-to {
  opacity: 0;
}

@media (max-height: 650px) {
  .startup-screen-error .startup-brand {
    top: calc(env(safe-area-inset-top) + 16px);
  }

  .startup-screen-error .startup-logo {
    width: 28px;
    height: 28px;
  }

  .startup-screen-error .startup-brand {
    height: 28px;
  }

  .startup-screen-error .startup-name {
    top: 3px;
    left: 38px;
  }

  .startup-status-error {
    top: max(calc(env(safe-area-inset-top) + 88px), 17vh);
  }
}

@media (max-width: 600px) {
  .startup-error-header {
    padding: 0 24px;
  }

  .startup-error-title {
    margin-right: 24px;
    margin-left: 24px;
  }

  .startup-error-hint {
    margin-right: 24px;
    margin-left: 24px;
  }

  .startup-error-progress-heading {
    margin-right: 24px;
    margin-left: 24px;
  }

  .startup-status-error .startup-track {
    width: calc(100% - 48px);
    margin-right: 24px;
    margin-left: 24px;
  }

  .startup-error-header::after {
    width: 32px;
  }

  .startup-error-details {
    right: 64px;
  }

  .startup-error-details-content {
    right: -40px;
  }

  .startup-error-recovery {
    display: grid;
    width: calc(100% - 48px);
  }

  .startup-error-action {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .startup-track {
    transition: none;
  }

  .startup-brand,
  .startup-logo,
  .startup-name,
  .startup-status {
    transition: none;
  }

  .startup-error,
  .startup-error-recovery {
    animation: none;
  }

  .startup-exit-leave-active {
    transition: none;
  }
}
</style>
