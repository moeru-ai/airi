import type { FaceState, HandState, Landmark2D, PerceptionState, PoseState } from '../types'

import { DrawingUtils, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'

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
  pointLineWidth: 1.5,
}

const paletteFor = (index: number) => OVERLAY_PALETTE[index % OVERLAY_PALETTE.length]

function drawFace(drawing: DrawingUtils, face: FaceState) {
  if (!face.landmarks2d?.length)
    return

  // Face has 468 points; keep them small to reduce clutter.
  const colors = paletteFor(3)
  drawing.drawLandmarks(face.landmarks2d as Landmark2D[], {
    color: colors.point,
    radius: OVERLAY_STYLES.facePointRadius,
    lineWidth: OVERLAY_STYLES.pointLineWidth,
  })
}

function drawPose(drawing: DrawingUtils, pose: PoseState) {
  if (!pose.landmarks2d?.length)
    return

  const colors = paletteFor(0)
  drawing.drawConnectors(pose.landmarks2d as Landmark2D[], POSE_CONNECTIONS.map(({ start, end }) => ({ start, end })), {
    color: colors.connector,
    lineWidth: OVERLAY_STYLES.connectorLineWidth,
  })
  drawing.drawLandmarks(pose.landmarks2d as Landmark2D[], {
    color: colors.point,
    radius: OVERLAY_STYLES.pointRadius,
    lineWidth: OVERLAY_STYLES.pointLineWidth,
  })
}

function drawHands(drawing: DrawingUtils, hands: HandState[]) {
  hands.forEach((hand) => {
    const handIndex = hand.handedness === 'Left' ? 1 : 2
    const colors = paletteFor(handIndex)
    drawing.drawConnectors(hand.landmarks2d as Landmark2D[], HAND_CONNECTIONS.map(({ start, end }) => ({ start, end })), {
      color: colors.connector,
      lineWidth: OVERLAY_STYLES.connectorLineWidth,
    })
    drawing.drawLandmarks(hand.landmarks2d as Landmark2D[], {
      color: colors.point,
      radius: OVERLAY_STYLES.pointRadius,
      lineWidth: OVERLAY_STYLES.pointLineWidth,
    })
  })
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  state: PerceptionState,
  enabled?: Partial<Record<'pose' | 'hands' | 'face', boolean>>,
) {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)

  const drawing = new DrawingUtils(ctx)

  const showPose = enabled?.pose ?? true
  const showHands = enabled?.hands ?? true
  const showFace = enabled?.face ?? true

  if (state.face && showFace)
    drawFace(drawing, state.face)

  if (state.pose && showPose)
    drawPose(drawing, state.pose)

  if (state.hands?.length && showHands)
    drawHands(drawing, state.hands)
}
