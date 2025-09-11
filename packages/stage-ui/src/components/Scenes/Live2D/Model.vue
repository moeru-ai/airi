<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { Cubism4InternalModel, InternalModel } from 'pixi-live2d-display/cubism4'
import type { UnElevenLabsOptions } from 'unspeech'

import { breakpointsTailwind, until, useBreakpoints, useDark, useDebounceFn } from '@vueuse/core'
import { generateSpeech } from '@xsai/generate-speech'
import { formatHex } from 'culori'
import { MotionSync } from 'live2d-motionsync'
import { storeToRefs } from 'pinia'
import { DropShadowFilter } from 'pixi-filters'
import { Live2DFactory, Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'

import { useLive2DIdleEyeFocus } from '../../../composables/live2d'
import { useDelayMessageQueue, useEmotionsMessageQueue, useMessageContentQueue } from '../../../composables/queues'
import { llmInferenceEndToken } from '../../../constants'
import { Emotion, EMOTION_EmotionMotionName_value, EmotionNeutralMotionName, EmotionThinkMotionName } from '../../../constants/emotions'
import { useAudioContext, useSpeakingStore } from '../../../stores/audio'
import { useChatStore } from '../../../stores/chat'
import { useLive2d } from '../../../stores/live2d'
import { useSpeechStore } from '../../../stores/modules/speech'
import { useProvidersStore } from '../../../stores/providers'
import { useSettings } from '../../../stores/settings'
import { createQueue } from '../../../utils/queue'

type CubismModel = Cubism4InternalModel['coreModel']
type CubismEyeBlink = Cubism4InternalModel['eyeBlink']
type PixiLive2DInternalModel = InternalModel & {
  eyeBlink?: CubismEyeBlink
  coreModel: CubismModel
}

const props = withDefaults(defineProps<{
  modelSrc?: string

  app?: Application
  mouthOpenSize?: number
  width: number
  height: number
  paused?: boolean
  focusAt?: { x: number, y: number }
  disableFocusAt?: boolean
  xOffset?: number | string
  yOffset?: number | string
  scale?: number
}>(), {
  mouthOpenSize: 0,
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  disableFocusAt: false,
  scale: 1,
})

const emits = defineEmits<{
  (e: 'modelLoaded'): void
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

function parsePropsOffset() {
  let xOffset = Number.parseFloat(String(props.xOffset)) || 0
  let yOffset = Number.parseFloat(String(props.yOffset)) || 0

  if (String(props.xOffset).endsWith('%')) {
    xOffset = (Number.parseFloat(String(props.xOffset).replace('%', '')) / 100) * props.width
  }
  if (String(props.yOffset).endsWith('%')) {
    yOffset = (Number.parseFloat(String(props.yOffset).replace('%', '')) / 100) * props.height
  }

  return {
    xOffset,
    yOffset,
  }
}

const modelSrcRef = toRef(() => props.modelSrc)

const modelLoading = ref(false)

const offset = computed(() => parsePropsOffset())

const pixiApp = toRef(() => props.app)
const paused = toRef(() => props.paused)
const focusAt = toRef(() => props.focusAt)
const model = ref<Live2DModel<PixiLive2DInternalModel>>()
const initialModelWidth = ref<number>(0)
const initialModelHeight = ref<number>(0)
const mouthOpenSize = computed(() => Math.max(0, Math.min(100, props.mouthOpenSize)))
const lastUpdateTime = ref(0)

const { audioContext, calculateVolume } = useAudioContext()
const { mouthOpenSize: speakingStoreMouthOpenSize } = storeToRefs(useSpeakingStore())
const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatStore()
const providersStore = useProvidersStore()
const { stageModelRenderer } = storeToRefs(useSettings())

const audioAnalyser = ref<AnalyserNode>()
const nowSpeaking = ref(false)
const lipSyncStarted = ref(false)
let currentAudioSource: AudioBufferSourceNode | null = null
let motionSyncInstance: MotionSync | null = null

const audioQueue = createQueue<{ audioBuffer: AudioBuffer, text: string }>({
  handlers: [
    (ctx) => {
      return new Promise((resolve) => {
        // 确保audioAnalyser已经创建
        setupAnalyser()

        // 停止任何当前播放的音频
        if (currentAudioSource) {
          try {
            currentAudioSource.stop()
            currentAudioSource.disconnect()
          }
          catch (error) {
            console.warn('Failed to stop current audio source:', error)
          }
          currentAudioSource = null
        }

        // 如果有motionSync实例且模型类型为live2d，使用motionSync播放音频
        if (motionSyncInstance && stageModelRenderer.value === 'live2d') {
          nowSpeaking.value = true

          // 使用motionSync.play播放音频
          motionSyncInstance.play(ctx.data.audioBuffer).then(() => {
            nowSpeaking.value = false
            resolve()
          }).catch((error) => {
            console.error('MotionSync play failed:', error)
            // 降级到标准播放逻辑
            fallbackToStandardPlayback(ctx.data.audioBuffer, resolve)
          })
        }
        else {
          // 标准播放逻辑
          fallbackToStandardPlayback(ctx.data.audioBuffer, resolve)
        }
      })
    },
  ],
})

// 标准音频播放的降级函数
function fallbackToStandardPlayback(audioBuffer: AudioBuffer, resolve: () => void) {
  try {
    // 检查audioContext状态并尝试恢复
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        console.warn('Failed to resume audio context during fallback:', err)
      })
    }

    // Create an AudioBufferSourceNode
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer

    // Connect the source to the AudioContext's destination (the speakers)
    source.connect(audioContext.destination)

    // 确保audioAnalyser存在再连接
    if (audioAnalyser.value) {
      source.connect(audioAnalyser.value)
    }

    // 开始设置口型同步
    setupLipSync()

    // Start playing the audio
    nowSpeaking.value = true
    currentAudioSource = source

    // 处理不同浏览器的兼容性
    try {
      source.start(0)
    }
    catch (error) {
      console.error('Failed to start audio playback:', error)
      nowSpeaking.value = false
      resolve()
      return
    }

    source.onended = () => {
      nowSpeaking.value = false
      if (currentAudioSource === source) {
        currentAudioSource = null
      }
      resolve()
    }
  }
  catch (error) {
    console.error('Unexpected error in audio playback:', error)
    nowSpeaking.value = false
    resolve()
  }
}

