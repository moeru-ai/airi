export type LessonEvaluationResult
  = | 'correct'
    | 'acceptable'
    | 'partially_correct'
    | 'incorrect'
    | 'off_topic'
    | 'unclear'

export type LessonTurnLabel
  = | 'page_entry'
    | 'answer_question'
    | 'ask_knowledge'
    | 'ask_help'
    | 'navigation'
    | 'social'

export type LessonTeachingAction
  = | 'page_intro'
    | 'probe'
    | 'confirm'
    | 'hint'
    | 'model'
    | 'repeat_drill'
    | 'explain'
    | 'redirect'
    | 'complete'

export type LessonRetrievalMode = 'none' | 'block' | 'page' | 'unit' | 'branch'

export type LessonActivityType
  = | 'page_entry'
    | 'teaching'
    | 'practice'
    | 'review'
    | 'branch'

export interface LessonRuntimeState {
  student_id: string
  current_grade: string
  current_semester: string
  current_unit: string
  current_page: number
  current_page_uid: string
  current_page_type: string
  current_block_uid: string | null
  current_activity_type: LessonActivityType
  awaiting_answer: boolean
  last_teacher_question: string | null
  hint_level: number
  pedagogy_level: number
  page_entry_probe_done: boolean
  repair_mode: string
  recent_turn_labels: string[]
  same_goal_attempt_count: number
  last_eval_result: LessonEvaluationResult | null
  model_already_given: boolean
  branch_active: boolean
  branch_reason: string | null
  branch_origin_block_uid: string | null
  branch_turn_budget: number | null
  return_anchor: string | null
  return_target: string | null
  simplemem_content_session_id: string | null
  simplemem_memory_session_id: string | null
}

export interface LessonLivePromptsDebugSignal {
  enabled: boolean
}

export interface LessonVectorRetrievalDebugSignal {
  enabled: boolean
  hit_modes: LessonRetrievalMode[]
}

export interface LessonPromptMemoryDebugSignal {
  enabled: boolean
  injected_buckets: string[]
}

export interface LessonSemanticRecallDebugSignal {
  enabled: boolean
  recalled_memories: string[]
}

export interface LessonTurnDebugSignals {
  live_prompts: LessonLivePromptsDebugSignal
  vector_retrieval: LessonVectorRetrievalDebugSignal
  prompt_memory: LessonPromptMemoryDebugSignal
  semantic_recall: LessonSemanticRecallDebugSignal
}

export interface LessonTurnResult {
  page_uid: string
  block_uid: string | null
  turn_label: LessonTurnLabel
  teaching_action: LessonTeachingAction
  retrieval_mode: LessonRetrievalMode
  teacher_response: string
  state: LessonRuntimeState
  evaluation: LessonEvaluationResult | null
  retrieved_block_uids: string[]
  support_entry_uids: string[]
  return_anchor: string | null
  branch_reason: string | null
  debug_signals?: LessonTurnDebugSignals
}

export interface LessonTranscriptEntry {
  id: string
  speaker: 'teacher' | 'learner' | 'system'
  text: string
  created_at: number
  local_only?: boolean
  turn_label?: LessonTurnLabel
  teaching_action?: LessonTeachingAction
  retrieval_mode?: LessonRetrievalMode
  evaluation?: LessonEvaluationResult | null
}

export interface LessonPageOption {
  label: string
  value: string
  description: string
}

export interface LessonScopeOption {
  label: string
  value: string
}

export interface LessonCatalogPageRecord {
  page_uid: string
  page: number
  page_type: string
  page_intro_cn: string
}

export interface LessonCatalogScopeRecord {
  grade: string
  semester: string
  unit: string
  pages: LessonCatalogPageRecord[]
}

export interface LessonCatalogOutline {
  scope_count: number
  page_count: number
  block_count: number
  scopes: LessonCatalogScopeRecord[]
}

const lessonPilotManifestProjection = {
  grade: 'G5',
  semester: 'S1',
  unit: 'U3',
  pages: [24, 25, 26, 27, 28, 29, 30, 31],
  pageDescriptions: {
    24: '点餐与饮料句型',
    25: '菜单阅读与 salad',
    26: '早餐支线话题',
    27: '点餐对话复用',
    28: '食物描述与形容词',
    29: '阅读理解与偏好表达',
    30: '单元复习与复数练习',
    31: '故事阅读与农场话题',
  } satisfies Record<number, string>,
} as const

export const lessonPilotCatalogOutline: LessonCatalogOutline = {
  scope_count: 1,
  page_count: lessonPilotManifestProjection.pages.length,
  block_count: lessonPilotManifestProjection.pages.length,
  scopes: [{
    grade: lessonPilotManifestProjection.grade,
    semester: lessonPilotManifestProjection.semester,
    unit: lessonPilotManifestProjection.unit,
    pages: lessonPilotManifestProjection.pages.map(page => ({
      page_uid: `TB-${lessonPilotManifestProjection.grade}${lessonPilotManifestProjection.semester}${lessonPilotManifestProjection.unit}-P${page}`,
      page,
      page_type: 'pilot',
      page_intro_cn: lessonPilotManifestProjection.pageDescriptions[page],
    })),
  }],
}

export function buildLessonScopeLabel(scope: Pick<LessonCatalogScopeRecord, 'grade' | 'semester' | 'unit'>): string {
  return `${scope.grade} ${scope.semester} ${scope.unit}`
}

export function buildLessonPageOptionsFromCatalog(catalog: LessonCatalogOutline): LessonPageOption[] {
  return catalog.scopes.flatMap(scope =>
    scope.pages.map(page => ({
      label: `${buildLessonScopeLabel(scope)} · P${page.page}`,
      value: page.page_uid,
      description: `${page.page_type} · ${page.page_intro_cn}`,
    })),
  )
}

export function buildLessonPageOptionsFromScope(scope: LessonCatalogScopeRecord): LessonPageOption[] {
  return scope.pages.map(page => ({
    label: `P${page.page}`,
    value: page.page_uid,
    description: `${page.page_type} · ${page.page_intro_cn}`,
  }))
}

export function findLessonCatalogScopeByPageUid(
  catalog: LessonCatalogOutline,
  pageUid: string,
): LessonCatalogScopeRecord | null {
  const normalizedPageUid = pageUid.trim()
  if (!normalizedPageUid) {
    return null
  }

  return catalog.scopes.find(scope =>
    scope.pages.some(page => page.page_uid === normalizedPageUid),
  ) || null
}

export const lessonPilotPageOptions: LessonPageOption[] = buildLessonPageOptionsFromCatalog(lessonPilotCatalogOutline)

export const lessonActivityTypeLabels: Record<LessonActivityType, string> = {
  page_entry: '页面进入',
  teaching: '教学中',
  practice: '练习中',
  review: '复习中',
  branch: '支线展开',
}

export const lessonTurnLabelLabels: Record<LessonTurnLabel, string> = {
  page_entry: '开场',
  answer_question: '回答题目',
  ask_knowledge: '知识提问',
  ask_help: '求助',
  navigation: '导航',
  social: '闲聊回收',
}

export const lessonTeachingActionLabels: Record<LessonTeachingAction, string> = {
  page_intro: '页面导入',
  probe: '探测',
  confirm: '确认',
  hint: '提示',
  model: '示范',
  repeat_drill: '重复操练',
  explain: '解释',
  redirect: '回主线',
  complete: '完成',
}

export const lessonRetrievalModeLabels: Record<LessonRetrievalMode, string> = {
  none: '无检索',
  block: '当前块',
  page: '当前页',
  unit: '当前单元',
  branch: '支线',
}
