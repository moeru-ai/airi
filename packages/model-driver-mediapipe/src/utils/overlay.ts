import type { FaceState, HandState, Landmark2D, PerceptionState, PoseState } from '../types'

import { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'

const POSE_CONNECTIONS: Readonly<{ start: number, end: number }[]> = PoseLandmarker.POSE_CONNECTIONS
const HAND_CONNECTIONS: Readonly<{ start: number, end: number }[]> = HandLandmarker.HAND_CONNECTIONS

// NOTICE: Palette inspired by https://github.com/proj-airi/webai-examples (see review link in PR).
const OVERLAY_PALETTE = [
  { point: 'rgba(80, 200, 255, 0.95)', connector: 'rgba(80, 200, 255, 0.55)' },
  { point: 'rgba(120, 255, 140, 0.95)', connector: 'rgba(120, 255, 140, 0.55)' },
  { point: 'rgba(255, 180, 80, 0.95)', connector: 'rgba(255, 180, 80, 0.55)' },
  { point: 'rgba(180, 120, 255, 0.55)', connector: 'rgba(180, 120, 255, 0.55)' },
]

// NOTICE: Tuned for devtools readability; see https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.drawingutils.
const OVERLAY_STYLES = {
  connectorLineWidth: 2.5,
  pointRadius: 6,
  facePointRadius: 2,
  pointStroke: 'rgba(0, 0, 0, 0.35)',
}

const paletteFor = (index: number) => OVERLAY_PALETTE[index % OVERLAY_PALETTE.length]

function drawConnectors(
  ctx: CanvasRenderingContext2D,
  points: Landmark2D[],
  connections: ReadonlyArray<readonly [number, number]>,
  color: string,
) {
  const { width, height } = ctx.canvas

  ctx.strokeStyle = color
  ctx.lineWidth = OVERLAY_STYLES.connectorLineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  for (const [a, b] of connections) {
    const pa = points[a]
    const pb = points[b]
    if (!pa || !pb)
      continue

    ctx.moveTo(pa.x * width, pa.y * height)
    ctx.lineTo(pb.x * width, pb.y * height)
  }
  ctx.stroke()
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  points: Landmark2D[],
  color: string,
  options?: { radius?: number },
) {
  const { width, height } = ctx.canvas

  ctx.fillStyle = color
  ctx.strokeStyle = OVERLAY_STYLES.pointStroke
  ctx.lineWidth = 1.5

  const radius = options?.radius ?? OVERLAY_STYLES.pointRadius
  for (const p of points) {
    const x = p.x * width
    const y = p.y * height
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFace(ctx: CanvasRenderingContext2D, face: FaceState) {
  if (!face.landmarks2d?.length)
    return

  // Face has 468 points; keep them small to reduce clutter.
  const colors = paletteFor(3)
  drawPoints(ctx, face.landmarks2d, colors.point, { radius: OVERLAY_STYLES.facePointRadius })
}

function drawPose(ctx: CanvasRenderingContext2D, pose: PoseState) {
  if (!pose.landmarks2d?.length)
    return

  const colors = paletteFor(0)
  drawConnectors(ctx, pose.landmarks2d, POSE_CONNECTIONS.map(({ start, end }) => [start, end] as const), colors.connector)
  drawPoints(ctx, pose.landmarks2d, colors.point, { radius: OVERLAY_STYLES.pointRadius })
}

function drawHands(ctx: CanvasRenderingContext2D, hands: HandState[]) {
  hands.forEach((hand) => {
    const handIndex = hand.handedness === 'Left' ? 1 : 2
    const colors = paletteFor(handIndex)
    drawConnectors(ctx, hand.landmarks2d, HAND_CONNECTIONS.map(({ start, end }) => [start, end] as const), colors.connector)
    drawPoints(ctx, hand.landmarks2d, colors.point, { radius: OVERLAY_STYLES.pointRadius })
  })
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  state: PerceptionState,
  enabled?: Partial<Record<'pose' | 'hands' | 'face', boolean>>,
) {
  // TODO: Reduce per-frame allocations; consider MediaPipe DrawingUtils or cached paths.
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)

  const showPose = enabled?.pose ?? true
  const showHands = enabled?.hands ?? true
  const showFace = enabled?.face ?? true

  if (state.face && showFace)
    drawFace(ctx, state.face)

  if (state.pose && showPose)
    drawPose(ctx, state.pose)

  if (state.hands?.length && showHands)
    drawHands(ctx, state.hands)
}