const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)

async function handleSpeechGeneration(ctx: { data: string }) {
  try {
    if (!activeSpeechProvider.value) {
      console.warn('No active speech provider configured')
      return
    }

    if (!activeSpeechVoice.value) {
      console.warn('No active speech voice configured')
      return
    }

    // 确保audioContext处于运行状态
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume()
      }
      catch (err) {
        console.warn('Failed to resume audio context before TTS generation:', err)
      }
    }

    // TODO: UnElevenLabsOptions
    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return
    }

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)

    const input = ssmlEnabled.value
      ? speechStore.generateSSML(ctx.data, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value })
      : ctx.data

    const res = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })

    // Decode the ArrayBuffer into an AudioBuffer with proper error handling
    try {
      const audioBuffer = await audioContext.decodeAudioData(res)
      audioQueue.enqueue({ audioBuffer, text: ctx.data })
    }
    catch (decodeError) {
      console.error('Failed to decode audio data:', decodeError)
      // 可以添加用户友好的错误提示逻辑
    }
  }
  catch (error) {
    console.error('Speech generation failed:', error)
    // 可以添加用户友好的错误提示逻辑
  }
}

const { currentMotion } = storeToRefs(useLive2d())

const ttsQueue = createQueue<string>({
  handlers: [
    handleSpeechGeneration,
  ],
})

const messageContentQueue = useMessageContentQueue(ttsQueue)

const emotionsQueue = createQueue<Emotion>({
  handlers: [
    async (ctx) => {
      currentMotion.value = { group: EMOTION_EmotionMotionName_value[ctx.data] }
    },
  ],
})

const emotionMessageContentQueue = useEmotionsMessageQueue(emotionsQueue)
emotionMessageContentQueue.onHandlerEvent('emotion', (emotion) => {
  // eslint-disable-next-line no-console
  console.debug('emotion detected', emotion)
})

const delaysQueue = useDelayMessageQueue()
delaysQueue.onHandlerEvent('delay', (delay) => {
  // eslint-disable-next-line no-console
  console.debug('delay detected', delay)
})

