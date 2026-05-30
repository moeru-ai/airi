# Changelog

## 2026-05-30
- Built and uploaded stage-pocket iOS app to TestFlight
- Verified capacitor sync, archive, export, upload pipeline
- IPA size: 173.9MB, upload time: 16.756s
- Delivery UUID: 8c3b85fd-c29b-4bb5-8ded-8ae332c07b87
- Used ASC API Key H93L552576, Issuer 69a6de7f-ceb3-47e3-e053-5b8c7c11a4d1
- clawhip workflow validated (VM -> Mac Studio host)


## 2026-05-30
- Bumped stage-pocket version to 1.0.1
- Built and exported iOS archive with xcodebuild using App Store Connect API key (H93L552576)
- Uploaded build 173966658 bytes to TestFlight via altool (Delivery UUID: 01828d34-9dd4-4d22-b800-51edf8980cb6)
- Build succeeded for scheme App, configuration Release, iphoneos26.0 SDK
- Exported IPA using updated ExportOptions.plist (method: app-store, teamID: 5Y7NBCKHJP)
- Verified upload succeeded with no errors

## 2026-05-29
- Initial setup: cloned `moeru-ai/airi` (v0.10.2) to `~/Developer/airi`.
- Prerequisites: Node v24.15.0 (homebrew node@24), pnpm v10.33.0 (via corepack).
- Installed dependencies — 66 workspace projects, 2788 packages, all 44 packages built.
- Verified `pnpm dev` (stage-web) starts on `http://localhost:5173` — HTTP 200.
- No `.env` required for stage-web; LLM providers configured via UI.
- PATH: `/opt/homebrew/opt/node@24/bin` set in `~/.zprofile`.