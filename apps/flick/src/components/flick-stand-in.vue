<script setup lang="ts">
import type { DecisionOptionId } from '../utils/flick-engine'

import { computed, nextTick, ref, watch } from 'vue'

import { cubicBezier, easeSpinDecelerate, slotToOffset, SPIN_CONFIG } from '../utils/flick-stand-in-math'

const props = defineProps<{
  selectedOption?: DecisionOptionId | null
  spinNonce: number
  title: string
  caption: string
  spinning?: boolean
  targetAngle?: number
}>()

const emit = defineEmits<{
  spinningComplete: []
}>()

const rotation = ref(-14)
const showCopy = computed(() => Boolean(props.title || props.caption))

const selectedOffset = computed(() => slotToOffset(props.selectedOption ?? 'do'))

// RAF-based spin animation
async function animateSpin(targetAngle: number): Promise<void> {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) {
    // Instant state change for reduced motion
    rotation.value = targetAngle
    emit('spinningComplete')
    return
  }

  const startRotation = rotation.value
  const startTime = performance.now()
  const jitter = (Math.random() - 0.5) * SPIN_CONFIG.jitterRange

  return new Promise((resolve) => {
    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / SPIN_CONFIG.totalDuration, 1)

      let angle: number

      if (progress < 0.22) {
        // Phase 1: Acceleration (0-400ms) - ease-in-cubic
        const p = progress / 0.22
        const eased = cubicBezier(0.55, 0, 1, 0.45, p)
        const rotationsInAccel = SPIN_CONFIG.totalRotations * 0.25
        angle = startRotation + eased * rotationsInAccel * 360
      }
      else if (progress < 0.89) {
        // Phase 2: Deceleration (400-1600ms) - ease-spin-decelerate
        const p = (progress - 0.22) / 0.67
        const eased = easeSpinDecelerate(p)

        const rotationsInAccel = SPIN_CONFIG.totalRotations * 0.25
        const rotationsInDecel = SPIN_CONFIG.totalRotations * 0.75

        // Overshoot curve: peaks at middle of deceleration
        const overshoot = Math.sin(p * Math.PI) * SPIN_CONFIG.overshootAngle

        angle = startRotation
          + (rotationsInAccel + eased * rotationsInDecel) * 360
          + targetAngle
          + jitter
          + overshoot
      }
      else {
        // Phase 3: Landing (1600-1800ms) - ease-spring-tight with settle
        const p = (progress - 0.89) / 0.11

        const baseAngle = startRotation
          + SPIN_CONFIG.totalRotations * 360
          + targetAngle
          + jitter
        const overshoot = SPIN_CONFIG.overshootAngle * Math.cos(p * Math.PI * 0.5)
        const settle = p * 3 // settle back

        angle = baseAngle + overshoot - settle

        if (progress >= 1) {
          emit('spinningComplete')
          resolve()
          return
        }
      }

      rotation.value = angle

      if (progress < 1) {
        requestAnimationFrame(tick)
      }
      else {
        emit('spinningComplete')
        resolve()
      }
    }

    requestAnimationFrame(tick)
  })
}

// Watch for spinNonce changes to trigger animation
watch(() => props.spinNonce, async (newNonce, oldNonce) => {
  if (newNonce <= oldNonce)
    return

  const targetAngle = selectedOffset.value

  if (props.spinning) {
    // Let parent control timing - just update rotation directly
    rotation.value += 360 * 6 + targetAngle
  }
  else {
    // Fallback: animate with RAF
    await animateSpin(targetAngle)
  }
})

// Watch spinning prop for controlled animation
watch(() => props.spinning, async (isSpinning) => {
  if (!isSpinning)
    return

  const targetAngle = selectedOffset.value

  await nextTick()
  await animateSpin(targetAngle)
})

// Watch targetAngle changes for instant final position updates
watch(() => props.targetAngle, (newAngle) => {
  if (newAngle !== undefined) {
    // For reduced motion or when animation is externally controlled
    rotation.value = 360 * 6 + newAngle
  }
})
</script>

<template>
  <div class="stand-in-shell">
    <div class="pointer" :class="{ 'pointer-compact': !showCopy }" />

    <div v-if="showCopy" class="stand-in-copy">
      <span class="eyebrow">{{ title }}</span>
      <p>{{ caption }}</p>
    </div>

    <div class="spinner-frame">
      <div class="frame-aura" :class="{ 'frame-aura--spinning': spinning }" />
      <div class="frame-grid" />
      <div class="spinner-float" :class="{ 'spinner-float--spinning': spinning }">
        <div
          class="spinner-body"
          :style="{ transform: `rotate(${rotation}deg)` }"
        >
          <div class="arm arm-do">
            <div class="arm-cap" />
          </div>
          <div class="arm arm-delay">
            <div class="arm-cap" />
          </div>
          <div class="arm arm-skip">
            <div class="arm-cap" />
          </div>

          <div class="center-ring">
            <div class="center-core" />
          </div>
        </div>
      </div>
      <div class="pedestal" />
    </div>
  </div>
</template>

<style scoped>
.stand-in-shell {
  position: relative;
  display: grid;
  gap: 1rem;
  justify-items: center;
}

.stand-in-copy {
  display: grid;
  gap: 0.35rem;
  text-align: center;
}

.eyebrow {
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 0.74rem;
  color: rgb(202 214 227 / 0.7);
}

.stand-in-copy p {
  max-width: 20rem;
  margin: 0;
  color: rgb(237 242 247 / 0.8);
  font-size: 0.95rem;
  line-height: 1.5;
}

