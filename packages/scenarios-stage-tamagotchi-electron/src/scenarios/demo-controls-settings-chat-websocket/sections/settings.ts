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
      id: 'airi-card',
      kind: 'settings-route',
      routePath: '/settings/airi-card',
      readyPattern: airiCardPattern,
      rawCaptureName: '05-airi-card',
      docAssetFileName: 'manual-airi-card.avif',
      waitMs: 1000,
    },
    {
      id: 'providers',
      kind: 'settings-route',
      routePath: '/settings/providers',
      readyPattern: providersPattern,
      rawCaptureName: '06-providers',
      docAssetFileName: 'manual-providers.avif',
      waitMs: 1000,
    },
    {
      id: 'data',
      kind: 'settings-route',
      routePath: '/settings/data',
      readyPattern: dataPattern,
      rawCaptureName: '07-data',
      docAssetFileName: 'manual-data-settings.avif',
      waitMs: 1000,
    },
    {
      id: 'system-general',
      kind: 'settings-route',
      routePath: '/settings/system/general',
      readyPattern: systemGeneralPattern,
      rawCaptureName: '08-system-general',
      docAssetFileName: 'manual-system-general.avif',
      waitMs: 1000,
    },
    {
      id: 'system-color-scheme',
      kind: 'settings-route',
      routePath: '/settings/system/color-scheme',
      readyPattern: systemColorSchemePattern,
      rawCaptureName: '09-system-color-scheme',
      docAssetFileName: 'manual-system-color-scheme.avif',
      waitMs: 1000,
    },
    {
      id: 'models',
      kind: 'settings-route',
      routePath: '/settings/models',
      readyPattern: modelsPattern,
      rawCaptureName: '10-models',
      docAssetFileName: 'manual-models.avif',
      waitMs: 1000,
    },
    {
      id: 'modules',
      kind: 'settings-route',
      routePath: '/settings/modules',
      readyPattern: modulesPattern,
      rawCaptureName: '11-modules',
      docAssetFileName: 'manual-modules.avif',
      waitMs: 1000,
    },
    {
      id: 'hearing',
      kind: 'settings-route',
      routePath: '/settings/modules/hearing',
      readyPattern: hearingPattern,
      rawCaptureName: '12-hearing',
      docAssetFileName: 'manual-hearing.avif',
      waitMs: 1000,
    },
    {
      id: 'system-developer',
      kind: 'settings-route',
      routePath: '/settings/system/developer',
      readyPattern: developerPattern,
      rawCaptureName: '13-system-developer',
      docAssetFileName: 'manual-system-developer.avif',
      waitMs: 1000,
    },
    {
      id: 'consciousness',
      kind: 'settings-route',
      routePath: '/settings/modules/consciousness',
      readyPattern: consciousnessPattern,
      rawCaptureName: '14-consciousness',
      docAssetFileName: 'manual-consciousness.avif',
      waitMs: navHeaderSettleWaitMs,
    },
    {
      id: 'speech',
      kind: 'settings-route',
      routePath: '/settings/modules/speech',
      readyPattern: speechPattern,
      rawCaptureName: '15-speech',
      docAssetFileName: 'manual-speech.avif',
      waitMs: 500,
    },
    {
      id: 'vision',
      kind: 'settings-route',
      routePath: '/settings/modules/vision',
      readyPattern: visionPattern,
      rawCaptureName: '16-vision',
      docAssetFileName: 'manual-vision.avif',
      waitMs: navHeaderSettleWaitMs,
    },
  ],
}
