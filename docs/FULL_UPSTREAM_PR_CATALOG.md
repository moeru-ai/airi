# Upstream PR Catalog (Reformatted)

> [!IMPORTANT]
> **Major Stable Build Marker**: `b1588ffe41a9825b98cf5bfae219836549a37ff2`
> This hash represents the last vetted stable point in `airi-rebase-scratch` before the March 13 rebase.

## 👤 My Pending Commits (`dasilva333`)

| PR # | Title | Last Feedback | Link |
| :--- | :--- | :--- | :--- |
| #1327 | feat: implement universal STT chat inscription and fix duplicate sessions | **gemini-code-assist** (2026-03-13T06:25Z): Summarized universal STT chat inscription and duplicate session fixes. | [1327](https://github.com/moeru-ai/airi/pull/1327) |
| #1320 | feat: discord bot stabilization, channel routing, and auto-discovery | **gemini-code-assist** (2026-03-12T15:20Z): Summarized Discord bot stabilization, routing fixes, and auto-discovery. | [1320](https://github.com/moeru-ai/airi/pull/1320) |
| #1300 | feat: implement stt feedback toasts and refined llm logging | **gemini-code-assist** (2026-03-11T23:09Z): Summarized STT feedback toasts and refined logging. | [1300](https://github.com/moeru-ai/airi/pull/1300) |
| #1299 | feat: port VAD and speech pipeline stability improvements | **gemini-code-assist** (2026-03-11T21:21Z): Highlighted audio recorder stability and VAD reliability enhancements. | [1299](https://github.com/moeru-ai/airi/pull/1299) |
| #1298 | feat: port scrolllock microphone toggle service | **gemini-code-assist** (2026-03-11T21:19Z): Summarized hardware-based mic toggling via Scroll Lock. | [1298](https://github.com/moeru-ai/airi/pull/1298) |
| #1297 | feat: port model selector redesign and live2d validation | **gemini-code-assist** (2026-03-11T21:14Z): Detailed Live2D model validation and UI redesign. | [1297](https://github.com/moeru-ai/airi/pull/1297) |
| #1295 | feat(speech): pipeline stability and audio quality fixes | **gemini-code-assist** (2026-03-11T18:49Z): Summarized VAD crackling and transcription hang fixes. | [1295](https://github.com/moeru-ai/airi/pull/1295) |
| #1289 | fix(tray): auto-restore window position from snapshot on startup | **gemini-code-assist** (2026-03-11T15:39Z): Highlighted window position restoration from configuration. | [1289](https://github.com/moeru-ai/airi/pull/1289) |

---

## 🛠️ FIXES

| PR # | Title | Author | Status | Link |
| :--- | :--- | :--- | :--- | :--- |
| #1324 | fix(server-runtime): preserve explicit empty route destinations | Gujiassh | ✅ | [1324](https://github.com/moeru-ai/airi/pull/1324) |
| #1323 | fix(plugin-sdk): preserve absolute plugin entrypoints | Gujiassh | ✅ | [1323](https://github.com/moeru-ai/airi/pull/1323) |
| #1322 | fix(stage-ui): keep nested reasoning out of speech | Gujiassh | ✅ | [1322](https://github.com/moeru-ai/airi/pull/1322) |
| #1312 | fix(stage-ui): use stable chat history keys in the stage UI | stablegenius49 | ✅ | [1312](https://github.com/moeru-ai/airi/pull/1312) |
| #1280 | fix(stage-ui): keep onboarding save button visible | Ver-zhzh | ✅ | [1280](https://github.com/moeru-ai/airi/pull/1280) |
| #1222 | fix(llm): flatten content array for OpenAI-compatible providers | Reisenbug | ✅ | [1222](https://github.com/moeru-ai/airi/pull/1222) |
| #1190 | fix(stage-pages): add missing local provider settings routes | Sakuranda | ✅ | [1190](https://github.com/moeru-ai/airi/pull/1190) |
| #1151 | fix: enable TTS audio playback on iOS when silent mode is on | NJX-njx | ✅ | [1151](https://github.com/moeru-ai/airi/pull/1151) |
| #1124 | fix(stage-tamagotchi): guard stdout/stderr against EPIPE | cat1949 | ✅ | [1124](https://github.com/moeru-ai/airi/pull/1124) |
| #1107 | fix(providers): use native ElevenLabs API on desktop to avoid unspeech proxy 401 | Hanfeng-Lin | ✅ | [1107](https://github.com/moeru-ai/airi/pull/1107) |
| #1065 | fix(onboarding): allow manual model entry when list is empty | liuxiaopai-ai | ✅ | [1065](https://github.com/moeru-ai/airi/pull/1065) |
| #1064 | fix(hearing): allow manual model fallback on load errors | liuxiaopai-ai | ✅ | [1064](https://github.com/moeru-ai/airi/pull/1064) |
| #1062 | fix(consciousness): allow manual model fallback for OpenAI-compatible | liuxiaopai-ai | ✅ | [1062](https://github.com/moeru-ai/airi/pull/1062) |
| #1061 | fix(providers): add Deepgram TTS model list | liuxiaopai-ai | ✅ | [1061](https://github.com/moeru-ai/airi/pull/1061) |

---

## 🚀 FEATURES

