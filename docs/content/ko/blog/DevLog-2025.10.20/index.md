---
title: DevLog @ 2025.10.20
category: DevLog
date: 2025-10-20
excerpt: |
  Tauri에서 Electron 으로의 마이그레이션, 새 Live2D 모델, 그리고 여러 오픈소스 프로젝트 업데이트까지 AIRI 프로젝트의 최근 진행 상황을 나눕니다.
preview-cover:
# TODO
---

오랜만입니다, 여러분!

요즘 AI 트레이딩 봇이 엄청 뜨겁죠. 저희도 비슷한 연구를 나눌 게 있는데, 우선 개발 이야기부터 시작하겠습니다...

## Tauri에서 Electron 으로의 마이그레이션

며칠 전 Tauri가 다시 화제가 됐죠. 저희는 3월에 일찌감치 도입했고 플러그인 설계가 마음에 들어서 crate도 잔뜩 감쌌습니다. 6월에 드디어 v0.7.2를 릴리스했지만, 모두가 원하던 음성 대화를 제공하려고 3개월을 고생했습니다... 3개월요... Tauri의 WebKit과 지독히 까다로운 Web Audio API, DevTools와 씨름하면서... 9월까지 계속요...

...결국 더는 못 버티고, 국경절 연휴에 Electron으로 완전히 갈아탔습니다!

<img src="/en/blog/DevLog-2025.10.20/assets/electron.avif" alt="electron.avif" />

이제 기존 Electron 기반 위에 Linux 지원을 추가했고, 저희가 Controls Island라고 부르는 것을 도입했으며, macOS 전체 화면 모드에서도 인터페이스 위에 겹쳐 띄울 수 있게 됐습니다.

호환성이 훌륭해서 정말 마음에 듭니다. 어제는 마침내 자막 오버레이가 동작하게 되어서, 이제 Neuro-sama처럼 자막으로 AI가 무엇을 출력하는지 볼 수 있습니다!

<img src="/en/blog/DevLog-2025.10.20/assets/control-island.avif" alt="control-island.avif" />

<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Controls Island
</div>

## 새 Live2D 모델

눈썰미 좋은 분들은 눈치채셨을 텐데, 모델이 업데이트됐습니다! 네, 업데이트됐어요! 이 새 모델이 정말 마음에 듭니다 (아쉽게도 아직 오픈소스 저장소에 바로 넣을 준비는 되지 않았습니다).

이 모델은 Neuro-sama 공식 팀과 함께 작업한 적 있는 아티스트, 그리고 실력이 대단한 모델링 전문가와 협업해 영광스럽게 개선한 결과물입니다. 새 애니메이션 표정도 정말 풍부합니다.

(속삭이며) 스폰서가 더 늘어나면 어쩌면 저도... (x

<video src="/en/blog/DevLog-2025.10.20/assets/airi.mp4" alt="airi.mp4" controls></video>

## Three.js MMD 지원

여러분이 가지고 있거나 구할 수 있는 모델이 전부 Live2D/VRM은 아닐 겁니다. 사실 가장 풍부하고 좋은 건 여전히 MMD 모델이죠.

저희도 3D 렌더링에 Three.js를 쓰고 있지만, 현실적으로 Three.js에는 더 이상 동작하는 MMD 구현이 없습니다. kwaa의 작업 덕분에 이제 이를 위한 저장소가 생겼습니다!

관심 있으시다면 함께 유지보수해 주세요! [moeru-ai/three-mmd](https://github.com/moeru-ai/three-mmd)

## Velin: Vue로 프롬프트 작성하기

 >"[Vue](https://velin-dev.netlify.app/#/) 로 프롬프트를 작성할 수 있습니다"!

5월에 저희 프롬프트 라이브러리를 소개했던 걸 기억하시나요? RainbowBird의 노력과 기여 덕분에 Velin이 이제 정식으로 Moeru AI의 일부가 됐습니다! AIRI의 거의 모든 프롬프트가 Velin으로 돌아가는데, 크로스 플랫폼 걱정은 마세요. Velin은 Node.js 환경에서도 잘 동작합니다!

<img src="/en/blog/DevLog-2025.10.20/assets/velin.avif" alt="velin.avif" />

## Eventa: 이벤트 기반 IPC/RPC

>"Events are all you need"

Vercel AI SDK와 비슷한 방식으로 브라우저에서 순수 로컬 추론을 할 수 있게 해 주는 프로젝트 [netlify](https://velin-dev.netlify.app/#/) 를 소개한 적이 있습니다.

이런 로컬 추론은 전부 Web Worker / worker_threads 에서만 돌 수 있고, 이들은 이벤트로 통신합니다. Electron IPC도 마찬가지인데, 저희는 그게 충분히 우아하지 않다고 느꼈습니다. RainbowBird 덕분에 이제 이벤트 기반 IPC/RPC 구현을 이끄는 라이브러리 eventa가 생겼습니다. [Eventa](https://github.com/moeru-ai/eventa)도 이제 정식으로 Moeru AI의 일부입니다!

## 프로젝트 개발 현황

이제 Moeru AI와 Project AIRI는 거대한 조직으로 성장해, 머신러닝·데이터 처리·프론트엔드·백엔드 등을 아우르는 50개 이상의 자체 저장소를 TypeScript/Python/Rust/Go 등 여러 언어로 운영하고 있습니다.

전체 팔로워 수는 800명을 넘었습니다. 1년 전 처음 시작할 때는 상상도 못 했던 일입니다. 정말로, 성원해 주셔서 진심으로 감사합니다!

<img src="/en/blog/DevLog-2025.10.20/assets/moeru.avif" alt="moeru.avif" />
<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Moeru AI
</div>

<img src="/en/blog/DevLog-2025.10.20/assets/project-airi.avif" alt="project-airi.avif" />
<div style="text-align: center; font-size: 0.875rem; color: #666; margin-top: 0.5rem;">
Project AIRI
</div>

## 순수 Rust TTS 구현

작은 예고: 최근 kwaa와 팀을 이뤄 잘 알려진 TTS 모델 chatterbox를 순수 Rust 구현으로 포팅했습니다. 이제 까다로운 Python 환경 설정으로 골머리를 앓지 않아도 됩니다!

4080S 기준 한 번에 약 5초 추론. 정말 마음에 듭니다.

Python 모델 아키텍처를 사실상 1:1로 Rust에 재현했고, 다른 SOTA TTS 모델까지 활용하는 아주 간결한 로컬 TTS 추론 엔진으로 발전시키고 싶습니다.

<img src="/en/blog/DevLog-2025.10.20/assets/rust-tts.avif" alt="rust-tts.avif" />

## 마치며

오늘의 "one more thing"은 여기까지입니다. 연달아 이어진 긴 스레드를 즐기셨기를 바랍니다!

내일도 계속 업데이트해서 더 많은 이야깃거리를 가져오겠습니다. VLA/VLM 게이밍 분야에서의 탐구, 어떻게 접근하고 있는지, 어떤 결과를 보고 있는지 소개하겠습니다.
