import type { Ref } from 'vue'

import { computed, ref } from 'vue'

export interface BeatBaseAngles { x: number, y: number, z: number }

export interface BeatSyncController {
  debugState: () => {
    avgInterval: null | number
    bpm: null | number
    lastBeatTimestamp: null | number
    lastInterval: null | number
    patternStarted: boolean
    primed: boolean
    segments: BeatSegment[]
    style: BeatSyncStyleName
  }
  getStyle: () => BeatSyncStyleName
  scheduleBeat: (timestamp?: null | number) => void
  setAutoStyleShift: (enabled: boolean) => void
  setStyle: (style: BeatSyncStyleName) => void
  targetX: Ref<number>
  targetY: Ref<number>
  targetZ: Ref<number>
  updateTargets: (now: number) => void
  velocityX: Ref<number>
  velocityY: Ref<number>
  velocityZ: Ref<number>
}

export type BeatSyncStyleName = 'balanced-v' | 'punchy-v' | 'sway-sine' | 'swing-lr'

interface BeatSegment {
  duration: number
  fromX?: number
  fromY: number
  fromZ: number
  start: number
  toX?: number
  toY: number
  toZ: number
}

interface BeatStyleConfig {
  bottomDip: number
  pattern: BeatStylePattern
  swingLift?: number
  topRoll: number
  topYaw: number
}

type BeatStylePattern = 'sway' | 'swing' | 'v'

interface CreateBeatSyncControllerOptions {
  autoStyleShift?: boolean
  baseAngles: () => BeatBaseAngles
  defaultIntervalMs?: number
  initialStyle?: BeatSyncStyleName
  releaseDelayMs?: number
  styles?: Partial<Record<BeatSyncStyleName, BeatStyleConfig>>
}

const defaultStyles: Record<BeatSyncStyleName, BeatStyleConfig> = {
  'balanced-v': { bottomDip: 6, pattern: 'v', topRoll: 0, topYaw: 6 },
  'punchy-v': { bottomDip: 4, pattern: 'v', topRoll: 8, topYaw: 10 },
  // sway uses a three-point path per beat: side A -> side B -> center (A-shape arcs)
  'sway-sine': { bottomDip: 0, pattern: 'sway', swingLift: 10, topRoll: 0, topYaw: 10 },
  'swing-lr': { bottomDip: 6, pattern: 'swing', swingLift: 8, topRoll: 0, topYaw: 8 },
}