let volumeUpdateId: number | null = null

function getVolumeWithMinMaxNormalizeWithFrameUpdates() {
  if (!nowSpeaking.value) {
    volumeUpdateId = null
    return
  }

  if (audioAnalyser.value) {
    speakingStoreMouthOpenSize.value = calculateVolume(audioAnalyser.value, 'linear')
  }

  volumeUpdateId = requestAnimationFrame(getVolumeWithMinMaxNormalizeWithFrameUpdates)
}

function setupLipSync() {
  if (!lipSyncStarted.value) {
    // 确保audioAnalyser已经创建
    setupAnalyser()
    audioContext.resume().catch((err) => {
      console.warn('Failed to resume audio context:', err)
    })
    lipSyncStarted.value = true

    // 开始音量检测循环
    if (!volumeUpdateId) {
      getVolumeWithMinMaxNormalizeWithFrameUpdates()
    }
  }
}

function setupAnalyser() {
  if (!audioAnalyser.value) {
    audioAnalyser.value = audioContext.createAnalyser()
    // 设置一些合理的默认值
    audioAnalyser.value.fftSize = 256
  }
}

const dark = useDark()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = computed(() => breakpoints.between('sm', 'md').value || breakpoints.smaller('sm').value)
const idleEyeFocus = useLive2DIdleEyeFocus()
const dropShadowFilter = shallowRef(new DropShadowFilter({
  alpha: 0.2,
  blur: 0,
  distance: 20,
  rotation: 45,
}))

function getCoreModel() {
  return model.value!.internalModel.coreModel as any
}

function setScaleAndPosition() {
  if (!model.value)
    return

  let offsetFactor = 2.2
  if (isMobile.value) {
    offsetFactor = 2.2
  }

  const heightScale = (props.height * 0.95 / initialModelHeight.value * offsetFactor)
  const widthScale = (props.width * 0.95 / initialModelWidth.value * offsetFactor)
  const scale = Math.min(heightScale, widthScale)

  model.value.scale.set(scale * props.scale, scale * props.scale)

  model.value.x = (props.width / 2) + offset.value.xOffset
  model.value.y = props.height + offset.value.yOffset
}

const {
  availableMotions,
  motionMap,
} = storeToRefs(useLive2d())

const {
  themeColorsHue,
  themeColorsHueDynamic,
} = storeToRefs(useSettings())

const localCurrentMotion = ref<{ group: string, index: number }>({ group: 'Idle', index: 0 })

