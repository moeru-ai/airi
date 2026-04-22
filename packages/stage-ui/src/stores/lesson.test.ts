import type { LessonTurnResult } from '../types/lesson'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cloneLessonFixture,
  lessonCatalogFixture,
  lessonJsonResponse,
  lessonTurnP24AnswerFixture,
  lessonTurnP24RestartStartFixture,
  lessonTurnP24StartFixture,
  lessonTurnP25StartFixture,
  lessonTurnP31StartFixture,
} from '../testing/lesson-api-fixtures'
import { setLessonApiBaseUrlForTest, useLessonStore } from './lesson'
import { useSpeechRuntimeStore } from './speech-runtime'

function createLocalStorageMock() {
  const backingStore = new Map<string, string>()

  return {
    getItem(key: string) {
      return backingStore.has(key) ? backingStore.get(key)! : null
    },
    setItem(key: string, value: string) {
      backingStore.set(key, String(value))
    },
    removeItem(key: string) {
      backingStore.delete(key)
    },
    clear() {
      backingStore.clear()
    },
    key(index: number) {
      return [...backingStore.keys()][index] ?? null
    },
    get length() {
      return backingStore.size
    },
  }
}

function mockSpeechRuntimeStore() {
  const speechRuntimeStore = useSpeechRuntimeStore()
  const intent = {
    intentId: 'lesson-intent',
    streamId: 'lesson-stream',
    ownerId: 'peptutor-lesson',
    priority: 1,
    stream: new ReadableStream(),
    writeLiteral: vi.fn(),
    writeSpecial: vi.fn(),
    writeFlush: vi.fn(),
    end: vi.fn(),
    cancel: vi.fn(),
  }

  speechRuntimeStore.stopByOwner = vi.fn()
  speechRuntimeStore.openIntent = vi.fn(() => intent)

  return {
    speechRuntimeStore,
    intent,
  }
}

function literalWrites(intent: { writeLiteral: ReturnType<typeof vi.fn> }) {
  return intent.writeLiteral.mock.calls.map(call => String(call[0] ?? '')).join('')
}

function catalogResponse() {
  return lessonJsonResponse(cloneLessonFixture(lessonCatalogFixture))
}

function turnResponse(result: LessonTurnResult) {
  return lessonJsonResponse(cloneLessonFixture(result))
}

function mockLessonTurnFetch(...results: LessonTurnResult[]) {
  const fetchSpy = vi.fn()

  for (const result of results) {
    fetchSpy.mockResolvedValueOnce(turnResponse(result))
  }

  return fetchSpy
}

