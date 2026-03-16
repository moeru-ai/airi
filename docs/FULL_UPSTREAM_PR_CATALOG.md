# Upstream PR Catalog (Reformatted)

> [!IMPORTANT]
> **Major Stable Build Marker**: `b1588ffe41a9825b98cf5bfae219836549a37ff2`
> This hash represents the last vetted stable point in `airi-rebase-scratch` before the March 13 rebase.
>
> **Maintenance**: Use `node scripts/github/pr-comment-tracker.mjs` to refresh the feedback data.

## 👤 My Pending Commits (`dasilva333`)

| PR # | Title | Status | Last Feedback | Link |
| :--- | :--- | :--- | :--- | :--- |
| #1327 | feat: implement universal STT chat inscription and fix duplicate sessions | ✅ | **gemini-code-assist[bot]** (2026-03-13): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | [1327](https://github.com/moeru-ai/airi/pull/1327) |
| #1320 | feat: discord bot stabilization, channel routing, and auto-discovery | ⏳ | **gemini-code-assist[bot]** (2026-03-12): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | [1320](https://github.com/moeru-ai/airi/pull/1320) |
| #1300 | feat: implement stt feedback toasts and refined llm logging | ⏳ | **gemini-code-assist[bot]** (2026-03-11): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | [1300](https://github.com/moeru-ai/airi/pull/1300) |
| #1299 | feat: port VAD and speech pipeline stability improvements | ⏳ | **gemini-code-assist[bot]** (2026-03-11): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | [1299](https://github.com/moeru-ai/airi/pull/1299) |
| #1298 | feat: port scrolllock microphone toggle service | **nekomeowww** (2026-03-14): I cannot quite understand what this PR is doing, would you mind add more images or screenshots for this? Why PowerShell is related to scroll lock, scr... | **gemini-code-assist[bot]** (2026-03-11): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | [1298](https://github.com/moeru-ai/airi/pull/1298) |
| #1297 | feat: port model selector redesign and live2d validation | **dasilva333** (2026-03-15): <img width="2560" height="1516" alt="image" src="https://github.com/user-attachments/assets/6c45948c-b849-4159-9ed5-bc4ac781f982" /> <img width="2560... | **gemini-code-assist[bot]** (2026-03-11): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | [1297](https://github.com/moeru-ai/airi/pull/1297) |
| #1295 | feat(speech): pipeline stability and audio quality fixes | **dasilva333** (2026-03-14): Closing this PR for now. While the diff contains reasonable improvements to the speech pipeline, the user is experiencing persistent 'crackly' audio q... | **shinohara-rin** (2026-03-13): We'd like to see some demos if that's possible | [1295](https://github.com/moeru-ai/airi/pull/1295) |
| #1289 | fix(tray): auto-restore window position from snapshot on startup | **nekomeowww** (2026-03-14): Shouldn't it auto-restore for now? I cannot see the difference. | **gemini-code-assist[bot]** (2026-03-11): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | [1289](https://github.com/moeru-ai/airi/pull/1289) |

---

## 🛠️ FIXES

