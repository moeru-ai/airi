<script setup lang="ts">
import { Button, Progress } from '@proj-airi/ui'
import { nextTick, useTemplateRef, watch } from 'vue'

import StartupErrorDetails from './startup-error-details.vue'

import '@fontsource-variable/comfortaa/wght.css'

/** Shows startup progress and retains failures until the user retries. */
const props = defineProps<{
  phase: 'splash' | 'loading' | 'error' | 'done'
  progress: number
  logoSrc: string
  label: string
  errorTitle: string
  errorHint: string
  errorMessage?: string
  errorDetailsLabel: string
  errorDetailsCloseLabel: string
  retryLabel: string
  alternativeLabel?: string
}>()
const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'alternative'): void
}>()
const trackElement = useTemplateRef<HTMLElement>('trackElement')

watch(() => props.phase, async (phase, previous, onCleanup) => {
  if (phase !== 'error' || previous !== 'loading' || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return

  let animation: Animation | undefined
  let active = true
  onCleanup(() => {
    active = false
    animation?.cancel()
  })
  const track = trackElement.value
  const before = track?.getBoundingClientRect()
  await nextTick()
  if (!active || !track || !before)
    return

  // Move the track between its measured loading and error positions.
  const after = track.getBoundingClientRect()
  animation = track.animate([
    { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scaleX(${before.width / after.width})` },
    { transform: 'none' },
  ], { duration: 500, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
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
        <div v-if="phase === 'error'" class="startup-error-info" role="alert">
          <h2 class="startup-error-title">
            {{ errorTitle }}
          </h2>
          <p class="startup-error-hint">
            {{ errorHint }}
          </p>
          <StartupErrorDetails
            v-if="errorMessage"
            :label="errorDetailsLabel"
            :close-label="errorDetailsCloseLabel"
            :message="errorMessage"
          />
        </div>
        <div v-if="phase === 'error'" class="startup-error-recovery">
          <Button class="startup-error-action" color="primary" variant="primary" @click="emit('retry')">
            {{ retryLabel }}
          </Button>
          <Button v-if="alternativeLabel" class="startup-error-action" @click="emit('alternative')">
            {{ alternativeLabel }}
          </Button>
        </div>
        <div
          class="startup-status"
          :class="{
            'startup-status-error': phase === 'error',
          }"
        >
          <span v-if="phase === 'loading'" class="startup-label">{{ label }}</span>
          <div
            ref="trackElement"
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

.startup-screen-error {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto minmax(0, 1fr) auto;
  gap: 16px;
  padding: max(env(safe-area-inset-top), 16px) 16px max(env(safe-area-inset-bottom), 16px);
  overflow-y: auto;
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
  top: calc(90% - 14px);
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: min(220px, 60vw);
  height: 44px;
  transform: translate(-50%, -50%);
  transition: top 500ms cubic-bezier(0.22, 1, 0.36, 1), width 500ms cubic-bezier(0.22, 1, 0.36, 1), transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}

.startup-status-error {
  position: relative;
  top: auto;
  left: auto;
  grid-row: 5;
  align-items: stretch;
  width: 100%;
  height: 16px;
  transform: none;
  transition: none;
}

.startup-error-info {
  grid-row: 2;
  align-self: center;
  justify-self: center;
  width: min(680px, 100%);
  padding-top: 24px;
  animation: startup-error-fade-in 400ms 100ms both;
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
  width: 100%;
  margin: 0;
  transform-origin: top left;
  transition: none;
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

.startup-error-title {
  margin: 0 24px;
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 700;
  line-height: 1.35;
}

.startup-error-hint {
  max-width: 560px;
  margin: 10px 24px 0;
  color: #737373;
  font-size: 13px;
  line-height: 1.6;
}

.startup-error-recovery {
  grid-row: 3;
  justify-self: center;
  display: flex;
  gap: 12px;
  width: min(680px, 100%);
  animation: startup-error-fade-in 400ms 100ms both;
}

.startup-error-action {
  min-width: 0;
  flex: 1;
}

:global(html.dark .startup-error-hint) {
  color: #a3a3a3;
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
    height: 28px;
  }

  .startup-screen-error .startup-logo {
    width: 28px;
    height: 28px;
  }

  .startup-screen-error .startup-name {
    top: 3px;
    left: 38px;
  }
}

@media (max-width: 600px) {
  .startup-screen-error .startup-brand {
    display: none;
  }

  .startup-screen-error {
    grid-template-rows: minmax(min-content, 1fr) auto auto;
    gap: 12px;
  }

  .startup-error-info {
    grid-row: 1;
  }

  .startup-status-error {
    grid-row: 2;
  }

  .startup-error-title {
    margin-right: 16px;
    margin-left: 16px;
  }

  .startup-error-hint {
    margin-right: 16px;
    margin-left: 16px;
  }

  .startup-error-recovery {
    grid-row: 3;
    display: grid;
    width: 100%;
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

  .startup-error-info,
  .startup-error-recovery {
    animation: none;
  }

  .startup-exit-leave-active {
    transition: none;
  }
}
</style>
