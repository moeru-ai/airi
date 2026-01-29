<script setup lang="ts">
import type { EmotionPayload } from '@proj-airi/stage-ui/constants/emotions'
import type { ChatProvider, SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { createPlaybackManager, createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { ThreeScene } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { useDelayMessageQueue, useEmotionsMessageQueue } from '@proj-airi/stage-ui/composables/queues'
import { llmInferenceEndToken } from '@proj-airi/stage-ui/constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '@proj-airi/stage-ui/constants/emotions'
import { useAudioContext, useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { createQueue } from '@proj-airi/stream-kit'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import motionRaw from '../../assets/motion-gen-demo/11test2_happy_0_lmks70?raw'

interface VrmBoneNode { quaternion: Quaternion }
interface VrmLike {
  humanoid?: { getNormalizedBoneNode: (name: string) => VrmBoneNode | null }
  expressionManager?: { setValue: (name: string, value: number) => void, expressionMap?: Record<string, unknown> }
}

type VrmFrameHook = NonNullable<Parameters<InstanceType<typeof ThreeScene>['setVrmFrameHook']>[0]>

const sceneRef = ref<InstanceType<typeof ThreeScene>>()
const currentAudioSource = ref<AudioBufferSourceNode>()

const { audioContext } = useAudioContext()
const audioAnalyser = ref<AnalyserNode>()
function setupAnalyser() {
  if (!audioAnalyser.value)
    audioAnalyser.value = audioContext.createAnalyser()
}

const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelected, stageModelSelectedUrl, stageViewControlsEnabled } = storeToRefs(settingsStore)

const isDev = import.meta.env.DEV

onMounted(async () => {
  const needsFallback = !stageModelSelectedUrl.value || stageModelRenderer.value !== 'vrm'
  if (needsFallback)
    stageModelSelected.value = 'preset-vrm-1'

  await settingsStore.updateStageModel()
  setupAnalyser()
  if (isDev)
    applyMotionAudioUrl()
})

const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { activeSpeechProvider, activeSpeechVoice, activeSpeechModel, ssmlEnabled, pitch } = storeToRefs(speechStore)
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)

const delaysQueue = useDelayMessageQueue()
const currentMotion = ref<{ group: string }>({ group: EmotionThinkMotionName })
const emotionsQueue = createQueue<EmotionPayload>({
  handlers: [
    async (ctx) => {
      const motion = EMOTION_EmotionMotionName_value[ctx.data.name]
      const expression = EMOTION_VRMExpressionName_value[ctx.data.name]
      if (motion)
        currentMotion.value = { group: motion }
      if (expression)
        sceneRef.value?.setExpression(expression, ctx.data.intensity)
    },
  ],
})
const emotionMessageQueue = useEmotionsMessageQueue(emotionsQueue)

emotionMessageQueue.on('enqueue', (token) => {
  log(`    - special 入队：${token}`)
})

emotionMessageQueue.on('dequeue', (token) => {
  log(`special 出队处理：${token}`)
})

const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const nowSpeaking = ref(false)
const logLines = ref<string[]>([])
const chatInput = ref('')
const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const chatMaintenance = useChatMaintenanceStore()
const chatMessages = computed(() => {
  return chatSession.messages
    .filter(msg => msg.role !== 'system')
    .map((msg) => {
      const text = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((part: any) => typeof part === 'string' ? part : part.text ?? '').join('')
          : JSON.stringify(msg.content ?? '')
      return { role: msg.role as 'user' | 'assistant', text }
    })
})

function log(line: string) {
  logLines.value = [line, ...logLines.value].slice(0, 50)
}

const playbackManager = createPlaybackManager<AudioBuffer>({
  play: (item, signal) => {
    return new Promise((resolve) => {
      const source = audioContext.createBufferSource()
      source.buffer = item.audio
      source.connect(audioContext.destination)
      if (audioAnalyser.value)
        source.connect(audioAnalyser.value)
      currentAudioSource.value = source

      const stopPlayback = () => {
        try {
          source.stop()
          source.disconnect()
        }
        catch {}
        if (currentAudioSource.value === source)
          currentAudioSource.value = undefined
        resolve()
      }

      if (signal.aborted) {
        stopPlayback()
        return
      }

      signal.addEventListener('abort', stopPlayback, { once: true })
      source.onended = () => {
        signal.removeEventListener('abort', stopPlayback)
        stopPlayback()
      }
      source.start(0)
    })
  },
  maxVoices: 1,
  maxVoicesPerOwner: 1,
  overflowPolicy: 'queue',
  ownerOverflowPolicy: 'steal-oldest',
})

type MotionLandmarkFrame = number[][]
interface MotionLandmarkPayload {
  fps: number
  landmarks: MotionLandmarkFrame[]
}

const motionPayload = ref<MotionLandmarkPayload | null>(null)
const motionError = ref('')
const motionLoading = ref(false)
const motionPlaying = ref(false)
const motionLoop = ref(true)
const motionFrameIndex = ref(0)
const motionClock = ref(0)
const motionSpeed = ref(1)
const motionAudioUrl = ref('/motion-gen-demo/11test2.mp3')
const motionAudioLabel = ref('')
const motionAudioBuffer = ref<AudioBuffer | null>(null)
const motionAudioSource = ref<AudioBufferSourceNode | null>(null)
const motionAudioStartTime = ref(0)
const motionAudioOffset = ref(0)
const motionAudioPlaying = ref(false)
const motionFade = ref({
  active: false,
  duration: 0.6,
  t: 0,
})
const motionGains = ref({
  mouthOpen: 6,
  mouthWidth: 4,
  jawOpen: 0.6,
  eyeBlink: 1,
  scale: 1,
  mouthOpenCap: 0.6,
})
const lastMotionState = ref<{
  headQuat?: Quaternion
  jawQuat?: Quaternion
  mouthOpenWeight: number
  mouthWidthWeight: number
  blink: number
} | null>(null)
const expressionMapCache = ref<{
  aa: string
  oh: string
  ee: string
  ih: string
  ou: string
  blink: string
} | null>(null)

const motionNeutral = ref<{
  headQuat: Quaternion
  mouthOpen: number
  mouthWidth: number
  eyeLeftOpen: number
  eyeRightOpen: number
  eyeLeftWidth: number
  eyeRightWidth: number
  scale: number
} | null>(null)

const boneBase = {
  head: undefined as Quaternion | undefined,
  jaw: undefined as Quaternion | undefined,
}

const axisConfig = ref({
  flipX: false,
  flipY: false,
  flipZ: false,
})

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function applyAxis(point: number[]) {
  const x = axisConfig.value.flipX ? -point[0] : point[0]
  const y = axisConfig.value.flipY ? -point[1] : point[1]
  const z = axisConfig.value.flipZ ? -point[2] : point[2]
  return new Vector3(x, y, z)
}

function getPoint(frame: MotionLandmarkFrame, index: number) {
  const point = frame[index]
  if (!point || point.length < 3)
    return null
  return applyAxis(point)
}

function getDistance(frame: MotionLandmarkFrame, a: number, b: number) {
  const pa = getPoint(frame, a)
  const pb = getPoint(frame, b)
  if (!pa || !pb)
    return null
  return pa.distanceTo(pb)
}

function computeHeadBasis(frame: MotionLandmarkFrame) {
  const leftEye = getPoint(frame, 36)
  const rightEye = getPoint(frame, 45)
  const nose = getPoint(frame, 27)
  const chin = getPoint(frame, 8)
  if (!leftEye || !rightEye || !nose || !chin)
    return null

  const xAxis = rightEye.clone().sub(leftEye).normalize()
  const yAxis = chin.clone().sub(nose).normalize()
  const zAxis = new Vector3().crossVectors(xAxis, yAxis).normalize()
  if (!Number.isFinite(zAxis.lengthSq()) || zAxis.lengthSq() === 0)
    return null

  const correctedYAxis = new Vector3().crossVectors(zAxis, xAxis).normalize()
  const matrix = new Matrix4().makeBasis(xAxis, correctedYAxis, zAxis)
  const quat = new Quaternion().setFromRotationMatrix(matrix)
  return { xAxis, quat }
}

function computeNeutral(frame: MotionLandmarkFrame) {
  const head = computeHeadBasis(frame)
  if (!head)
    return null

  const scale = (getDistance(frame, 36, 45) ?? 1) * motionGains.value.scale
  const mouthOpen = (getDistance(frame, 51, 57) ?? 0) / scale
  const mouthWidth = (getDistance(frame, 48, 54) ?? 0) / scale
  const eyeLeftOpen = (getDistance(frame, 37, 41) ?? 0) / scale
  const eyeRightOpen = (getDistance(frame, 43, 47) ?? 0) / scale
  const eyeLeftWidth = (getDistance(frame, 36, 39) ?? 0) / scale
  const eyeRightWidth = (getDistance(frame, 42, 45) ?? 0) / scale

  return {
    headQuat: head.quat,
    mouthOpen,
    mouthWidth,
    eyeLeftOpen,
    eyeRightOpen,
    eyeLeftWidth,
    eyeRightWidth,
    scale,
  }
}

function resetMotionPlayback() {
  motionClock.value = 0
  motionFrameIndex.value = 0
  motionNeutral.value = null
  motionFade.value = { ...motionFade.value, active: false, t: 0 }
  lastMotionState.value = null
  expressionMapCache.value = null
  motionAudioOffset.value = 0
  motionAudioLabel.value = ''
}

async function loadMotionPayload() {
  if (motionLoading.value || motionPayload.value)
    return
  motionLoading.value = true
  motionError.value = ''
  try {
    const data = JSON.parse(motionRaw) as MotionLandmarkPayload
    motionPayload.value = data
  }
  catch (err) {
    motionError.value = err instanceof Error ? err.message : String(err)
    console.error(err)
  }
  finally {
    motionLoading.value = false
  }
}

async function loadMotionAudioFromFile(file: File) {
  const data = await file.arrayBuffer()
  motionAudioBuffer.value = await audioContext.decodeAudioData(data)
  motionAudioLabel.value = file.name
  motionAudioOffset.value = 0
}

async function loadMotionAudioFromUrl() {
  const url = motionAudioUrl.value.trim()
  if (!url)
    return false
  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`Failed to load motion audio: ${res.status}`)
  const data = await res.arrayBuffer()
  motionAudioBuffer.value = await audioContext.decodeAudioData(data)
  motionAudioLabel.value = url
  motionAudioOffset.value = 0
  return true
}