| PR # | Title | Author | Status | Link |
| :--- | :--- | :--- | :--- | :--- |
| #1328 | feat(profile): add profile switcher to controls island and web header | lietblue | ❌ | [1328](https://github.com/moeru-ai/airi/pull/1328) |
| #1326 | feat(stage-pocket): add Android target | lietblue | ❌ | [1326](https://github.com/moeru-ai/airi/pull/1326) |
| #1314 | feat(provider): add Volcengine Ark and Fish Audio providers, improve consciousness model input | DanZai233 | ❌ | [1314](https://github.com/moeru-ai/airi/pull/1314) |
| #1302 | feat: add OpenRouter as a speech (TTS) provider | monolithic827 | ✅ | [1302](https://github.com/moeru-ai/airi/pull/1302) |
| #1287 | feat(vision): add AIRI vision system - screen capture and AI analysis | awaxiaoyu | ❌ | [1287](https://github.com/moeru-ai/airi/pull/1287) |
| #1264 | feat: add mem9.ai long-term memory integration | YangKeao | ❌ | [1264](https://github.com/moeru-ai/airi/pull/1264) |
| #1256 | feat(providers): add Amazon Bedrock provider | chaosreload | ✅ | [1256](https://github.com/moeru-ai/airi/pull/1256) |
| #1237 | feat(stage-ui): add chat settings with stream idle timeout | Minnzen | ❌ | [1237](https://github.com/moeru-ai/airi/pull/1237) |
| #1221 | feat(providers): add IndexTTS-2 Text-to-Speech (TTS) provider | AnyaCoder | ❌ | [1221](https://github.com/moeru-ai/airi/pull/1221) |
| #1216 | feat(alaya): lay the groundwork for standalone short-term memory planner/query | freezinlove | ❌ | [1216](https://github.com/moeru-ai/airi/pull/1216) |
| #1185 | feat(tamagotchi): Add model selection and custom Voice ID support for Alibaba Bailian | liteshade | ❌ | [1185](https://github.com/moeru-ai/airi/pull/1185) |
| #1174 | feat(providers): add MegaNova AI as a chat provider | bq1024 | ❌ | [1174](https://github.com/moeru-ai/airi/pull/1174) |
| #1171 | feat(services/matrix-bot): add matrix_bot | donjuanplatinum | ❌ | [1171](https://github.com/moeru-ai/airi/pull/1171) |
| #1153 | feat: add window dock mode for Tamagotchi (Electron) | NJX-njx | ✅ | [1153](https://github.com/moeru-ai/airi/pull/1153) |
| #1148 | feat(ui,stage-ui,stage-pages,i18n): transcription confidence filter | Reisenbug | ❌ | [1148](https://github.com/moeru-ai/airi/pull/1148) |
| #1146 | feat: add provider configuration export/import | NJX-njx | ❌ | [1146](https://github.com/moeru-ai/airi/pull/1146) |
| #1139 | feat: Add export/import config buttons, integrated into the Airi first-time setup page and DevTools page | Decolv | ❌ | [1139](https://github.com/moeru-ai/airi/pull/1139) |
| #1125 | feat(providers): manual model ping and selective validation checks | cat1949 | ❌ | [1125](https://github.com/moeru-ai/airi/pull/1125) |
| #1057 | feat(providers): add Azure OpenAI support | breezy89757 | ❌ | [1057](https://github.com/moeru-ai/airi/pull/1057) |
| #1040 | feat(openclaw): add OpenClaw bridge and Stage integration | botBehavior | ❌ | [1040](https://github.com/moeru-ai/airi/pull/1040) |
| #1033 | feat(stage-ui-live2d): exp3 expression system + auto-blink rework | youetube | ❌ | [1033](https://github.com/moeru-ai/airi/pull/1033) |
| #1026 | feat(providers): add xAI Grok voice providers (TTS/STT) | olsenbudanur | ✅ | [1026](https://github.com/moeru-ai/airi/pull/1026) |
| #1016 | feat(stage-pocket): push notifications | LemonNekoGH | ❌ | [1016](https://github.com/moeru-ai/airi/pull/1016) |
| #979 | Feat/dock mode | s3d-i | ❌ | [979](https://github.com/moeru-ai/airi/pull/979) |
| #961 | feat(stage-ui): add abstract base interfaces for transcription and spΓÇª | lockrush-dev | ❌ | [961](https://github.com/moeru-ai/airi/pull/961) |
| #917 | feat(stage-tamagotchi): vision | nekomeowww | ❌ | [917](https://github.com/moeru-ai/airi/pull/917) |
| #851 | feat(stage-tamagotchi): add option for chat area send key | cheesemori | ❌ | [851](https://github.com/moeru-ai/airi/pull/851) |
| #801 | feat: add memory system frontend components and settings UI | inoribea | ❌ | [801](https://github.com/moeru-ai/airi/pull/801) |
| #800 | feat: add serverless memory API functions and memory system package | inoribea | ❌ | [800](https://github.com/moeru-ai/airi/pull/800) |
| #780 | feat(pinia-broadcast): use BroadcastChannel & SharedWorker for syncing states across windows & tabs | nekomeowww | ❌ | [780](https://github.com/moeru-ai/airi/pull/780) |

---

## 🧪 WIP / MISC

| PR # | Title | Author | Status | Link |
| :--- | :--- | :--- | :--- | :--- |
| #1307 | land computer-use terminal lane for internal testing | 3361559784 | ❌ | [1307](https://github.com/moeru-ai/airi/pull/1307) |
| #1306 | Sanxincao/refactor/fix contributing doc | freemanGFW | ❌ | [1306](https://github.com/moeru-ai/airi/pull/1306) |
| #1262 | chore(ci): added Scoop bucket manifest | stablegenius49 | ❌ | [1262](https://github.com/moeru-ai/airi/pull/1262) |
| #1227 | Codex/feat GitHub | 3361559784 | ❌ | [1227](https://github.com/moeru-ai/airi/pull/1227) |
| #1076 | refactor: replace unsafe any types with unknown | fvngs | ❌ | [1076](https://github.com/moeru-ai/airi/pull/1076) |
| #1048 | Upgrade GitHub Actions to latest versions | salmanmkc | ❌ | [1048](https://github.com/moeru-ai/airi/pull/1048) |
