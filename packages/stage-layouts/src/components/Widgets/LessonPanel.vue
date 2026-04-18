<script setup lang="ts">
import type { LessonTranscriptEntry } from '@proj-airi/stage-ui/types/lesson'

import { useLessonStore } from '@proj-airi/stage-ui/stores/lesson'
import {
  ensureLessonHearingFallbackProvider,
  isLessonHearingFallbackSupported,
} from '@proj-airi/stage-ui/stores/lesson-voice-hearing-fallback'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import {
  lessonRetrievalModeLabels,
  lessonTeachingActionLabels,
  lessonTurnLabelLabels,
} from '@proj-airi/stage-ui/types/lesson'
import { BasicTextarea, Button, Callout, FieldSelect, Input, Progress, SelectTab } from '@proj-airi/ui'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'

import IndicatorMicVolume from './IndicatorMicVolume.vue'

const props = withDefaults(defineProps<{
  mobile?: boolean
}>(), {
  mobile: false,
})

const lessonStore = useLessonStore()
const hearingStore = useHearingStore()
const hearingPipeline = useHearingSpeechInputPipeline()
const settingsAudioDevice = useSettingsAudioDevice()
const speechStore = useSpeechStore()
const {
  availablePages,
  scopedPages,
  selectedPageUid,
  selectedGrade,
  selectedSemester,
  selectedUnit,
  studentId,
  draftLearnerInput,
  loading,
  error,
  runtimeState,
  activeTurn,
  transcript,
  isConfigured,
  hasStarted,
  currentTeacherPrompt,
  currentPageTitle,
  currentActivityLabel,
  pedagogyProgress,
  selectedScopeLabel,
  gradeOptions,
  semesterOptions,
  unitOptions,
} = storeToRefs(lessonStore)
const {
  activeTranscriptionProvider,
  activeTranscriptionModel,
} = storeToRefs(hearingStore)
const {
  supportsStreamInput,
  error: hearingPipelineError,
} = storeToRefs(hearingPipeline)
const {
  activeSpeechProvider,
  activeSpeechVoiceId,
} = storeToRefs(speechStore)
const {
  enabled,
  selectedAudioInput,
  stream,
  audioInputs,
} = storeToRefs(settingsAudioDevice)

const isComposing = ref(false)
const isListening = ref(false)
const listeningPending = ref(false)
const hearingError = ref('')
const pageUidDraft = ref(selectedPageUid.value)

watch(selectedPageUid, (pageUid) => {
  pageUidDraft.value = pageUid
}, { immediate: true })

const gradeTabOptions = computed(() =>
  gradeOptions.value.map(option => ({
    label: option.label,
    value: option.value,
  })),
)

const semesterTabOptions = computed(() =>
  semesterOptions.value.map(option => ({
    label: option.label,
    value: option.value,
  })),
)

const unitSelectOptions = computed(() =>
  unitOptions.value.map(option => ({
    label: option.label,
    value: option.value,
  })),
)

const pageOptions = computed(() =>
  scopedPages.value.map(page => ({
    label: page.label,
    value: page.value,
  })),
)

const selectedGradeTabValue = computed({
  get: () => selectedGrade.value,
  set: (value) => {
    void lessonStore.selectLessonGrade(String(value), {
      restartIfStarted: hasStarted.value,
    })
  },
})

const selectedSemesterTabValue = computed({
  get: () => selectedSemester.value,
  set: (value) => {
    void lessonStore.selectLessonSemester(String(value), {
      restartIfStarted: hasStarted.value,
    })
  },
})

const selectedUnitValue = computed({
  get: () => selectedUnit.value,
  set: (value) => {
    void lessonStore.selectLessonUnit(String(value), {
      restartIfStarted: hasStarted.value,
    })
  },
})

const selectedPageTabValue = computed({
  get: () => selectedPageUid.value,
  set: (value) => {
    void lessonStore.selectLessonPage(String(value), {
      restartIfStarted: hasStarted.value,
    })
  },
})

const selectedPageDescription = computed(() =>
  availablePages.value.find(page => page.value === selectedPageUid.value)?.description || '选择当前 lesson 页面',
)