async function ensureMotionAudio() {
  if (motionAudioBuffer.value)
    return true
  try {
    return await loadMotionAudioFromUrl()
  }
  catch (err) {
    console.error(err)
    motionError.value = err instanceof Error ? err.message : String(err)
    return false
  }
}

function stopMotionAudio() {
  if (!motionAudioSource.value)
    return
  try {
    motionAudioSource.value.stop()
  }
  catch {}
  try {
    motionAudioSource.value.disconnect()
  }
  catch {}
  motionAudioSource.value = null
  motionAudioPlaying.value = false
}

async function startMotionAudio(offset = 0) {
  const ready = await ensureMotionAudio()
  if (!ready)
    return false
  stopMotionAudio()
  const buffer = motionAudioBuffer.value
  if (!buffer)
    return false
  const source = audioContext.createBufferSource()
  source.buffer = buffer
  source.connect(audioContext.destination)
  if (audioAnalyser.value)
    source.connect(audioAnalyser.value)
  motionAudioSource.value = source
  motionAudioStartTime.value = audioContext.currentTime
  motionAudioOffset.value = offset
  motionAudioPlaying.value = true
  source.onended = () => {
    motionAudioPlaying.value = false
    if (motionLoop.value) {
      motionClock.value = 0
      motionFrameIndex.value = 0
      motionPlaying.value = true
      startMotionAudio(0)
    }
    else {
      motionPlaying.value = false
      motionFade.value = { ...motionFade.value, active: true, t: 0 }
    }
  }
  source.start(0, offset)
  return true
}

