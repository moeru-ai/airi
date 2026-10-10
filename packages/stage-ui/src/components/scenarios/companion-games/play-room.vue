<script setup lang="ts">
import type { GameKind, Gesture, Hand, Point } from '../../../features/companion-games/host'
import type { MotionPort } from '../../../features/companion-games/motion-adapter'

import { Button, Input } from '@proj-airi/ui'
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { hasTimeline } from '../../../features/companion-games/host'
import { useGameSession } from '../../../features/companion-games/use-game-session'

const props = defineProps<{
  modelId?: string
  /** Optional integration. Emergency stop and direct manipulation take priority over this user-started game. */
  motionPort?: MotionPort
  suspended?: boolean
}>()
const { t } = useI18n()
const playfield = useTemplateRef<HTMLElement>('playfield')
const { state, start, pause, stop, act } = useGameSession(playfield, () => props.modelId, () => props.motionPort)
const selected = ref<GameKind>('paper-toss')
const seed = ref<number | undefined>(1)
const slow = ref(true)
const largeTargets = ref(true)
const staticPlay = ref(false)
const pointerMode = ref(false)
const preferredMotion = usePreferredReducedMotion()
const reducedMotion = computed(() => staticPlay.value || preferredMotion.value === 'reduce')
const data = computed(() => state.value.data)
const followTarget = computed(() => data.value?.kind === 'follow-me' ? data.value.path[data.value.reached] : undefined)
const playing = computed(() => state.value.status === 'playing')
const choices: { kind: GameKind, icon: string }[] = [
  { kind: 'paper-toss', icon: 'i-solar:trash-bin-minimalistic-bold-duotone' },
  { kind: 'catch-stars', icon: 'i-solar:star-fall-bold-duotone' },
  { kind: 'rock-paper-scissors', icon: 'i-solar:hand-shake-bold-duotone' },
  { kind: 'copy-gesture', icon: 'i-solar:hand-heart-bold-duotone' },
  { kind: 'hidden-star', icon: 'i-solar:cup-star-bold-duotone' },
  { kind: 'follow-me', icon: 'i-solar:map-point-wave-bold-duotone' },
]
const hands: Hand[] = ['rock', 'paper', 'scissors']
const gestures: Gesture[] = ['wave', 'point', 'bow']
let drag: { pointerId: number, point: Point } | undefined

const hasNext = computed(() => playing.value && data.value && 'phase' in data.value && data.value.phase === 'result')
const timelineActive = computed(() => hasTimeline(data.value))
const position = (point: Point) => ({ left: `${point.x * 100}%`, top: `${point.y * 100}%` })

function begin() {
  drag = undefined
  pointerMode.value = false
  if (props.suspended)
    return
  start(selected.value, { seed: seed.value ?? 1, reducedMotion: reducedMotion.value, slow: slow.value, largeTargets: largeTargets.value })
}

function select(kind: GameKind) {
  stop()
  selected.value = kind
}

function localPoint(event: PointerEvent): Point | undefined {
  const bounds = playfield.value?.getBoundingClientRect()
  if (!bounds || bounds.width <= 0 || bounds.height <= 0)
    return
  const point = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)
    return
  return point
}

function pointerDown(event: PointerEvent) {
  const point = localPoint(event)
  if (!playing.value || event.button !== 0 || !point)
    return
  playfield.value?.focus({ preventScroll: true })
  if (data.value?.kind === 'paper-toss' && data.value.phase === 'aim' && Math.hypot(point.x - 0.12, point.y - 0.82) < 0.12)
    drag = { pointerId: event.pointerId, point }
  else if (data.value?.kind !== 'follow-me' || pointerMode.value)
    act(host => host.move(point))
}

function pointerMove(event: PointerEvent) {
  const point = localPoint(event)
  if (!point || !playing.value)
    return
  if (drag && drag.pointerId === event.pointerId) {
    const x = point.x - drag.point.x
    const y = drag.point.y - point.y
    act(host => host.aim(Math.atan2(y, Math.max(0.001, x)) * 180 / Math.PI, Math.hypot(x, y) * 2))
  }
  else if (!drag && (data.value?.kind !== 'follow-me' || pointerMode.value)) {
    act(host => host.move(point))
  }
}

function pointerUp(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId)
    return
  const inside = localPoint(event)
  drag = undefined
  if (inside)
    act(host => host.throwPaper())
}