const selectedScopeFacts = computed(() => {
  if (!scopedPages.value.length) {
    return '当前目录还没有可选页面。'
  }

  const firstPage = scopedPages.value[0]?.label || ''
  const lastPage = scopedPages.value.at(-1)?.label || ''
  return `${selectedScopeLabel.value} · ${scopedPages.value.length} 页 · ${firstPage} - ${lastPage}`
})

const pageSelectorSummary = computed(() => {
  if (!scopedPages.value.length) {
    return '当前 scope 没有页面。'
  }

  return `当前单元 ${scopedPages.value.length} 页，${selectedPageDescription.value}`
})

const pageSelectorDisabled = computed(() => loading.value || pageOptions.value.length === 0)
const pageInputPlaceholder = computed(() => scopedPages.value[0]?.value || 'TB-G5S1U3-P24')

const currentTask = computed(() =>
  currentTeacherPrompt.value
  || activeTurn.value?.teacher_response
  || '先选择页面并开始本页 lesson。',
)

const runtimeTags = computed(() => {
  const tags = [
    selectedScopeLabel.value === '未选择页面' ? '未绑定 scope' : `目录：${selectedScopeLabel.value}`,
    activeTurn.value?.retrieval_mode
      ? `检索：${lessonRetrievalModeLabels[activeTurn.value.retrieval_mode]}`
      : null,
    activeTurn.value?.teaching_action
      ? `动作：${lessonTeachingActionLabels[activeTurn.value.teaching_action]}`
      : null,
    runtimeState.value?.branch_active ? '支线中' : '主线中',
  ]

  if (runtimeState.value?.awaiting_answer) {
    tags.push('等待回答')
  }

  return tags.filter(Boolean) as string[]
})

const lessonDebugSignalFacts = computed(() => {
  const debugSignals = activeTurn.value?.debug_signals
  if (!debugSignals) {
    return []
  }

  return [
    {
      key: 'live_prompts',
      label: 'Live prompts',
      status: debugSignals.live_prompts.enabled ? '开启' : '关闭',
      detail: debugSignals.live_prompts.enabled
        ? '本轮 teacher 响应走了 live planner / responder。'
        : '本轮没有走 live prompts。',
    },
    {
      key: 'vector_retrieval',
      label: '向量检索',
      status: debugSignals.vector_retrieval.enabled ? '开启' : '关闭',
      detail: debugSignals.vector_retrieval.hit_modes.length > 0
        ? `命中：${debugSignals.vector_retrieval.hit_modes.join(' / ')}`
        : '未命中 unit / branch 检索。',
    },
    {
      key: 'prompt_memory',
      label: 'Prompt memory',
      status: debugSignals.prompt_memory.enabled ? '开启' : '关闭',
      detail: debugSignals.prompt_memory.injected_buckets.length > 0
        ? `注入：${debugSignals.prompt_memory.injected_buckets.join(' / ')}`
        : '当前没有注入 memory bucket。',
    },
    {
      key: 'semantic_recall',
      label: 'Semantic recall',
      status: debugSignals.semantic_recall.enabled ? '开启' : '关闭',
      detail: debugSignals.semantic_recall.recalled_memories.length > 0
        ? `召回：${debugSignals.semantic_recall.recalled_memories.join('；')}`
        : '当前没有额外召回记忆。',
    },
  ]
})

const lessonRhythmFacts = computed(() => {
  if (!runtimeState.value) {
    return []
  }

  return [
    {
      label: '当前块',
      value: runtimeState.value.current_block_uid || '未绑定',
    },
    {
      label: '提示级别',
      value: String(runtimeState.value.hint_level),
    },
    {
      label: '教学级别',
      value: String(runtimeState.value.pedagogy_level),
    },
    {
      label: '同目标尝试',
      value: String(runtimeState.value.same_goal_attempt_count),
    },
  ]
})

const canStart = computed(() =>
  isConfigured.value
  && Boolean(selectedPageUid.value.trim())
  && Boolean(studentId.value.trim())
  && !loading.value,
)

