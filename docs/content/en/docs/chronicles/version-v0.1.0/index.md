# Chronicles v0.1.0


- [x] [Frontend VRM integration (Dec 5)](https://github.com/nekomeowww/airi-vtuber/commit/5738c219b5891f200d7dc9dae04a8e885c8d8c17)
  - [x] [VRM idle animation (Dec 6)](https://github.com/nekomeowww/airi-vtuber/commit/8f9a0e76cde546952651189229c824c6196caed6)
  - [x] [VRM blinking (Dec 7)](https://github.com/nekomeowww/airi-vtuber/commit/289f8226696998dae36b550d3a055eba04e160f6)
- [x] Mouth (Jun 8)
  - [x] [Created the unspeech project (Dec 13)](https://github.com/moeru-ai/unspeech)
    - [x] Integrated TTS (Jun 8)
    - [x] Integrated 11Labs
      - [x] [Wrapped a standalone 11Labs types package (Dec 3)](https://github.com/nekomeowww/airi-vtuber/commit/f9ddf9af93a61e0a2f3323ced79171f29b6dd2e6)
- [x] Hearing (Dec 12)
  - [x] Implemented the speak button (Jun 9)
  - [x] ~~Audio transcription to text~~
    - [x] ~~Frontend streaming audio to the backend~~
      - [x] Using socket.io over WebSocket for bidirectional communication [Socket.IO](https://socket.io/) (Jun 10)
        - [x] socket.io is actually not based on WebSocket
          - [node.js - What is the major scenario to use Socket.IO - Stack Overflow](https://stackoverflow.com/questions/18587104/what-is-the-major-scenario-to-use-socket-io)
          - [node.js - Differences between socket.io and websockets - Stack Overflow](https://stackoverflow.com/questions/10112178/differences-between-socket-io-and-websockets)
        - [x] Frontend uses the `socket.io-client` package, `pnpm i socket.io-client`
          - [x] WebSocket support is good, and Nitro used by Nuxt also supports it, [How to use with Nuxt | Socket.IO](https://socket.io/how-to/use-with-nuxt)
        - [x] Backend uses the `socket.io` package, `pnpm i socket.io`
        - Nuxt 3 and socket.io
          - [richardeschloss/nuxt-socket-io: Nuxt Socket IO - socket.io client and server module for Nuxt](https://github.com/richardeschloss/nuxt-socket-io)
          - [javascript - Socket.io websocket not working in Nuxt 3 when in production - Stack Overflow](https://stackoverflow.com/questions/73592619/socket-io-websocket-not-working-in-nuxt-3-when-in-production)
          - [adityar15/nuxt3socket (github.com)](https://github.com/adityar15/nuxt3socket)
      - [x] ~~Using WebRTC for audio streaming, VueUse also supports it~~
        - [x] Nuxt and Nitro do not seem to support it yet, so let's skip this step for now; it can be considered for group chat or Discord
        - Tutorials
          - [Media devices getting started | WebRTC](https://webrtc.org/getting-started/media-devices)
          - [WebRTC | JavaScript standard reference tutorial](https://wohugb.gitbooks.io/javascript/content/htmlapi/webrtc.html)
    - ~~Transformers.js + Whisper is enough~~
      - [x] Chrome / Edge now support WebGPU
        - [x] There is a [Real-time Whisper WebGPU - a Hugging Face Space by Xenova](https://huggingface.co/spaces/Xenova/realtime-whisper-webgpu) demo to reference; it is not open-sourced yet
      - [x] ~~Whisper can just run inference directly in the browser~~
      - [x] ~~WebGPU is not supported yet~~ now supported
        - [x] [🤗 Transformers.js + ONNX Runtime WebGPU in Chrome extension | by Wei Lu | Medium](https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9)
      - ~~In summary, the approach of porting whisper.cpp to an embedded Node.js C++ addon~~
      - [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
    - Tutorials
      - [Realtime video transcription and translation with Whisper and NLLB on MacBook Air | by Wei Lu | Medium](https://medium.com/@GenerationAI/realtime-video-transcription-and-translation-with-whisper-and-nllb-on-macbook-air-31db4c62c074)
      - [🤗 Transformers.js + ONNX Runtime WebGPU in Chrome extension | by Wei Lu | Medium](https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9)
  - [ ] [Whisper WebGPU Demo (Dec 10)](https://github.com/moeru-ai/airi/commit/ae3b9468d74c5d38c507ae2877799fd36339f8c1)
  - [ ] [MicVAD Demo (Dec 11)](https://github.com/moeru-ai/airi/commit/e4a0cc71006639669e9d71f0db27086fca47a03a)
  - [ ] [MicVAD + ONNX Whisper real-time transcription (Dec 12)](https://github.com/moeru-ai/airi/commit/01dbaeb9317ab7491743e50dd6c58fc7e19a880d)
  - [ ] [dcrebbin/oai-voice-mode-chat-mac: Adds realtime chat for ChatGPT Voice Mode [Unofficial]](https://github.com/dcrebbin/oai-voice-mode-chat-mac)
- [x] Expressions (Jul 9)
  - [x] [Frontend VRM expression control (Dec 7)](https://github.com/nekomeowww/airi-vtuber/commit/b69abd2b5ab70aa1d72b5e7224f146c8426394eb)
- [ ] Multilingual
  - [x] Interface multilingual support
    - [x] [feat: basic i18n (#2) (Dec 13)](https://github.com/moeru-ai/airi/commit/38cda9e957aa4d66bed115ebf96d3d81ce085f68)
- [ ] Interface polish
  - [x] [Canvas scene mobile adaptation (Dec 5)](https://github.com/nekomeowww/airi-vtuber/commit/bc04dbaf2ba98f13a367a8dd153cef4a19d1b83d)
    - [x] [Live2D Viewer improvements (Dec 5)](https://github.com/nekomeowww/airi-vtuber/commit/f6e41e64afdb2592024a24ec2d1de732c4c3d537)
    - [x] [Live2D model scaling and adaptive aspect ratio (Dec 5)](https://github.com/nekomeowww/airi-vtuber/commit/1ce61d7e13fd9dc55a447e513a10e4a08730716c)
  - [x] [Screen safe area (Dec 4)](https://github.com/nekomeowww/airi-vtuber/commit/135a8a00fc4d0013d2caec585e8c911817870abc)
  - [x] [Settings menu & overflow fixes (Dec 7)](https://github.com/nekomeowww/airi-vtuber/commit/e2f1f7bd37757b862d803f3cd77475b436fe8758)


## Models


- VRM
  - Thanks to [kwaa](https://github.com/kwaa) for pointing us to [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm/)
  - Related tools and plugins:
    - [VRM Add-on for Blender](https://vrm-addon-for-blender.info/en/)
    - [VRM format — Blender Extensions](https://extensions.blender.org/add-ons/vrm/)
    - [VRM Posing Desktop on Steam](https://store.steampowered.com/app/1895630/VRM_Posing_Desktop/)
    - [Characters Product List | Vket Store](https://store.vket.com/en/category/1)
  - Animation support: VRM Animation `.vrma`
    - [`vrma` Spec](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm_animation-1.0)
    - [3D Motion & Animationの人気の同人グッズ1283点を通販 - BOOTH](https://booth.pm/en/browse/3D%20Motion%20&%20Animation)
      - [VRMアニメーション7種セット（.vrma） - VRoid Project - BOOTH](https://vroid.booth.pm/items/5512385)
        - [VRoid Hub introduces Photo Booth for animation playback! "VRM Animation (.vrma)" now listed on BOOTH, plus 7 free animation files!](https://vroid.com/en/news/6HozzBIV0KkcKf9dc1fZGW)
        - [malaybaku/AnimationClipToVrmaSample: Sample Project to Convert AnimationClip to VRM Animation (.vrma) in Unity](https://github.com/malaybaku/AnimationClipToVrmaSample)

