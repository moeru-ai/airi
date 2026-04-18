import type { LessonTurnDebugSignals, LessonTurnResult } from '@proj-airi/stage-ui/types/lesson'

import { setLessonApiBaseUrlForTest, useLessonStore } from '@proj-airi/stage-ui/stores/lesson'
import {
  cloneLessonFixture,
  lessonCatalogSmokeFixture,
  lessonJsonResponse,
  lessonTurnP24AnswerFixture,
  lessonTurnP24StartFixture,
  lessonTurnP25StartFixture,
} from '@proj-airi/stage-ui/testing/lesson-api-fixtures'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const mockSettingsStore = {
  stageModelRenderer: ref('mock-renderer'),
  stageModelSelected: 'mock-model',
  stageModelSelectedUrl: ref('/mock-model.vrm'),
  updateStageModel: vi.fn(async () => {}),
}

const mockAudioDeviceStore = {
  enabled: ref(false),
  selectedAudioInput: ref('mock-mic'),
  stream: ref<MediaStream | null>(null),
  audioInputs: ref([
    {
      label: 'Mock Mic',
      deviceId: 'mock-mic',
    },
  ]),
  askPermission: vi.fn(async () => {}),
  startStream: vi.fn(() => {
    mockAudioDeviceStore.stream.value = { id: 'mock-stream' } as MediaStream
  }),
  stopStream: vi.fn(() => {
    mockAudioDeviceStore.stream.value = null
  }),
}

let lastSentenceEndHandler: ((delta: string) => void) | null = null

const mockHearingStore = {
  activeTranscriptionProvider: ref('browser-web-speech-api'),
  activeTranscriptionModel: ref('web-speech-api'),
}

const mockHearingPipeline = {
  supportsStreamInput: ref(true),
  error: ref(''),
  transcribeForMediaStream: vi.fn(async (_stream: MediaStream, options?: { onSentenceEnd?: (delta: string) => void }) => {
    lastSentenceEndHandler = options?.onSentenceEnd ?? null
  }),
  stopStreamingTranscription: vi.fn(async () => {}),
}

const mockSpeechStore = {
  activeSpeechProvider: ref('browser-speech-api'),
  activeSpeechVoiceId: ref('lesson-voice'),
}

function resetLessonBrowserMockStores() {
  mockSettingsStore.stageModelRenderer.value = 'mock-renderer'
  mockSettingsStore.stageModelSelected = 'mock-model'
  mockSettingsStore.stageModelSelectedUrl.value = '/mock-model.vrm'
  mockSettingsStore.updateStageModel.mockClear()

  mockAudioDeviceStore.enabled.value = false
  mockAudioDeviceStore.selectedAudioInput.value = 'mock-mic'
  mockAudioDeviceStore.stream.value = null
  mockAudioDeviceStore.askPermission.mockClear()
  mockAudioDeviceStore.startStream.mockClear()
  mockAudioDeviceStore.stopStream.mockClear()

  lastSentenceEndHandler = null
  mockHearingStore.activeTranscriptionProvider.value = 'browser-web-speech-api'
  mockHearingStore.activeTranscriptionModel.value = 'web-speech-api'
  mockHearingPipeline.supportsStreamInput.value = true
  mockHearingPipeline.error.value = ''
  mockHearingPipeline.transcribeForMediaStream.mockClear()
  mockHearingPipeline.stopStreamingTranscription.mockClear()

  mockSpeechStore.activeSpeechProvider.value = 'browser-speech-api'
  mockSpeechStore.activeSpeechVoiceId.value = 'lesson-voice'
}

function emitMockTranscriptionSentence(delta: string) {
  if (!lastSentenceEndHandler) {
    throw new Error('Expected a lesson hearing sentence handler to be registered')
  }

  lastSentenceEndHandler(delta)
}

vi.mock('@proj-airi/stage-layouts/components/Layouts/Header.vue', async () => {
  const { h } = await import('vue')

  return {
    default: {
      name: 'LessonHeaderStub',
      setup: () => () => h('div', { 'data-testid': 'lesson-header-stub' }),
    },
  }
})

vi.mock('@proj-airi/stage-layouts/components/Layouts/MobileHeader.vue', async () => {
  const { h } = await import('vue')

  return {
    default: {
      name: 'LessonMobileHeaderStub',
      setup: () => () => h('div', { 'data-testid': 'lesson-mobile-header-stub' }),
    },
  }
})

vi.mock('@proj-airi/stage-layouts/components/Backgrounds', async () => {
  const { h } = await import('vue')

  return {
    BackgroundProvider: {
      name: 'LessonBackgroundProviderStub',
      setup: (_props: unknown, { slots }: { slots: { default?: () => unknown[] } }) => () =>
        h('div', { 'data-testid': 'lesson-background-provider-stub' }, slots.default?.() as any),
    },
  }
})