async function loadModel() {
  await until(modelLoading).not.toBeTruthy()

  modelLoading.value = true
  componentState.value = 'loading'

  if (!pixiApp.value) {
    modelLoading.value = false
    componentState.value = 'mounted'
    return
  }

  if (model.value) {
    pixiApp.value.stage.removeChild(model.value)
    model.value.destroy()
    model.value = undefined
  }
  if (!modelSrcRef.value) {
    console.warn('No Live2D model source provided.')
    modelLoading.value = false
    componentState.value = 'mounted'
    return
  }

  try {
    const live2DModel = new Live2DModel<PixiLive2DInternalModel>()
    if (modelSrcRef.value.startsWith('blob:')) {
      const res = await fetch(modelSrcRef.value)
      const blob = await res.blob()
      await Live2DFactory.setupLive2DModel(live2DModel, [new File([blob], 'model.zip')], { autoInteract: false })
    }
    else {
      await Live2DFactory.setupLive2DModel(live2DModel, modelSrcRef.value, { autoInteract: false })
    }

    availableMotions.value.forEach((motion) => {
      if (motion.motionName in Emotion) {
        motionMap.value[motion.fileName] = motion.motionName
      }
      else {
        motionMap.value[motion.fileName] = EmotionNeutralMotionName
      }
    })

    // --- Scene

    model.value = live2DModel
    pixiApp.value.stage.addChild(model.value)
    initialModelWidth.value = model.value.width
    initialModelHeight.value = model.value.height
    model.value.anchor.set(0.5, 0.5)
    setScaleAndPosition()

    // --- Interaction

    model.value.on('hit', (hitAreas) => {
      if (model.value && hitAreas.includes('body'))
        model.value.motion('tap_body')
    })

    // --- Motion

    const internalModel = model.value.internalModel
    const motionSync = new MotionSync(internalModel)
    motionSync.loadDefaultMotionSync()
    // 保存motionSync实例供音频播放使用
    motionSyncInstance = motionSync
    const coreModel = internalModel.coreModel
    const motionManager = internalModel.motionManager
    coreModel.setParameterValueById('ParamMouthOpenY', mouthOpenSize.value)

    availableMotions.value = Object
      .entries(motionManager.definitions)
      .flatMap(([motionName, definition]) => (definition?.map((motion: any, index: number) => ({
        motionName,
        motionIndex: index,
        fileName: motion.File,
      })) || []))
      .filter(Boolean)

    // Remove eye ball movements from idle motion group to prevent conflicts
    // This is too hacky
    // FIXME: it cannot blink if loading a model only have idle motion
    if (motionManager.groups.idle) {
      motionManager.motionGroups[motionManager.groups.idle]?.forEach((motion) => {
        motion._motionData.curves.forEach((curve: any) => {
        // TODO: After emotion mapper, stage editor, eye related parameters should be take cared to be dynamical instead of hardcoding
          if (curve.id === 'ParamEyeBallX' || curve.id === 'ParamEyeBallY') {
            curve.id = `_${curve.id}`
          }
        })
      })
    }

    // This is hacky too
    const hookedUpdate = motionManager.update as (model: CubismModel, now: number) => boolean
    motionManager.update = function (model: CubismModel, now: number) {
      lastUpdateTime.value = now

      hookedUpdate?.call(this, model, now)

      // Possibility 1: Only update eye focus when the model is idle
      // Possibility 2: For models having no mo`ti`on groups, currentGroup will be undefined while groups can be { idle: ... }
      if (!motionManager.state.currentGroup || motionManager.state.currentGroup === motionManager.groups.idle) {
        idleEyeFocus.update(internalModel, now)

        // If the model has eye blink parameters
        if (internalModel.eyeBlink != null) {
          // For the part of the auto eye blink implementation in pixi-live2d-display
          //
          // this.emit("beforeMotionUpdate");
          // const motionUpdated = this.motionManager.update(this.coreModel, now);
          // this.emit("afterMotionUpdate");
          // model.saveParameters();
          // this.motionManager.expressionManager?.update(model, now);
          // if (!motionUpdated) {
          //   this.eyeBlink?.updateParameters(model, dt);
          // }
          //
          // https://github.com/guansss/pixi-live2d-display/blob/31317b37d5e22955a44d5b11f37f421e94a11269/src/cubism4/Cubism4InternalModel.ts#L202-L214
          //
          // If the this.motionManager.update returns true, as motion updated flag on,
          // the eye blink parameters will not be updated, in another hand, the auto eye blink is disabled
          //
          // Since we are hooking the motionManager.update method currently,
          // and previously a always `true` was returned, eye blink parameters were never updated.
          //
          // Thous we are here to manually update the eye blink parameters within this hooked method
          internalModel.eyeBlink.updateParameters(model, (now - lastUpdateTime.value) / 1000)
        }

        // still, mark the motion as updated
        return true
      }

      return false
    }

    motionManager.on('motionStart', (group, index) => {
      localCurrentMotion.value = { group, index }
    })

    emits('modelLoaded')
  }
  finally {
    modelLoading.value = false
    componentState.value = 'mounted'
  }
}

async function setMotion(motionName: string, index?: number) {
  // TODO: motion? Not every Live2D model has motion, we do need to help users to set motion
  await model.value?.motion(motionName, index, MotionPriority.FORCE)
}

const handleResize = useDebounceFn(setScaleAndPosition, 100)

const dropShadowColorComputer = ref<HTMLDivElement>()
const dropShadowAnimationId = ref(0)

function updateDropShadowFilter() {
  if (model.value) {
    const color = getComputedStyle(dropShadowColorComputer.value!).backgroundColor
    dropShadowFilter.value.color = Number(formatHex(color)!.replace('#', '0x'))
    model.value.filters = [dropShadowFilter.value]
  }
}