async function playMotion() {
  if (!motionPayload.value)
    await loadMotionPayload()
  if (!motionPayload.value)
    return
  motionPlaying.value = true
  await startMotionAudio(motionAudioOffset.value)
}

function pauseMotion() {
  motionPlaying.value = false
  if (motionAudioPlaying.value) {
    const elapsed = audioContext.currentTime - motionAudioStartTime.value + motionAudioOffset.value
    motionAudioOffset.value = Math.max(0, elapsed)
  }
  stopMotionAudio()
}

function stopMotion() {
  motionPlaying.value = false
  stopMotionAudio()
  resetMotionPlayback()
}

async function onMotionAudioFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file)
    return
  try {
    await loadMotionAudioFromFile(file)
  }
  catch (err) {
    console.error(err)
    motionError.value = err instanceof Error ? err.message : String(err)
  }
}

async function applyMotionAudioUrl() {
  try {
    await loadMotionAudioFromUrl()
  }
  catch (err) {
    console.error(err)
    motionError.value = err instanceof Error ? err.message : String(err)
  }
}

function applyLandmarkMotion(vrm: VrmLike, delta: number) {
  const payload = motionPayload.value
  if (!payload || (!motionPlaying.value && !motionFade.value.active))
    return

  const fps = payload.fps || 25
  const frames = payload.landmarks
  if (!frames.length)
    return

  let frame: MotionLandmarkFrame | null = null
  if (motionPlaying.value) {
    if (motionAudioPlaying.value) {
      const elapsed = audioContext.currentTime - motionAudioStartTime.value + motionAudioOffset.value
      motionClock.value = elapsed
    }
    else {
      motionClock.value += delta * motionSpeed.value
    }
    let frameIndex = Math.floor(motionClock.value * fps)
    if (frameIndex >= frames.length) {
      if (!motionLoop.value) {
        motionPlaying.value = false
        motionFade.value = { ...motionFade.value, active: true, t: 0 }
        frameIndex = frames.length - 1
      }
      else {
        motionClock.value = 0
        frameIndex = 0
      }
    }
    motionFrameIndex.value = frameIndex
    frame = frames[frameIndex] ?? null
  }

  if (frame && !motionNeutral.value)
    motionNeutral.value = computeNeutral(frame)

  const neutral = motionNeutral.value
  if (!neutral)
    return

  if (frame) {
    const headBasis = computeHeadBasis(frame)
    const headBone = vrm.humanoid?.getNormalizedBoneNode('head')
    if (headBasis && headBone) {
      if (!boneBase.head)
        boneBase.head = headBone.quaternion.clone()
      const baseHead = boneBase.head ?? headBone.quaternion
      const deltaQuat = neutral.headQuat.clone().invert().multiply(headBasis.quat)
      const target = baseHead.clone().multiply(deltaQuat)
      const alpha = 1 - Math.exp(-10 * delta)
      headBone.quaternion.slerp(target, alpha)
      lastMotionState.value = {
        ...(lastMotionState.value ?? { mouthOpenWeight: 0, mouthWidthWeight: 0, blink: 0 }),
        headQuat: target.clone(),
      }
    }

    const jawBone = vrm.humanoid?.getNormalizedBoneNode('jaw')
    if (jawBone && headBasis) {
      if (!boneBase.jaw)
        boneBase.jaw = jawBone.quaternion.clone()
      const baseJaw = boneBase.jaw ?? jawBone.quaternion
      const scale = (neutral.scale || 1) * motionGains.value.scale
      const mouthOpen = (getDistance(frame, 51, 57) ?? 0) / scale
      const jawOpen = clamp((mouthOpen - neutral.mouthOpen) * motionGains.value.mouthOpen, 0, 1)
      const jawQuat = new Quaternion().setFromAxisAngle(headBasis.xAxis, jawOpen * motionGains.value.jawOpen)
      const target = baseJaw.clone().multiply(jawQuat)
      const alpha = 1 - Math.exp(-12 * delta)
      jawBone.quaternion.slerp(target, alpha)
      lastMotionState.value = {
        ...(lastMotionState.value ?? { mouthOpenWeight: 0, mouthWidthWeight: 0, blink: 0 }),
        jawQuat: target.clone(),
      }
    }

    if (vrm.expressionManager) {
      if (!expressionMapCache.value) {
        const names = Object.keys(vrm.expressionManager.expressionMap ?? {})
        const hasVrm0 = ['A', 'I', 'U', 'E', 'O'].every(n => names.includes(n))
        const blinkName = names.find(n => n.toLowerCase() === 'blink') ?? 'blink'
        expressionMapCache.value = hasVrm0
          ? { aa: 'A', ih: 'I', ou: 'U', ee: 'E', oh: 'O', blink: blinkName }
          : { aa: 'aa', ih: 'ih', ou: 'ou', ee: 'ee', oh: 'oh', blink: blinkName }
      }
      const map = expressionMapCache.value
      const scale = (neutral.scale || 1) * motionGains.value.scale
      const mouthOpen = (getDistance(frame, 51, 57) ?? 0) / scale
      const mouthWidth = (getDistance(frame, 48, 54) ?? 0) / scale
      const eyeLeftOpen = (getDistance(frame, 37, 41) ?? 0) / scale
      const eyeRightOpen = (getDistance(frame, 43, 47) ?? 0) / scale
      const eyeLeftWidth = (getDistance(frame, 36, 39) ?? 0) / scale
      const eyeRightWidth = (getDistance(frame, 42, 45) ?? 0) / scale

      const mouthOpenWeight = clamp(
        (mouthOpen - neutral.mouthOpen) * motionGains.value.mouthOpen,
        0,
        motionGains.value.mouthOpenCap,
      )
      const mouthWidthWeight = clamp((mouthWidth - neutral.mouthWidth) * motionGains.value.mouthWidth, 0, 1)
      const eyeLeftRatio = eyeLeftWidth > 0 ? eyeLeftOpen / eyeLeftWidth : 0
      const eyeRightRatio = eyeRightWidth > 0 ? eyeRightOpen / eyeRightWidth : 0
      const neutralEyeLeftRatio = neutral.eyeLeftWidth > 0 ? neutral.eyeLeftOpen / neutral.eyeLeftWidth : 0
      const neutralEyeRightRatio = neutral.eyeRightWidth > 0 ? neutral.eyeRightOpen / neutral.eyeRightWidth : 0
      const blinkLeft = clamp(1 - (eyeLeftRatio / (neutralEyeLeftRatio || 1)), 0, 1)
      const blinkRight = clamp(1 - (eyeRightRatio / (neutralEyeRightRatio || 1)), 0, 1)
      const blink = clamp(Math.max(blinkLeft, blinkRight) * motionGains.value.eyeBlink, 0, 1)

      if (map) {
        vrm.expressionManager.setValue(map.aa, mouthOpenWeight)
        vrm.expressionManager.setValue(map.oh, mouthOpenWeight * 0.4)
        vrm.expressionManager.setValue(map.ee, mouthWidthWeight * 0.6)
        vrm.expressionManager.setValue(map.ih, mouthWidthWeight * 0.4)
        vrm.expressionManager.setValue(map.ou, mouthOpenWeight * 0.2)
        vrm.expressionManager.setValue(map.blink, blink)
      }

      lastMotionState.value = {
        ...(lastMotionState.value ?? { headQuat: undefined, jawQuat: undefined, mouthOpenWeight: 0, mouthWidthWeight: 0, blink: 0 }),
        mouthOpenWeight,
        mouthWidthWeight,
        blink,
      }
    }
  }

  if (motionFade.value.active && lastMotionState.value) {
    motionFade.value.t += delta
    const ratio = clamp(motionFade.value.t / motionFade.value.duration, 0, 1)
    const headBone = vrm.humanoid?.getNormalizedBoneNode('head')
    const jawBone = vrm.humanoid?.getNormalizedBoneNode('jaw')
    if (headBone) {
      const baseHead = boneBase.head ?? headBone.quaternion
      const start = lastMotionState.value.headQuat ?? headBone.quaternion
      const target = start.clone().slerp(baseHead, ratio)
      headBone.quaternion.slerp(target, 1 - Math.exp(-10 * delta))
    }
    if (jawBone) {
      const baseJaw = boneBase.jaw ?? jawBone.quaternion
      const start = lastMotionState.value.jawQuat ?? jawBone.quaternion
      const target = start.clone().slerp(baseJaw, ratio)
      jawBone.quaternion.slerp(target, 1 - Math.exp(-12 * delta))
    }
    if (vrm.expressionManager && expressionMapCache.value) {
      const map = expressionMapCache.value
      const fade = 1 - ratio
      vrm.expressionManager.setValue(map.aa, lastMotionState.value.mouthOpenWeight * fade)
      vrm.expressionManager.setValue(map.oh, lastMotionState.value.mouthOpenWeight * 0.4 * fade)
      vrm.expressionManager.setValue(map.ee, lastMotionState.value.mouthWidthWeight * 0.6 * fade)
      vrm.expressionManager.setValue(map.ih, lastMotionState.value.mouthWidthWeight * 0.4 * fade)
      vrm.expressionManager.setValue(map.ou, lastMotionState.value.mouthOpenWeight * 0.2 * fade)
      vrm.expressionManager.setValue(map.blink, lastMotionState.value.blink * fade)
    }
    if (ratio >= 1) {
      motionFade.value = { ...motionFade.value, active: false, t: 0 }
      lastMotionState.value = null
    }
  }
}