describe('store lesson', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setLessonApiBaseUrlForTest('http://127.0.0.1:9625')
  })

  afterEach(() => {
    setLessonApiBaseUrlForTest(undefined)
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('falls back to the pilot page list and resets to the first page', () => {
    const store = useLessonStore()

    expect(store.availablePages.map(page => page.value)).toEqual([
      'TB-G5S1U3-P24',
      'TB-G5S1U3-P25',
      'TB-G5S1U3-P26',
      'TB-G5S1U3-P27',
      'TB-G5S1U3-P28',
      'TB-G5S1U3-P29',
      'TB-G5S1U3-P30',
      'TB-G5S1U3-P31',
    ])

    store.setSelectedPageUid('TB-G5S1U3-P31')
    store.resetLessonState()

    expect(store.selectedPageUid).toBe('TB-G5S1U3-P24')
  })

  it('appends streaming learner dictation into the draft input with stable spacing', () => {
    const store = useLessonStore()

    store.setDraftLearnerInput('I think')
    store.appendDraftLearnerInput('  the answer  ')
    store.appendDraftLearnerInput('')
    store.appendDraftLearnerInput('is on page twenty four.')

    expect(store.draftLearnerInput).toBe('I think the answer is on page twenty four.')
  })

  it('loads the lesson catalog from the backend and replaces the fallback page list', async () => {
    const fetchSpy = vi.fn(async () => catalogResponse())

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.loadCatalog()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:9625/lesson/catalog', {
      method: 'GET',
      headers: {},
    })
    expect(store.catalogLoaded).toBe(true)
    expect(store.availablePages.map(page => page.value)).toEqual([
      'TB-G5S1U3-P24',
      'TB-G6S1U1-P2',
      'TB-G6S2Recycle2-P49',
      'TB-G6S2Recycle2-P51',
    ])
    expect(store.availablePages[1]).toEqual({
      label: 'G6 S1 U1 · P2',
      value: 'TB-G6S1U1-P2',
      description: 'dialogue · 这一页进入六上第一单元的问路对话。',
    })
    expect(store.availablePages[2]).toEqual({
      label: 'G6 S2 Recycle2 · P49',
      value: 'TB-G6S2Recycle2-P49',
      description: 'phonics · 这一页复习告别派对里的语音分类。',
    })
    expect(store.selectedGrade).toBe('G5')
    expect(store.selectedSemester).toBe('S1')
    expect(store.selectedUnit).toBe('U3')
    expect(store.scopedPages.map(page => page.value)).toEqual(['TB-G5S1U3-P24'])
  })

  it('sends the lesson api key when loading the catalog from a protected backend', async () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_API_KEY', 'lesson-api-key')
    const fetchSpy = vi.fn(async () => catalogResponse())

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.loadCatalog()

    expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:9625/lesson/catalog', {
      method: 'GET',
      headers: {
        'X-API-Key': 'lesson-api-key',
      },
    })
  })

  it('switches the active scope and keeps the selected page inside the chosen unit', async () => {
    const fetchSpy = vi.fn(async () => catalogResponse())

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.loadCatalog()

    await store.selectLessonGrade('G6')

    expect(store.selectedGrade).toBe('G6')
    expect(store.selectedSemester).toBe('S1')
    expect(store.selectedUnit).toBe('U1')
    expect(store.selectedPageUid).toBe('TB-G6S1U1-P2')

    await store.selectLessonSemester('S2')

    expect(store.selectedSemester).toBe('S2')
    expect(store.selectedUnit).toBe('Recycle2')
    expect(store.selectedPageUid).toBe('TB-G6S2Recycle2-P49')
    expect(store.scopedPages.map(page => page.value)).toEqual([
      'TB-G6S2Recycle2-P49',
      'TB-G6S2Recycle2-P51',
    ])

    store.setSelectedPageUid('TB-G6S2Recycle2-P51')

    expect(store.selectedGrade).toBe('G6')
    expect(store.selectedSemester).toBe('S2')
    expect(store.selectedUnit).toBe('Recycle2')
    expect(store.selectedPageUid).toBe('TB-G6S2Recycle2-P51')
  })

  it('restores the last persisted lesson page after loading the backend catalog', async () => {
    const localStorageMock = createLocalStorageMock()
    localStorageMock.setItem('peptutor/lesson/last-page-uid', 'TB-G6S2Recycle2-P51')
    vi.stubGlobal('localStorage', localStorageMock)

    const fetchSpy = vi.fn(async () => catalogResponse())

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.loadCatalog()

    expect(store.selectedGrade).toBe('G6')
    expect(store.selectedSemester).toBe('S2')
    expect(store.selectedUnit).toBe('Recycle2')
    expect(store.selectedPageUid).toBe('TB-G6S2Recycle2-P51')
  })

  it('keeps the fallback page list when the catalog request fails', async () => {
    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({
        detail: 'catalog unavailable',
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.loadCatalog()

    expect(store.catalogLoaded).toBe(false)
    expect(store.availablePages[0]?.value).toBe('TB-G5S1U3-P24')
    expect(store.selectedPageUid).toBe('TB-G5S1U3-P24')
  })

  it('persists the selected lesson page when the user changes scope', async () => {
    const localStorageMock = createLocalStorageMock()
    vi.stubGlobal('localStorage', localStorageMock)

    const fetchSpy = vi.fn(async () => catalogResponse())

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.loadCatalog()
    await store.selectLessonGrade('G6')
    await store.selectLessonSemester('S2')
    await store.selectLessonPage('TB-G6S2Recycle2-P51')

    expect(localStorageMock.getItem('peptutor/lesson/last-page-uid')).toBe('TB-G6S2Recycle2-P51')
  })

  it('sends the lesson bearer token when starting a lesson against a protected backend', async () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_BEARER_TOKEN', 'lesson-jwt')
    const fetchSpy = vi.fn(async () => turnResponse(lessonTurnP24StartFixture))

    vi.stubGlobal('fetch', fetchSpy)
    mockSpeechRuntimeStore()

    const store = useLessonStore()
    await store.startLesson()

    expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:9625/lesson/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer lesson-jwt',
      },
      body: JSON.stringify({
        page_uid: 'TB-G5S1U3-P24',
        student_id: 'demo-student',
      }),
    })
  })

  it('keeps the current valid page when a manual jump requests an unknown page uid', async () => {
    const fetchSpy = vi.fn(async () => catalogResponse())

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.loadCatalog()
    await store.selectLessonGrade('G6')
    await store.selectLessonSemester('S2')
    await store.selectLessonPage('TB-G6S2Recycle2-P51')
    await store.selectLessonPage('TB-UNKNOWN-P404')

    expect(store.selectedGrade).toBe('G6')
    expect(store.selectedSemester).toBe('S2')
    expect(store.selectedUnit).toBe('Recycle2')
    expect(store.selectedPageUid).toBe('TB-G6S2Recycle2-P51')
  })

  it('starts a lesson session and records the teacher opening', async () => {
    const fetchSpy = mockLessonTurnFetch(lessonTurnP24StartFixture)

    vi.stubGlobal('fetch', fetchSpy)

    const { speechRuntimeStore, intent } = mockSpeechRuntimeStore()
    const store = useLessonStore()
    await store.startLesson('TB-G5S1U3-P24')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(store.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P24')
    expect(store.transcript).toHaveLength(1)
    expect(store.transcript[0]?.speaker).toBe('teacher')
    expect(store.currentTeacherPrompt).toBe('What would you like to drink?')
    expect(store.activeTurn?.debug_signals).toEqual(lessonTurnP24StartFixture.debug_signals)
    expect(speechRuntimeStore.stopByOwner).toHaveBeenCalledWith('peptutor-lesson', 'lesson-start')
    expect(speechRuntimeStore.openIntent).toHaveBeenCalledWith({
      ownerId: 'peptutor-lesson',
      priority: 'high',
      behavior: 'interrupt',
    })
    expect(literalWrites(intent)).toBe('这一页练习点餐和饮料表达。Can you say: What would you like to drink?')
    expect(intent.writeFlush).toHaveBeenCalledTimes(1)
    expect(intent.end).toHaveBeenCalledTimes(1)
  })

  it('continues a lesson turn and appends learner and teacher transcript entries', async () => {
    const fetchSpy = mockLessonTurnFetch(
      lessonTurnP24StartFixture,
      lessonTurnP24AnswerFixture,
    )

    vi.stubGlobal('fetch', fetchSpy)

    const { speechRuntimeStore, intent } = mockSpeechRuntimeStore()
    const store = useLessonStore()
    await store.startLesson('TB-G5S1U3-P24')
    await store.sendTurn(`I'd like some water.`)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(store.transcript).toHaveLength(3)
    expect(store.transcript[1]?.speaker).toBe('learner')
    expect(store.transcript[1]?.text).toBe(`I'd like some water.`)
    expect(store.transcript[2]?.speaker).toBe('teacher')
    expect(store.activeTurn?.evaluation).toBe('correct')
    expect(store.runtimeState?.current_block_uid).toBe('TB-G5S1U3-P24-D2')
    expect(store.activeTurn?.debug_signals).toEqual(lessonTurnP24AnswerFixture.debug_signals)
    expect(speechRuntimeStore.stopByOwner).toHaveBeenNthCalledWith(1, 'peptutor-lesson', 'lesson-start')
    expect(speechRuntimeStore.stopByOwner).toHaveBeenNthCalledWith(2, 'peptutor-lesson', 'lesson-turn')
    expect(literalWrites(intent)).toBe('这一页练习点餐和饮料表达。Can you say: What would you like to drink?对了。我们继续：Now say one full drink sentence.')
    expect(intent.writeFlush).toHaveBeenCalledTimes(2)
    expect(intent.end).toHaveBeenCalledTimes(2)
  })

  it('starts the final pilot page without changing the request contract', async () => {
    const fetchSpy = mockLessonTurnFetch(lessonTurnP31StartFixture)

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.startLesson('TB-G5S1U3-P31')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
      page_uid: 'TB-G5S1U3-P31',
      student_id: 'demo-student',
    }))
    expect(store.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P31')
    expect(store.currentPageTitle).toBe('G5 S1 U3 · P31')
  })

  it('updates the selected page without requesting a restart before the lesson begins', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.selectLessonPage('TB-G5S1U3-P25', { restartIfStarted: true })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(store.selectedPageUid).toBe('TB-G5S1U3-P25')
    expect(store.runtimeState).toBeNull()
  })

  it('restarts the lesson when selecting a different page after the session has started', async () => {
    const fetchSpy = mockLessonTurnFetch(
      lessonTurnP24RestartStartFixture,
      lessonTurnP25StartFixture,
    )

    vi.stubGlobal('fetch', fetchSpy)

    const store = useLessonStore()
    await store.startLesson('TB-G5S1U3-P24')
    await store.selectLessonPage('TB-G5S1U3-P25', { restartIfStarted: true })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({
      page_uid: 'TB-G5S1U3-P25',
      student_id: 'demo-student',
    }))
    expect(store.selectedPageUid).toBe('TB-G5S1U3-P25')
    expect(store.runtimeState?.current_page_uid).toBe('TB-G5S1U3-P25')
    expect(store.currentPageTitle).toBe('G5 S1 U3 · P25')
    expect(store.transcript).toHaveLength(1)
    expect(store.transcript[0]?.text).toContain('salad')
  })

  it('replays the latest teacher prompt through the lesson speech runtime', async () => {
    const { speechRuntimeStore, intent } = mockSpeechRuntimeStore()
    const store = useLessonStore()

    store.repeatTeacherPrompt()
    expect(speechRuntimeStore.openIntent).not.toHaveBeenCalled()

    store.transcript.push({
      id: 'teacher-1',
      created_at: Date.now(),
      speaker: 'teacher',
      text: 'Listen again: What would you like to drink?',
      turn_label: 'page_entry',
      teaching_action: 'page_intro',
      retrieval_mode: 'none',
      evaluation: null,
    })

    store.repeatTeacherPrompt()
    await vi.waitFor(() => {
      expect(intent.writeFlush).toHaveBeenCalledTimes(1)
    })

    expect(store.transcript).toHaveLength(2)
    expect(store.transcript[1]?.local_only).toBe(true)
    expect(store.transcript[1]?.text).toBe('Listen again: What would you like to drink?')
    expect(speechRuntimeStore.stopByOwner).toHaveBeenCalledWith('peptutor-lesson', 'lesson-repeat')
    expect(literalWrites(intent)).toBe('Listen again: What would you like to drink?')
    expect(intent.writeFlush).toHaveBeenCalledTimes(1)
    expect(intent.end).toHaveBeenCalledTimes(1)
  })
})