vi.mock('@proj-airi/stage-layouts/composables/theme-color', () => ({
  useBackgroundThemeColor: () => ({
    syncBackgroundTheme: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-layouts/stores/background', async () => {
  const { ref } = await import('vue')

  const backgroundStore = {
    selectedOption: ref({ id: 'colorful-wave' }),
    sampledColor: ref('#ffffff'),
  }

  return {
    useBackgroundStore: () => backgroundStore,
  }
})

vi.mock('@proj-airi/stage-ui/components/scenes', async () => {
  const { h } = await import('vue')

  return {
    WidgetStage: {
      name: 'LessonWidgetStageStub',
      setup: () => () => h('div', { 'data-testid': 'lesson-widget-stage-stub' }),
    },
  }
})

vi.mock('@proj-airi/stage-layouts/components/Widgets/IndicatorMicVolume.vue', async () => {
  const { h } = await import('vue')

  return {
    default: {
      name: 'LessonIndicatorMicVolumeStub',
      setup: () => () => h('div', { 'data-testid': 'lesson-indicator-mic-volume-stub' }),
    },
  }
})

vi.mock('@proj-airi/stage-ui/stores/provider-env-bootstrap', () => ({
  bootstrapPepTutorVoiceEnvDefaults: vi.fn(async () => {}),
}))

vi.mock('@proj-airi/stage-ui/stores/peptutor-backend-auth', () => ({
  bootstrapPepTutorBackendAuth: vi.fn(async () => undefined),
  fetchPepTutorBackend: vi.fn(async (input: string | URL, init?: RequestInit) => fetch(input, init)),
}))

vi.mock('@proj-airi/stage-ui/stores/lesson-voice-hearing-fallback', () => ({
  ensureLessonHearingFallbackProvider: vi.fn(async () => true),
  isLessonHearingFallbackSupported: vi.fn(() => true),
}))

vi.mock('@proj-airi/stage-ui/stores/lesson-voice-speech-fallback', () => ({
  ensureLessonSpeechFallbackProvider: vi.fn(async () => true),
}))

vi.mock('@proj-airi/stage-ui/stores/settings', async () => {
  return {
    useSettings: () => mockSettingsStore,
    useSettingsAudioDevice: () => mockAudioDeviceStore,
  }
})

vi.mock('@proj-airi/stage-ui/stores/modules/hearing', async () => {
  return {
    useHearingStore: () => mockHearingStore,
    useHearingSpeechInputPipeline: () => mockHearingPipeline,
  }
})

vi.mock('@proj-airi/stage-ui/stores/modules/speech', async () => {
  return {
    useSpeechStore: () => mockSpeechStore,
  }
})

async function flushUi(cycles: number = 4) {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

const useRealLessonBackend = import.meta.env.VITE_PEPTUTOR_LESSON_REAL_BACKEND_SMOKE === '1'
const expectRealLessonDebugSignals = import.meta.env.VITE_PEPTUTOR_LESSON_EXPECT_DEBUG_SIGNALS === '1'
const lessonApiBaseUrl = import.meta.env.VITE_PEPTUTOR_LESSON_REAL_BACKEND_URL || 'http://127.0.0.1:9625'
const smokeWaitTimeoutMs = useRealLessonBackend ? 20_000 : 5_000
const smokeTestTimeoutMs = useRealLessonBackend ? 30_000 : 10_000
const describeMockSmoke = useRealLessonBackend ? describe.skip : describe
const describeRealSmoke = useRealLessonBackend ? describe : describe.skip
const itRealDebugSmoke = expectRealLessonDebugSignals ? it : it.skip

function lastTeacherTranscriptText(lessonStore: ReturnType<typeof useLessonStore>) {
  return [...lessonStore.transcript]
    .reverse()
    .find(entry => entry.speaker === 'teacher')
    ?.text
    ?.trim() || ''
}

function expectRealTeacherResponse(teacherResponse: string) {
  expect(teacherResponse.length).toBeGreaterThanOrEqual(8)
  expect(/[A-Z\u4E00-\u9FFF]/i.test(teacherResponse)).toBe(true)
}

function logRealSmokeObservation(testName: string, startedAtMs: number, teacherResponse: string) {
  console.info(`[lesson-real-smoke] ${JSON.stringify({
    test: testName,
    duration_ms: Date.now() - startedAtMs,
    teacher_response: teacherResponse,
  })}`)
}

function logRealDebugSignalsObservation(testName: string, debugSignals: LessonTurnDebugSignals) {
  console.info(`[lesson-real-debug-signals] ${JSON.stringify({
    test: testName,
    debug_signals: debugSignals,
  })}`)
}

function textContent() {
  return document.body.textContent || ''
}

function queryRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`Expected element for selector "${selector}"`)
  }

  return element as T
}

function queryPageUidInput(): HTMLInputElement {
  const input = [...document.querySelectorAll('input')]
    .find((candidate): candidate is HTMLInputElement => {
      if (!(candidate instanceof HTMLInputElement)) {
        return false
      }

      const value = candidate.value.trim()
      const placeholder = candidate.getAttribute('placeholder')?.trim() || ''
      return value.startsWith('TB-') || placeholder.startsWith('TB-')
    })

  if (!input) {
    throw new Error('Expected Page UID input')
  }

  return input
}

function clickButton(label: string) {
  const button = [...document.querySelectorAll('button')]
    .find(candidate => candidate.textContent?.trim() === label)

  if (!button) {
    throw new Error(`Expected button "${label}"`)
  }

  button.click()
}

function clickRadioTab(label: string) {
  const radio = [...document.querySelectorAll('[role="radio"]')]
    .find((candidate): candidate is HTMLElement =>
      candidate instanceof HTMLElement && candidate.getAttribute('aria-label')?.trim() === label,
    )

  if (!radio) {
    throw new Error(`Expected radio tab "${label}"`)
  }

  radio.click()
}

function queryDebugSignalStatus(key: string): string {
  return queryRequiredElement<HTMLElement>(`[data-testid="lesson-debug-signal-status-${key}"]`).textContent?.trim() || ''
}

function queryDebugSignalDetail(key: string): string {
  return queryRequiredElement<HTMLElement>(`[data-testid="lesson-debug-signal-detail-${key}"]`).textContent?.trim() || ''
}

function setControlValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function spyOnLessonSpeechRuntime(speechRuntimeStore: {
  stopByOwner: (ownerId: string, reason?: string) => void
  openIntent: (options?: { ownerId?: string, priority?: string | number, behavior?: string }) => {
    writeLiteral: (text: string) => void
    writeFlush: () => void
    end: () => void
  }
}) {
  const originalStopByOwner = speechRuntimeStore.stopByOwner.bind(speechRuntimeStore)
  const originalOpenIntent = speechRuntimeStore.openIntent.bind(speechRuntimeStore)
  const literalWrites: string[] = []
  let flushCount = 0
  let endCount = 0

  const stopByOwnerSpy = vi.fn((ownerId: string, reason?: string) => {
    originalStopByOwner(ownerId, reason)
  })
  const openIntentSpy = vi.fn((options?: { ownerId?: string, priority?: string | number, behavior?: string }) => {
    const intent = originalOpenIntent(options)
    const originalWriteLiteral = intent.writeLiteral.bind(intent)
    const originalWriteFlush = intent.writeFlush.bind(intent)
    const originalEnd = intent.end.bind(intent)

    intent.writeLiteral = ((text: string) => {
      literalWrites.push(String(text ?? ''))
      originalWriteLiteral(text)
    }) as typeof intent.writeLiteral
    intent.writeFlush = (() => {
      flushCount += 1
      originalWriteFlush()
    }) as typeof intent.writeFlush
    intent.end = (() => {
      endCount += 1
      originalEnd()
    }) as typeof intent.end

    return intent
  })

  speechRuntimeStore.stopByOwner = stopByOwnerSpy
  speechRuntimeStore.openIntent = openIntentSpy

  return {
    stopByOwnerSpy,
    openIntentSpy,
    literalWrites,
    get flushCount() {
      return flushCount
    },
    get endCount() {
      return endCount
    },
  }
}

function installLessonApiMock(turnResults: Array<typeof lessonTurnP24StartFixture>) {
  const queuedTurnResults = turnResults.map(result => cloneLessonFixture(result))
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/lesson/catalog')) {
      return lessonJsonResponse(cloneLessonFixture(lessonCatalogSmokeFixture))
    }

    if (url.endsWith('/lesson/turn')) {
      const nextResult = queuedTurnResults.shift()
      if (!nextResult) {
        throw new Error(`Unexpected extra lesson turn request: ${JSON.stringify(init?.body || null)}`)
      }

      return lessonJsonResponse(nextResult)
    }

    throw new Error(`Unexpected fetch request: ${url}`)
  })

  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