const vrmFrameHook: VrmFrameHook = (vrm, delta) => {
  applyLandmarkMotion(vrm as VrmLike, delta)
}

watch(sceneRef, (scene) => {
  boneBase.head = undefined
  boneBase.jaw = undefined
  motionNeutral.value = null
  scene?.setVrmFrameHook(vrmFrameHook)
}, { immediate: true })

const speechPipeline = createSpeechPipeline<AudioBuffer>({
  tts: async (request, signal) => {
    if (signal.aborted)
      return null

    if (!activeSpeechProvider.value || !activeSpeechVoice.value) {
      console.warn('No active speech provider configured')
      return null
    }

    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, any>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return null
    }

    if (!request.text && !request.special)
      return null

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)
    const input = ssmlEnabled.value
      ? speechStore.generateSSML(request.text, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value })
      : request.text

    const res = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })

    if (signal.aborted)
      return null

    log(`    - 排队：${request.text}${request.special ? ` [special: ${request.special}]` : ''}`)
    return audioContext.decodeAudioData(res)
  },
  playback: playbackManager,
})

speechPipeline.on('onSpecial', (segment) => {
  if (segment.special)
    emotionMessageQueue.enqueue(segment.special)
})

playbackManager.onStart(({ item }) => {
  nowSpeaking.value = true
  log(`播放开始：${item.text}`)
})

