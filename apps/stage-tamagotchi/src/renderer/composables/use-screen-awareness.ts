import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { SourcesOptions } from 'electron'
import type { Ref } from 'vue'

import type { ScreenAwarenessChannelEvent, ScreenAwarenessSnapshot } from '../stores/screen-awareness-channel'

import { errorMessageFrom } from '@moeru/std'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { extractVisibleReactionText, useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useVisionOrchestratorStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useScreenAwarenessStore } from '../stores/screen-awareness'
import { screenAwarenessChannelName } from '../stores/screen-awareness-channel'
import { protectScreenDescription, SCREEN_AWARENESS_RESPONSE_INSTRUCTIONS, SCREEN_AWARENESS_VISION_PROMPT } from '../stores/screen-awareness-policy'
import { ScreenAwarenessRuntime } from '../stores/screen-awareness-runtime'
import { useVisionScreenCapture } from './use-vision-screen-capture'

const sourcesOptions: SourcesOptions = {
  types: ['screen'],
  fetchWindowIcons: false,
  thumbnailSize: { width: 1280, height: 720 },
}

/**
 * 等待隐藏视频获得可绘制画面
 *
 * @param video 承载显示器捕获流的隐藏视频元素
 * @returns 视频可绘制时解决的 Promise
 */