const canSend = computed(() =>
  hasStarted.value
  && Boolean(draftLearnerInput.value.trim())
  && !loading.value,
)

const canQuickAct = computed(() => hasStarted.value && !loading.value)
const canToggleListening = computed(() =>
  hasStarted.value
  && !loading.value
  && !listeningPending.value,
)
const audioInputOptions = computed(() =>
  audioInputs.value.map(device => ({
    label: device.label || 'Unknown Device',
    value: device.deviceId,
  })),
)
const lessonVoiceSummary = computed(() => {
  const providerId = activeSpeechProvider.value.trim()
  const voiceId = activeSpeechVoiceId.value.trim()

  if (!providerId || providerId === 'speech-noop') {
    return '当前没有可用语音 provider，lesson 仍会保留完整的文字回合。'
  }

  return `教师提示会自动通过 ${providerId}${voiceId ? ` / ${voiceId}` : ''} 播放，同时保持 lesson-lite 路由不启动 websocket 或聊天 runtime。`
})
const lessonHearingSummary = computed(() => {
  if (isListening.value) {
    return '学生麦克风正在听写，语音句段会持续回填到输入框，但不会自动发送到 `/lesson/turn`。'
  }

  const providerId = activeTranscriptionProvider.value.trim()
  const modelId = activeTranscriptionModel.value.trim()

  if (providerId && !supportsStreamInput.value) {
    return `当前学生转写 provider ${providerId}${modelId ? ` / ${modelId}` : ''} 不支持流式输入。lesson 听写需要切换到支持 streaming 的 ASR。`
  }

  if (providerId) {
    return `学生语音会通过 ${providerId}${modelId ? ` / ${modelId}` : ''} 转写回输入框，仍然需要手动点“发送”。`
  }

  if (isLessonHearingFallbackSupported()) {
    return '当前没有预配置 ASR provider。打开麦克风时，lesson 会自动回退到浏览器 Web Speech API，并把转写结果只回填到输入框。'
  }

  return '当前浏览器没有可用的语音识别 provider，学生输入仍需手动键入。'
})
const lessonHearingStatusLabel = computed(() => {
  if (listeningPending.value) {
    return '准备麦克风中'
  }

  if (isListening.value) {
    return '正在听写'
  }

  return hasStarted.value ? '等待手动开启' : '开始上课后可用'
})
const currentHearingError = computed(() => hearingError.value || hearingPipelineError.value || '')

const statusBadgeClasses = computed(() => {
  if (!runtimeState.value) {
    return [
      'bg-neutral-100/90',
      'text-neutral-600',
      'dark:bg-neutral-800/90',
      'dark:text-neutral-300',
    ]
  }

  if (runtimeState.value.branch_active) {
    return [
      'bg-violet-100/95',
      'text-violet-700',
      'dark:bg-violet-500/25',
      'dark:text-violet-100',
    ]
  }

  if (runtimeState.value.awaiting_answer) {
    return [
      'bg-amber-100/95',
      'text-amber-700',
      'dark:bg-amber-500/25',
      'dark:text-amber-100',
    ]
  }

  return [
    'bg-emerald-100/95',
    'text-emerald-700',
    'dark:bg-emerald-500/25',
    'dark:text-emerald-100',
  ]
})

function transcriptEntryMeta(entry: LessonTranscriptEntry) {
  const tags = [
    entry.turn_label ? lessonTurnLabelLabels[entry.turn_label] : null,
    entry.teaching_action ? lessonTeachingActionLabels[entry.teaching_action] : null,
    entry.retrieval_mode ? lessonRetrievalModeLabels[entry.retrieval_mode] : null,
    entry.evaluation ? `评估：${entry.evaluation}` : null,
    entry.local_only ? '本地重放' : null,
  ]

  return tags.filter(Boolean) as string[]
}

async function handleStart() {
  await stopListening()

  try {
    await lessonStore.startLesson(selectedPageUid.value)
  }
  catch {
  }
}