function leave(event: PointerEvent) {
  drag = undefined
  // Touch release ends contact without leaving an active pointer outside the field.
  const releasedTouch = event.pointerType === 'touch' && event.buttons === 0
  if (data.value?.kind === 'follow-me' && pointerMode.value && !releasedTouch)
    pause('pointer')
}

function moveBy(x: number, y: number) {
  pointerMode.value = false
  act(host => host.moveBy(x, y))
}

function keydown(event: KeyboardEvent) {
  if (event.target !== playfield.value)
    return
  const moves: Record<string, Point> = {
    ArrowLeft: { x: -0.05, y: 0 },
    ArrowRight: { x: 0.05, y: 0 },
    ArrowUp: { x: 0, y: -0.05 },
    ArrowDown: { x: 0, y: 0.05 },
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    pause()
  }
  else if (moves[event.key] && (data.value?.kind === 'catch-stars' || data.value?.kind === 'follow-me')) {
    event.preventDefault()
    const move = moves[event.key]
    moveBy(move.x, move.y)
  }
}

function setAim(value: number | undefined, field: 'angle' | 'power') {
  if (data.value?.kind !== 'paper-toss' || value === undefined)
    return
  const { angle, power } = data.value
  act(host => host.aim(field === 'angle' ? value : angle, field === 'power' ? value / 100 : power))
}

watch(() => state.value.token, () => {
  drag = undefined
})
watch(() => props.suspended, value => value && pause('ownership'))
watch(reducedMotion, () => stop())
</script>