function installRealLessonApiCapture() {
  const originalFetch = globalThis.fetch.bind(globalThis)
  const capturedTurnResults: LessonTurnResult[] = []
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init)
    const url = String(input)

    if (url.endsWith('/lesson/turn')) {
      const payload = await response.clone().json() as LessonTurnResult
      capturedTurnResults.push(payload)
    }

    return response
  })

  vi.stubGlobal('fetch', fetchSpy as typeof fetch)

  return {
    fetchSpy,
    capturedTurnResults,
  }
}

function buildPageEntryFixture(overrides: {
  pageUid: string
  blockUid: string
  grade: string
  semester: string
  unit: string
  page: number
  pageType: string
  teacherResponse: string
  lastTeacherQuestion: string
}): LessonTurnResult {
  const fixture = cloneLessonFixture(lessonTurnP24StartFixture)
  fixture.page_uid = overrides.pageUid
  fixture.block_uid = overrides.blockUid
  fixture.teacher_response = overrides.teacherResponse
  fixture.state.current_grade = overrides.grade
  fixture.state.current_semester = overrides.semester
  fixture.state.current_unit = overrides.unit
  fixture.state.current_page = overrides.page
  fixture.state.current_page_uid = overrides.pageUid
  fixture.state.current_page_type = overrides.pageType
  fixture.state.current_block_uid = overrides.blockUid
  fixture.state.last_teacher_question = overrides.lastTeacherQuestion
  fixture.retrieved_block_uids = []
  return fixture
}

const lessonTurnG6S2Recycle2P49StartFixture = buildPageEntryFixture({
  pageUid: 'TB-G6S2Recycle2-P49',
  blockUid: 'TB-G6S2Recycle2-P49-D1',
  grade: 'G6',
  semester: 'S2',
  unit: 'Recycle2',
  page: 49,
  pageType: 'phonics',
  teacherResponse: '这一页复习告别派对里的语音分类。Let us sort the sounds together.',
  lastTeacherQuestion: 'Can you sort the sounds?',
})

const lessonTurnG6S1U1P2StartFixture = buildPageEntryFixture({
  pageUid: 'TB-G6S1U1-P2',
  blockUid: 'TB-G6S1U1-P2-D1',
  grade: 'G6',
  semester: 'S1',
  unit: 'U1',
  page: 2,
  pageType: 'dialogue',
  teacherResponse: '这一页进入六上第一单元的问路对话。Can you ask: Where is the museum?',
  lastTeacherQuestion: 'Where is the museum?',
})

function livePromptsDetail(debugSignals: LessonTurnDebugSignals): string {
  return debugSignals.live_prompts.enabled
    ? '本轮 teacher 响应走了 live planner / responder。'
    : '本轮没有走 live prompts。'
}

function promptMemoryDetail(debugSignals: LessonTurnDebugSignals): string {
  return debugSignals.prompt_memory.injected_buckets.length > 0
    ? `注入：${debugSignals.prompt_memory.injected_buckets.join(' / ')}`
    : '当前没有注入 memory bucket。'
}

function expectRenderedDebugSignals(debugSignals: LessonTurnDebugSignals) {
  expect(queryDebugSignalStatus('live_prompts')).toBe(debugSignals.live_prompts.enabled ? '开启' : '关闭')
  expect(queryDebugSignalDetail('live_prompts')).toBe(livePromptsDetail(debugSignals))
  expect(queryDebugSignalStatus('prompt_memory')).toBe(debugSignals.prompt_memory.enabled ? '开启' : '关闭')
  expect(queryDebugSignalDetail('prompt_memory')).toBe(promptMemoryDetail(debugSignals))
}

