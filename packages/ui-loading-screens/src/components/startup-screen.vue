<script setup lang="ts">
import { Button, Progress } from '@proj-airi/ui'

import '@fontsource-variable/comfortaa/wght.css'

/** Shows startup progress and retains failures until the user retries. */
defineProps<{
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
              <span class="startup-error-indicator" aria-hidden="true" />
              <span>{{ errorStatusLabel }}</span>
              <span class="startup-error-header-line" aria-hidden="true" />
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
          <div v-if="phase === 'error'" class="startup-error-footer">
            <div class="startup-error-actions">
              <Button color="primary" variant="primary" block @click="emit('retry')">
                {{ retryLabel }}
              </Button>
              <Button v-if="alternativeLabel" block @click="emit('alternative')">
                {{ alternativeLabel }}
              </Button>
            </div>
            <details v-if="errorMessage" class="startup-error-details">
              <summary>{{ errorDetailsLabel }}</summary>
              <span>{{ errorMessage }}</span>
            </details>
          </div>
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
  top: 50%;
  box-sizing: border-box;
  align-items: stretch;
  width: min(440px, calc(100vw - 40px));
  height: auto;
  max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 112px);
  padding: 24px;
  overflow: auto;
  border: 1px solid #e5e5e5;
  border-top: 2px solid #ef4444;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 20px 60px #1717170d, 0 2px 8px #17171708;
  transform: translate(-50%, -50%);
}

:global(html.dark .startup-status-error) {
  border-color: #404040;
  border-top-color: #f87171;
  background: #202020;
  box-shadow: 0 20px 60px #0003;
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
  margin-top: 10px;
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

.startup-error,
.startup-error-footer {
  animation: startup-error-enter 400ms 100ms both;
}

.startup-error-header {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #dc2626;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.startup-error-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px #fee2e2;
}

.startup-error-header-line {
  flex: 1;
  height: 1px;
  margin-left: 4px;
  background: #e5e5e5;
}

.startup-error-title {
  margin: 28px 0 0;
  font-size: clamp(18px, 4vw, 22px);
  font-weight: 700;
  line-height: 1.35;
}

.startup-error-hint {
  margin: 10px 0 0;
  color: #737373;
  font-size: 13px;
  line-height: 1.6;
}

.startup-error-progress-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 32px;
  color: #dc2626;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.startup-error-mark {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 700;
}

.startup-error-footer {
  padding-top: 32px;
}

.startup-error-actions {
  display: grid;
  gap: 10px;
}

.startup-error-details {
  margin-top: 20px;
  color: #737373;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.startup-error-details summary {
  width: fit-content;
  cursor: pointer;
}

.startup-error-details span {
  display: block;
  padding-top: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

:global(html.dark .startup-error-header),
:global(html.dark .startup-error-progress-heading) {
  color: #f87171;
}

:global(html.dark .startup-error-indicator) {
  box-shadow: 0 0 0 4px #7f1d1d;
}

:global(html.dark .startup-error-header-line) {
  background: #404040;
}

:global(html.dark .startup-error-hint),
:global(html.dark .startup-error-details) {
  color: #a3a3a3;
}

@keyframes startup-error-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
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
    top: calc(50% + 24px);
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
  .startup-error-footer {
    animation: none;
  }

  .startup-exit-leave-active {
    transition: none;
  }
}
</style>
