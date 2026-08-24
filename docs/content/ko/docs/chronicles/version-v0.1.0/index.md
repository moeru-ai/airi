---
title: 연대기 v0.1.0
---

- [x] [VRM 프론트엔드 연동 (12월 5일)](https://github.com/nekomeowww/airi-vtuber/commit/5738c219b5891f200d7dc9dae04a8e885c8d8c17)
  - [x] [VRM 대기 애니메이션 (12월 6일)](https://github.com/nekomeowww/airi-vtuber/commit/8f9a0e76cde546952651189229c824c6196caed6)
  - [x] [VRM 눈 깜빡임 (12월 7일)](https://github.com/nekomeowww/airi-vtuber/commit/289f8226696998dae36b550d3a055eba04e160f6)

- [x] 입 (6월 8일)
  - [x] [unspeech 프로젝트 생성 (12월 13일)](https://github.com/moeru-ai/unspeech)
    - [x] TTS 연동 (6월 8일)
    - [x] 11Labs 연동
      - [x] [독립적인 11Labs 패키지로 캡슐화 (12월 3일)](https://github.com/nekomeowww/airi-vtuber/commit/f9ddf9af93a61e0a2f3323ced79171f29b6dd2e6)

- [x] 청각 (12월 12일)
  - [x] 말하기 버튼 구현 (6월 9일)
  - [x] ~~오디오 전사~~
    - [x] ~~프론트엔드에서 백엔드로 오디오 스트리밍~~
      - [x] WebSocket 기반 양방향 통신을 위해 socket.io 사용 [Socket.IO](https://socket.io/) (6월 10일)
        - [x] Socket.io는 사실 WebSocket 기반이 아니다
          - [node.js - What is the major scenario to use Socket.IO - Stack Overflow](https://stackoverflow.com/questions/18587104/what-is-the-major-scenario-to-use-socket-io)
          - [node.js - Differences between socket.io and websockets - Stack Overflow](https://stackoverflow.com/questions/10112178/differences-between-socket-io-and-websockets)
        - [x] 프론트엔드는 `socket.io-client` 패키지 사용, `pnpm i socket.io-client`
          - [x] WebSocket은 지원이 좋고 Nuxt의 Nitro도 지원한다. [How to use with Nuxt | Socket.IO](https://socket.io/how-to/use-with-nuxt)
        - [x] 백엔드는 `socket.io` 패키지 사용, `pnpm i socket.io`
        - Nuxt 3와 socket.io
          - [richardeschloss/nuxt-socket-io: Nuxt Socket IO - socket.io client and server module for Nuxt](https://github.com/richardeschloss/nuxt-socket-io)
          - [javascript - Socket.io websocket not working in Nuxt 3 when in production - Stack Overflow](https://stackoverflow.com/questions/73592619/socket-io-websocket-not-working-in-nuxt-3-when-in-production)
          - [adityar15/nuxt3socket (github.com)](https://github.com/adityar15/nuxt3socket)
      - [x] ~~오디오 스트리밍에 WebRTC 사용, VueUse도 이를 지원함~~
        - [x] Nuxt와 Nitro가 아직 지원하지 않아 일단 보류. 그룹 채팅이나 Discord 용으로 검토해 볼 수 있음.
        - 튜토리얼:
          - [Getting started with media devices | WebRTC](https://webrtc.org/getting-started/media-devices?hl=en)
          - [WebRTC | JavaScript Standard Reference Tutorial](https://wohugb.gitbooks.io/javascript/content/htmlapi/webrtc.html)
    - ~~Transformers.js + Whisper로 충분함~~
      - [x] Chrome / Edge가 이제 WebGPU를 지원함
        - [x] 데모가 있음: [Real-time Whisper WebGPU - a Hugging Face Space by Xenova](https://huggingface.co/spaces/Xenova/realtime-whisper-webgpu) (현재는 오픈소스가 아님)
      - [x] ~~Whisper 추론을 브라우저에서 바로 수행할 수 있음~~
      - [x] ~~WebGPU가 아직 지원되지 않음~~ (이제 지원됨)
        - [x] [🤗 Transformers.js + ONNX Runtime WebGPU in Chrome extension | by Wei Lu | Medium](https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9)
      - ~~Node.js CPP Addon을 통해 Whisper.cpp를 임베딩하는 방안 검토~~
      - [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
    - 튜토리얼:
      - [Realtime video transcription and translation with Whisper and NLLB on MacBook Air | by Wei Lu | Medium](https://medium.com/@GenerationAI/realtime-video-transcription-and-translation-with-whisper-and-nllb-on-macbook-air-31db4c62c074)
      - [🤗 Transformers.js + ONNX Runtime WebGPU in Chrome extension | by Wei Lu | Medium](https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9)
  - [ ] [Whisper WebGPU 데모 (12월 10일)](https://github.com/moeru-ai/airi/commit/ae3b9468d74c5d38c507ae2877799fd36339f8c1)
  - [ ] [MicVAD 데모 (12월 11일)](https://github.com/moeru-ai/airi/commit/e4a0cc71006639669e9d71f0db27086fca47a03a)
  - [ ] [MicVAD + ONNX Whisper 실시간 전사 (12월 12일)](https://github.com/moeru-ai/airi/commit/01dbaeb9317ab7491743e50dd6c58fc7e19a880d)
  - [ ] [dcrebbin/oai-voice-mode-chat-mac: Adds realtime chat for ChatGPT Voice Mode [Unofficial]](https://github.com/dcrebbin/oai-voice-mode-chat-mac)
- [x] 표정 (7월 9일)
  - [x] [프론트엔드 VRM 표정 제어 (12월 7일)](https://github.com/nekomeowww/airi-vtuber/commit/b69abd2b5ab70aa1d72b5e7224f146c8426394eb)

- [ ] 다국어 지원
  - [x] UI 다국어 지원
    - [x] [feat: basic i18n (#2) (12월 13일)](https://github.com/moeru-ai/airi/commit/38cda9e957aa4d66bed115ebf96d3d81ce085f68)

- [ ] UI 최적화
  - [x] [Canvas 씬 모바일 대응 (12월 5일)](https://github.com/nekomeowww/airi-vtuber/commit/bc04dbaf2ba98f13a367a8dd153cef4a19d1b83d)
    - [x] [Live2D Viewer 개선 (12월 5일)](https://github.com/nekomeowww/airi-vtuber/commit/f6e41e64afdb2592024a24ec2d1de732c4c3d537)
    - [x] [Live2D 모델 스케일링과 비율 적응 (12월 5일)](https://github.com/nekomeowww/airi-vtuber/commit/1ce61d7e13fd9dc55a447e513a10e4a08730716c)
  - [x] [화면 안전 영역 (12월 4일)](https://github.com/nekomeowww/airi-vtuber/commit/135a8a00fc4d0013d2caec585e8c911817870abc)
  - [x] [설정 메뉴 & 오버플로 최적화 (12월 7일)](https://github.com/nekomeowww/airi-vtuber/commit/e2f1f7bd37757b862d803f3cd77475b436fe8758)

## **모델**

- **VRM**
  - [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm/) 을 알려 준 [kwaa](https://github.com/kwaa)에게 감사드립니다
  - 관련 도구와 플러그인:
    - [VRM Add-on for Blender](https://vrm-addon-for-blender.info/en/)
    - [VRM format — Blender Extensions](https://extensions.blender.org/add-ons/vrm/)
    - [VRM Posing Desktop on Steam](https://store.steampowered.com/app/1895630/VRM_Posing_Desktop/)
    - [Characters Product List | Vket Store](https://store.vket.com/en/category/1)
  - 애니메이션 지원: VRM Animation `.vrma`
    - [`vrma` 스펙](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm_animation-1.0)
    - [3D Motion & Animation popular doujin goods available online (Booth)](https://booth.pm/en/browse/3D%20Motion%20&%20Animation)
      - [Seven VRM animations (.vrma) - VRoid Project - BOOTH](https://vroid.booth.pm/items/5512385)
        - [VRoid Hub introduces Photo Booth for animation playback! "VRM Animation (.vrma)" now listed on BOOTH, plus 7 free animation files!](https://vroid.com/en/news/6HozzBIV0KkcKf9dc1fZGW)
        - [malaybaku/AnimationClipToVrmaSample: Sample Project to Convert AnimationClip to VRM Animation (.vrma) in Unity](https://github.com/malaybaku/AnimationClipToVrmaSample)