| PR # | Title | Author | Status | Link |
| :--- | :--- | :--- | :--- | :--- |
| #1324 | fix(server-runtime): preserve explicit empty route destinations | **github-actions[bot]** (2026-03-13): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ✅ | [1324](https://github.com/moeru-ai/airi/pull/1324) |
| #1323 | fix(plugin-sdk): preserve absolute plugin entrypoints | **github-actions[bot]** (2026-03-12): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ✅ | [1323](https://github.com/moeru-ai/airi/pull/1323) |
| #1322 | fix(stage-ui): keep nested reasoning out of speech | **github-actions[bot]** (2026-03-12): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ✅ | [1322](https://github.com/moeru-ai/airi/pull/1322) |
| #1312 | fix(stage-ui): use stable chat history keys in the stage UI | **stablegenius49** (2026-03-13): Thanks — you were right, the keying change alone did not fix the underlying loss.  I pushed a follow-up that preserves in-flight local messages if Ind... | ✅ | [1312](https://github.com/moeru-ai/airi/pull/1312) |
| #1280 | fix(stage-ui): keep onboarding save button visible | **github-actions[bot]** (2026-03-11): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ✅ | [1280](https://github.com/moeru-ai/airi/pull/1280) |
| #1222 | fix(llm): flatten content array for OpenAI-compatible providers | **Reisenbug** (2026-03-10): > Did you installed VSCode plugin? Or experimenting WebSocket? How can I reproduce this bug?  No VSCode plugin or WebSocket involved The issue occu... | ✅ | [1222](https://github.com/moeru-ai/airi/pull/1222) |
| #1190 | fix(stage-pages): add missing local provider settings routes | **Sakuranda** (2026-03-15): > 🙏  Sry, [xsai-transformers](https://github.com/moeru-ai/xsai-transformers) seems to be just an empty shell. I think using a **cloud TTS service*... | ✅ | [1190](https://github.com/moeru-ai/airi/pull/1190) |
| #1151 | fix: enable TTS audio playback on iOS when silent mode is on | **chatgpt-codex-connector[bot]** (2026-03-05): You have reached your Codex usage limits for code reviews. You can see your limits in the [Codex usage dashboard](https://chatgpt.com/codex/settings/u... | Name                    | Link... | ✅ | [1151](https://github.com/moeru-ai/airi/pull/1151) |
| #1124 | fix(stage-tamagotchi): guard stdout/stderr against EPIPE | **nekomeowww** (2026-03-13): Root cause wasn't this, it should be fixed. | ✅ | [1124](https://github.com/moeru-ai/airi/pull/1124) |
| #1107 | fix(providers): use native ElevenLabs API on desktop to avoid unspeech proxy 401 | **Hanfeng-Lin** (2026-03-07): If we're sticking with the native ElevenLabs API (because this solves the 401 redirect issue caused by shared IPs once and for all), I can extract the... | Name       ... | ✅ | [1107](https://github.com/moeru-ai/airi/pull/1107) |
| #1065 | fix(onboarding): allow manual model entry when list is empty | **github-actions[bot]** (2026-03-01): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ✅ | [1065](https://github.com/moeru-ai/airi/pull/1065) |
| #1064 | fix(hearing): allow manual model fallback on load errors | **github-actions[bot]** (2026-03-01): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ✅ | [1064](https://github.com/moeru-ai/airi/pull/1064) |
| #1062 | fix(consciousness): allow manual model fallback for OpenAI-compatible | **hxnan** (2026-03-13): I met this issue，hope merge soon,thanks | ✅ | [1062](https://github.com/moeru-ai/airi/pull/1062) |
| #1061 | fix(providers): add Deepgram TTS model list | **github-actions[bot]** (2026-03-01): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ✅ | [1061](https://github.com/moeru-ai/airi/pull/1061) |

---

## 🚀 FEATURES

