<script setup lang="ts">
import { computed } from 'vue'

interface MapPoint {
  x: number
  y: number
  label?: string
}

const props = withDefaults(defineProps<{
  propsLoading?: boolean
  title?: string
  eta?: string
  distance?: string
  mode?: string
  status?: string
  originLabel?: string
  destinationLabel?: string
  origin?: MapPoint
  destination?: MapPoint
  route?: MapPoint[]
  stops?: MapPoint[]
  accent?: string
}>(), {
  propsLoading: false,
  title: undefined,
  eta: '--',
  distance: '--',
  mode: 'Transit',
  status: 'Smooth ride',
  originLabel: 'You',
  destinationLabel: 'Airport',
  accent: '#38bdf8',
})

const fallbackOrigin: MapPoint = { x: 22, y: 72 }
const fallbackDestination: MapPoint = { x: 78, y: 26 }
const fallbackRoute: MapPoint[] = [
  { x: 22, y: 72 },
  { x: 32, y: 64 },
  { x: 44, y: 58 },
  { x: 52, y: 50 },
  { x: 60, y: 42 },
  { x: 70, y: 34 },
  { x: 78, y: 26 },
]

const fallbackStops: MapPoint[] = [
  { x: 32, y: 64, label: 'Midtown' },
  { x: 52, y: 50, label: 'Central' },
  { x: 70, y: 34, label: 'Skyline' },
]

function clamp(value: number) {
  return Math.min(100, Math.max(0, value))
}

function clampPoint(point: MapPoint): MapPoint {
  return {
    x: clamp(point.x),
    y: clamp(point.y),
    label: point.label,
  }
}

const heading = computed(() => props.title ?? `To ${props.destinationLabel ?? 'Airport'}`)

const resolvedOrigin = computed(() => clampPoint(props.origin ?? fallbackOrigin))
const resolvedDestination = computed(() => clampPoint(props.destination ?? fallbackDestination))

const routePoints = computed(() => {
  const points = (props.route?.length ? props.route : fallbackRoute).map(clampPoint)
  if (!points.length)
    return [resolvedOrigin.value, resolvedDestination.value]

  const first = points[0]
  const last = points[points.length - 1]
  if (first.x !== resolvedOrigin.value.x || first.y !== resolvedOrigin.value.y)
    points.unshift(resolvedOrigin.value)
  if (last.x !== resolvedDestination.value.x || last.y !== resolvedDestination.value.y)
    points.push(resolvedDestination.value)

  return points
})

const stopPoints = computed(() => (props.stops?.length ? props.stops : fallbackStops).map(clampPoint))

const routePath = computed(() => routePoints.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
  .join(' '))

const mapStyle = computed(() => ({
  '--map-accent': props.accent,
} as Record<string, string>))

function pointStyle(point: MapPoint) {
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
  }
}
</script>

