# Steam review submission plan

Status: draft. No review submission is complete. The user chose to retain Windows, macOS, and Linux on 2026-10-08.

## Candidate provenance

| Item | Current evidence |
| --- | --- |
| AppID | 3885340 |
| Internal branch | `internal-test`, build 25797796 |
| Default branch | Build 24551505, an older package |
| Windows depot | 3885342, manifest 3638930766507548416 |
| macOS depot | 3885343, manifest 8375733062030734335, older package |
| Linux depot | 3885344, manifest 5346654711222988433, older package |
| Source branch | `codex/steam-local-asr-20261005` |
| Source base | edbbcf5384b5ed183979fa1ccadf1f1e15cb66b5 |
| Source changes | Uncommitted fixes. The base SHA alone does not identify the packaged source. |

The Windows upload contains the clean-profile candidate from 2026-10-08. The user reported that its functions worked.

That report does not certify the older macOS or Linux packages. Automated checks do not replace installation and runtime acceptance.

## Common package requirements

All supported platforms must use the same revision and these build values:

```text
VITE_DISTRIBUTION=steam
VITE_DISABLE_CUSTOM_PROVIDERS=true
VITE_DISABLE_FLUX_PURCHASE=true
VITE_ENABLE_ANALYTICS=false
SHERPAW_BUNDLE_MODELS=true
```

The existing workflow uses Node 26.7.0 and Godot 4.7.1. Its platform targets are Windows x64, macOS arm64, and Linux x64.

The workflow is `.github/workflows/release-tamagotchi-steam.yml`. Its manual build supports `upload_to_steam=false` for package preparation without deployment.

Uncommitted local fixes are absent from remote workflow runs. A workflow run must use a revision that contains all intended fixes.

## Acceptance before submission

For each platform, record the package revision, Steam BuildID, depot manifest, architecture, and test results.

1. Install the candidate through Steam with a new application profile.
2. Keep existing account data and chat history intact.
3. Complete account login without a third-party API key.
4. Send the first text message without another login.
5. Listen to several ordinary TTS responses.
6. Speak at least ten separate microphone utterances with automatic submission enabled.
7. Record transcription failures and response delays.
8. Use chat and voice for 10–15 minutes.
9. Exit the application fully.
10. Restart through Steam and repeat chat, transcription, and speech tests.
11. Import VRM and Live2D models supplied by the tester.
12. Use only an approved window for screen context.
13. Check that drawing, ComfyUI, Tavily, Discord, X, custom keys, streaming TTS, and paid top-ups are unavailable.
14. Check saved selections and direct settings routes in isolated test data.
15. Keep uploaded-image understanding available.

Only a new account can establish the initial 150-credit grant. Login does not repeat that grant.

The local language selector filters compatible models. It does not force a multilingual model to recognize only the selected language.

Record Chinese and English results separately. No completed English recognition quality test is recorded here.

## Content Survey corrections

The saved survey on 2026-10-08 still describes external speech recognition and says that users need no local AI models.

Bundled local recognition requires no separate installation. That fact differs from the absence of a local model.

After all platform packages match this policy, replace the relevant survey text with these drafts. Preserve unrelated survey answers.

### Public English AI description

AIRI generates companion conversation text and synthesized voice responses during use. Bundled local speech recognition converts microphone input to text.

AI can analyze user-provided images and user-enabled screen context. The Steam edition does not generate images, textures, or 3D models.

Cloud chat, speech synthesis, and visual understanding require an internet connection and an AIRI account. AIRI manages these services.

Players need no third-party API keys, separate AI software, or manual model installation. Local speech recognition uses the model files included with the application.

The project covers cloud service costs within the available free allowance. New accounts receive 150 credits once. Usage consumes credits.

Repeated login does not grant more credits. Features that require credits pause when credits run out. The Steam edition offers no paid top-ups.

The existing survey says that default assets and store materials are not AI-generated. This investigation did not independently audit their sources.

Before publication, retain that asset statement only with the publisher's confirmed declaration. Do not publish this internal evidence note as customer text.

### External service delivery

Steam 版本通过 AIRI 账户使用项目管理的云端聊天、普通语音合成和视觉理解服务。官方聊天当前接入 OpenAI 模型。语音识别在本地运行，所需 Sherpaw 模型随应用安装，无需用户另行下载、安装或填写密钥。图片上传和主动启用的屏幕上下文用于理解画面，不提供图像生成。云端功能需要网络连接和 AIRI 账户。

### Moderation and costs

Keep the accurate declaration of OpenAI model safety mechanisms. Do not claim a separate project moderation system or guaranteed copyright protection.

Keep the one-time 150-credit grant and project-funded service explanation. Do not imply unlimited service, recurring grants, or external payment.

## English reviewer note draft

This draft describes the intended final packages. It is not a statement that all platform acceptance is complete.

> This candidate addresses the feedback for BuildID 25227678.
>
> Steam speech recognition now uses bundled local Sherpaw models. Players need no external transcription service, API key, or manual model installation.
>
> Chat uses AIRI-managed services after account login. Speech output uses the managed ordinary TTS provider. The Steam edition disables streaming TTS.
>
> The Steam edition disables image generation and ComfyUI. Image uploads and approved screen context remain available for visual understanding.
>
> Players cannot configure custom AI providers, Tavily, Kokoro keys, Discord, or X integrations in the Steam edition.
>
> The project covers cloud AI costs within the free allowance. New accounts receive 150 credits once. Login does not repeat the grant.
>
> Credit-dependent functions pause when the allowance runs out. The Steam edition offers no paid top-ups or external recharge links.
>
> The Content Survey discloses live conversation text and synthesized speech. Its service description distinguishes bundled recognition from cloud services.

Before submission, append the final BuildID and completed platform results. Include the reviewer login procedure without credentials.

Do not submit build 24551505 or describe old platform depots as repaired. Keep the review request pending until all supported packages pass acceptance.

## References

- [Steam review process](https://partner.steamgames.com/doc/store/review_process)
- [Content Survey](https://partner.steamgames.com/contentdescriptors/editsurvey/3885340/)
- [AIRI build management](https://partner.steamgames.com/apps/builds/3885340)