| PR # | Title | Author | Status | Link |
| :--- | :--- | :--- | :--- | :--- |
| #1328 | feat(profile): add profile switcher to controls island and web header | **gemini-code-assist[bot]** (2026-03-13): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1328](https://github.com/moeru-ai/airi/pull/1328) |
| #1326 | feat(stage-pocket): add Android target | **gemini-code-assist[bot]** (2026-03-13): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1326](https://github.com/moeru-ai/airi/pull/1326) |
| #1314 | feat(provider): add Volcengine Ark and Fish Audio providers, improve consciousness model input | **Garfield550** (2026-03-12): Can you provide a demo video of this PR? | ❌ | [1314](https://github.com/moeru-ai/airi/pull/1314) |
| #1302 | feat: add OpenRouter as a speech (TTS) provider | **monolithic827** (2026-03-14): I've extracted the new OpenRouter TTS logic into its own module in order to de-clutter `providers.ts`. Also addressed the two other comments by Gemin... | ✅ | [1302](https://github.com/moeru-ai/airi/pull/1302) |
| #1287 | feat(vision): add AIRI vision system - screen capture and AI analysis | **awaxiaoyu** (2026-03-14): > Thanks for the contribution! The vision system is a cool feature idea, but the current implementation needs some structural work before it's ready t... | ❌ | [1287](https://github.com/moeru-ai/airi/pull/1287) |
| #1264 | feat: add mem9.ai long-term memory integration | **YangKeao** (2026-03-11): I might want to remove the `memory_search` tool call tips in chat. It's a little bit embarrassing to see her searching in her mind so hard to find out... | ❌ | [1264](https://github.com/moeru-ai/airi/pull/1264) |
| #1256 | feat(providers): add Amazon Bedrock provider | **chaosreload** (2026-03-14): Thanks for the review @shinohara-rin!  Addressed in commit ba1556f3: replaced the `isAmazonBedrock` branching and `ProviderConfigData` type changes wi... | ✅ | [1256](https://github.com/moeru-ai/airi/pull/1256) |
| #1237 | feat(stage-ui): add chat settings with stream idle timeout | **gemini-code-assist[bot]** (2026-03-10): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1237](https://github.com/moeru-ai/airi/pull/1237) |
| #1221 | feat(providers): add IndexTTS-2 Text-to-Speech (TTS) provider | **gemini-code-assist[bot]** (2026-03-09): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1221](https://github.com/moeru-ai/airi/pull/1221) |
| #1216 | feat(alaya): lay the groundwork for standalone short-term memory planner/query | **NashChennc** (2026-03-10): However, I must say:  We might not be ready to start implementing it yet. The context composer & plugin system need to be organized better.  Worki... | ❌ | [1216](https://github.com/moeru-ai/airi/pull/1216) |
| #1185 | feat(tamagotchi): Add model selection and custom Voice ID support for Alibaba Bailian | **github-actions[bot]** (2026-03-10): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ❌ | [1185](https://github.com/moeru-ai/airi/pull/1185) |
| #1174 | feat(providers): add MegaNova AI as a chat provider | **gemini-code-assist[bot]** (2026-03-06): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1174](https://github.com/moeru-ai/airi/pull/1174) |
| #1171 | feat(services/matrix-bot): add matrix_bot | **gemini-code-assist[bot]** (2026-03-06): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1171](https://github.com/moeru-ai/airi/pull/1171) |
| #1153 | feat: add window dock mode for Tamagotchi (Electron) | **NJX-njx** (2026-03-10): > Never thought this could be implemented like this... I will try this today and decide to merge or not.  thank you hh | ✅ | [1153](https://github.com/moeru-ai/airi/pull/1153) |
| #1148 | feat(ui,stage-ui,stage-pages,i18n): transcription confidence filter | **nekomeowww** (2026-03-10): /gemini review  | ❌ | [1148](https://github.com/moeru-ai/airi/pull/1148) |
| #1146 | feat: add provider configuration export/import | **chatgpt-codex-connector[bot]** (2026-03-05): You have reached your Codex usage limits for code reviews. You can see your limits in the [Codex usage dashboard](https://chatgpt.com/codex/settings/u... | ❌ | [1146](https://github.com/moeru-ai/airi/pull/1146) |
| #1139 | feat: Add export/import config buttons, integrated into the Airi first-time setup page and DevTools page | **gemini-code-assist[bot]** (2026-03-05): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1139](https://github.com/moeru-ai/airi/pull/1139) |
| #1125 | feat(providers): manual model ping and selective validation checks | **cat1949** (2026-03-07): Addressed in `3d6f5a95`.  Changes made: - guard provider access with provider metadata checks so invalid route keys like `__proto__` are not used to r... | ❌ | [1125](https://github.com/moeru-ai/airi/pull/1125) |
| #1057 | feat(providers): add Azure OpenAI support | **breezy89757** (2026-03-15): > Would you mind rebase this?  Done!It seems that AIRI is getting along quite well with gpt-5.4 already! :) <img width="1919" height="907" alt="ima... | ❌ | [1057](https://github.com/moeru-ai/airi/pull/1057) |
| #1040 | feat(openclaw): add OpenClaw bridge and Stage integration | **github-actions[bot]** (2026-02-23): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ❌ | [1040](https://github.com/moeru-ai/airi/pull/1040) |
| #1033 | feat(stage-ui-live2d): exp3 expression system + auto-blink rework | **youetube** (2026-03-10): Rebased onto latest main (`v0.9.0-alpha.10`) and resolved conflicts: - `package.json`: merged dependency version bumps + expression deps (`@xsai/tool`... | ❌ | [1033](https://github.com/moeru-ai/airi/pull/1033) |
| #1026 | feat(providers): add xAI Grok voice providers (TTS/STT) | **github-actions[bot]** (2026-02-07): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ✅ | [1026](https://github.com/moeru-ai/airi/pull/1026) |
| #1016 | feat(stage-pocket): push notifications | **github-actions[bot]** (2026-02-01): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ❌ | [1016](https://github.com/moeru-ai/airi/pull/1016) |
| #979 | Feat/dock mode | **nekomeowww** (2026-01-21): cc @sumimakito would you mind merge your WIP code first? It seems this PR is more focused on Windows but not macOS. And the handling of Three.js is no... | ❌ | [979](https://github.com/moeru-ai/airi/pull/979) |
| #961 | feat(stage-ui): add abstract base interfaces for transcription and spΓÇª | **lockrush-dev** (2026-01-21): @gemini-code-assist review | ❌ | [961](https://github.com/moeru-ai/airi/pull/961) |
| #917 | feat(stage-tamagotchi): vision | **hxnan** (2026-03-15): I can't wait for this feature!  | ❌ | [917](https://github.com/moeru-ai/airi/pull/917) |
| #851 | feat(stage-tamagotchi): add option for chat area send key | **cheesemori** (2026-01-13): Just a quick bump to prevent this from getting stale since I saw lots of updates recently. Let me know if any changes are needed! 🍵 | ❌ | [851](https://github.com/moeru-ai/airi/pull/851) |
| #801 | feat: add memory system frontend components and settings UI | **nekomeowww** (2026-03-14): New designed finalized for memory layer, in both #879 and https://github.com/moeru-ai/plast-mem. We will support adding additional memory layer to the... | ❌ | [801](https://github.com/moeru-ai/airi/pull/801) |
| #800 | feat: add serverless memory API functions and memory system package | **nekomeowww** (2026-03-14): New designed finalized for memory layer, in both #879 and https://github.com/moeru-ai/plast-mem. We will support adding additional memory layer to the... | Name       ... | ❌ | [800](https://github.com/moeru-ai/airi/pull/800) |
| #780 | feat(pinia-broadcast): use BroadcastChannel & SharedWorker for syncing states across windows & tabs | **github-actions[bot]** (2025-11-30): ## ✅ Deploy to Cloudflare Workers (Preview) for *stage-web* ready!  | Name                    | Link... | ❌ | [780](https://github.com/moeru-ai/airi/pull/780) |

