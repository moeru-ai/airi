import type { ManualCaptureSection } from '../shared/types'

const airiCardPattern = /sort|排序|upload|上传/i
const providersPattern = /Chat|Speech|Transcription/i
// NOTICE: Must stay unique to /settings/data. The prior alternates `chat` / `聊天`
// also matched the providers page, which renders a `Chat` / `聊天` provider category
// immediately before this step. That allowed the readiness check to pass against stale
// providers DOM and silently produce a mislabeled screenshot. `打开` was also too
// generic because it appears on multiple pages as button labels. `Open app data folder`
// is the desktop-folder section title and is literal English across every locale file.
const dataPattern = /Open app data folder/i
const systemGeneralPattern = /theme|主题|language|语言/i
const systemColorSchemePattern = /RGB|Primary Color|主题颜色|500\/50/i
const modelsPattern = /select model|confirm|缩放与位置|Zoom & Position/i
const modulesPattern = /Consciousness|意识|Speech|发声|Hearing|听觉/i
const hearingPattern = /Audio Input Device|音频输入设备|Start Monitoring|Transcription Result/i
const developerPattern = /Open DevTools|打开|Markdown|Lag|Vision Capture|Screen Capture/i
// NOTICE: Anchor on the consciousness page's always-rendered section description.
// Previous alternates like `提供商` / `No Providers Configured` did not match zh-Hans,
// and `当前模型` / `Current model` only appear when a model is already selected.
// Fresh environments with no providers configured would hang without this pattern.
//
// Caveat: vision.vue reuses the same i18n key, so this also matches on
// /settings/modules/vision. That remains safe because this step is reached from
// developer, which does not render either phrase. If the step order changes,
// pick a token unique to consciousness.vue instead.
const consciousnessPattern = /Select the suitable LLM|为意识选择合适/i
const speechPattern = /Hello, my name is AI Assistant|Test voice|Voice|声音|Speech|选择语音合成服务来源/i
const visionPattern = /Capture interval|context|ollama|提供商|Current model|Chat|Vision capture cadence/i
const navHeaderSettleWaitMs = 1000

export const settingsSection: ManualCaptureSection = {
  id: 'settings',
  label: 'Settings surfaces',
  steps: [
    {
      docAssetFileName: 'manual-airi-card.avif',
      id: 'airi-card',
      kind: 'settings-route',
      rawCaptureName: '05-airi-card',
      readyPattern: airiCardPattern,
      routePath: '/settings/airi-card',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-providers.avif',
      id: 'providers',
      kind: 'settings-route',
      rawCaptureName: '06-providers',
      readyPattern: providersPattern,
      routePath: '/settings/providers',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-data-settings.avif',
      id: 'data',
      kind: 'settings-route',
      rawCaptureName: '07-data',
      readyPattern: dataPattern,
      routePath: '/settings/data',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-system-general.avif',
      id: 'system-general',
      kind: 'settings-route',
      rawCaptureName: '08-system-general',
      readyPattern: systemGeneralPattern,
      routePath: '/settings/system/general',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-system-color-scheme.avif',
      id: 'system-color-scheme',
      kind: 'settings-route',
      rawCaptureName: '09-system-color-scheme',
      readyPattern: systemColorSchemePattern,
      routePath: '/settings/system/color-scheme',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-models.avif',
      id: 'models',
      kind: 'settings-route',
      rawCaptureName: '10-models',
      readyPattern: modelsPattern,
      routePath: '/settings/models',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-modules.avif',
      id: 'modules',
      kind: 'settings-route',
      rawCaptureName: '11-modules',
      readyPattern: modulesPattern,
      routePath: '/settings/modules',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-hearing.avif',
      id: 'hearing',
      kind: 'settings-route',
      rawCaptureName: '12-hearing',
      readyPattern: hearingPattern,
      routePath: '/settings/modules/hearing',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-system-developer.avif',
      id: 'system-developer',
      kind: 'settings-route',
      rawCaptureName: '13-system-developer',
      readyPattern: developerPattern,
      routePath: '/settings/system/developer',
      waitMs: 1000,
    },
    {
      docAssetFileName: 'manual-consciousness.avif',
      id: 'consciousness',
      kind: 'settings-route',
      rawCaptureName: '14-consciousness',
      readyPattern: consciousnessPattern,
      routePath: '/settings/modules/consciousness',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      docAssetFileName: 'manual-speech.avif',
      id: 'speech',
      kind: 'settings-route',
      rawCaptureName: '15-speech',
      readyPattern: speechPattern,
      routePath: '/settings/modules/speech',
      waitMs: 500,
    },
    {
      docAssetFileName: 'manual-vision.avif',
      id: 'vision',
      kind: 'settings-route',
      rawCaptureName: '16-vision',
      readyPattern: visionPattern,
      routePath: '/settings/modules/vision',
      waitMs: navHeaderSettleWaitMs,
    },
  ],
}