/* ─── Pointer ──────────────────────────────────────── */
.pointer {
  position: absolute;
  top: 4.45rem;
  z-index: 2;
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 18px solid #9C7447;
  filter: drop-shadow(0 10px 18px rgb(38 28 16 / 0.5));
  transition: filter 0.3s ease;
}

.pointer-compact {
  top: 0.85rem;
}

/* ─── Spinner Frame ─────────────────────────────────── */
.spinner-frame {
  position: relative;
  display: grid;
  place-items: center;
  width: min(24rem, 72vw);
  aspect-ratio: 1;
  border-radius: 2.6rem;
  background:
    radial-gradient(circle at 50% 32%, rgb(255 255 255 / 0.08), transparent 34%),
    linear-gradient(160deg, rgb(17 24 36 / 0.96), rgb(7 12 21 / 0.98));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.12),
    0 38px 120px rgb(2 6 23 / 0.45);
  overflow: hidden;
}

.spinner-frame::before {
  content: '';
  position: absolute;
  inset: 1rem;
  border-radius: 2rem;
  border: 1px solid rgb(255 255 255 / 0.08);
}

.spinner-frame::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.06), transparent 22%),
    radial-gradient(circle at 50% 100%, rgb(156 116 71 / 0.10), transparent 36%);
  pointer-events: none;
}

/* ─── Frame Aura ─────────────────────────────────────── */
.frame-aura {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgb(156 116 71 / 0.18), transparent 56%);
  filter: blur(30px);
  opacity: 0.55;
  transition: opacity 2s cubic-bezier(0.22, 1, 0.36, 1);
}

.frame-aura--spinning {
  opacity: 0.75;
  animation: bronze-glow-calm 2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: 500ms;
}

@keyframes bronze-glow-calm {
  0% {
    opacity: 0.75;
    filter: blur(30px);
  }
  100% {
    opacity: 0.35;
    filter: blur(35px);
  }
}

/* ─── Frame Grid ────────────────────────────────────── */
.frame-grid {
  position: absolute;
  inset: 1.25rem;
  border-radius: 2rem;
  background:
    linear-gradient(rgb(255 255 255 / 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.02) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(circle at 50% 48%, black 42%, transparent 82%);
  opacity: 0.45;
}

/* ─── Spinner Float ──────────────────────────────────── */
.spinner-float {
  position: relative;
  z-index: 1;
  animation: idle-float 5.6s ease-in-out infinite;
}

.spinner-float--spinning {
  animation: idle-float 5.6s ease-in-out infinite;
  animation-delay: 2s; /* Resume after landing */
}

@keyframes idle-float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-8px);
  }
}

/* ─── Spinner Body ──────────────────────────────────── */
.spinner-body {
  position: relative;
  width: 15.5rem;
  height: 15.5rem;
  /* GPU acceleration for smooth animation */
  will-change: transform;
  backface-visibility: hidden;
  perspective: 1000px;
  filter: drop-shadow(0 18px 30px rgb(5 10 18 / 0.45));
}

/* ─── Arms ──────────────────────────────────────────── */
.arm {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4.5rem;
  height: 11rem;
  margin-left: -2.25rem;
  margin-top: -7.2rem;
  transform-origin: center 7.2rem;
  border-radius: 999px;
  display: grid;
  place-items: end center;
  padding-bottom: 0.3rem;
}

.arm::before {
  content: '';
  position: absolute;
  inset: 0.55rem 0.65rem 2.8rem;
  border-radius: 999px;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.18), rgb(255 255 255 / 0.02));
  opacity: 0.65;
}

.arm-do {
  transform: rotate(0deg);
  background: linear-gradient(180deg, rgb(86 76 58), rgb(38 32 24));
}

.arm-delay {
  transform: rotate(120deg);
  background: linear-gradient(180deg, rgb(133 96 52), rgb(54 38 18));
}

.arm-skip {
  transform: rotate(240deg);
  background: linear-gradient(180deg, rgb(82 90 100), rgb(32 36 44));
}

.arm-cap {
  width: 3.15rem;
  height: 3.15rem;
  margin-bottom: -0.25rem;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.35), rgb(255 255 255 / 0.06) 46%, rgb(5 10 18 / 0.58) 82%);
  border: 1px solid rgb(255 255 255 / 0.1);
}

/* ─── Center Ring ────────────────────────────────────── */
.center-ring {
  position: absolute;
  inset: 4.45rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.32), rgb(255 255 255 / 0.06) 36%, rgb(9 16 28 / 0.95) 82%);
  border: 1px solid rgb(255 255 255 / 0.12);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1);
}

.center-core {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 25%, rgb(255 255 255 / 0.36), rgb(255 255 255 / 0.06) 42%, rgb(2 6 23 / 0.82) 82%);
  border: 1px solid rgb(255 255 255 / 0.12);
}

/* ─── Pedestal ───────────────────────────────────────── */
.pedestal {
  position: absolute;
  bottom: 1.15rem;
  width: 64%;
  height: 1.2rem;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.02));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 14px 30px rgb(0 0 0 / 0.35);
  opacity: 0.75;
}

/* ─── Pointer Relief Pulse ───────────────────────────── */
.pointer {
  animation: pointer-relief-pulse 3s ease-in-out infinite;
  animation-delay: 1s;
}

@keyframes pointer-relief-pulse {
  0%, 100% {
    filter: drop-shadow(0 10px 18px rgb(38 28 16 / 0.5));
  }
  50% {
    filter: drop-shadow(0 10px 24px rgb(38 28 16 / 0.35));
  }
}

/* ─── Reduced Motion ─────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .spinner-float {
    animation: none;
  }

  .frame-aura {
    transition: none !important;
    animation: none !important;
  }

  .pointer {
    animation: none !important;
  }

  .spinner-body {
    transition: none !important;
  }
}
</style>