---

## 🧪 WIP / MISC

| PR # | Title | Author | Status | Link |
| :--- | :--- | :--- | :--- | :--- |
| #1307 | land computer-use terminal lane for internal testing | **chatgpt-codex-connector[bot]** (2026-03-13):  ### 💡 Codex Review  https://github.com/moeru-ai/airi/blob/ba7004d2d5f11fb7903ba0136044eab3cffcad97/packages/stage-ui/src/stores/llm-tool-loop.ts#L37... | ❌ | [1307](https://github.com/moeru-ai/airi/pull/1307) |
| #1306 | Sanxincao/refactor/fix contributing doc | **freemanGFW** (2026-03-15): 可以，我将bug描述放出来，安装步骤挪到常见问题解决中 | ❌ | [1306](https://github.com/moeru-ai/airi/pull/1306) |
| #1262 | chore(ci): added Scoop bucket manifest | **gemini-code-assist[bot]** (2026-03-11): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1262](https://github.com/moeru-ai/airi/pull/1262) |
| #1227 | Codex/feat GitHub | **gemini-code-assist[bot]** (2026-03-10): ## Summary of Changes  Hello, I'm Gemini Code Assist[^1]! I'm currently reviewing this pull request ... | ❌ | [1227](https://github.com/moeru-ai/airi/pull/1227) |
| #1076 | refactor: replace unsafe any types with unknown | **github-actions[bot]** (2026-03-02): ## ⏳ Approval required for deploying to Cloudflare Workers (Preview) for *stage-web*.  | Name       ... | ❌ | [1076](https://github.com/moeru-ai/airi/pull/1076) |
| #1048 | Upgrade GitHub Actions to latest versions | **nekomeowww** (2026-03-01): Rebase is needed. | ❌ | [1048](https://github.com/moeru-ai/airi/pull/1048) |