async function handleSend() {
  if (isComposing.value) {
    return
  }

  const text = draftLearnerInput.value.trim()
  if (!text) {
    return
  }

  await stopListening()

  lessonStore.setDraftLearnerInput('')

  try {
    await lessonStore.sendTurn(text)
  }
  catch {
  }
}

async function handleHint() {
  await stopListening()

  try {
    await lessonStore.requestHint()
  }
  catch {
  }
}

async function handleReturn() {
  await stopListening()

  try {
    await lessonStore.returnToMainline()
  }
  catch {
  }
}

async function handleRepeatPrompt() {
  await stopListening()
  lessonStore.repeatTeacherPrompt()
}

async function startListening() {
  if (!canToggleListening.value || isListening.value) {
    return
  }

  listeningPending.value = true
  hearingError.value = ''

  try {
    const ready = await ensureLessonHearingFallbackProvider()
    if (!ready) {
      hearingError.value = isLessonHearingFallbackSupported()
        ? '当前没有可用的流式语音识别 provider，请先到设置页完成 Hearing 配置。'
        : '当前浏览器不支持 Web Speech API，lesson 学生输入暂时只能手打。'
      enabled.value = false
      return
    }

    if (!enabled.value) {
      enabled.value = true
    }

    await settingsAudioDevice.askPermission()

    if (!stream.value) {
      settingsAudioDevice.startStream()
      try {
        await until(stream).toBeTruthy({ timeout: 3000, throwOnTimeout: true })
      }
      catch {
        hearingError.value = '无法启动麦克风输入流，请检查浏览器权限和输入设备。'
        enabled.value = false
        return
      }
    }

    if (!stream.value) {
      hearingError.value = '没有拿到可用的麦克风音频流。'
      enabled.value = false
      return
    }

    if (!supportsStreamInput.value) {
      await hearingPipeline.stopStreamingTranscription(true)
      hearingError.value = '当前转写 provider 不支持流式输入，请切换到支持 streaming 的 ASR。'
      enabled.value = false
      return
    }

    await hearingPipeline.transcribeForMediaStream(stream.value, {
      onSentenceEnd: (delta) => {
        if (delta && delta.trim()) {
          lessonStore.appendDraftLearnerInput(delta)
        }
      },
    })

    if (hearingPipelineError.value) {
      hearingError.value = hearingPipelineError.value
      enabled.value = false
      await hearingPipeline.stopStreamingTranscription(true)
      return
    }

    isListening.value = true
  }
  catch (caughtError) {
    hearingError.value = caughtError instanceof Error ? caughtError.message : '启动语音输入失败。'
    enabled.value = false
    isListening.value = false
  }
  finally {
    listeningPending.value = false
  }
}

async function stopListening(options: { disableMic?: boolean } = {}) {
  try {
    await hearingPipeline.stopStreamingTranscription(true)
  }
  catch {
  }
  finally {
    isListening.value = false
    listeningPending.value = false

    if (options.disableMic !== false) {
      enabled.value = false
    }
  }
}

async function toggleListening() {
  if (isListening.value) {
    await stopListening()
    return
  }

  await startListening()
}

async function applyPageUidDraft() {
  const normalizedPageUid = pageUidDraft.value.trim()
  if (!normalizedPageUid) {
    pageUidDraft.value = selectedPageUid.value
    return
  }

  try {
    await lessonStore.selectLessonPage(normalizedPageUid, {
      restartIfStarted: hasStarted.value,
    })
  }
  catch {
  }

  pageUidDraft.value = selectedPageUid.value
}

watch(stream, (currentStream) => {
  if (!currentStream) {
    isListening.value = false
  }
})

onUnmounted(() => {
  void stopListening()
})
</script>