async function waitForVideoFrame(video: HTMLVideoElement) {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)
    return

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for a screen capture frame'))
    }, 5_000)

    /**
     * 清理视频就绪等待期间注册的监听器和超时
     *
     * 返回值为 void
     */
    function cleanup() {
      clearTimeout(timeout)
      video.removeEventListener('loadeddata', handleLoaded)
      video.removeEventListener('error', handleError)
    }

    /**
     * 在视频可以绘制时完成等待
     *
     * 返回值为 void
     */
    function handleLoaded() {
      cleanup()
      resolve()
    }

    /**
     * 在视频加载失败时终止等待
     *
     * 返回值为 void
     */
    function handleError() {
      cleanup()
      reject(new Error('Screen capture video failed to load'))
    }

    video.addEventListener('loadeddata', handleLoaded, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

/**
 * 在主舞台中管理屏幕感知捕获、调度、角色回复和跨窗口状态
 *
 * @param videoRef 承载显示器捕获流的隐藏视频元素引用
 * @returns 屏幕感知运行快照和手动关闭字幕操作
 */
export function useScreenAwareness(videoRef: Ref<HTMLVideoElement | null>) {
  const settingsStore = useScreenAwarenessStore()
  const { enabled, intervalMs, sourceId } = storeToRefs(settingsStore)
  const chatOrchestrator = useChatOrchestratorStore()
  const characterOrchestrator = useCharacterOrchestratorStore()
  const speakingStore = useSpeakingStore()
  const visionOrchestrator = useVisionOrchestratorStore()
  const { sending, pendingQueuedSendCount } = storeToRefs(chatOrchestrator)
  const { processing: characterProcessing } = storeToRefs(characterOrchestrator)
  const { nowSpeaking } = storeToRefs(speakingStore)

  const {
    sources,
    activeSourceId,
    refetchSources,
    startStream,
    stopStream,
    cleanup: cleanupCapture,
    captureFrame,
  } = useVisionScreenCapture(sourcesOptions)

  const snapshot = ref<ScreenAwarenessSnapshot>({
    phase: 'idle',
    lastResponse: '',
    lastObservedAt: null,
    error: null,
  })
  const responseVisible = ref(false)
  const { data: channelEvent, post: postChannelEvent, close: closeChannel } = useBroadcastChannel<ScreenAwarenessChannelEvent, ScreenAwarenessChannelEvent>({
    name: screenAwarenessChannelName,
  })

  /**
   * 向设置窗口发布不含截图的屏幕感知运行快照
   *
   * 返回值为 void
   */
  function publishSnapshot() {
    postChannelEvent({ type: 'state', snapshot: { ...snapshot.value } })
  }

  /**
   * 更新屏幕感知局部状态并同步到设置窗口
   *
   * @param patch 需要合并到当前快照的字段
   * 返回值为 void
   */
  function updateSnapshot(patch: Partial<ScreenAwarenessSnapshot>) {
    snapshot.value = { ...snapshot.value, ...patch }
    publishSnapshot()
  }

  /**
   * 判断普通聊天、角色回复或语音播放是否正忙
   *
   * @returns 任一前台交互正在运行时返回 true
   */
  function isForegroundBusy() {
    return sending.value
      || pendingQueuedSendCount.value > 0
      || characterProcessing.value
      || nowSpeaking.value
  }

  /**
   * 选择仍然存在的显示器并同步持久化配置
   *
   * @returns 当前可用显示器源标识
   */
  async function ensureSelectedSource() {
    await refetchSources()
    const selectedSource = sources.value.find(source => source.id === sourceId.value) ?? sources.value[0]
    if (!selectedSource)
      throw new Error('No display is available for screen awareness')

    activeSourceId.value = selectedSource.id
    if (sourceId.value !== selectedSource.id)
      sourceId.value = selectedSource.id
    return selectedSource.id
  }

  /**
   * 捕获当前显示器并通过现有 Vision 管线生成隐私安全描述
   *
   * @returns 仅包含安全屏幕上下文的文本
   */
  async function observeScreen() {
    const selectedSourceId = await ensureSelectedSource()
    const video = videoRef.value
    if (!video)
      throw new Error('Screen awareness video element is unavailable')

    let imageDataUrl = ''
    try {
      const stream = await startStream()
      video.srcObject = stream
      await video.play()
      await waitForVideoFrame(video)

      imageDataUrl = captureFrame(video) ?? ''
      if (!imageDataUrl)
        throw new Error('Screen capture returned an empty frame')

      const result = await visionOrchestrator.processCapture({
        imageDataUrl,
        workloadId: 'screen:interpret',
        promptOverride: SCREEN_AWARENESS_VISION_PROMPT,
        sourceId: selectedSourceId,
        capturedAt: Date.now(),
        publishContext: false,
        retainResult: false,
      })

      return protectScreenDescription(result.text)
    }
    finally {
      imageDataUrl = ''
      video.pause()
      video.srcObject = null
      stopStream()
    }
  }

  /**
   * 将屏幕描述交给现有角色主动回应和语音动作管线
   *
   * @param description 已完成隐私保护的屏幕描述
   * @returns 移除内部标记后的可见角色回应
   */
  async function respondToScreen(description: string) {
    const eventId = crypto.randomUUID()
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'screen-awareness',
      data: {
        id: eventId,
        eventId,
        kind: 'ping',
        urgency: 'immediate',
        headline: 'Current screen context',
        note: description,
        destinations: ['character'],
        payload: {},
      },
    }

    const rawResponse = await characterOrchestrator.handleSparkNotifyWithReaction(event, {
      forceTextResponse: true,
      messageOverride: {
        appendSystemInstructions: [SCREEN_AWARENESS_RESPONSE_INSTRUCTIONS],
        replaceUserMessage: `Current screen context:\n${description}`,
      },
    })

    return rawResponse
  }

  const runtime = new ScreenAwarenessRuntime({
    isBusy: isForegroundBusy,
    observe: observeScreen,
    respond: respondToScreen,
    onResponse: async (response) => {
      const visibleResponse = await extractVisibleReactionText(response)
      if (!visibleResponse)
        return
      responseVisible.value = true
      updateSnapshot({
        phase: 'idle',
        lastResponse: visibleResponse,
        lastObservedAt: Date.now(),
        error: null,
      })
    },
    onStatus: (status) => {
      updateSnapshot({
        phase: status.phase,
        error: status.error ? errorMessageFrom(status.error) : null,
      })
    },
  }, {
    getIntervalMs: () => intervalMs.value,
  })

  /**
   * 隐藏当前持久字幕但保留最近回应供设置页查看
   *
   * 返回值为 void
   */
  function dismissResponse() {
    responseVisible.value = false
  }

  watch(channelEvent, (event) => {
    if (!event)
      return
    if (event.type === 'observe-now')
      void runtime.requestNow()
    if (event.type === 'request-state')
      publishSnapshot()
  })

  watch([enabled, intervalMs], ([isEnabled], [wasEnabled, previousInterval]) => {
    if (!isEnabled) {
      runtime.stop()
      stopStream()
      return
    }

    if (!wasEnabled || previousInterval !== intervalMs.value) {
      runtime.stop()
      runtime.start()
    }
  })

  onMounted(() => {
    if (enabled.value)
      runtime.start()
    publishSnapshot()
  })

  onBeforeUnmount(() => {
    runtime.stop()
    cleanupCapture()
    closeChannel()
  })

  return {
    snapshot: computed(() => snapshot.value),
    responseVisible: computed(() => responseVisible.value && !!snapshot.value.lastResponse),
    dismissResponse,
  }
}
