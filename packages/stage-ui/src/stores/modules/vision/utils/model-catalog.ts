export interface VisionModelInfo {
  id: string
  name: string
  description: string
  tags: string[]
  recommendedFor: string[]
  deprecated?: boolean
  customizable?: boolean
}

export const VISION_MODEL_CATALOG: VisionModelInfo[] = [
  {
    id: 'gpt-4o-mini-vision',
    name: 'GPT-4o mini (Vision)',
    description: 'Fast and cost-efficient for screen UI understanding and lightweight OCR.',
    tags: ['fast', 'ui', 'ocr'],
    recommendedFor: ['UI navigation', 'Quick captions', 'Low-latency feedback'],
  },
  {
    id: 'gpt-4o-vision',
    name: 'GPT-4o (Vision)',
    description: 'Stronger reasoning on complex layouts and multi-window scenes.',
    tags: ['accurate', 'ui', 'reasoning'],
    recommendedFor: ['Dense UIs', 'Multi-step analysis', 'Ambiguous screens'],
  },
  {
    id: 'claude-3.5-sonnet-vision',
    name: 'Claude 3.5 Sonnet (Vision)',
    description: 'Balanced quality for diagrams, docs, and structured UI reading.',
    tags: ['balanced', 'documents', 'charts'],
    recommendedFor: ['Docs and dashboards', 'Diagram reading', 'Summaries'],
  },
  {
    id: 'gemini-1.5-pro-vision',
    name: 'Gemini 1.5 Pro (Vision)',
    description: 'Great for longer-context screen stories and multi-step tasks.',
    tags: ['long-context', 'reasoning'],
    recommendedFor: ['Long sessions', 'Workflow tracking', 'Large screens'],
  },
  {
    id: 'llava-1.6',
    name: 'LLaVA 1.6 (Local)',
    description: 'Local-friendly baseline for offline or privacy-focused setups.',
    tags: ['local', 'offline'],
    recommendedFor: ['Offline mode', 'On-device evaluation', 'Privacy-first use'],
  },
  {
    id: 'custom',
    name: 'Custom Model',
    description: 'Use your own vision model ID from a provider or local runtime.',
    tags: ['custom'],
    recommendedFor: ['Self-hosted models', 'Experimental runtimes'],
    customizable: true,
  },
]