playbackManager.onEnd(({ item }) => {
  nowSpeaking.value = false
  mouthOpenSize.value = 0

  if (item.special)
    log(`播放结束，special: ${item.special}`)
})

async function sendChat() {
  const content = chatInput.value.trim()
  if (!content)
    return

  const provider = await providersStore.getProviderInstance(activeChatProvider.value)
  if (!provider || !activeChatModel.value) {
    log('未配置聊天模型或 provider')
    return
  }

  try {
    await chatOrchestrator.ingest(content, {
      model: activeChatModel.value,
      chatProvider: provider as ChatProvider,
    })
    chatInput.value = ''
  }
  catch (err) {
    console.error(err)
    log('发送到 LLM 失败')
  }
}

function resetChat() {
  chatMaintenance.cleanupMessages()
  chatInput.value = ''
  logLines.value = []
  playbackManager.stopAll('reset')
}

const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = chatOrchestrator
const chatHookCleanups: Array<() => void> = []
let currentIntent: ReturnType<typeof speechPipeline.openIntent> | null = null

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  playbackManager.stopAll('new-message')
  setupAnalyser()
  logLines.value = []
  currentIntent?.cancel('new-message')
  currentIntent = speechPipeline.openIntent({ priority: 'normal', behavior: 'queue' })
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  currentIntent?.writeLiteral(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  currentIntent?.writeSpecial(special)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  delaysQueue.enqueue(llmInferenceEndToken)
  currentIntent?.writeFlush()
}))