<template>
  <section
    :class="[
      'flex h-full min-h-0 w-full flex-col gap-3',
      props.mobile ? 'pb-2' : '',
    ]"
  >
    <div
      :class="[
        'rounded-[24px] border-2 border-solid border-white/50 bg-white/70 p-4 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.55)] backdrop-blur-xl',
        'dark:border-neutral-800/70 dark:bg-neutral-950/72',
      ]"
    >
      <div :class="['flex items-start justify-between gap-3']">
        <div :class="['min-w-0']">
          <div :class="['text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400 dark:text-neutral-500']">
            PepTutor Lesson
          </div>
          <div :class="['mt-1 text-lg font-semibold text-neutral-800 dark:text-neutral-50']">
            {{ currentPageTitle }}
          </div>
          <div :class="['mt-1 text-sm text-neutral-500 dark:text-neutral-300']">
            {{ runtimeState?.current_block_uid || selectedPageDescription }}
          </div>
        </div>
        <div
          :class="[
            'rounded-full px-3 py-1 text-xs font-semibold',
            ...statusBadgeClasses,
          ]"
        >
          {{ currentActivityLabel }}
        </div>
      </div>
    </div>

    <Callout
      v-if="!isConfigured"
      theme="orange"
      label="Lesson API 未配置"
    >
      <p>设置 `VITE_PEPTUTOR_LESSON_API_URL` 后，这个面板才会调用 `POST /lesson/turn`。</p>
      <p>推荐本地值：`http://127.0.0.1:9625`</p>
    </Callout>

    <Callout
      v-else-if="error"
      theme="orange"
      label="Lesson 请求失败"
    >
      <p>{{ error }}</p>
    </Callout>

    <div
      :class="[
        'grid gap-3',
        props.mobile ? 'grid-cols-1' : 'grid-cols-1',
      ]"
    >
      <div
        :class="[
          'rounded-[24px] border-2 border-solid border-white/50 bg-white/78 p-4 backdrop-blur-xl',
          'dark:border-neutral-800/70 dark:bg-neutral-950/72',
        ]"
      >
        <div :class="['mb-3 flex items-center justify-between gap-3']">
          <div>
            <div :class="['text-sm font-semibold text-neutral-700 dark:text-neutral-100']">
              启动页面
            </div>
            <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              显式进入 lesson，不接管现有聊天首页。
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            :loading="loading"
            :disabled="!canStart"
            @click="handleStart"
          >
            {{ hasStarted ? '重新开始' : '开始上课' }}
          </Button>
        </div>

        <div :class="['grid gap-3']">
          <div>
            <div :class="['mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400']">
              年级
            </div>
            <SelectTab
              v-model="selectedGradeTabValue"
              size="sm"
              :options="gradeTabOptions"
              :disabled="loading"
            />
          </div>

          <div>
            <div :class="['mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400']">
              学期
            </div>
            <SelectTab
              v-model="selectedSemesterTabValue"
              size="sm"
              :options="semesterTabOptions"
              :disabled="loading || semesterTabOptions.length === 0"
            />
          </div>

          <FieldSelect
            v-model="selectedUnitValue"
            label="单元"
            :description="selectedScopeFacts"
            :options="unitSelectOptions"
            placeholder="选择单元"
            :disabled="loading || unitSelectOptions.length === 0"
            layout="horizontal"
          />

          <div>
            <div :class="['mb-2 flex items-center justify-between gap-3']">
              <span :class="['text-xs font-medium text-neutral-500 dark:text-neutral-400']">页面</span>
              <span :class="['text-[11px] text-neutral-400 dark:text-neutral-500']">{{ pageSelectorSummary }}</span>
            </div>
            <SelectTab
              v-model="selectedPageTabValue"
              size="sm"
              :options="pageOptions"
              :disabled="pageSelectorDisabled"
            />
          </div>
        </div>

        <div :class="['mt-3 grid gap-3', props.mobile ? 'grid-cols-1' : 'grid-cols-[1.25fr_0.85fr]']">
          <label :class="['flex flex-col gap-2']">
            <span :class="['text-xs font-medium text-neutral-500 dark:text-neutral-400']">Page UID</span>
            <div :class="['flex gap-2']">
              <Input
                v-model="pageUidDraft"
                variant="primary-dimmed"
                :placeholder="pageInputPlaceholder"
                @blur="void applyPageUidDraft()"
                @keydown.enter.prevent="void applyPageUidDraft()"
              />
              <Button
                variant="secondary"
                size="sm"
                :disabled="loading"
                @click="void applyPageUidDraft()"
              >
                跳转
              </Button>
            </div>
          </label>

          <label :class="['flex flex-col gap-2']">
            <span :class="['text-xs font-medium text-neutral-500 dark:text-neutral-400']">Student ID</span>
            <Input
              v-model="studentId"
              variant="primary-dimmed"
              placeholder="demo-student"
            />
          </label>
        </div>
      </div>

      <div
        :class="[
          'rounded-[24px] border-2 border-solid border-white/50 bg-white/78 p-4 backdrop-blur-xl',
          'dark:border-neutral-800/70 dark:bg-neutral-950/72',
        ]"
      >
        <div :class="['text-sm font-semibold text-neutral-700 dark:text-neutral-100']">
          当前任务
        </div>
        <div :class="['mt-2 text-base leading-6 text-neutral-800 dark:text-neutral-50']">
          {{ currentTask }}
        </div>

        <div :class="['mt-3 flex flex-wrap gap-2']">
          <div
            v-for="tag in runtimeTags"
            :key="tag"
            :class="[
              'rounded-full bg-neutral-100/90 px-3 py-1 text-xs font-medium text-neutral-600',
              'dark:bg-neutral-800/85 dark:text-neutral-200',
            ]"
          >
            {{ tag }}
          </div>
        </div>

        <div
          v-if="runtimeState?.return_anchor"
          :class="[
            'mt-3 rounded-2xl border border-dashed border-neutral-200/90 px-3 py-2 text-sm text-neutral-500',
            'dark:border-neutral-700/80 dark:text-neutral-300',
          ]"
        >
          回主线锚点：{{ runtimeState.return_anchor }}
        </div>
      </div>

      <div
        v-if="lessonDebugSignalFacts.length > 0"
        :class="[
          'rounded-[24px] border-2 border-solid border-white/50 bg-white/78 p-4 backdrop-blur-xl',
          'dark:border-neutral-800/70 dark:bg-neutral-950/72',
        ]"
      >
        <div :class="['mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-100']">
          本轮能力
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          只在后端开启 `PEPTUTOR_DEBUG_SIGNALS=1` 时出现，用来解释这一轮 lesson 实际用了哪些能力。
        </div>

        <div :class="['mt-3 grid gap-2', props.mobile ? 'grid-cols-1' : 'grid-cols-2']">
          <div
            v-for="fact in lessonDebugSignalFacts"
            :key="fact.key"
            :data-testid="`lesson-debug-signal-card-${fact.key}`"
            :class="[
              'rounded-2xl bg-neutral-100/90 px-3 py-3',
              'dark:bg-neutral-900/75',
            ]"
          >
            <div :class="['flex items-center justify-between gap-3']">
              <div :class="['text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500']">
                {{ fact.label }}
              </div>
              <div
                :data-testid="`lesson-debug-signal-status-${fact.key}`"
                :class="[
                  'rounded-full px-2 py-1 text-[11px] font-medium',
                  fact.status === '开启'
                    ? 'bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100'
                    : 'bg-neutral-200/90 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-200',
                ]"
              >
                {{ fact.status }}
              </div>
            </div>
            <div
              :data-testid="`lesson-debug-signal-detail-${fact.key}`"
              :class="['mt-2 text-sm leading-6 text-neutral-700 dark:text-neutral-100']"
            >
              {{ fact.detail }}
            </div>
          </div>
        </div>
      </div>

      <div
        :class="[
          'rounded-[24px] border-2 border-solid border-white/50 bg-white/78 p-4 backdrop-blur-xl',
          'dark:border-neutral-800/70 dark:bg-neutral-950/72',
        ]"
      >
        <div :class="['mb-2 flex items-start justify-between gap-3']">
          <div>
            <div :class="['text-sm font-semibold text-neutral-700 dark:text-neutral-100']">
              Lesson 语音
            </div>
            <div :class="['mt-1 text-xs text-neutral-500 dark:text-neutral-400']">
              lesson-lite 只补本页 teacher prompt 播放，不接管现有聊天首页。
            </div>
          </div>
        </div>

        <div
          :class="[
            'rounded-2xl border border-dashed border-neutral-200/90 px-4 py-3 text-sm text-neutral-600',
            'dark:border-neutral-700/80 dark:text-neutral-300',
          ]"
        >
          {{ lessonVoiceSummary }}
        </div>

        <div
          :class="[
            'mt-2 rounded-2xl border border-dashed border-neutral-200/90 px-4 py-3 text-sm text-neutral-600',
            'dark:border-neutral-700/80 dark:text-neutral-300',
          ]"
        >
          {{ lessonHearingSummary }}
        </div>
      </div>
    </div>

    <div
      :class="[
        'min-h-0 flex-1 overflow-hidden rounded-[28px] border-2 border-solid border-white/50 bg-white/78 p-4 backdrop-blur-xl',
        'dark:border-neutral-800/70 dark:bg-neutral-950/72',
      ]"
    >
      <div :class="['mb-3 flex items-center justify-between gap-3']">
        <div>
          <div :class="['text-sm font-semibold text-neutral-700 dark:text-neutral-100']">
            教学对话区
          </div>
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            跟随 `/lesson/turn` 的真实 teacher / learner 回合。
          </div>
        </div>
        <div :class="['text-xs text-neutral-400 dark:text-neutral-500']">
          {{ transcript.length }} 条
        </div>
      </div>

      <div
        :class="[
          'flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1',
          props.mobile ? 'max-h-[36dvh]' : 'max-h-[27rem]',
        ]"
      >
        <div
          v-if="transcript.length === 0"
          :class="[
            'rounded-2xl border border-dashed border-neutral-200 px-4 py-5 text-sm text-neutral-500',
            'dark:border-neutral-700 dark:text-neutral-300',
          ]"
        >
          还没有 lesson 对话。先开始一页，再让老师出第一句。
        </div>

        <div
          v-for="entry in transcript"
          :key="entry.id"
          :class="[
            'flex flex-col gap-2',
            entry.speaker === 'learner' ? 'items-end' : 'items-start',
          ]"
        >
          <div
            :class="[
              'max-w-[92%] rounded-[20px] px-4 py-3 text-sm leading-6 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.7)]',
              entry.speaker === 'teacher'
                ? 'bg-[#fff2d9] text-neutral-800 dark:bg-[#4f3d1e] dark:text-neutral-50'
                : entry.speaker === 'learner'
                  ? 'bg-[#eef2ff] text-neutral-800 dark:bg-[#24304b] dark:text-neutral-50'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
            ]"
          >
            {{ entry.text }}
          </div>

          <div
            v-if="transcriptEntryMeta(entry).length > 0"
            :class="[
              'flex max-w-[92%] flex-wrap gap-1',
              entry.speaker === 'learner' ? 'justify-end' : 'justify-start',
            ]"
          >
            <span
              v-for="tag in transcriptEntryMeta(entry)"
              :key="tag"
              :class="[
                'rounded-full bg-white/85 px-2 py-1 text-[11px] text-neutral-500',
                'dark:bg-neutral-900/70 dark:text-neutral-300',
              ]"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div :class="['grid gap-3', props.mobile ? 'grid-cols-1' : 'grid-cols-[1fr_0.92fr]']">
      <div
        :class="[
          'rounded-[24px] border-2 border-solid border-white/50 bg-white/78 p-4 backdrop-blur-xl',
          'dark:border-neutral-800/70 dark:bg-neutral-950/72',
        ]"
      >
        <div :class="['mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-100']">
          动作按钮
        </div>
        <div :class="['grid grid-cols-2 gap-2']">
          <Button
            variant="secondary"
            size="sm"
            icon="i-solar:restart-bold-duotone"
            :disabled="!canStart"
            @click="handleStart"
          >
            重新开始
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="i-solar:chat-round-call-bold-duotone"
            :disabled="!canQuickAct"
            @click="handleHint"
          >
            给提示
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="i-solar:round-arrow-left-bold-duotone"
            :disabled="!canQuickAct"
            @click="handleReturn"
          >
            回主线
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="i-solar:playback-speed-bold-duotone"
            :disabled="!hasStarted"
            @click="handleRepeatPrompt"
          >
            再听一遍
          </Button>
        </div>
      </div>

      <div
        :class="[
          'rounded-[24px] border-2 border-solid border-white/50 bg-white/78 p-4 backdrop-blur-xl',
          'dark:border-neutral-800/70 dark:bg-neutral-950/72',
        ]"
      >
        <div :class="['mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-100']">
          页面节奏
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          当前显示的不是整页真实完成度，而是 lesson 节奏和纠错深度。
        </div>

        <div :class="['mt-3']">
          <Progress :progress="pedagogyProgress" />
        </div>

        <div :class="['mt-3 grid grid-cols-2 gap-2']">
          <div
            v-for="fact in lessonRhythmFacts"
            :key="fact.label"
            :class="[
              'rounded-2xl bg-neutral-100/90 px-3 py-2',
              'dark:bg-neutral-900/75',
            ]"
          >
            <div :class="['text-[11px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500']">
              {{ fact.label }}
            </div>
            <div :class="['mt-1 line-clamp-2 text-sm text-neutral-700 dark:text-neutral-100']">
              {{ fact.value }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      :class="[
        'rounded-[24px] border-2 border-solid border-white/50 bg-white/78 p-4 backdrop-blur-xl',
        'dark:border-neutral-800/70 dark:bg-neutral-950/72',
      ]"
    >
      <div :class="['mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-100']">
        学生输入
      </div>
      <div :class="['mb-3 grid gap-3', props.mobile ? 'grid-cols-1' : 'grid-cols-[auto_1fr]']">
        <div :class="['flex flex-col gap-2']">
          <Button
            :variant="isListening ? 'primary' : 'secondary'"
            size="sm"
            :icon="isListening ? 'i-ph:microphone' : 'i-ph:microphone-slash'"
            :loading="listeningPending"
            :disabled="!canToggleListening"
            @click="void toggleListening()"
          >
            {{ isListening ? '停止听写' : '打开麦克风' }}
          </Button>

          <div
            :class="[
              'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
              isListening
                ? 'bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100'
                : 'bg-neutral-100/95 text-neutral-500 dark:bg-neutral-900/70 dark:text-neutral-300',
            ]"
          >
            <IndicatorMicVolume v-if="isListening" class="h-4 w-4" />
            <div v-else class="i-ph:waveform-slash h-4 w-4" />
            <span>{{ lessonHearingStatusLabel }}</span>
          </div>
        </div>

        <FieldSelect
          v-model="selectedAudioInput"
          label="输入设备"
          :description="audioInputOptions.length > 0 ? '切换 lesson 听写使用的麦克风。' : '首次授权后浏览器才会列出可用输入设备。'"
          :options="audioInputOptions"
          placeholder="选择麦克风"
          layout="horizontal"
          :disabled="loading"
        />
      </div>

      <div
        v-if="currentHearingError"
        :class="[
          'mb-3 rounded-2xl border border-orange-200/90 bg-orange-50/90 px-4 py-3 text-sm text-orange-700',
          'dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100',
        ]"
      >
        {{ currentHearingError }}
      </div>

      <div :class="['flex items-end gap-2']">
        <BasicTextarea
          v-model="draftLearnerInput"
          :class="[
            'min-h-[calc(2lh+8px)] max-h-[8lh] w-full resize-none rounded-[20px] border-2 border-solid border-neutral-200/80 bg-neutral-100/90 px-4 py-2 text-sm outline-none',
            'text-neutral-700 placeholder:text-neutral-400 dark:border-neutral-800/80 dark:bg-neutral-900/78 dark:text-neutral-50 dark:placeholder:text-neutral-500',
            'transition-colors duration-200 ease-in-out',
          ]"
          placeholder="学生回答或追问，例如：I'd like some water."
          default-height="calc(2lh + 8px)"
          @submit="handleSend"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />

        <Button
          variant="primary"
          size="md"
          icon="i-solar:arrow-up-bold"
          :loading="loading"
          :disabled="!canSend"
          @click="handleSend"
        >
          发送
        </Button>
      </div>
    </div>
  </section>
</template>
