import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface BlackboardGazeTarget {
  type: 'screen' | 'world'
  position?: { x: number, y: number, z?: number }
}

export interface BlackboardSpeechState {
  speaking: boolean
  lastText?: string
  lastSpecial?: string
  playheadMs?: number
}

export interface BlackboardEmotionState {
  tag: string | null
  intensity: number
}

export interface BlackboardPoseState {
  current: string | null
  weight?: number
  layer?: string
}

export interface BlackboardActorState {
  emotion: BlackboardEmotionState
  expression: string | null
  gaze: BlackboardGazeTarget | null
  pose: BlackboardPoseState
  speech: BlackboardSpeechState
  flags: Record<string, string | number | boolean>
  markers: Record<string, number>
}

function createDefaultActorState(): BlackboardActorState {
  return {
    emotion: { tag: null, intensity: 0 },
    expression: null,
    gaze: null,
    pose: { current: null, weight: 0 },
    speech: { speaking: false },
    flags: {},
    markers: {},
  }
}

export const useBlackboardStore = defineStore('stage-performance-blackboard', () => {
  const actors = ref<Record<string, BlackboardActorState>>({
    default: createDefaultActorState(),
  })

  const activeActorId = ref('default')

  const activeActor = computed(() => actors.value[activeActorId.value] ?? actors.value.default)

  function ensureActor(id: string) {
    if (!actors.value[id])
      actors.value[id] = createDefaultActorState()
  }

  function setActiveActor(id: string) {
    ensureActor(id)
    activeActorId.value = id
  }

  function updateEmotion(id: string, emotion: Partial<BlackboardEmotionState>) {
    ensureActor(id)
    actors.value[id].emotion = { ...actors.value[id].emotion, ...emotion }
  }

  function updateExpression(id: string, expression: string | null) {
    ensureActor(id)
    actors.value[id].expression = expression
  }

  function updateGaze(id: string, gaze: BlackboardGazeTarget | null) {
    ensureActor(id)
    actors.value[id].gaze = gaze
  }

  function updatePose(id: string, pose: Partial<BlackboardPoseState>) {
    ensureActor(id)
    actors.value[id].pose = { ...actors.value[id].pose, ...pose }
  }

  function updateSpeech(id: string, speech: Partial<BlackboardSpeechState>) {
    ensureActor(id)
    actors.value[id].speech = { ...actors.value[id].speech, ...speech }
  }

  function setFlag(id: string, key: string, value: string | number | boolean) {
    ensureActor(id)
    actors.value[id].flags[key] = value
  }

  function clearFlag(id: string, key: string) {
    if (!actors.value[id])
      return
    delete actors.value[id].flags[key]
  }

  function setMarker(id: string, key: string, timestampMs: number) {
    ensureActor(id)
    actors.value[id].markers[key] = timestampMs
  }

  function clearActor(id: string) {
    if (!actors.value[id])
      return
    actors.value[id] = createDefaultActorState()
  }

  function resetAll() {
    actors.value = { default: createDefaultActorState() }
    activeActorId.value = 'default'
  }

  return {
    actors,
    activeActorId,
    activeActor,

    setActiveActor,
    updateEmotion,
    updateExpression,
    updateGaze,
    updatePose,
    updateSpeech,
    setFlag,
    clearFlag,
    setMarker,
    clearActor,
    resetAll,
  }
})