chatHookCleanups.push(onAssistantResponseEnd(async () => {
  currentIntent?.end()
  currentIntent = null
}))

onUnmounted(() => {
  chatHookCleanups.forEach(dispose => dispose?.())
  playbackManager.stopAll('unmount')
  sceneRef.value?.setVrmFrameHook(undefined)
  stopMotionAudio()
})
</script>

<template>
  <div p-4 space-y-4>
    <div text-lg font-600>
      Performance Layer Playground（复刻 Stage，去掉 Live2D）
    </div>
    <div grid gap-4 lg:grid-cols-2>
      <div border="1 solid neutral-300/40 dark:neutral-700/40" h-100 min-h-80 overflow-hidden rounded-2xl>
        <ThreeScene
          v-if="stageModelRenderer === 'vrm'"
          ref="sceneRef"
          :model-src="stageModelSelectedUrl"
          :idle-animation="animations.idleLoop.toString()"
          :current-audio-source="currentAudioSource"
          :show-axes="stageViewControlsEnabled"
          :paused="false"
          @error="console.error"
        />
        <div v-else p-4 text-sm text-red-500>
          请选择 VRM 模型（当前模型类型不支持）。
        </div>
      </div>

      <div :class="['border', 'border-neutral-300/50', 'rounded-xl', 'p-3', 'text-xs', 'leading-relaxed', 'space-y-3', 'dark:border-neutral-700/60']">
        <div font-600>
          聊天 / 播放
        </div>
        <div :class="['h-60', 'overflow-auto', 'border', 'border-neutral-200/60', 'rounded-lg', 'p-2', 'dark:border-neutral-700/60']">
          <div v-for="(msg, idx) in chatMessages" :key="idx" :class="['mb-2']">
            <div :class="['text-[11px]', 'text-neutral-500']">
              {{ msg.role === 'user' ? 'User' : 'AIRI' }}
            </div>
            <div :class="['whitespace-pre-wrap', 'break-words', 'text-sm']">
              {{ msg.text }}
            </div>
          </div>
          <div v-if="!chatMessages.length" :class="['text-sm', 'text-neutral-500']">
            输入消息进行对话。
          </div>
        </div>
        <div :class="['flex', 'items-center', 'gap-2']">
          <input
            v-model="chatInput"
            :class="['flex-1', 'border', 'border-neutral-300/60', 'rounded-lg', 'bg-white', 'px-3', 'py-2', 'text-sm', 'dark:bg-neutral-900/60']"
            placeholder="输入消息，点击发送"
            @keyup.enter="sendChat"
          >
          <button
            :class="['rounded-lg', 'bg-primary-500', 'px-3', 'py-2', 'text-white', 'disabled:bg-neutral-400']"
            :disabled="!chatInput.trim()"
            @click="sendChat"
          >
            发送
          </button>
          <button
            :class="['border', 'border-neutral-300/60', 'rounded-lg', 'px-3', 'py-2', 'text-sm']"
            @click="resetChat"
          >
            重置对话
          </button>
        </div>
        <div :class="['border', 'border-neutral-200/60', 'rounded-lg', 'p-2', 'dark:border-neutral-700/60']">
          <div mb-1 font-600>
            播放队列 / 日志
          </div>
          <ul :class="['max-h-60', 'overflow-auto', 'space-y-1']">
            <li v-for="line in logLines" :key="line">
              {{ line }}
            </li>
          </ul>
        </div>
        <div :class="['border', 'border-neutral-200/60', 'rounded-lg', 'p-2', 'space-y-2', 'dark:border-neutral-700/60']">
          <div font-600>
            Motion Gen Demo
          </div>
          <div :class="['flex', 'items-center', 'flex-wrap', 'gap-2']">
            <button
              :class="['rounded-lg', 'bg-emerald-500', 'px-3', 'py-1.5', 'text-white', 'disabled:bg-neutral-400']"
              :disabled="motionLoading"
              @click="playMotion"
            >
              {{ motionPlaying ? '继续播放' : '播放' }}
            </button>
            <button
              :class="['rounded-lg', 'border', 'border-neutral-300/60', 'px-3', 'py-1.5']"
              @click="pauseMotion"
            >
              暂停
            </button>
            <button
              :class="['rounded-lg', 'border', 'border-neutral-300/60', 'px-3', 'py-1.5']"
              @click="stopMotion"
            >
              停止
            </button>
            <label :class="['flex', 'items-center', 'gap-2']">
              <input v-model="motionLoop" type="checkbox">
              <span>循环</span>
            </label>
            <label :class="['flex', 'items-center', 'gap-2']">
              <span>速度</span>
              <input
                v-model.number="motionSpeed"
                type="number"
                step="0.1"
                min="0.1"
                max="2"
                :class="['w-20', 'border', 'border-neutral-300/60', 'rounded', 'px-2', 'py-1']"
              >
            </label>
          </div>
          <div :class="['flex', 'items-center', 'flex-wrap', 'gap-2']">
            <label :class="['flex', 'items-center', 'gap-2']">
              <span>音频文件</span>
              <input type="file" accept="audio/*" @change="onMotionAudioFileChange">
            </label>
            <input
              v-model="motionAudioUrl"
              placeholder="音频 URL（例如 /motion-gen-demo/11test2.mp3）"
              :class="['flex-1', 'min-w-48', 'border', 'border-neutral-300/60', 'rounded', 'px-2', 'py-1', 'text-[11px]']"
            >
            <button
              :class="['rounded-lg', 'border', 'border-neutral-300/60', 'px-3', 'py-1.5']"
              @click="applyMotionAudioUrl"
            >
              加载音频
            </button>
            <span :class="['text-[11px]', 'text-neutral-500']">
              {{ motionAudioLabel || '未加载' }}
            </span>
          </div>
          <div :class="['text-[11px]', 'text-neutral-500']">
            {{ motionLoading ? '加载中...' : motionError || `frame ${motionFrameIndex + 1}/${motionPayload?.landmarks.length ?? 0}` }}
          </div>
          <div :class="['grid', 'grid-cols-2', 'gap-2', 'text-[11px]']">
            <label :class="['flex', 'items-center', 'justify-between', 'gap-2']">
              <span>嘴开合</span>
              <input v-model.number="motionGains.mouthOpen" type="number" min="0" max="12" step="0.5" :class="['w-16', 'border', 'border-neutral-300/60', 'rounded', 'px-1', 'py-0.5']">
            </label>
            <label :class="['flex', 'items-center', 'justify-between', 'gap-2']">
              <span>嘴宽</span>
              <input v-model.number="motionGains.mouthWidth" type="number" min="0" max="12" step="0.5" :class="['w-16', 'border', 'border-neutral-300/60', 'rounded', 'px-1', 'py-0.5']">
            </label>
            <label :class="['flex', 'items-center', 'justify-between', 'gap-2']">
              <span>下颌幅度</span>
              <input v-model.number="motionGains.jawOpen" type="number" min="0" max="2" step="0.1" :class="['w-16', 'border', 'border-neutral-300/60', 'rounded', 'px-1', 'py-0.5']">
            </label>
            <label :class="['flex', 'items-center', 'justify-between', 'gap-2']">
              <span>眨眼强度</span>
              <input v-model.number="motionGains.eyeBlink" type="number" min="0" max="2" step="0.1" :class="['w-16', 'border', 'border-neutral-300/60', 'rounded', 'px-1', 'py-0.5']">
            </label>
            <label :class="['flex', 'items-center', 'justify-between', 'gap-2']">
              <span>嘴开合上限</span>
              <input v-model.number="motionGains.mouthOpenCap" type="number" min="0" max="1" step="0.05" :class="['w-16', 'border', 'border-neutral-300/60', 'rounded', 'px-1', 'py-0.5']">
            </label>
            <label :class="['flex', 'items-center', 'justify-between', 'gap-2']">
              <span>Scale</span>
              <input v-model.number="motionGains.scale" type="number" min="0.2" max="2" step="0.1" :class="['w-16', 'border', 'border-neutral-300/60', 'rounded', 'px-1', 'py-0.5']">
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Performance Playground
  subtitleKey: tamagotchi.settings.devtools.title
</route>