<template>
  <section :data-reduced-motion="reducedMotion" :class="['mx-auto max-w-4xl', 'flex flex-col gap-5 p-4 pb-16']" :aria-label="t('companionGames.title')">
    <header :class="['flex flex-col gap-2']">
      <h1 :class="['text-2xl font-semibold']">
        {{ t('companionGames.title') }}
      </h1>
      <p>{{ t('companionGames.subtitle') }}</p>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('companionGames.privacy') }}
      </p>
    </header>

    <div role="group" :aria-label="t('companionGames.selection')" :class="['grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3']">
      <Button
        v-for="game in choices"
        :key="game.kind" size="lg" :aria-pressed="selected === game.kind"
        :color="selected === game.kind ? 'primary' : 'neutral'" :class="['min-h-24 text-left']"
        @click="select(game.kind)"
      >
        <span :class="['flex w-full items-start gap-3']">
          <span :class="[game.icon, 'mt-1 h-6 w-6 shrink-0']" aria-hidden="true" />
          <span :class="['flex flex-col gap-1']">
            <span :class="['font-semibold']">{{ t(`companionGames.${game.kind}.title`) }}</span>
            <span :class="['whitespace-normal text-xs font-normal']">{{ t(`companionGames.${game.kind}.description`) }}</span>
          </span>
        </span>
      </Button>
    </div>

    <div :class="['flex flex-wrap items-end gap-3']">
      <label :class="['flex w-36 flex-col gap-1 text-sm']">
        {{ t('companionGames.controls.seed') }}
        <Input v-model="seed" :class="['min-h-11']" type="number" :min="0" :max="4294967295" :step="1" :disabled="playing || state.status === 'paused'" />
      </label>
      <Button size="lg" :aria-pressed="slow" :disabled="state.status === 'playing' || state.status === 'paused'" @click="slow = !slow">
        {{ t('companionGames.controls.slow') }} {{ slow ? '✓' : '' }}
      </Button>
      <Button size="lg" :aria-pressed="largeTargets" :disabled="state.status === 'playing' || state.status === 'paused'" @click="largeTargets = !largeTargets">
        {{ t('companionGames.controls.targets') }} {{ largeTargets ? '✓' : '' }}
      </Button>
      <Button size="lg" :aria-pressed="reducedMotion" :disabled="preferredMotion === 'reduce'" @click="staticPlay = !staticPlay">
        {{ t('companionGames.controls.reduced') }} {{ reducedMotion ? '✓' : '' }}
      </Button>
    </div>
    <p v-if="preferredMotion === 'reduce'" :class="['text-sm']">
      {{ t('companionGames.controls.reduced_system') }}
    </p>

    <div :class="['flex flex-wrap gap-3']">
      <Button size="lg" color="primary" variant="primary" :disabled="suspended" @click="begin">
        {{ t(state.status === 'idle' ? 'companionGames.controls.start' : 'companionGames.controls.restart') }}
      </Button>
      <Button v-if="state.status === 'paused'" size="lg" :disabled="suspended" @click="act(host => host.resume())">
        {{ t('companionGames.controls.resume') }}
      </Button>
      <Button v-else size="lg" :disabled="!playing" @click="pause()">
        {{ t('companionGames.controls.pause') }}
      </Button>
      <Button size="lg" :disabled="state.status === 'idle'" @click="stop">
        {{ t('companionGames.controls.stop') }}
      </Button>
    </div>

    <p>{{ t(`companionGames.${selected}.help`) }}</p>
    <p id="game-keyboard-help" :class="['text-sm text-neutral-600 dark:text-neutral-400']">
      {{ t('companionGames.keyboard') }}
    </p>
    <div role="status" aria-live="polite" :class="['flex flex-wrap gap-3 text-sm']">
      <span>{{ t(`companionGames.status.${state.status}`) }}</span>
      <span v-if="state.status !== 'idle'">{{ t('companionGames.status.score', { score: state.score }) }}</span>
      <span v-if="state.status !== 'idle'">{{ t('companionGames.status.round', { round: state.round }) }}</span>
      <span v-if="state.pauseReason">{{ t(`companionGames.status.pause_${state.pauseReason}`) }}</span>
    </div>

    <div
      ref="playfield" role="group" tabindex="0" :aria-label="t('companionGames.playfield')" aria-describedby="game-keyboard-help"
      :class="['relative min-h-64 w-full overflow-hidden rounded-2xl border-2', 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
      :style="{ aspectRatio: '16 / 9', touchAction: data?.kind === 'paper-toss' || data?.kind === 'follow-me' || data?.kind === 'catch-stars' ? 'none' : 'auto' }"
      @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="drag = undefined" @pointerleave="leave" @keydown="keydown"
    >
      <div v-if="!data" :class="['absolute inset-0 flex items-center justify-center p-6 text-center']">
        {{ t('companionGames.status.idle') }}
      </div>

      <template v-else-if="data.kind === 'paper-toss'">
        <div :class="['absolute top-4 w-full text-center text-sm']">
          {{ t(`companionGames.paper-toss.${data.phase === 'result' ? 'title' : data.phase}`) }}
        </div>
        <div :class="['absolute -translate-x-1/2', 'h-14 w-[15%] rounded-b-xl border-4 border-t-0 border-primary-500']" :style="{ left: `${data.basket * 100}%`, top: '72%' }">
          <span :class="['absolute top-full w-full text-center text-xs']">{{ t('companionGames.paper-toss.basket') }}</span>
        </div>
        <div v-if="data.phase === 'aim' || data.ball" :class="['absolute -translate-x-1/2 -translate-y-1/2', 'h-8 w-8 rounded-full border-2 border-neutral-500 bg-white shadow-sm']" :style="position(data.ball ?? { x: 0.12, y: 0.82 })" :aria-label="t('companionGames.paper-toss.paper')" />
      </template>

      <template v-else-if="data.kind === 'catch-stars'">
        <p :class="['absolute left-4 top-4 text-sm']">
          {{ t('companionGames.catch-stars.remaining', { count: 12 - data.resolved }) }}
        </p>
        <span v-for="star in data.stars" :key="star.id" :class="['i-solar:star-bold absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-amber-500']" :style="position(star)" aria-hidden="true" />
        <div :class="['absolute h-5 -translate-x-1/2 rounded-b-xl bg-primary-500']" :style="{ left: `${data.tray * 100}%`, top: '84%', width: state.options.largeTargets ? '30%' : '20%' }">
          <span :class="['absolute top-full w-full text-center text-xs']">{{ t('companionGames.catch-stars.tray') }}</span>
        </div>
      </template>

      <div v-else-if="data.kind === 'rock-paper-scissors'" :class="['absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center']">
        <span :class="['i-solar:hand-shake-bold-duotone h-16 w-16 text-primary-500']" aria-hidden="true" />
        <p v-if="data.phase === 'choose'">
          {{ t('companionGames.rock-paper-scissors.choose') }}
        </p>
        <p v-else-if="data.phase === 'countdown'">
          {{ t('companionGames.rock-paper-scissors.countdown', { count: Math.ceil(data.countdown / 300) }) }}
        </p>
        <template v-else>
          <p>{{ t('companionGames.rock-paper-scissors.result', { player: t(`companionGames.rock-paper-scissors.${data.player}`), opponent: t(`companionGames.rock-paper-scissors.${data.opponent}`) }) }}</p>
          <p>{{ t(`companionGames.status.${data.history.at(-1)?.outcome}`) }}</p>
          <p>{{ t('companionGames.status.rival', { score: data.rivalScore }) }}</p>
        </template>
      </div>

      <div v-else-if="data.kind === 'copy-gesture'" :class="['absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center']" aria-live="polite">
        <span :class="['h-16 w-16 text-primary-500', data.cue === 'wave' ? 'i-solar:hand-shake-bold-duotone' : data.cue === 'point' ? 'i-solar:map-point-wave-bold-duotone' : 'i-solar:hand-heart-bold-duotone']" aria-hidden="true" />
        <p v-if="data.cue">
          {{ t('companionGames.copy-gesture.cue', { index: data.shown + 1, count: data.length, gesture: t(`companionGames.copy-gesture.${data.cue}`) }) }}
        </p>
        <p v-else-if="data.phase === 'repeat'">
          {{ t('companionGames.copy-gesture.repeat', { count: data.entered, total: data.length }) }}
        </p>
        <p v-else>
          {{ t(data.correct ? 'companionGames.status.correct' : 'companionGames.status.incorrect') }}
        </p>
      </div>

      <template v-else-if="data.kind === 'hidden-star'">
        <p :class="['absolute top-4 w-full text-center text-sm']">
          {{ data.star !== null ? t('companionGames.hidden-star.star', { position: data.cups.indexOf(data.star) + 1 }) : t(`companionGames.hidden-star.${data.phase === 'choose' ? 'choose' : 'shuffle'}`) }}
        </p>
        <div v-for="(cup, index) in data.cups" :key="cup" :class="['absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2', playing && !state.options.reducedMotion && 'transition-[left] duration-500 ease-in-out']" :style="{ left: `${(index + 1) * 25}%` }">
          <span :class="['h-14 w-14 text-primary-500', data.star === cup ? 'i-solar:cup-star-bold-duotone' : 'i-solar:cup-bold-duotone']" aria-hidden="true" />
          <span>{{ index + 1 }} <span v-if="data.star === cup" aria-hidden="true">★</span></span>
        </div>
      </template>

      <template v-else-if="data.kind === 'follow-me'">
        <p :class="['absolute left-4 top-4 text-sm']">
          {{ t('companionGames.follow-me.target', { index: Math.min(data.reached + 1, 6), total: 6 }) }}
        </p>
        <div v-for="(target, index) in data.path" :key="index" :style="position(target)" :class="['absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2', 'flex items-center justify-center font-semibold', index === data.reached ? 'border-primary-600 bg-primary-100 text-primary-900 dark:bg-primary-900 dark:text-primary-100' : 'border-neutral-400 opacity-40']">
          {{ index < data.reached ? '✓' : index + 1 }}
        </div>
        <span :class="['i-solar:map-point-bold absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-amber-600']" :style="position(data.marker)" :aria-label="t('companionGames.follow-me.marker')" />
      </template>
    </div>

    <p v-if="data?.kind === 'follow-me' && followTarget" :class="['text-sm']">
      {{ t('companionGames.follow-me.coordinates', { x: Math.round(data.marker.x * 100), y: Math.round(data.marker.y * 100), targetX: Math.round(followTarget.x * 100), targetY: Math.round(followTarget.y * 100) }) }}
    </p>
    <p v-if="data?.kind === 'catch-stars' && state.options.reducedMotion && data.stars[0]" :class="['text-sm']">
      {{ t('companionGames.catch-stars.coordinates', { star: Math.round(data.stars[0].x * 100), tray: Math.round(data.tray * 100) }) }}
    </p>

    <div v-if="state.options.reducedMotion && state.status !== 'idle'" :class="['flex flex-wrap items-center gap-3']">
      <Button size="lg" :disabled="!playing || !timelineActive" @click="act(host => host.step(state.token))">
        {{ t('companionGames.controls.step') }}
      </Button>
      <p :class="['text-sm']">
        {{ t('companionGames.status.step_hint') }}
      </p>
    </div>

    <div v-if="data?.kind === 'paper-toss'" :class="['flex flex-wrap items-end gap-3']">
      <label :class="['flex w-36 flex-col gap-1 text-sm']">
        {{ t('companionGames.controls.angle') }}
        <Input :class="['min-h-11']" type="number" :model-value="data.angle" :min="15" :max="80" :step="1" :disabled="!playing || data.phase !== 'aim'" @update:model-value="setAim($event, 'angle')" />
      </label>
      <label :class="['flex w-36 flex-col gap-1 text-sm']">
        {{ t('companionGames.controls.power') }}
        <Input :class="['min-h-11']" type="number" :model-value="Math.round(data.power * 100)" :min="30" :max="100" :step="1" :disabled="!playing || data.phase !== 'aim'" @update:model-value="setAim($event, 'power')" />
      </label>
      <Button size="lg" :disabled="!playing || data.phase !== 'aim'" @click="act(host => host.throwPaper())">
        {{ t('companionGames.controls.throw') }}
      </Button>
      <p v-if="data.hit !== null">
        {{ t(data.hit ? 'companionGames.status.hit' : 'companionGames.status.miss') }}
      </p>
    </div>

    <div v-if="data?.kind === 'catch-stars' || data?.kind === 'follow-me'" :class="['flex flex-wrap gap-3']">
      <Button size="lg" :disabled="!playing" @click="moveBy(-0.05, 0)">
        {{ t('companionGames.controls.left') }}
      </Button>
      <Button size="lg" :disabled="!playing" @click="moveBy(0.05, 0)">
        {{ t('companionGames.controls.right') }}
      </Button>
      <template v-if="data.kind === 'follow-me'">
        <Button size="lg" :aria-pressed="pointerMode" @click="pointerMode = !pointerMode">
          {{ t('companionGames.controls.pointer') }} {{ pointerMode ? '✓' : '' }}
        </Button>
        <Button size="lg" :disabled="!playing" @click="moveBy(0, -0.05)">
          {{ t('companionGames.controls.up') }}
        </Button>
        <Button size="lg" :disabled="!playing" @click="moveBy(0, 0.05)">
          {{ t('companionGames.controls.down') }}
        </Button>
      </template>
    </div>

    <div v-if="data?.kind === 'rock-paper-scissors'" :class="['flex flex-col gap-3']">
      <div :class="['flex flex-wrap gap-3']">
        <Button v-for="hand in hands" :key="hand" size="lg" :disabled="!playing || data.phase !== 'choose'" @click="act(host => host.chooseHand(hand))">
          {{ t(`companionGames.rock-paper-scissors.${hand}`) }}
        </Button>
      </div>
      <ol v-if="data.history.length" :aria-label="t('companionGames.rock-paper-scissors.history')" :class="['flex flex-col gap-1 text-sm']">
        <li v-for="(round, index) in data.history" :key="index">
          {{ index + 1 }}. {{ t(`companionGames.rock-paper-scissors.${round.player}`) }} / {{ t(`companionGames.rock-paper-scissors.${round.opponent}`) }}: {{ t(`companionGames.status.${round.outcome}`) }}
        </li>
      </ol>
    </div>

    <div v-if="data?.kind === 'copy-gesture'" :class="['flex flex-wrap gap-3']">
      <Button v-for="gesture in gestures" :key="gesture" size="lg" :disabled="!playing || data.phase !== 'repeat'" @click="act(host => host.chooseGesture(gesture))">
        {{ t(`companionGames.copy-gesture.${gesture}`) }}
      </Button>
      <Button size="lg" :disabled="!playing || data.phase === 'result'" @click="act(host => host.replay())">
        {{ t('companionGames.controls.replay') }}
      </Button>
    </div>

    <div v-if="data?.kind === 'hidden-star'" :class="['flex flex-col gap-3']">
      <div :class="['flex flex-wrap gap-3']">
        <Button v-for="cup in 3" :key="cup" size="lg" :disabled="!playing || data.phase !== 'choose'" @click="act(host => host.chooseCup(cup - 1))">
          {{ t('companionGames.hidden-star.cup', { position: cup }) }}
        </Button>
      </div>
      <ol :aria-label="t('companionGames.hidden-star.swaps')" :class="['flex flex-col gap-1 text-sm']" aria-live="polite">
        <li v-for="(swap, index) in data.swaps" :key="index">
          {{ t('companionGames.hidden-star.swap', { first: swap[0] + 1, second: swap[1] + 1 }) }}
        </li>
      </ol>
      <p v-if="data.correct !== null">
        {{ t(data.correct ? 'companionGames.status.correct' : 'companionGames.status.incorrect') }}
      </p>
    </div>

    <Button v-if="hasNext" size="lg" color="primary" @click="act(host => host.nextRound())">
      {{ t('companionGames.controls.next') }}
    </Button>
    <p v-if="state.status === 'finished'" :class="['text-lg font-semibold']">
      {{ t('companionGames.status.final', { score: state.score }) }}
    </p>
  </section>
</template>

<style scoped>
[data-reduced-motion='true'] :deep(*) {
  transition: none !important;
  animation: none !important;
}
</style>
