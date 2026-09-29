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
      <section v-if="phase !== 'done'" class="startup-screen">
        <div class="startup-brand">
          <img class="startup-logo" :src="logoSrc" alt="">
          <strong class="startup-name">AIRI</strong>
        </div>
        <div class="startup-status">
          <span v-if="phase === 'loading'" class="startup-label">{{ label }}</span>
          <div v-if="phase === 'error'" class="startup-error" role="alert">
            <strong>{{ errorTitle }}</strong>
            <details v-if="errorMessage" class="startup-error-details">
              <summary>{{ errorDetailsLabel }}</summary>
              <span>{{ errorMessage }}</span>
            </details>
            <Button class="startup-retry" @click="emit('retry')">
              {{ retryLabel }}
            </Button>
            <Button v-if="alternativeLabel" @click="emit('alternative')">
              {{ alternativeLabel }}
            </Button>
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
            <Progress v-if="phase === 'loading' || phase === 'error'" :progress="progress" class="startup-progress" />
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: max(calc(env(safe-area-inset-top) + 48px), calc(40vh - 82px)) 24px calc(env(safe-area-inset-bottom) + clamp(48px, 8vh, 96px));
  background: #fff;
  color: #262626;
  font-family: "Comfortaa Variable", "Comfortaa", ui-sans-serif, system-ui, sans-serif;
}

:global(html.dark .startup-screen) {
  background: #171717;
  color: #f5f5f5;
}

.startup-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
}

.startup-logo {
  width: 96px;
  height: 96px;
  filter: hue-rotate(calc(var(--chromatic-hue, 220.44) * 1deg));
}

.startup-name {
  padding-left: 0.07em;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.07em;
  -webkit-text-stroke: 0.5px currentColor;
}

.startup-status {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: min(220px, 60vw);
  height: 44px;
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
  position: absolute;
  bottom: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(320px, 80vw);
  text-align: center;
  font-size: 13px;
}

.startup-error span { overflow-wrap: anywhere; }
.startup-error-details { max-width: 100%; color: #737373; }
.startup-error-details summary { cursor: pointer; }
.startup-retry {
  margin-top: 8px;
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

@media (prefers-reduced-motion: reduce) {
  .startup-track {
    transition: none;
  }

  .startup-exit-leave-active {
    transition: none;
  }
}
</style>