async function mountLessonPage(
  initialPath: string = '/lesson?page_uid=TB-G5S1U3-P24',
  options: {
    beforeMount?: (deps: {
      pinia: ReturnType<typeof createPinia>
      speechRuntimeStore: any
    }) => void
  } = {},
) {
  const { default: LessonScenePage } = await import('../../testing/LessonScenePageHarness.vue')
  const { useSpeechRuntimeStore: useRealSpeechRuntimeStore } = await import('../../../../../packages/stage-ui/src/stores/speech-runtime')
  const pinia = createPinia()
  const speechRuntimeStore = useRealSpeechRuntimeStore(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        redirect: '/lesson',
      },
      {
        path: '/lesson',
        component: LessonScenePage,
      },
    ],
  })

  const app = createApp({
    render: () => h(RouterView),
  })

  app.use(pinia)
  app.use(router)

  const host = document.createElement('div')
  document.body.innerHTML = ''
  document.body.appendChild(host)

  await router.push(initialPath)
  options.beforeMount?.({ pinia, speechRuntimeStore })
  app.mount(host)
  await router.isReady()
  await flushUi()

  return {
    app,
    lessonStore: useLessonStore(pinia),
    speechRuntimeStore,
    pinia,
    router,
  }
}

describeMockSmoke('/lesson browser smoke', () => {
  let mountedApp: ReturnType<typeof createApp> | null = null

  beforeEach(() => {
    resetLessonBrowserMockStores()
    setLessonApiBaseUrlForTest(lessonApiBaseUrl)
    vi.clearAllMocks()
    localStorage.clear()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mountedApp?.unmount()
    mountedApp = null
    setLessonApiBaseUrlForTest(undefined)
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('loads the catalog, resolves the route page, and auto-starts the first teacher turn against the real backend', async () => {
    const fetchSpy = installLessonApiMock([lessonTurnP24StartFixture])
    const { app } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(textContent()).toContain(lessonTurnP24StartFixture.teacher_response)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:9625/lesson/catalog', { method: 'GET' })
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_uid: 'TB-G5S1U3-P24',
        student_id: 'demo-student',
      }),
    })
    expect(textContent()).toContain('G5 S1 U3 · P24')
    expect(textContent()).toContain('重新开始')
    expect(textContent()).toContain('本轮能力')
    expect(textContent()).toContain('Live prompts')
    expect(textContent()).toContain('向量检索')
    expect(textContent()).toContain('命中：unit')
    expect(textContent()).toContain('注入：common_mistakes / stable_preferences')
    mountedApp = null
    app.unmount()
  })

  it('sends learner text and appends the next teacher turn', async () => {
    const fetchSpy = installLessonApiMock([
      lessonTurnP24StartFixture,
      lessonTurnP24AnswerFixture,
    ])
    const { app } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(textContent()).toContain('What would you like to drink?')
    })

    const draftInput = queryRequiredElement<HTMLTextAreaElement>('textarea')
    setControlValue(draftInput, `I'd like some water.`)
    await flushUi()
    clickButton('发送')

    await vi.waitFor(() => {
      expect(textContent()).toContain(lessonTurnP24AnswerFixture.teacher_response)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(textContent()).toContain(`I'd like some water.`)
    expect(textContent()).toContain('命中：branch')
    expect(textContent()).toContain('注入：common_mistakes / preferences / stable_preferences')
    expect(textContent()).toContain('召回：Learner gets shy when asked to answer aloud.')
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        page_uid: 'TB-G5S1U3-P24',
        student_id: 'demo-student',
        learner_input: `I'd like some water.`,
        state: cloneLessonFixture(lessonTurnP24StartFixture.state),
      }),
    })
    mountedApp = null
    app.unmount()
  })

  it('jumps to another page and restarts the lesson on the new page', async () => {
    const fetchSpy = installLessonApiMock([
      lessonTurnP24StartFixture,
      lessonTurnP25StartFixture,
    ])
    const { app, router } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(textContent()).toContain(lessonTurnP24StartFixture.teacher_response)
    })

    const pageUidInput = queryPageUidInput()
    setControlValue(pageUidInput, 'TB-G5S1U3-P25')
    await flushUi()
    clickButton('跳转')

    await vi.waitFor(() => {
      expect(textContent()).toContain(lessonTurnP25StartFixture.teacher_response)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(router.currentRoute.value.query.page_uid).toBe('TB-G5S1U3-P25')
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        page_uid: 'TB-G5S1U3-P25',
        student_id: 'demo-student',
      }),
    })
    expect(textContent()).toContain('G5 S1 U3 · P25')
    mountedApp = null
    app.unmount()
  })

  it('switches scope through the grouped selector and restarts the lesson on the new cross-scope page', async () => {
    const fetchSpy = installLessonApiMock([
      lessonTurnG6S2Recycle2P49StartFixture,
      lessonTurnG6S1U1P2StartFixture,
    ])
    const { app, lessonStore, router } = await mountLessonPage('/lesson?page_uid=TB-G6S2Recycle2-P49')
    mountedApp = app

    await vi.waitFor(() => {
      expect(textContent()).toContain(lessonTurnG6S2Recycle2P49StartFixture.teacher_response)
      expect(textContent()).toContain('G6 S2 Recycle2 · P49')
      expect(queryPageUidInput().value).toBe('TB-G6S2Recycle2-P49')
    })

    clickRadioTab('S1')
    await flushUi()

    await vi.waitFor(() => {
      expect(textContent()).toContain(lessonTurnG6S1U1P2StartFixture.teacher_response)
      expect(textContent()).toContain('G6 S1 U1 · P2')
      expect(queryPageUidInput().value).toBe('TB-G6S1U1-P2')
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G6S1U1-P2')
      expect(lessonStore.selectedGrade).toBe('G6')
      expect(lessonStore.selectedSemester).toBe('S1')
      expect(lessonStore.selectedUnit).toBe('U1')
      expect(lessonStore.selectedPageUid).toBe('TB-G6S1U1-P2')
      expect(localStorage.getItem('peptutor/lesson/last-page-uid')).toBe('TB-G6S1U1-P2')
    })

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        page_uid: 'TB-G6S2Recycle2-P49',
        student_id: 'demo-student',
      }),
    })
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        page_uid: 'TB-G6S1U1-P2',
        student_id: 'demo-student',
      }),
    })
    mountedApp = null
    app.unmount()
  })

  it('replays teacher prompts through the lesson speech runtime on start and repeat', async () => {
    installLessonApiMock([lessonTurnP24StartFixture])
    let runtimeSpy!: ReturnType<typeof spyOnLessonSpeechRuntime>
    const { app } = await mountLessonPage('/lesson?page_uid=TB-G5S1U3-P24', {
      beforeMount: ({ speechRuntimeStore }) => {
        runtimeSpy = spyOnLessonSpeechRuntime(speechRuntimeStore)
      },
    })
    mountedApp = app

    await vi.waitFor(() => {
      expect(runtimeSpy.openIntentSpy).toHaveBeenCalledTimes(1)
    })

    expect(runtimeSpy.stopByOwnerSpy).toHaveBeenNthCalledWith(1, 'peptutor-lesson', 'lesson-start')
    expect(runtimeSpy.literalWrites.join('')).toBe(lessonTurnP24StartFixture.teacher_response)
    expect(runtimeSpy.flushCount).toBe(1)
    expect(runtimeSpy.endCount).toBe(1)

    clickButton('再听一遍')
    await flushUi()

    await vi.waitFor(() => {
      expect(runtimeSpy.openIntentSpy).toHaveBeenCalledTimes(2)
    })

    expect(runtimeSpy.stopByOwnerSpy).toHaveBeenNthCalledWith(2, 'peptutor-lesson', 'lesson-repeat')
    await vi.waitFor(() => {
      expect(runtimeSpy.literalWrites.join('')).toBe(
        `${lessonTurnP24StartFixture.teacher_response}${lessonTurnP24StartFixture.teacher_response}`,
      )
      expect(runtimeSpy.flushCount).toBe(2)
      expect(runtimeSpy.endCount).toBe(2)
    })
    mountedApp = null
    app.unmount()
  })

  it('opens the lesson microphone, starts streaming transcription, and backfills the learner draft', async () => {
    installLessonApiMock([lessonTurnP24StartFixture])
    const { app } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(textContent()).toContain(lessonTurnP24StartFixture.teacher_response)
    })

    clickButton('打开麦克风')

    await vi.waitFor(() => {
      expect(mockAudioDeviceStore.askPermission).toHaveBeenCalledTimes(1)
      expect(mockAudioDeviceStore.startStream).toHaveBeenCalledTimes(1)
      expect(mockHearingPipeline.transcribeForMediaStream).toHaveBeenCalledTimes(1)
    })

    expect(textContent()).toContain('停止听写')
    emitMockTranscriptionSentence(`I'd like some water.`)
    await flushUi()

    const draftInput = queryRequiredElement<HTMLTextAreaElement>('textarea')
    expect(draftInput.value).toContain(`I'd like some water.`)

    clickButton('停止听写')
    await flushUi()

    await vi.waitFor(() => {
      expect(mockHearingPipeline.stopStreamingTranscription).toHaveBeenCalled()
    })

    expect(textContent()).toContain('打开麦克风')
    mountedApp = null
    app.unmount()
  })
})