watch([() => props.width, () => props.height], () => handleResize())
watch(modelSrcRef, async () => await loadModel(), { immediate: true })
watch(dark, updateDropShadowFilter, { immediate: true })
watch([model, themeColorsHue], updateDropShadowFilter)
watch(offset, setScaleAndPosition)
watch(() => props.scale, setScaleAndPosition)

// TODO: This is hacky!
function updateDropShadowFilterLoop() {
  updateDropShadowFilter()
  dropShadowAnimationId.value = requestAnimationFrame(updateDropShadowFilterLoop)
}

watch(themeColorsHueDynamic, () => {
  if (themeColorsHueDynamic.value) {
    dropShadowAnimationId.value = requestAnimationFrame(updateDropShadowFilterLoop)
  }
  else {
    cancelAnimationFrame(dropShadowAnimationId.value)
    dropShadowAnimationId.value = 0
  }
}, { immediate: true })

watch(mouthOpenSize, value => getCoreModel().setParameterValueById('ParamMouthOpenY', value))
watch(currentMotion, value => setMotion(value.group, value.index))
watch(paused, value => value ? pixiApp.value?.stop() : pixiApp.value?.start())

watch(focusAt, (value) => {
  if (!model.value)
    return
  if (props.disableFocusAt)
    return

  model.value.focus(value.x, value.y)
})

onBeforeMessageComposed(async () => {
  // 停止任何当前播放的音频并清除音频队列
  if (currentAudioSource) {
    try {
      currentAudioSource.stop()
      currentAudioSource.disconnect()
    }
    catch {}
    currentAudioSource = null
  }

  // 如果有motionSync实例，调用reset方法停止播放
  if (motionSyncInstance) {
    try {
      motionSyncInstance.reset()
    }
    catch (error) {
      console.error('MotionSync reset failed:', error)
    }
  }

  audioQueue.clear()
  setupAnalyser()
  setupLipSync()
})

onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
})

onTokenLiteral(async (literal) => {
  messageContentQueue.enqueue(literal)
})

onTokenSpecial(async (special) => {
  delaysQueue.enqueue(special)
  emotionMessageContentQueue.enqueue(special)
})

onStreamEnd(async () => {
  delaysQueue.enqueue(llmInferenceEndToken)
})

onAssistantResponseEnd(async (_message) => {
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
})

onUnmounted(() => {
  lipSyncStarted.value = false
})

onMounted(async () => {
  updateDropShadowFilter()
})

function componentCleanUp() {
  // 取消所有动画帧请求
  cancelAnimationFrame(dropShadowAnimationId.value)
  if (volumeUpdateId) {
    cancelAnimationFrame(volumeUpdateId)
    volumeUpdateId = null
  }

  // 清理模型相关资源
  model.value && pixiApp.value?.stage.removeChild(model.value)

  // 清理TTS相关资源
  lipSyncStarted.value = false
  nowSpeaking.value = false

  // 停止并断开当前音频源
  if (currentAudioSource) {
    try {
      currentAudioSource.stop()
      currentAudioSource.disconnect()
    }
    catch (error) {
      console.warn('Error during audio source cleanup:', error)
    }
    currentAudioSource = null
  }

  // 断开音频分析器连接
  if (audioAnalyser.value) {
    audioAnalyser.value.disconnect()
    // 注意：不要在这里设置audioAnalyser.value = null，因为组件可能会被重新激活
  }

  // 清理motionSync实例
  if (motionSyncInstance) {
    try {
      motionSyncInstance.reset()
    }
    catch (error) {
      console.error('MotionSync reset failed during cleanup:', error)
    }
    motionSyncInstance = null
  }

  // 清空队列
  audioQueue.clear()
  ttsQueue.clear()
}
onUnmounted(() => {
  componentCleanUp()
})

function listMotionGroups() {
  return availableMotions.value
}

defineExpose({
  setMotion,
  listMotionGroups,
})

if (import.meta.hot) {
  // Ensure cleanup on HMR
  import.meta.hot.dispose(() => {
    componentCleanUp()
  })
}
</script>

<template>
  <div ref="dropShadowColorComputer" hidden bg="primary-400 dark:primary-500" />
  <slot />
</template>
