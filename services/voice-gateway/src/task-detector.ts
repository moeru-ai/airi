const TASK_KEYWORDS = [
  '帮我',
  '帮忙',
  '发邮件',
  '发送',
  '查一下',
  '搜索',
  '搜一下',
  '提醒我',
  '设置闹钟',
  '记一下',
  '备忘',
  '创建',
  '删除',
  '打开',
  '关闭',
  '运行',
  '执行',
  '下载',
  '安装',
  '查询',
  '翻译',
  '计算',
  '预约',
  '预定',
  '订购',
]

const ACCEPTANCE_PHRASES = [
  '好的',
  '没问题',
  '马上',
  '稍等',
  '正在处理',
  '我来',
  '收到',
  '了解',
  '这就',
  '帮你',
]

export interface TaskDetectResult {
  isTask: boolean
  taskText: string
  confidence: number
}

export function detectTask(asrText: string, chatResponse?: string): TaskDetectResult {
  const text = asrText.trim()
  if (!text) {
    return { isTask: false, taskText: '', confidence: 0 }
  }

  let confidence = 0
  const matchedKeywords: string[] = []

  for (const keyword of TASK_KEYWORDS) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword)
      confidence += 0.3
    }
  }

  if (matchedKeywords.length === 0) {
    return { isTask: false, taskText: text, confidence: 0 }
  }

  // Cap keyword-based confidence at 0.7
  confidence = Math.min(confidence, 0.7)

  // Boost confidence if chat response contains acceptance phrases
  if (chatResponse) {
    for (const phrase of ACCEPTANCE_PHRASES) {
      if (chatResponse.includes(phrase)) {
        confidence = Math.min(confidence + 0.2, 1.0)
        break
      }
    }
  }

  return {
    isTask: confidence >= 0.3,
    taskText: text,
    confidence,
  }
}