describeRealSmoke('/lesson browser smoke (real backend)', () => {
  let mountedApp: ReturnType<typeof createApp> | null = null

  beforeEach(() => {
    resetLessonBrowserMockStores()
    setLessonApiBaseUrlForTest(lessonApiBaseUrl)
    vi.clearAllMocks()
    localStorage.clear()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mountedApp?.unmount()
    mountedApp = null
    setLessonApiBaseUrlForTest(undefined)
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('loads the catalog, resolves the route page, and auto-starts the first teacher turn', async () => {
    const startedAtMs = Date.now()
    const { app, lessonStore } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(lessonStore.transcript).toHaveLength(1)
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P24')
      expect(lessonStore.activeTurn?.turn_label).toBe('page_entry')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
    }, { timeout: smokeWaitTimeoutMs })

    const teacherResponse = lastTeacherTranscriptText(lessonStore)
    expectRealTeacherResponse(teacherResponse)
    expect(textContent()).toContain('G5 S1 U3 · P24')
    expect(textContent()).toContain('重新开始')
    logRealSmokeObservation('loads the catalog, resolves the route page, and auto-starts the first teacher turn against the real backend', startedAtMs, teacherResponse)
    mountedApp = null
    app.unmount()
  }, smokeTestTimeoutMs)

  it('sends learner text and appends the next teacher turn against the real backend', async () => {
    const startedAtMs = Date.now()
    const { app, lessonStore } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
      expect(lessonStore.transcript).toHaveLength(1)
    }, { timeout: smokeWaitTimeoutMs })

    const initialTeacherResponse = lastTeacherTranscriptText(lessonStore)
    const draftInput = queryRequiredElement<HTMLTextAreaElement>('textarea')
    setControlValue(draftInput, `I'd like some water.`)
    await flushUi()
    clickButton('发送')

    await vi.waitFor(() => {
      expect(lessonStore.transcript).toHaveLength(3)
      expect(lessonStore.transcript[1]?.speaker).toBe('learner')
      expect(lessonStore.transcript[1]?.text).toBe(`I'd like some water.`)
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(initialTeacherResponse)
    }, { timeout: smokeWaitTimeoutMs })

    const teacherResponse = lastTeacherTranscriptText(lessonStore)
    expectRealTeacherResponse(teacherResponse)
    expect(textContent()).toContain(`I'd like some water.`)
    logRealSmokeObservation('sends learner text and appends the next teacher turn against the real backend', startedAtMs, teacherResponse)
    mountedApp = null
    app.unmount()
  }, smokeTestTimeoutMs)

  it('jumps to another page and restarts the lesson on the new page against the real backend', async () => {
    const startedAtMs = Date.now()
    const { app, lessonStore, router } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P24')
    }, { timeout: smokeWaitTimeoutMs })

    const initialTeacherResponse = lastTeacherTranscriptText(lessonStore)
    const pageUidInput = queryPageUidInput()
    setControlValue(pageUidInput, 'TB-G5S1U3-P25')
    await flushUi()
    clickButton('跳转')

    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G5S1U3-P25')
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P25')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(initialTeacherResponse)
    }, { timeout: smokeWaitTimeoutMs })

    const teacherResponse = lastTeacherTranscriptText(lessonStore)
    expectRealTeacherResponse(teacherResponse)
    expect(textContent()).toContain('G5 S1 U3 · P25')
    logRealSmokeObservation('jumps to another page and restarts the lesson on the new page against the real backend', startedAtMs, teacherResponse)
    mountedApp = null
    app.unmount()
  }, smokeTestTimeoutMs)

  it('keeps browser lesson routing stable across P24 -> P25 -> P26 and preserves the P26 snow interruption', async () => {
    const startedAtMs = Date.now()
    const { capturedTurnResults } = installRealLessonApiCapture()
    const { app, lessonStore, router } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(capturedTurnResults.length).toBeGreaterThanOrEqual(1)
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P24')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
    }, { timeout: smokeWaitTimeoutMs })

    const p24TeacherResponse = lastTeacherTranscriptText(lessonStore)
    setControlValue(queryPageUidInput(), 'TB-G5S1U3-P25')
    await flushUi()
    clickButton('跳转')

    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G5S1U3-P25')
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P25')
      expect(lessonStore.activeTurn?.turn_label).toBe('page_entry')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(p24TeacherResponse)
    }, { timeout: smokeWaitTimeoutMs })

    const p25TeacherResponse = lastTeacherTranscriptText(lessonStore)
    setControlValue(queryPageUidInput(), 'TB-G5S1U3-P26')
    await flushUi()
    clickButton('跳转')

    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G5S1U3-P26')
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P26')
      expect(lessonStore.runtimeState?.current_block_uid).toBe('TB-G5S1U3-P26-D2')
      expect(lessonStore.activeTurn?.turn_label).toBe('page_entry')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(p25TeacherResponse)
    }, { timeout: smokeWaitTimeoutMs })

    const p26TeacherResponse = lastTeacherTranscriptText(lessonStore)
    expectRealTeacherResponse(p26TeacherResponse)
    expect(textContent()).toContain('G5 S1 U3 · P26')

    const draftInput = queryRequiredElement<HTMLTextAreaElement>('textarea')
    setControlValue(draftInput, 'What does snow mean?')
    await flushUi()
    clickButton('发送')

    await vi.waitFor(() => {
      const latestTurn = capturedTurnResults.at(-1)
      expect(lessonStore.activeTurn?.turn_label).toBe('ask_knowledge')
      expect(lessonStore.runtimeState?.current_block_uid).toBe('TB-G5S1U3-P26-D2')
      expect(lessonStore.runtimeState?.awaiting_answer).toBe(true)
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(p26TeacherResponse)
      expect(latestTurn?.turn_label).toBe('ask_knowledge')
      expect(['block', 'page', 'unit']).toContain(latestTurn?.retrieval_mode)
      expect(latestTurn?.state.current_block_uid).toBe('TB-G5S1U3-P26-D2')
      expect(latestTurn?.state.awaiting_answer).toBe(true)
      expect(latestTurn?.retrieved_block_uids).toContain('TB-G5S1U3-P26-D1')
    }, { timeout: smokeWaitTimeoutMs })

    const latestTurn = capturedTurnResults.at(-1)
    if (!latestTurn) {
      throw new Error('Expected to capture the real backend P26 knowledge-interruption turn.')
    }

    expectRealTeacherResponse(latestTurn.teacher_response)
    expect(latestTurn.teacher_response).toMatch(/snow|雪/i)

    if (expectRealLessonDebugSignals) {
      if (!latestTurn.debug_signals) {
        throw new Error('Expected the real backend P26 interruption turn to include debug_signals. Start LightRAG with PEPTUTOR_DEBUG_SIGNALS=1.')
      }

      expect(latestTurn.debug_signals.live_prompts.enabled).toBe(true)
      expectRenderedDebugSignals(latestTurn.debug_signals)
    }

    logRealSmokeObservation(
      'keeps browser lesson routing stable across P24 -> P25 -> P26 and preserves the P26 snow interruption',
      startedAtMs,
      latestTurn.teacher_response,
    )

    mountedApp = null
    app.unmount()
  }, smokeTestTimeoutMs)

  it('keeps browser lesson routing stable on G6 P13 while unit-vocabulary interruptions stay on the dialogue block', async () => {
    const startedAtMs = Date.now()
    const { capturedTurnResults } = installRealLessonApiCapture()
    const { app, lessonStore, router } = await mountLessonPage('/lesson?page_uid=TB-G6S2U2-P13')
    mountedApp = app

    await vi.waitFor(() => {
      const latestTurn = capturedTurnResults.at(-1)
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G6S2U2-P13')
      expect(capturedTurnResults.length).toBeGreaterThanOrEqual(1)
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G6S2U2-P13')
      expect(lessonStore.runtimeState?.current_block_uid).toBe('TB-G6S2U2-P13-D2')
      expect(lessonStore.runtimeState?.awaiting_answer).toBe(true)
      expect(lessonStore.activeTurn?.turn_label).toBe('page_entry')
      expect(latestTurn?.turn_label).toBe('page_entry')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
    }, { timeout: smokeWaitTimeoutMs })

    const pageEntryTurn = capturedTurnResults.at(-1)
    if (!pageEntryTurn) {
      throw new Error('Expected to capture the real backend G6 page-entry turn.')
    }

    expectRealTeacherResponse(pageEntryTurn.teacher_response)
    expect(/[\u4E00-\u9FFF]/.test(pageEntryTurn.teacher_response)).toBe(true)
    expect(textContent()).toContain('G6 S2 U2 · P13')

    const draftInput = queryRequiredElement<HTMLTextAreaElement>('textarea')
    setControlValue(draftInput, 'What does stayed at home mean?')
    await flushUi()
    clickButton('发送')

    await vi.waitFor(() => {
      const latestTurn = capturedTurnResults.at(-1)
      expect(lessonStore.activeTurn?.turn_label).toBe('ask_knowledge')
      expect(lessonStore.runtimeState?.current_block_uid).toBe('TB-G6S2U2-P13-D2')
      expect(lessonStore.runtimeState?.awaiting_answer).toBe(true)
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(pageEntryTurn.teacher_response)
      expect(latestTurn?.turn_label).toBe('ask_knowledge')
      expect(latestTurn?.retrieval_mode).toBe('unit')
      expect(latestTurn?.state.current_block_uid).toBe('TB-G6S2U2-P13-D2')
      expect(latestTurn?.state.awaiting_answer).toBe(true)
      expect(latestTurn?.retrieved_block_uids?.[0]).toBe('TB-G6S2U2-P15-D1')
    }, { timeout: smokeWaitTimeoutMs })

    const stayedHomeTurn = capturedTurnResults.at(-1)
    if (!stayedHomeTurn) {
      throw new Error('Expected to capture the real backend stayed-at-home interruption turn.')
    }

    expectRealTeacherResponse(stayedHomeTurn.teacher_response)
    expect(/[\u4E00-\u9FFF]/.test(stayedHomeTurn.teacher_response)).toBe(true)
    expect(stayedHomeTurn.teacher_response).toMatch(/stayed at home|待在家|在家/i)

    if (expectRealLessonDebugSignals) {
      if (!stayedHomeTurn.debug_signals) {
        throw new Error('Expected the real backend stayed-at-home interruption turn to include debug_signals. Start LightRAG with PEPTUTOR_DEBUG_SIGNALS=1.')
      }

      expect(stayedHomeTurn.debug_signals.live_prompts.enabled).toBe(true)
      expectRenderedDebugSignals(stayedHomeTurn.debug_signals)
    }

    setControlValue(draftInput, 'What does had a cold mean?')
    await flushUi()
    clickButton('发送')

    await vi.waitFor(() => {
      const latestTurn = capturedTurnResults.at(-1)
      expect(lessonStore.activeTurn?.turn_label).toBe('ask_knowledge')
      expect(lessonStore.runtimeState?.current_block_uid).toBe('TB-G6S2U2-P13-D2')
      expect(lessonStore.runtimeState?.awaiting_answer).toBe(true)
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(stayedHomeTurn.teacher_response)
      expect(latestTurn?.turn_label).toBe('ask_knowledge')
      expect(latestTurn?.retrieval_mode).toBe('unit')
      expect(latestTurn?.state.current_block_uid).toBe('TB-G6S2U2-P13-D2')
      expect(latestTurn?.state.awaiting_answer).toBe(true)
      expect(latestTurn?.retrieved_block_uids?.[0]).toBe('TB-G6S2U2-P17-D1')
    }, { timeout: smokeWaitTimeoutMs })

    const hadColdTurn = capturedTurnResults.at(-1)
    if (!hadColdTurn) {
      throw new Error('Expected to capture the real backend had-a-cold interruption turn.')
    }

    expectRealTeacherResponse(hadColdTurn.teacher_response)
    expect(/[\u4E00-\u9FFF]/.test(hadColdTurn.teacher_response)).toBe(true)
    expect(hadColdTurn.teacher_response).toMatch(/had a cold|have a cold|感冒/i)

    if (expectRealLessonDebugSignals) {
      if (!hadColdTurn.debug_signals) {
        throw new Error('Expected the real backend had-a-cold interruption turn to include debug_signals. Start LightRAG with PEPTUTOR_DEBUG_SIGNALS=1.')
      }

      expect(hadColdTurn.debug_signals.live_prompts.enabled).toBe(true)
      expectRenderedDebugSignals(hadColdTurn.debug_signals)
    }

    logRealSmokeObservation(
      'keeps browser lesson routing stable on G6 P13 while unit-vocabulary interruptions stay on the dialogue block',
      startedAtMs,
      hadColdTurn.teacher_response,
    )

    mountedApp = null
    app.unmount()
  }, smokeTestTimeoutMs)

  it('keeps non-pilot browser routing stable across G6 Recycle2 page changes and route recovery', async () => {
    const startedAtMs = Date.now()
    const { capturedTurnResults } = installRealLessonApiCapture()
    const { app, lessonStore, router } = await mountLessonPage('/lesson?page_uid=TB-G6S2Recycle2-P49')
    mountedApp = app

    await vi.waitFor(() => {
      const latestTurn = capturedTurnResults.at(-1)
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G6S2Recycle2-P49')
      expect(capturedTurnResults.length).toBeGreaterThanOrEqual(1)
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G6S2Recycle2-P49')
      expect(lessonStore.activeTurn?.turn_label).toBe('page_entry')
      expect(latestTurn?.turn_label).toBe('page_entry')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
    }, { timeout: smokeWaitTimeoutMs })

    const p49Turn = capturedTurnResults.at(-1)
    if (!p49Turn) {
      throw new Error('Expected to capture the real backend G6 Recycle2 P49 page-entry turn.')
    }

    expectRealTeacherResponse(p49Turn.teacher_response)
    expect(/[\u4E00-\u9FFF]/.test(p49Turn.teacher_response)).toBe(true)

    if (expectRealLessonDebugSignals) {
      if (!p49Turn.debug_signals) {
        throw new Error('Expected the real backend G6 Recycle2 P49 page-entry turn to include debug_signals. Start LightRAG with PEPTUTOR_DEBUG_SIGNALS=1.')
      }

      expect(p49Turn.debug_signals.live_prompts.enabled).toBe(true)
      expectRenderedDebugSignals(p49Turn.debug_signals)
    }

    const p49TeacherResponse = lastTeacherTranscriptText(lessonStore)
    setControlValue(queryPageUidInput(), 'TB-G6S2Recycle2-P51')
    await flushUi()
    clickButton('跳转')

    await vi.waitFor(() => {
      const latestTurn = capturedTurnResults.at(-1)
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G6S2Recycle2-P51')
      expect(queryPageUidInput().value).toBe('TB-G6S2Recycle2-P51')
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G6S2Recycle2-P51')
      expect(lessonStore.activeTurn?.turn_label).toBe('page_entry')
      expect(latestTurn?.turn_label).toBe('page_entry')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(p49TeacherResponse)
      expect(localStorage.getItem('peptutor/lesson/last-page-uid')).toBe('TB-G6S2Recycle2-P51')
    }, { timeout: smokeWaitTimeoutMs })

    const p51Turn = capturedTurnResults.at(-1)
    if (!p51Turn) {
      throw new Error('Expected to capture the real backend G6 Recycle2 P51 page-entry turn.')
    }

    expectRealTeacherResponse(p51Turn.teacher_response)
    expect(/[\u4E00-\u9FFF]/.test(p51Turn.teacher_response)).toBe(true)

    if (expectRealLessonDebugSignals) {
      if (!p51Turn.debug_signals) {
        throw new Error('Expected the real backend G6 Recycle2 P51 page-entry turn to include debug_signals. Start LightRAG with PEPTUTOR_DEBUG_SIGNALS=1.')
      }

      expect(p51Turn.debug_signals.live_prompts.enabled).toBe(true)
      expectRenderedDebugSignals(p51Turn.debug_signals)
    }

    await router.push('/lesson')
    await flushUi()

    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G6S2Recycle2-P51')
      expect(queryPageUidInput().value).toBe('TB-G6S2Recycle2-P51')
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G6S2Recycle2-P51')
      expect(lessonStore.selectedPageUid).toBe('TB-G6S2Recycle2-P51')
    }, { timeout: smokeWaitTimeoutMs })

    await router.push('/lesson?page_uid=TB-UNKNOWN-P404')
    await flushUi()

    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G6S2Recycle2-P51')
      expect(queryPageUidInput().value).toBe('TB-G6S2Recycle2-P51')
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G6S2Recycle2-P51')
      expect(lessonStore.selectedPageUid).toBe('TB-G6S2Recycle2-P51')
    }, { timeout: smokeWaitTimeoutMs })

    const stableTeacherResponse = lastTeacherTranscriptText(lessonStore)
    setControlValue(queryPageUidInput(), 'TB-UNKNOWN-P404')
    await flushUi()
    clickButton('跳转')

    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.page_uid).toBe('TB-G6S2Recycle2-P51')
      expect(queryPageUidInput().value).toBe('TB-G6S2Recycle2-P51')
      expect(lessonStore.runtimeState?.current_page_uid).toBe('TB-G6S2Recycle2-P51')
      expect(lessonStore.selectedPageUid).toBe('TB-G6S2Recycle2-P51')
      expect(lastTeacherTranscriptText(lessonStore)).toBe(stableTeacherResponse)
    }, { timeout: smokeWaitTimeoutMs })

    logRealSmokeObservation(
      'keeps non-pilot browser routing stable across G6 Recycle2 page changes and route recovery',
      startedAtMs,
      p51Turn.teacher_response,
    )

    mountedApp = null
    app.unmount()
  }, smokeTestTimeoutMs)

  itRealDebugSmoke('renders debug_signals from the real backend turn instead of fixture defaults', async () => {
    const { capturedTurnResults } = installRealLessonApiCapture()
    const { app, lessonStore } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(lessonStore.transcript).toHaveLength(1)
      expect(capturedTurnResults.length).toBeGreaterThanOrEqual(1)
      expect(capturedTurnResults.at(-1)?.debug_signals).toBeTruthy()
      expect(textContent()).toContain('本轮能力')
    }, { timeout: smokeWaitTimeoutMs })

    const debugSignals = capturedTurnResults.at(-1)?.debug_signals
    if (!debugSignals) {
      throw new Error('Expected real backend /lesson/turn response to include debug_signals. Start LightRAG with PEPTUTOR_DEBUG_SIGNALS=1.')
    }

    expectRenderedDebugSignals(debugSignals)

    logRealDebugSignalsObservation(
      'renders debug_signals from the real backend turn instead of fixture defaults',
      debugSignals,
    )

    mountedApp = null
    app.unmount()
  }, smokeTestTimeoutMs)

  itRealDebugSmoke('keeps the debug_signals card aligned with the latest real backend turn after learner input', async () => {
    const { capturedTurnResults } = installRealLessonApiCapture()
    const { app, lessonStore } = await mountLessonPage()
    mountedApp = app

    await vi.waitFor(() => {
      expect(capturedTurnResults.length).toBeGreaterThanOrEqual(1)
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe('')
    }, { timeout: smokeWaitTimeoutMs })

    const initialTeacherResponse = lastTeacherTranscriptText(lessonStore)
    const draftInput = queryRequiredElement<HTMLTextAreaElement>('textarea')
    setControlValue(draftInput, `I'd like some water.`)
    await flushUi()
    clickButton('发送')

    await vi.waitFor(() => {
      expect(capturedTurnResults.length).toBeGreaterThanOrEqual(2)
      expect(lessonStore.transcript).toHaveLength(3)
      expect(lastTeacherTranscriptText(lessonStore)).not.toBe(initialTeacherResponse)
    }, { timeout: smokeWaitTimeoutMs })

    const latestTurn = capturedTurnResults.at(-1)
    if (!latestTurn?.debug_signals) {
      throw new Error('Expected latest real backend /lesson/turn response to include debug_signals after learner input.')
    }

    expect(lessonStore.activeTurn?.teacher_response).toBe(latestTurn.teacher_response)
    expectRenderedDebugSignals(latestTurn.debug_signals)

    logRealDebugSignalsObservation(
      'keeps the debug_signals card aligned with the latest real backend turn after learner input',
      latestTurn.debug_signals,
    )

    mountedApp = null
    app.unmount()
  }, smokeTestTimeoutMs)
})
