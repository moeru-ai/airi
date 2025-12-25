import type { FaceState, HandState, Landmark2D, PerceptionState, PoseState } from '../types'

const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  // Upper body
  [9, 10],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  // Torso
  [11, 23],
  [12, 24],
  [23, 24],
  // Legs
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [31, 27],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [32, 28],
]

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm base
  [0, 17],
]

function drawConnectors(
  ctx: CanvasRenderingContext2D,
  points: Landmark2D[],
  connections: ReadonlyArray<readonly [number, number]>,
  color: string,
) {
  const { width, height } = ctx.canvas

  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
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
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 1.5

  const radius = options?.radius ?? 6
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
  drawPoints(ctx, face.landmarks2d, 'rgba(180, 120, 255, 0.55)', { radius: 2 })
}

function drawPose(ctx: CanvasRenderingContext2D, pose: PoseState) {
  if (!pose.landmarks2d?.length)
    return

  drawConnectors(ctx, pose.landmarks2d, POSE_CONNECTIONS, 'rgba(80, 200, 255, 0.55)')
  drawPoints(ctx, pose.landmarks2d, 'rgba(80, 200, 255, 0.95)', { radius: 6 })
}

function drawHands(ctx: CanvasRenderingContext2D, hands: HandState[]) {
  const handColors = {
    Left: { point: 'rgba(120, 255, 140, 0.95)', connector: 'rgba(120, 255, 140, 0.55)' },
    Right: { point: 'rgba(255, 180, 80, 0.95)', connector: 'rgba(255, 180, 80, 0.55)' },
  }

  for (const hand of hands) {
    const colors = hand.handedness === 'Left' ? handColors.Left : handColors.Right
    drawConnectors(ctx, hand.landmarks2d, HAND_CONNECTIONS, colors.connector)
    drawPoints(ctx, hand.landmarks2d, colors.point, { radius: 6 })
  }
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  state: PerceptionState,
  enabled?: Partial<Record<'pose' | 'hands' | 'face', boolean>>,
) {
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