<template>
  <div :class="['font-sans', 'relative', 'h-full', 'w-full', 'overflow-hidden', 'rounded-2xl', 'bg-neutral-950/65', 'text-neutral-100', 'shadow-[0_16px_40px_rgba(15,23,42,0.35)]']" :style="mapStyle">
    <div v-if="props.propsLoading" :class="['flex', 'h-full', 'w-full', 'items-center', 'justify-center']">
      <div :class="['grid', 'w-[85%]', 'gap-4']">
        <div :class="['h-4', 'w-40', 'rounded-full', 'bg-white/10', 'animate-pulse']" />
        <div :class="['h-7', 'w-28', 'rounded-full', 'bg-white/10', 'animate-pulse']" />
        <div :class="['h-52', 'w-full', 'rounded-2xl', 'bg-white/10', 'animate-pulse']" />
        <div :class="['grid', 'grid-cols-3', 'gap-2']">
          <div v-for="index in 3" :key="index" :class="['h-10', 'rounded-xl', 'bg-white/10', 'animate-pulse']" />
        </div>
      </div>
    </div>

    <div v-else :class="['relative', 'grid', 'h-full', 'grid-rows-[auto_minmax(0,1fr)_auto]', 'gap-3', 'p-4']">
      <div :class="['flex', 'items-start', 'justify-between', 'gap-4']">
        <div>
          <div :class="['flex', 'items-center', 'gap-2', 'text-lg', 'font-semibold']">
            <span :class="['i-lucide-plane-landing', 'text-base', 'opacity-80']" />
            <span :class="['truncate']">{{ heading }}</span>
          </div>
          <div :class="['mt-1', 'flex', 'items-center', 'gap-2', 'text-xs', 'text-neutral-300/80']">
            <span :class="['inline-flex', 'items-center', 'gap-1', 'rounded-full', 'bg-white/10', 'px-2', 'py-0.5']">
              <span :class="['i-lucide-route', 'text-[0.7rem]']" />
              <span>{{ props.mode }}</span>
            </span>
            <span :class="['truncate']">{{ props.status }}</span>
          </div>
        </div>
        <div :class="['text-right']">
          <div :class="['text-xs', 'uppercase', 'tracking-[0.2em]', 'text-neutral-400']">
            ETA
          </div>
          <div :class="['text-3xl', 'font-semibold', 'leading-none']">
            {{ props.eta }}
          </div>
        </div>
      </div>

      <div :class="['relative', 'overflow-hidden', 'rounded-2xl', 'border', 'border-white/10', 'bg-neutral-900/60']">
        <div class="map-surface" />
        <div class="map-grid" />
        <div class="map-glow" />

        <svg
          :class="['absolute', 'inset-0', 'h-full', 'w-full']"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            class="map-route map-route-shadow"
            :d="routePath"
          />
          <path
            class="map-route map-route-core"
            :d="routePath"
          />
          <g>
            <circle
              v-for="(stop, index) in stopPoints"
              :key="index"
              :cx="stop.x"
              :cy="stop.y"
              r="1.3"
              class="map-stop"
            />
          </g>
        </svg>

        <div :class="['absolute', 'inset-0']">
          <div
            class="map-marker map-marker--origin"
            :style="pointStyle(resolvedOrigin)"
          >
            <span :class="['i-lucide-user', 'text-[0.55rem]']" />
          </div>
          <div
            class="map-marker map-marker--destination"
            :style="pointStyle(resolvedDestination)"
          >
            <span :class="['i-lucide-plane', 'text-[0.55rem]']" />
          </div>
        </div>
      </div>

      <div :class="['grid', 'grid-cols-3', 'gap-2', 'text-xs']">
        <div :class="['rounded-xl', 'bg-white/8', 'px-3', 'py-2', 'text-neutral-200', 'shadow-[inset_0_0_0_1px_rgba(148,163,184,0.15)]']">
          <div :class="['text-[0.65rem]', 'uppercase', 'tracking-widest', 'text-neutral-400']">
            Origin
          </div>
          <div :class="['mt-1', 'truncate', 'font-semibold']">
            {{ props.originLabel }}
          </div>
        </div>
        <div :class="['rounded-xl', 'bg-white/8', 'px-3', 'py-2', 'text-neutral-200', 'shadow-[inset_0_0_0_1px_rgba(148,163,184,0.15)]']">
          <div :class="['text-[0.65rem]', 'uppercase', 'tracking-widest', 'text-neutral-400']">
            Destination
          </div>
          <div :class="['mt-1', 'truncate', 'font-semibold']">
            {{ props.destinationLabel }}
          </div>
        </div>
        <div :class="['rounded-xl', 'bg-white/8', 'px-3', 'py-2', 'text-neutral-200', 'shadow-[inset_0_0_0_1px_rgba(148,163,184,0.15)]']">
          <div :class="['text-[0.65rem]', 'uppercase', 'tracking-widest', 'text-neutral-400']">
            Distance
          </div>
          <div :class="['mt-1', 'truncate', 'font-semibold']">
            {{ props.distance }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-surface {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.18), transparent 45%),
    radial-gradient(circle at 80% 10%, rgba(34, 197, 94, 0.12), transparent 40%),
    radial-gradient(circle at 20% 90%, rgba(14, 165, 233, 0.2), transparent 40%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(2, 6, 23, 0.95));
}

.map-grid {
  position: absolute;
  inset: -20% 0 0 -20%;
  background-image:
    linear-gradient(90deg, rgba(148, 163, 184, 0.12) 1px, transparent 1px),
    linear-gradient(0deg, rgba(148, 163, 184, 0.12) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.4;
  transform: rotate(-6deg);
}

.map-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 60% 40%, rgba(59, 130, 246, 0.2), transparent 55%);
  mix-blend-mode: screen;
  opacity: 0.8;
}

.map-route {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-route-shadow {
  stroke: rgba(15, 23, 42, 0.7);
  stroke-width: 3.2;
}

.map-route-core {
  stroke: var(--map-accent, #38bdf8);
  stroke-width: 1.6;
  stroke-dasharray: 3 2;
  filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.35));
}

.map-stop {
  fill: rgba(248, 250, 252, 0.85);
  opacity: 0.9;
}

.map-marker {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  color: #0f172a;
}

.map-marker--origin {
  background: rgba(226, 232, 240, 0.9);
  box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.15);
}

.map-marker--destination {
  background: var(--map-accent, #38bdf8);
  color: #0f172a;
  box-shadow:
    0 0 0 4px rgba(56, 189, 248, 0.2),
    0 0 16px rgba(56, 189, 248, 0.45);
  animation: map-pulse 2.4s ease-in-out infinite;
}

@keyframes map-pulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.08);
  }
}
</style>
