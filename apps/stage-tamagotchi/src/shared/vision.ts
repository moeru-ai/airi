/**
 * 视觉系统 IPC 契约
 * 定义主进程与渲染进程之间的通信接口
 */

// 视觉模型类型
export type VisionModelType
  = | 'doubao-1.6-vision'
    | 'gemini-3-pro'
    | 'gemini-3-flash'
    | 'qwen2.5-vl'
    | 'ui-tars'

// 触发方式
export type TriggerMode = 'manual' | 'voice' | 'auto' | 'event'

// 窗口信息
export interface WindowInfo {
  id: number
  title: string
  owner: {
    name: string
    processId: number
  }
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}

// 敏感信息类型
export type SensitiveType
  = | 'email'
    | 'phone'
    | 'creditCard'
    | 'ssn'
    | 'password'
    | 'apiKey'
    | 'token'
    | 'ipAddress'
    | 'url'
    | 'name'
    | 'address'

// 隐私配置
export interface PrivacyConfig {
  enabled: boolean
  protectedTypes: SensitiveType[]
  customSensitiveWords: string[]
  maskMode: 'mask' | 'remove' | 'hash'
  maskKeepPrefix: number
  maskKeepSuffix: number
  maskChar: string
}

// 性能配置
export interface PerformanceConfig {
  enableCache: boolean
  maxCacheSize: number
  cacheTTL: number
  throttleInterval: number
  imageQuality: number
  maxImageDimension: number
  enableCompression: boolean
  enableChangeDetection: boolean
  changeThreshold: number
}

// 视觉配置
export interface VisionConfig {
  enabled: boolean
  model: VisionModelType
  apiKey?: string
  apiEndpoint?: string
  localModelEndpoint?: string
  triggerMode: TriggerMode
  autoInterval: number // 轮询间隔（毫秒）
  captureOnEvent: boolean
  privacyMode: boolean
  saveHistory: boolean
  maxHistoryItems: number
  sensitiveAreas: Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  privacy?: PrivacyConfig
  performance?: PerformanceConfig
}

// 分析结果
export interface AnalysisResult {
  description: string
  text?: string // 分析文本内容（用于隐私保护）
  elements?: Array<{
    type: string
    text?: string
    bounds?: {
      x: number
      y: number
      width: number
      height: number
    }
  }>
  extractedData?: Record<string, unknown>
  confidence: number
  timestamp: number
}

// 操作类型
export type ActionType = 'click' | 'doubleClick' | 'rightClick' | 'type' | 'scroll' | 'keypress'

// 操作定义
export interface Action {
  type: ActionType
  target?: string
  coordinates?: {
    x: number
    y: number
  }
  text?: string
  scrollAmount?: number
  key?: string
}

// 视觉状态
export interface VisionState {
  isCapturing: boolean
  isAnalyzing: boolean
  lastScreenshot?: string // base64
  lastAnalysis?: AnalysisResult
  error?: string
}

// 授权状态
export interface VisionAuthState {
  isAuthorized: boolean
  authTime?: number
  lastPromptTime?: number
  denyCount: number
}

// IPC 通道名称
export const VISION_CHANNELS = {
  // 屏幕捕获
  CAPTURE_SCREEN: 'vision:captureScreen',
  CAPTURE_WINDOW: 'vision:captureWindow',
  GET_ACTIVE_WINDOW: 'vision:getActiveWindow',
  LIST_WINDOWS: 'vision:listWindows',

  // 分析
  ANALYZE_SCREEN: 'vision:analyzeScreen',
  EXECUTE_ACTION: 'vision:executeAction',

  // 配置
  GET_CONFIG: 'vision:getConfig',
  SET_CONFIG: 'vision:setConfig',

  // 状态
  GET_STATE: 'vision:getState',

  // 授权
  GET_AUTH_STATE: 'vision:getAuthState',
  REQUEST_AUTH: 'vision:requestAuth',
  GRANT_AUTH: 'vision:grantAuth',
  REVOKE_AUTH: 'vision:revokeAuth',

  // 事件
  ON_SCREEN_CAPTURED: 'vision:onScreenCaptured',
  ON_ANALYSIS_COMPLETE: 'vision:onAnalysisComplete',
  ON_ERROR: 'vision:onError',
  ON_AUTH_CHANGED: 'vision:onAuthChanged',
} as const

// 主进程 API 接口
export interface VisionMainAPI {
  // 屏幕捕获
  captureScreen: () => Promise<Buffer>
  captureWindow: (windowId: number) => Promise<Buffer>
  getActiveWindow: () => Promise<WindowInfo | null>
  listWindows: () => Promise<WindowInfo[]>

  // 分析
  analyzeScreen: (image: Buffer, prompt?: string) => Promise<AnalysisResult>
  executeAction: (action: Action) => Promise<void>

  // 配置
  getConfig: () => Promise<VisionConfig>
  setConfig: (config: Partial<VisionConfig>) => Promise<void>

  // 状态
  getState: () => Promise<VisionState>
}

// 默认配置
export const DEFAULT_VISION_CONFIG: VisionConfig = {
  enabled: false,
  model: 'doubao-1.6-vision',
  triggerMode: 'manual',
  autoInterval: 5000,
  captureOnEvent: false,
  privacyMode: false,
  saveHistory: false,
  maxHistoryItems: 10,
  sensitiveAreas: [],
}

// 视觉指令关键词（用于聊天触发）
export const VISION_COMMANDS = [
  '看看',
  '看一下',
  '帮我看看',
  '看看屏幕',
  '这是什么',
  '截图',
  '分析屏幕',
  '查看屏幕',
  '看看这个',
]

// 检查消息是否包含视觉指令
export function containsVisionCommand(message: string): boolean {
  const lowerMessage = message.toLowerCase()
  return VISION_COMMANDS.some(cmd => lowerMessage.includes(cmd))
}