export function createBeatSyncController(options: CreateBeatSyncControllerOptions): BeatSyncController {
  const {
    autoStyleShift = false,
    baseAngles: baseAnglesGetter,
    defaultIntervalMs = 600,
    initialStyle = 'punchy-v',
    releaseDelayMs = 1800,
    styles = {},
  } = options

  const styleMap = { ...defaultStyles, ...styles }

  const targetX = ref<number>(0)
  const targetY = ref<number>(0)
  const targetZ = ref<number>(0)
  const velocityX = ref<number>(0)
  const velocityY = ref<number>(0)
  const velocityZ = ref<number>(0)
  const segments = ref<BeatSegment[]>([])
  const currentTopSide = ref<'left' | 'right'>('left')
  const primed = ref(false)
  const patternStarted = ref(false)
  const lastBeatTimestamp = ref<null | number>(null)
  const lastInterval = ref<null | number>(null)
  const avgInterval = ref<null | number>(null)
  const style = ref<BeatSyncStyleName>(initialStyle)
  const autoShift = ref(autoStyleShift)
  const baseAngles = computed(() => baseAnglesGetter())

  function lerp(from: number, to: number, t: number) {
    return from + (to - from) * t
  }

  function easeOutCubic(t: number) {
    return 1 - ((1 - t) ** 3)
  }

  function getStyleConfig(): BeatStyleConfig {
    return styleMap[style.value] || defaultStyles['punchy-v']
  }

  function getTopPose(side: 'left' | 'right') {
    const { pattern, swingLift, topRoll, topYaw } = getStyleConfig()
    const direction = side === 'left' ? -1 : 1
    const zOffset = (pattern === 'swing' || pattern === 'sway') ? (swingLift ?? topRoll) : topRoll
    const z = baseAngles.value.z + (pattern === 'swing' || pattern === 'sway' ? zOffset : direction * zOffset)
    return {
      y: baseAngles.value.y + (direction * topYaw),
      z,
    }
  }

  function getBottomPose() {
    const { bottomDip } = getStyleConfig()
    return {
      y: baseAngles.value.y,
      z: baseAngles.value.z - bottomDip,
    }
  }

  function updateTargets(now: number) {
    let currentY: number | undefined = targetY.value
    let currentZ: number | undefined = targetZ.value

    if (!primed.value && !segments.value.length) {
      currentY = baseAngles.value.y
      currentZ = baseAngles.value.z
    }

    currentY ??= baseAngles.value.y
    currentZ ??= baseAngles.value.z

    while (segments.value.length) {
      const segment = segments.value[0]

      if (now < segment.start) {
        currentY = segment.fromY
        currentZ = segment.fromZ
        break
      }

      const progress = Math.min(1, (now - segment.start) / Math.max(segment.duration, 1))
      const eased = easeOutCubic(progress)
      currentY = lerp(segment.fromY, segment.toY, eased)
      currentZ = lerp(segment.fromZ, segment.toZ, eased)

      if (progress >= 1) {
        segments.value.shift()
        continue
      }

      break
    }

    const lastBeat = lastBeatTimestamp.value
    const timeSinceBeat = primed.value && lastBeat != null ? (now - lastBeat) : Infinity
    const shouldRelease = primed.value && !segments.value.length && timeSinceBeat > releaseDelayMs

    if (shouldRelease) {
      primed.value = false
      patternStarted.value = false
      currentTopSide.value = 'left'
      segments.value = []
      lastBeatTimestamp.value = null
      currentY = baseAngles.value.y
      currentZ = baseAngles.value.z
      velocityY.value *= 0.5
      velocityZ.value *= 0.5
    }

    targetY.value = currentY
    targetZ.value = currentZ
  }

  function scheduleBeat(timestamp?: null | number) {
    const now = timestamp != null && Number.isFinite(timestamp)
      ? Number(timestamp)
      : (typeof performance !== 'undefined' ? performance.now() : Date.now())
    updateTargets(now)

    if (!primed.value) {
      primed.value = true
      lastBeatTimestamp.value = now
      return
    }

    const interval = Math.min(2000, Math.max(220, lastBeatTimestamp.value != null ? (now - lastBeatTimestamp.value) : defaultIntervalMs))
    lastBeatTimestamp.value = now
    lastInterval.value = interval
    avgInterval.value = avgInterval.value == null ? interval : (avgInterval.value * 0.7 + interval * 0.3)
    if (autoShift.value && avgInterval.value) {
      const bpm = 60000 / avgInterval.value
      const targetStyle: BeatSyncStyleName = bpm < 120 ? 'swing-lr' : bpm < 180 ? 'balanced-v' : 'punchy-v'
      if (targetStyle !== style.value)
        style.value = targetStyle
    }
    const halfDuration = Math.max(80, interval / 2)
    const startPose = { y: targetY.value, z: targetZ.value }

    segments.value = []

    const styleConfig = getStyleConfig()
    const nextSide = currentTopSide.value === 'left' ? 'right' : 'left'

    if (styleConfig.pattern === 'v') {
      if (!patternStarted.value) {
        const topPose = getTopPose('left')
        segments.value.push({
          duration: halfDuration,
          fromY: startPose.y,
          fromZ: startPose.z,
          start: now,
          toY: topPose.y,
          toZ: topPose.z,
        })
        patternStarted.value = true
        currentTopSide.value = 'left'
        return
      }

      const bottomPose = getBottomPose()
      const nextTopPose = getTopPose(nextSide)

      segments.value.push({
        duration: halfDuration,
        fromY: startPose.y,
        fromZ: startPose.z,
        start: now,
        toY: bottomPose.y,
        toZ: bottomPose.z,
      })
      segments.value.push({
        duration: halfDuration,
        fromY: bottomPose.y,
        fromZ: bottomPose.z,
        start: now + halfDuration,
        toY: nextTopPose.y,
        toZ: nextTopPose.z,
      })

      currentTopSide.value = nextSide
    }

    else if (styleConfig.pattern === 'swing') {
      // swing-lr pattern: beat pulls to current side, then cross to the other side within the interval (A-shape)
      const currentSide = currentTopSide.value
      const sidePose = getTopPose(currentSide)
      const oppositePose = getTopPose(nextSide)
      const sidePortion = 0.35
      const sideDuration = Math.max(60, interval * sidePortion)
      const crossDuration = Math.max(60, interval - sideDuration)

      segments.value.push({
        duration: sideDuration,
        fromY: startPose.y,
        fromZ: startPose.z,
        start: now,
        toY: sidePose.y,
        toZ: sidePose.z,
      })
      segments.value.push({
        duration: crossDuration,
        fromY: sidePose.y,
        fromZ: sidePose.z,
        start: now + sideDuration,
        toY: oppositePose.y,
        toZ: oppositePose.z,
      })

      patternStarted.value = true
      currentTopSide.value = nextSide
    }
    else if (styleConfig.pattern === 'sway') {
      // sway pattern: side A -> lifted mid-arc -> side B (downward parabola / A-shape)
      const currentSide = currentTopSide.value
      const sidePose = getTopPose(currentSide)
      const oppositePose = getTopPose(nextSide)
      const centerPose = { y: baseAngles.value.y, z: baseAngles.value.z }
      const lift = styleConfig.swingLift ?? 10

      // First beat after prime: move to initial side anchor
      if (!patternStarted.value) {
        segments.value.push({
          duration: halfDuration,
          fromY: startPose.y,
          fromZ: startPose.z,
          start: now,
          toY: sidePose.y,
          toZ: sidePose.z,
        })
        patternStarted.value = true
        currentTopSide.value = currentSide
        return
      }

      const apexPose = {
        y: 0,
        z: centerPose.z + lift,
      }

      const leg1 = Math.max(60, interval * 0.5)
      const leg2 = Math.max(60, interval - leg1)

      segments.value.push({
        duration: leg1,
        fromY: startPose.y,
        fromZ: startPose.z,
        start: now,
        toY: apexPose.y,
        toZ: apexPose.z,
      })
      segments.value.push({
        duration: leg2,
        fromY: apexPose.y,
        fromZ: apexPose.z,
        start: now + leg1,
        toY: oppositePose.y,
        toZ: oppositePose.z,
      })

      patternStarted.value = true
      currentTopSide.value = nextSide
    }
  }

  return {
    debugState: () => ({
      avgInterval: avgInterval.value,
      bpm: avgInterval.value ? 60000 / avgInterval.value : null,
      lastBeatTimestamp: lastBeatTimestamp.value,
      lastInterval: lastInterval.value,
      patternStarted: patternStarted.value,
      primed: primed.value,
      segments: [...segments.value],
      style: style.value,
    }),
    getStyle: () => style.value,
    scheduleBeat,
    setAutoStyleShift: (enabled: boolean) => { autoShift.value = enabled },
    setStyle: (s: BeatSyncStyleName) => { style.value = s },
    targetX,
    targetY,
    targetZ,
    updateTargets,
    velocityX,
    velocityY,
    velocityZ,
  }
}
