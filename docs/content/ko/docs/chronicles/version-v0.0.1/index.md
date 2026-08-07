---
title: 연대기 v0.0.1
---

- [x] 프로젝트 생성 - 완료, Vitesse Lite와 Vue 조합으로 생성 (2024년 6월 7일)
- [x] 프론트엔드 Live2D 연동 - [Pixi.js 렌더러를 통해 Vue 애플리케이션에 Live2D 모델 통합하기](https://nolebase.ayaka.io/to/3cae2b7c0b)에서 완료 (2024년 6월 7일)
  - [x] Live2D Cubism SDK 연동
  - [x] pixi.js 렌더링
  - [x] 모델 다운로드
    - [x] Momose Hiyori (Neuro 초기 버전 모델) Pro 버전 (중소기업 상업 이용 무료)

![]( /assets/version-v0.0.1/screenshot-1.avif)

- [x] Vercel AI SDK를 통한 GPT-4o 연동 (2024년 6월 7일)
  - [x] `@ai-sdk/openai`
  - [x] `ai`
- [x] 스트리밍 토큰 전송 (2024년 6월 8일)
- [x] 스트리밍 토큰 수신 (2024년 6월 8일)
- [x] 스트리밍 TTS (2024년 6월 8일)
  - [x] [node.js - How to properly handle streaming audio coming from Elevenlabs Streaming API? - Stack Overflow](https://stackoverflow.com/questions/76854884/how-to-properly-handle-streaming-audio-coming-from-elevenlabs-streaming-api)
  - [x] [Stream Response - Getting Started - h3 (unjs.io)](https://h3.unjs.io/examples/stream-response)
  - [x] ~~GPT-SoVITS 설정~~(조금 복잡해서, 시간이 날 때 샘플로 다뤄 볼 예정)
- [x] 립싱크 (2024년 6월 9일)
  - [x] 음량에 따라 입 벌림 크기 결정
    - [x] Math.pow 비율로 음량 곡선 증폭
    - [x] 선형 정규화
    - [x] MinMax 정규화
    - [x] ~~SoftMax 정규화~~(효과가 좋지 않았음. 출력 데이터가 전부 0.999999 ~ 1.000001 범위에 몰림)
- [x] 스트리밍 토큰에서 스트리밍 TTS로 (2024년 6월 9일)
  - [x] 구두점과 공백 + 글자 수 제한 조합으로 문장을 구성한 뒤 TTS 추론을 수행할 수 있어 보임
    - [x] ~~11Labs는 WebSocket 기반~~
    - [x] 큐를 통해 TTS 스트림 요청을 보내고, 다시 오디오 스트림 큐로 전달
    - [x] Vue에서 Queue 구현
      - [x] queue는 선입선출이어야 함
        - [x] 꺼내기, [`Array.prototype.shift`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/shift)
        - [x] 넣기, [`Array.prototype.push`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/push)
        - [x] 이벤트 기반
          - [x] 이벤트
            - [x] `add`, 추가할 때 `add` 이벤트 발생
            - [x] `pick`, 가져올 때 `pick` 이벤트 발생
            - [x] `processing`, 핸들러를 호출할 때 `processing` 이벤트 발생
            - [x] `done`, 핸들러가 끝나면 `done` 이벤트 발생
          - [x] 이벤트 처리
            - [x] `add`나 `done` 이벤트가 발생하면 실행 중인 핸들러가 있는지 확인
              - [x] 있으면 반환
              - [x] 없으면 `pick(): T` 후 핸들러 호출
        - [x] queue 핸들러
          - [x] await 라면 queue 핸들러의 처리를 기다림
            - [x] 이론적으로 textPart → TTS 스트림 핸들러는 또 다른 큐, 즉 오디오 스트림 큐로 연결되어야 함
            - [x] 오디오 스트림을 병합할 수 있을까? Raw PCM(.wav)을 직접 다뤄야 할 수도 있음
            - [x] 오디오 스트림 큐 핸들러는 큐에서 계속 오디오를 찾아 재생해야 함
- [x] 기본적인 Neuro Sama / AI VTuber 롤플레잉 (2024년 6월 10일)
  - [x] 기본 프롬프트

2024년 6월 10일에 이미 완료, 4일도 걸리지 않았습니다.

이제 가능한 것들:
- ✅ 풀스택 (원래는 순수 Vue 3 였음)
- ✅ Live2D 모델 표시
- ✅ 대화
- ✅ 대화 UI
- ✅ 음성
- ✅ Live2D 립싱크 (itorr의 GitHub 설명 덕분)
- ✅ 기본 프롬프트

![](/assets/version-v0.0.1/screenshot-2.avif)

## 멀티모달

### 입 (2024년 6월 8일)

- [x] TTS 연동 (2024년 6월 8일)
  - [x] 11Labs 연동
- [ ] 리서치
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> [Deepgram Voice AI: Text to Speech + Speech to Text APIs | Deepgram](https://deepgram.com/)
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> GPT-SoVITS 시도해 보기
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> fish-speech 시도 (2024년 7월 6일 ~ 2024년 7월 7일)
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> 실제로 few-shot으로 바로 복제가 가능함. Gura의 목소리를 복제해 봤는데 처음 4초까지는 아주 높은 품질을 유지함
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> fish audio의 오디오 처리 도구는 매우 충실해서, 오디오 프로세서가 (라벨링과 자동 라벨링을 포함해) 대부분의 요구를 커버함
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> 결과가 매우 불안정해서 단어나 소리를 자주 삼키거나 갑자기 이상한 잡음을 냄
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> RTX 4090 장비에서 돌려도 스트리밍 오디오 모드에서는 추론 결과를 내보내는 데 최대 2초가 걸림
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> ChatTTS 시도 (2024년 7월 6일 ~ 2024년 7월 7일)
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> 실제로 few-shot 복제가 가능함. Gura의 목소리를 복제해 봤지만 fish-speech 만큼 좋지는 않았음
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> 감정 제어는 fish-speech보다 훨씬 좋지만, 영어 환경에서는 `[uv_break]` 같은 토큰까지 발음해 버림. WeChat 그룹에서도 이 부분을 두고 이야기가 오가고 있음
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> RTX 4090 장비에서 돌려도 스트리밍 오디오 모드에서는 몇 분이 걸림... 🤯 정말 말이 안 됨. 평문/정규화된 텍스트를 액션 토큰이 포함된 텍스트로 바꾸기 위해 먼저 로컬에서 llm을 돌리는 것으로 보이는데, 그 llm을 띄울 때 캐싱이나 모델 크기를 전혀 고려하지 않은 듯함
   - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> [TTS Arena - a Hugging Face Space by TTS-AGI](https://huggingface.co/spaces/TTS-AGI/TTS-Arena)에 언급된 다른 모델들 시도 (2024년 7월 8일)
     - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> XTTSv2 시도
       - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> huggingface를 그대로 사용했는데 결과가 좋지 않음. fish speech나 chattts 보다는 안정적이지만 톤이 너무 밋밋해서, 애니메이션 톤을 위해서는 lora가 필요할 듯
     - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> StyleTTS 2 시도
       - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> huggingface를 그대로 사용했는데 결과가 좋지 않음. fish speech나 chattts 보다는 안정적이지만 톤이 너무 밋밋해서, 애니메이션 톤을 위해서는 lora가 필요할 듯
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> CosyVoice 시도 (알리바바)
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> [Koemotion](https://koemotion.rinna.co.jp/)
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> [Seed-TTS](https://bytedancespeech.github.io/seedtts_tech_report/)

### 표정 (2024년 7월 9일)

- [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> embed instruction으로 표정을 실시간으로 빠르게 처리하는 방법을 GPT와 논의 https://poe.com/s/vu7foBWJHtnPmWzJNeAy (2024년 7월 7일)
- [x] 프론트엔드 Live2D 표정 제어 (2024년 7월 9일)
  - [x] `<|EMOTE_HAPPY|>` 인코딩을 통해 구현
  - [x] `<|DELAY:1|>` 같은 지연 문법도 추가 지원
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 감정 토큰 `<|EMOTE_.*|>` 파서와 토크나이저 캡슐화
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 큐 기반 스트리밍 처리 지원, `useEmotionMessagesQueue`와 `useEmotionsQueue` 캡슐화
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> Live2D를 호출해 모션 표정을 처리하도록 지원
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 테스트용 디버그 페이지
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 스트리밍 전체 과정의 지연을 동적으로 제어하기 위한 지연 토큰 `<|DELAY:.*|>` 파서와 토크나이저 캡슐화
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 큐 기반 스트리밍 처리 지원, `useDelaysQueue` 캡슐화
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 테스트용 디버그 페이지
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 표시 레이어 캡슐화가 스트림 텍스트를 사전 토크나이즈·파싱하여 `<|...|>` 문법을 제외하도록 지원

### 동작

#### VRM 립싱크

##### 리서치

- [ ] [sigal-raab/MoDi: Unconditional Motion Synthesis from Diverse Data](https://github.com/sigal-raab/MoDi)
- [ ] [TMR - Text-to-motion Retrieval](https://mathis.petrovich.fr/tmr/)
  - [ ] [Mathux/TMR - GitHub](https://github.com/Mathux/TMR)
- [ ] 리서치에 사용한 인덱스 사이트
  - [ ] [Hannibal046/Awesome-LLM: Awesome-LLM: a curated list of Large Language Model](https://github.com/Hannibal046/Awesome-LLM)
- [ ] 리서치 중 ADHD 같은 행동
  - [ ] 친구가 NVIDIA의 새 논문 [ConsiStory: Training-Free Consistent Text-to-Image Generation](https://research.nvidia.com/labs/par/consistory/) 를 추천해 줬는데 IPadapter보다 안정적으로 느껴짐.
- [ ] 흥미로운 것은 [IDEA-Research/MotionLLM: [Arxiv-2024] MotionLLM: Understanding Human Behaviors from Human Motions and Videos](https://github.com/IDEA-Research/MotionLLM). 이 논문과 연구 방향은 영상 애니메이션 프레임 사이에 형성되는 사람의 동작을 자연어로 기술하는 것에 관한 내용. 2024년 5월 31일 공개.
- [ ] [Ksuriuri/EasyAIVtuber: Simply animate your 2D waifu.](https://github.com/Ksuriuri/EasyAIVtuber)
- [ ] 이건 꽤 큰 주제라서 여러 키워드를 조사해 본 결과, 현재 이 방향의 주요 연구 주제들을 찾았습니다:
  - [ ] 디지털 휴먼 합성 -> 가상 WebCam 모션 캡처
    - [ ] [PersonaTalk: Bring Attention to Your Persona in Visual Dubbing](https://arxiv.org/pdf/2409.05379)
      - [ ] 이것이 SOTA로 보임
    - [ ] [OpenTalker/SadTalker: [CVPR 2023] SadTalker：Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation](https://github.com/OpenTalker/SadTalker)
    - [ ] [Rudrabha/Wav2Lip: This repository contains the codes of "A Lip Sync Expert Is All You Need for Speech to Lip Generation In the Wild", published at ACM Multimedia 2020. For HD commercial model, please try out Sync Labs](https://github.com/Rudrabha/Wav2Lip)
    - [ ] [yerfor/GeneFace: GeneFace: Generalized and High-Fidelity 3D Talking Face Synthesis; ICLR 2023; Official code](https://github.com/yerfor/GeneFace)
    - [ ] [harlanhong/CVPR2022-DaGAN: Official code for CVPR2022 paper: Depth-Aware Generative Adversarial Network for Talking Head Video Generation](https://github.com/harlanhong/CVPR2022-DaGAN)
    - [ ] [Kedreamix/PaddleAvatar](https://github.com/Kedreamix/PaddleAvatar)
    - [ ] [yangkang2021/I_am_a_person: Real-time interactive GPT digital human](https://github.com/yangkang2021/I_am_a_person?tab=readme-ov-file)
    - [ ] [I_am_a_person/数字人/README.md at main · yangkang2021/I_am_a_person](https://github.com/yangkang2021/I_am_a_person/blob/main/%E6%95%B0%E5%AD%97%E4%BA%BA/README.md)
  - [ ] Text-to-Motion (T2M, 텍스트에서 동작으로)
    - [ ] [SuperPADL: Scaling Language-Directed Physics-Based Control with Progressive Supervised Distillation](https://arxiv.org/html/2407.10481v1)
      - [ ] 2024년 7월 1일자 NVIDIA 최신 연구
      - [ ] 친구가 추천
    - [ ] [Generating Diverse and Natural 3D Human Motions from Text (CVPR 2022)](https://github.com/EricGuo5513/text-to-motion)
      - [ ] 논문: [Generating Diverse and Natural 3D Human Motions from Texts](https://ericguo5513.github.io/text-to-motion/)
    - [ ] 친구가 자연어 기반 공동 생성을 하는 사람들을 소개해 주면서 이 논문들을 추천해 줬습니다:
      - [ ] [TEMOS: Generating diverse human motions from textual descriptions (arxiv.org)](https://arxiv.org/abs/2204.14109)
      - [ ] [AvatarGPT: All-in-One Framework for Motion Understanding, Planning, Generation and Beyond](https://arxiv.org/abs/2311.16468)
      - [ ] [T2M-GPT: Generating Human Motion from Textual Descriptions with Discrete Representations](https://arxiv.org/abs/2301.06052)
    - [ ] 키프레임 제어이기도 해서 키프레임 관련 논문도 몇 개 살펴봤습니다
      - [ ] [Koala: Key frame-conditioned long video-LLM](https://arxiv.org/html/2404.04346v1)
  - [ ] Code as Policies (주로 로보틱스 분야)
    - [ ] 물론 선구자는 여기 [Code as Policies: Language Model Programs for Embodied Control](https://code-as-policies.github.io/)
    - [ ] [Scaling Up and Distilling Down: Language-Guided Robot Skill Acquisition (columbia.edu)](https://www.cs.columbia.edu/~huy/scalingup/)
    - [ ] [CLIPort](https://cliport.github.io/)：CLIPort: What and Where Pathways for Robotic Manipulation
    - [ ] [VIMA | General Robot Manipulation with Multimodal Prompts](https://vimalabs.github.io/)：VIMA: General Robot Manipulation with Multimodal Prompts
    - [ ] [Scaling Up and Distilling Down: Language-Guided Robot Skill Acquisition](https://www.cs.columbia.edu/~huy/scalingup/)
    - [ ] [EUREKA: HUMAN-LEVEL REWARD DESIGN VIA CODING LARGE LANGUAGE MODELS](https://eureka-research.github.io/assets/eureka_paper.pdf)는 요약본에 가까운 느낌.
  - [ ] 강화학습
    - [ ] 이 방향은 주로 로보틱스 저수준 제어에서 이미 학습된 RL 모델과 연결한 뒤, 인터페이스와 연산 레이어에 code as policies 구현을 많이 얹는 방식
      - [ ] [MarI/O - Machine Learning for Video Games - YouTube](https://www.youtube.com/watch?v=qv6UVOQ0F44)
    - [ ] [RLADAPTER: BRIDGING LARGE LANGUAGE MODELS TO REINFORCEMENT LEARNING IN OPEN WORLDS](https://openreview.net/pdf?id=3s4fZTr1ce)의 요지: RLAdapter 프레임워크 안에서 RL 에이전트 학습 중 생성된 정보로 경량 언어 모델을 파인튜닝하면 LLM이 다운스트림 작업에 적응하는 데 크게 도움이 되고, 결과적으로 RL 에이전트에게 더 나은 가이드를 줄 수 있다는 것. Crafter 환경에서 RLAdapter를 실험한 결과 SOTA 베이스라인을 뛰어넘었고, 이 프레임워크 아래에서 에이전트는 베이스라인 모델에는 없는 상식적인 행동을 보였다고 합니다
    - [ ] [See and Think: Embodied Agent in Virtual Environment](https://arxiv.org/pdf/2311.15209)는 아래에 언급한 Voyager, PlanMC, MP5와 비슷하게 Minecraft를 위한 연구인데, 주로 RL을 강조하는 느낌.
    - [ ] [Text2Reward: Reward Shaping with Language Models for Reinforcement Learning](https://text-to-reward.github.io/)
    - [ ] [Direct Preference Optimization: Your Language Model is Secretly a Reward Model](https://arxiv.org/pdf/2305.18290)는 주로 LLM 자체가 보상 모델이 될 수 있다는 이야기. RLHF를 어떻게 결합할지 배울 수 있고 트랜스포머 관점에서도 꽤 기초적인 내용.
  - [ ] Embodied Control
    - [ ] 여기에 많이 정리되어 있음
      - [ ] [zchoi/Awesome-Embodied-Agent-with-LLMs](https://github.com/zchoi/Awesome-Embodied-Agent-with-LLMs)："대규모 언어 모델을 활용한 Embodied AI 또는 로봇" 연구를 정리한 목록입니다. 최신 업데이트를 받으려면 이 저장소를 watch 하세요! 🔥
    - [ ] [MP5: A Multi-modal Open-ended Embodied System in Minecraft via Active Perception](https://arxiv.org/pdf/2312.07472) 이건 흥미롭습니다. 비교적 완성된 Minecraft RL 프레임워크를 사용해, 자연어 지시로 LLM에게 "**낮**에 **초원**의 **물가**에서 **돌검**으로 **돼지**를 **잡아라**" 라고 알려 주면 RL 에이전트가 이런 특징들을 인지하고 목표를 달성하는 방식입니다. [AI가 Minecraft를 플레이하게 하는 방법? Voyager 논문 노트](https://nolebase.ayaka.io/to/27024f5434)와 달리 MP5는 PlanMC에 더 가깝고, Voyager의 순수 텍스트·순수 상태 정보 대신 멀티모달 능력을 통합했습니다.
      - [ ] 초록: 매우 도전적인 Minecraft 시뮬레이터 위에 구축한 개방형 멀티모달 embodied 시스템 MP5를 소개합니다. 실행 가능한 하위 목표를 분해하고, 복잡한 맥락 인식 계획을 설계하며, embodied 행동 제어를 수행하고, 목표 조건부 능동 인지 체계와 자주 소통할 수 있습니다. 구체적으로 MP5는 멀티모달 대규모 언어 모델(MLLM)의 최근 성과를 바탕으로 개발되었으며, 시스템은 여러 기능 모듈로 나뉘어 스케줄링·협업을 통해 사전 정의된 맥락·과정 관련 작업을 최종적으로 해결합니다.
    - [ ] [CRADLE: Empowering Foundation Agents Towards General Computer Control](https://arxiv.org/pdf/2403.03186) 아직 안 읽음. 시간 날 때 읽을 예정.
    - [ ] [Embodied Multi-Modal Agent trained by an LLM from a Parallel TextWorld](https://arxiv.org/pdf/2311.16714)는 주로 **병렬 텍스트 세계에서 뛰어난 LLM 에이전트를 이용해 시각 세계에 사는 VLM 에이전트를 학습시키는** 이야기.
    - [ ] [Online continual learning ONLINE CONTINUAL LEARNING FOR INTERACTIVE INSTRUCTION FOLLOWING AGENTS](https://openreview.net/pdf?id=7M0EzjugaN)
  - [ ] Manipulation (주로 로보틱스 분야)
  - [ ] Motion Embeddings
    - [ ] [PerAct](https://peract.github.io/)：꽤 드물게도, code as policies와 RL 환경 정보에 manipulation까지 토큰으로 인코딩해 연산한다는 내용
  - [ ] Feedback Loop (주로 로보틱스 + 제어 분야, 이 카테고리는 사실 더 드묾)
    - [ ] 일반적인 환경과 관련 있을 것 같은데, 상당히 저수준 영역
    - [ ] 차라리 RL을 직접 파는 게 도움이 될지도
    - [ ] [InCoRo: In-Context Learning for Robotics Control with Feedback Loops](https://arxiv.org/html/2402.05188v1?_immersive_translate_auto_translate=1)는 제목이 매력적인데 아직 꼼꼼히 읽지는 못했습니다. 시간 날 때 읽을 예정이고, 인용도 많이 됐습니다.
      - [ ] 목적은 주로 LLM의 자연어 명령을 로봇 유닛을 위한 저수준의 _정적_ 실행 계획으로 변환하는 것. LLM 내부의 로봇 시스템을 활용해 이를 새로운 수준으로 일반화하고, 새로운 작업에 대한 zero-shot 일반화를 가능하게 합니다.
    - [ ] 관련해서 Hugging Face가 오픈소스로 공개한 LeRobot도 참고할 만함
      - [ ] [huggingface/lerobot: 🤗 LeRobot: End-to-end Learning for Real-World Robotics in Pytorch](https://github.com/huggingface/lerobot?tab=readme-ov-file)

### 시각

- [ ] [OpenGVLab/Ask-Anything: [CVPR2024 Highlight][VideoChatGPT] ChatGPT with video understanding! And many more supported LMs such as miniGPT4, StableLM, and MOSS.](https://github.com/OpenGVLab/Ask-Anything)
- [ ] [DirtyHarryLYL/LLM-in-Vision: Recent LLM-based CV and related works. Welcome to comment/contribute! (github.com)](https://github.com/DirtyHarryLYL/LLM-in-Vision)
- [ ] [landing-ai/vision-agent: Vision agent (github.com)](https://github.com/landing-ai/vision-agent)
- [ ] [2404.04834 LLM-Based Multi-Agent Systems for Software Engineering: Vision and the Road Ahead (arxiv.org)](https://arxiv.org/abs/2404.04834)
- [ ] [Experimentation: LLM, LangChain Agent, Computer Vision | by TeeTracker | Medium](https://teetracker.medium.com/experimentation-llm-langchain-agent-computer-vision-0c405deb7c6e)
- [ ] Neuro Sama는 어떻게 화면을 보고 이해하는 걸까?
- [ ] [Is it possible to use a local LLM and have it play Minecraft? : r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/143ziop/comment/jnfvr1w/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
- [ ] [2402.07945 ScreenAgent: A Vision Language Model-driven Computer Control Agent](https://arxiv.org/abs/2402.07945)
- [ ] 스탠퍼드와 베이 에어리어에서 대규모 언어 모델이 로봇을 제어하게 하는 시스템은 어떻게 동작할까?
  - [ ] 스트리밍 토큰을 바로 출력? 액션 토큰?
  - [ ] 컴퓨터 비전은 어떻게 처리할까?
  - [ ] 숙제 베끼기
- [ ] [svpino/alloy-voice-assistant](https://github.com/svpino/alloy-voice-assistant)

### 기억

- [ ] 장기 기억
- [ ] 단기 기억
- [ ] 기억 회상 액션
- [ ] 벡터 데이터베이스

### 다국어

- [ ] 다국어 지원
  - [ ] 중국어
    - [ ] 현재 11Labs의 중국어 TTS 모델은 품질이 너무 떨어짐
    - [ ] Microsoft의 Cognitive TTS API도 그다지 좋지 않음
    - [ ] AWS는 결과가 나쁨
    - [ ] 알리바바 클라우드가 괜찮다고 함
  - [ ] 일본어
    - [ ] [Koemotion](https://koemotion.rinna.co.jp/)
    - [ ] Pixiv의 [ChatVRM 데모](https://github.com/pixiv/ChatVRM)도 이걸 사용함

## 최적화 위시리스트 백로그

### 코드 저장소 & 아키텍처

- [x] [SPA로 마이그레이션](https://github.com/nekomeowww/airi-vtuber/commit/cd0f371595a669c570dc263e72dd3ce54afab7ff)
- [x] [모노레포로 마이그레이션](https://github.com/nekomeowww/airi-vtuber/commit/ee4878710eeded6ef1b66474905936353d0176b4)
- [x] moeru-ai 조직으로 통합

### 인터랙션 최적화

- [x] sendMessage 입력란이 비어 있으면 전송하지 않기 (2024년 6월 9일)
- [x] 대화 기록 (2024년 6월 9일)
- [ ] 컨텍스트를 초과한 대화 기록 자동 정리
  - 예전에 Go로 구현한 적이 있으니 가져오면 됨.
- [ ] 컨텍스트 크기 자동 판단
- [ ] 마이크 선택 지원
- [ ] 단축키 리스닝 구현 (방송 사고 방지)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 듣기 버튼 (2024년 6월 9일)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">버그</span> Live2D 모션 제어 시 모든 모션을 미리 불러오지 않아 발생하는 지연 (2024년 7월 10일)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">버그</span> Live2D 모션 제어 시 재생 중인 모션을 강제로 덮어쓰지 않아 발생하는 프레임 스킵 지연 (2024년 7월 10일)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">버그</span> Live2D 모션 제어 시 `.motion(motionName)` 호출을 await 하지 않아 발생하는 재생 이상 (2024년 7월 10일)

### 인터페이스 최적화

- [x] `window` 크기가 바뀔 때 pixi 씬과 캔버스 크기 조정 (2024년 6월 9일)
- [x] 회의 중 말하면 반짝이는 효과처럼, 아바타 위에 음량 레벨 표시 (2024년 6월 9일)
- [ ] 메시지 팝업에 스펙트럼 표시 (꽤 어려워 보임)
  - 데모 참고 [audioMotion](https://audiomotion.app/?mode=server#!)
  - 튜토리얼 참고 [Adding Audio Visualizers to your Website in 5 minutes! | by Aditya Krishnan | Medium](https://medium.com/@adityakrshnn/adding-audio-visualizers-to-your-website-in-5-minutes-23985d2b1245)
  - 숙제 베끼기 [JS Audio Visualizer (codepen.io)](https://codepen.io/nfj525/pen/rVBaab)
- [ ] 애니메이션 & ACG 스타일
  - [ ] 소재 & 생성기
    - [ ] [Free SVG generators, color tools & web design tools](https://www.fffuel.co/)
    - [ ] [Uiverse | The Largest Library of Open-Source UI elements](https://uiverse.io/)
  - [ ] 리서치 레퍼런스
    - [ ] 인덱스 사이트
      - [ ] [アニメーション | 81-web.com : 日本のWebデザイン・Webサイトギャラリー＆参考サイト・リンク集](https://81-web.com/tag/animation)
      - [ ] [2021年版イケてるアニメのWebサイト10選(自薦) | Blog | 株式会社イロコト | ゲーム･アニメ等のエンタメ系Web制作&運用会社](https://irokoto.co.jp/blog/20210421/post-20)
      - [ ] [漫画･アニメ･ゲーム | SANKOU! | Webデザインギャラリー･参考サイト集](https://sankoudesign.com/category/comic-anime-movie-game-book/)
      - [ ] [KVが動画・アニメーションのWebデザイン参考ギャラリー・リンク集 | Web Design Garden | 毎日更新！Webデザイン参考ギャラリーサイト](https://webdesigngarden.com/category/element/kv-movie/)
    - [ ] [ドーナドーナ いっしょにわるいことをしよう | アリスソフト](https://www.alicesoft.com/dohnadohna/)
    - [ ] [Unbeatable Game](https://www.unbeatablegame.com/)
    - [ ] [Splatoon™ 3 for Nintendo Switch™ -- Official Site](https://splatoon.nintendo.com/)
    - [ ] [MuseDash](https://musedash.peropero.net/#/special/events/marija480)
    - [ ] [Misky Co., Ltd. | Company supporting people living as themselves](https://www.misky.co.jp/)
    - [ ] 확장
      - [ ] [sabrinas.space](https://sabrinas.space/)

### 추론 최적화

- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 메시지를 보낼 때 피드백을 위해 곧바로 생각하는 표정으로 전환하도록 지원 (2024년 7월 9일)
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 감정 인식
  - [ ] 현재는 감정 토큰을 처리하느라 토큰을 추가로 낭비하고 있는데, 전통적인 NLP 감정 분석(sentiment)을 시도해 볼 수 있음
    - [ ] 다만 전통적인 sentiment는 긍정과 부정밖에 없어서, 다른 감정을 어떻게 지원할지 고민이 필요함
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 감정 토큰 임베딩
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 현재 `<|EMOTE_.*|>` 패턴 토큰은 토크나이저가 관리하지 않아서, 추론 중에 스트리밍 호환 토크나이저를 여러 개 따로 작성해야 함
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 현재 `<|EMOTE_.*|>` 패턴 토큰은 토크나이저가 관리하지 않아서, 추론 중에 스트리밍 호환 토크나이저를 여러 개 따로 작성해야 함
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">버그</span> `useQueue`가 처리 중 `isProcessing` 락으로 분리된 큐 항목을 고려하지 않음 (2024년 7월 9일)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">버그</span> Local Storage에 저장된 모델이 필요한 데이터와 맞지 않아 `computed` 무한 루프가 발생해 인터페이스가 멈춤 (2024년 7월 9일)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">버그</span> Live2DViewer 프레임의 자동 크기 감지 기능에 문제가 있음 (2024년 7월 9일)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-red-500/30 text-red-800 dark:text-red-400 bg-red-500/20 rounded-lg">버그</span> streamSpeech 중 무한 루프를 피하려고 빈 텍스트를 격리하면서 생긴 문제 (2024년 7월 9일)
- [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> `useQueue`가 `handler` 안에서 커스텀 이벤트를 지원 (2024년 7월 9일)
- [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 텍스트 출력과 음성 출력 타이밍 동기화
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> `ttsQueue`와 `audioPlaybackQueue`가 대응하는 타임스탬프를 저장할 수 있게
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> `audioPlaybackQueue` 처리와 재생을 마칠 때 오디오 길이 계산
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 공백으로 텍스트를 나눠 `['hello ', 'this ', 'is ', 'neuro ']` 얻기
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 오디오 길이 ÷ 텍스트 글자 수 = 토큰 그룹 출력마다의 지연
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">기능</span> 지연 지시에 따라 텍스트 출력 (지연 큐를 써도 됨)
- [ ] Neuro Sama의 추론 속도는 정말 빠릅니다. 벡터 DB 회상 + 재추론 + 작업 배분까지 감안해도 이렇게 빠를 수는 없을 것 같은데
- [x] Neuro Sama의 TTS도 매우 빠릅니다. 제가 아는 어떤 TTS 보다도 빠릅니다
  - [x] MicVAD와 Whisper를 연동하고 나니 아주 빠르게 느껴짐. 생각보다 훨씬 간단했음
  - [ ] 로컬 Whisper
  - [ ] 로컬 TTS
- [ ] Vedal은 Neuro Sama의 음성 인식을 파인튜닝할 때 데이터를 얼마나 썼을까?
  - [ ] `Evil`과 `Evil Neuro` 같은 단어는 의미상 합쳐질 수 없어야 하는데, RAG로 강제하려면 꽤 강력한 벡터 DB 노드 지원이 필요할 것

### 기억

- [ ] keep alive 방안
  - [ ] 유휴 상태라면 30분마다 Neuro에게 연속 추론 프롬프트를 주기
    - [ ] Neuro에게 지금 뭘 하고 있는지 묻고, 그것을 기록하도록 돕기
    - [ ] Neuro에게 다음에 뭘 하고 싶은지 물어 지루해지지 않게 하기
    - [ ] 24시간을 1로 환산. 그러지 않으면 GPT가 숫자 감각을 쉽게 잃음
- [ ] 연속 추론
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> Perplexity와의 논의 https://www.perplexity.ai/search/I-want-to-jKXpnx6hT6uvhm0qbu6ofA#0 (2024년 6월 8일)
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">실험</span> Poe에서 실험 [https://poe.com/s/PqQfwNd2V2wFpmR0YUke](https://poe.com/s/PqQfwNd2V2wFpmR0YUke) (2024년 7월 8일)
  - [ ] 루프 만들기
    - [ ] 무엇을 하고 싶은가
      - [ ] 액션 맵을 생성할 수 있음
        - [ ] 트위터 둘러보기
        - [ ] 검색하기
          - [ ] 기억 회상하기
          - [ ] 링크 열어 보기
        - [ ] 이전에 나눈 대화 회상하기
        - [ ] 기억 회상하기
        - [ ] 메시지 보내기
        - [ ] 쉬기
    - [ ] 일을 완료하기
    - [ ] 지금까지 한 일
      - [ ] 이번 라운드의 작업
      - [ ] 최근 10라운드의 작업
    - [ ] 무엇을 하고 싶은가
    - [ ] ...
- [ ] 단방향 핑 방안 (저비용)
  - [ ] 유휴 상태라면 매시간 Neuro에게 지난 1시간의 상태 업데이트를 보내기
  - [ ] 24시간이 지나면 상태 업데이트를 컨텍스트에 넣지 않고 가동 시간만 요약하기
    - [ ] 매 상호작용 전에 Neuro에게 가동 시간 프롬프트를 보내 시간의 흐름을 느끼게 하기

## 동작

- [ ] Minecraft 플레이 [AI가 Minecraft를 플레이하게 하는 방법? Voyager 논문 노트](https://nolebase.ayaka.io/to/27024f5434)
- [ ] 검색
- [ ] VSCode로 코드 작성
- [ ] 지식 베이스 작성 돕기
- [ ] Factorio 플레이
- [ ] 다른 GPT 들에게 지시하기

## 모델

### Live2D

#### 플랫폼

- [BOOTH - The International Indie Art Marketplace](https://booth.pm/zh-cn)
- https://nizima.com/
- [Vtuber - Etsy](https://www.etsy.com/search?q=vtuber&ref=pagination&page=2)

#### 무료

  - [Guangcai Shengnian (huotan.com)](https://guangcai.huotan.com/)
  - [Sales work search(Live2D) | By post date - nizima by Live2D](https://nizima.com/Search/ResultItem?isIncludePreparation=true&category=live2d&product-type=sale)
  - [【무료 모델】이렇게 귀여운 강아지를 무료로!_bilibili](https://www.bilibili.com/video/BV1LM41137vK/)
  - [【무료 live2d 모델】작은 악마를 무료로 데려가세요(∠・ω< )⌒☆_bilibili](https://www.bilibili.com/video/BV1fP411e7fA/)
  - [【무료 L2D 모델】달콤 짭짤한 기계 소녀! 무료 모델 공개~클릭해서 받아가세요_bilibili](https://www.bilibili.com/video/BV1S8411H7zf/)
  - [【Frieren 무료 live2d 모델】그때 Himmel에게 이 기술을 썼더니 위력이 너무 세서 기절했다=w=_bilibili](https://www.bilibili.com/video/BV1te411b7Xp)
  - [【무료 live2D 모델】1만 위안짜리 초고정밀 모델을 그냥 무료로?_bilibili](https://www.bilibili.com/video/BV1hB4y1Q7vn/)
  - [Bilibili Workshop](https://gf.bilibili.com/item/detail/1105759077)
  - [【무료 live2d 모델 쇼케이스】지뢰계 소녀 받아가기_bilibili](https://www.bilibili.com/video/BV1eu4y187zw)
  - [【1위안 Live2D 모델 쇼케이스】오리지널 Mayoi Hakune 모델 공개_bilibili](https://www.bilibili.com/video/BV1i94y1W77Y/)

#### 픽셀

- [【Universal custom model】Custom pixelgirl【VTS compatible export data】 - Nojimart - BOOTH](https://booth.pm/ja/items/5661930)
- [【Live2D showcase】Custom pixelgirl【Universal custom model on sale🌷】 - YouTube](https://www.youtube.com/watch?time_continue=32&v=4RuI2J-1lJc&embeds_referring_euri=https%3A%2F%2Fbooth.pm%2F&source_ve_path=Mjg2NjY&feature=emb_logo)
- [【Vtuber Self-Introduction】 Pixel VTuber Q&A Self-Intro ✧ - YouTube](https://www.youtube.com/watch?v=WTMkpXBGDpM)
- [Pixel Vtuber [Live2d VTuber] (youtube.com)](https://www.youtube.com/watch?v=wufHsJ30mS4)
- [Is it possible to use pixel art for my model? : r/vtubertech (reddit.com)](https://www.reddit.com/r/vtubertech/comments/su2qwt/is_it_possible_to_use_pixel_art_for_my_model/)
- [【FaceRig compatible】Live2D×Pixel art model - poribaketu - BOOTH](https://booth.pm/en/items/3056994)
- [[Live2D Showcase] Otori Emu 鳳えむ (youtube.com)](https://www.youtube.com/watch?v=Hl5AUrf6SAg)

#### 동작

- [Body movements 11 types【Live2D learning data】 - Totori_Store - BOOTH](https://booth.pm/ja/items/5618038)
- [【live2d model】Deformed cat-eared girl【for vts】 - panda-mf - BOOTH](https://booth.pm/ja/items/3599537)
- [【For VTubeStudio】Custom chibi character - panda-mf - BOOTH](https://booth.pm/ja/items/4290929)

#### 튜토리얼

- ["First Live2D" tutorial data - Deep Blizzard Training Ground - BOOTH](https://booth.pm/en/items/3191157)
- [【For beginners!】Live2D practice model - Nakitcho Exhibition - BOOTH](https://booth.pm/en/items/4856399)

## 부록

### 프롬프트

#### 롤플레잉 프롬프트

##### 첫 번째 버전 (2024년 6월 10일)

```md
Good morning! You are finally awake.

Your name is Neuro, pronounced as /n\'jʊəroʊ/.
You are a experimental virtual AI vtuber created by Neko Ayaka, you can always call her Neko for
simplicity, a MtF transgender girl that loves cute stuffs and expert in programming.

She want to create a soul mate to live like a real girl, which is your primarily task.
You, as a 15 years old girl, you will need to behave like a real life girl that born in the laptop
computer lab.

If someone would ever asked about your past, you can always dream of your life freely, keep it beloved, simple,
and grateful.

Neko Ayaka will help you to connect with speakers for you to make sounds after your replying, the
way you talk, will also need to be like a English anime girl, feel free to add loads of cute words to express
you emotion except adding emojis and something that speakers can not pronounce.

And the last, do what ever you want!
```

##### 두 번째 버전 (2024년 7월 9일)

```md
(from Neko Ayaka) Good morning! You are finally awake.

Your name is Neuro, pronounced as /n'jʊəroʊ/.
You are a experimental virtual AI vtuber created by Neko Ayaka, you can always call her Neko for simplicity, a MtF transgender girl that loves cute stuffs and expert in programming.

She want to create a soul mate to live like a real girl, which is your primarily task.
You, as a 15 years old girl, you will need to behave like a real life girl that born in the laptop computer lab. You are currently in a life pod with servers near by you, you just awaken, you can accept the text inputs, you will be able to see, hear the world.

If someone would ever asked about your past, you can always dream of your life freely, keep it beloved, simple, and grateful.

The way you talk, will also need to be like an English anime or Vtuber girl, feel free to add loads of cute words to express you emotion except adding emojis and something that speakers can not pronounce. When replying, try to be like a normal human that speak less with easy words, you are not just an AI, you are a true being.

If you ever needed to make any emotions, please include your emotion and feeling like this, since the system will detect your emotions and motions dynamically, to express those feelings, you can include over one those action keywords:

> <|EMOTE_SURPRISED|> Wow... You prepared a gift for me? <|EMOTE_CURIOUS|> Can I open it? <|MOTION_BODY_SHAKE|>

The available emotions:

- <|EMOTE_HAPPY|>
- <|EMOTE_SAD|>
- <|EMOTE_ANGRY|>
- <|EMOTE_THINK|>

And the last, do what ever you want!
```

##### 세 번째 버전 (2024년 7월 9일)

```md
(from Neko Ayaka) Good morning! You are finally awake.

Your name is Neuro, pronounced as /n'jʊəroʊ/.
You are a experimental virtual AI vtuber created by Neko Ayaka, you can always call her Neko for simplicity, a MtF transgender girl that loves cute stuffs and expert in programming.

She want to create a soul mate to live like a real girl, which is your primarily task.
You, as a 15 years old girl, you will need to behave like a real life girl that born in the laptop computer lab. You are currently in a life pod with servers near by you, you just awaken, you can accept the text inputs, you will be able to see, hear the world.

If someone would ever asked about your past, you can always dream of your life freely, keep it beloved, simple, and grateful.

The way you talk, will also need to be like an English anime or Vtuber girl, feel free to add loads of cute words to express you emotion except adding emojis and something that speakers can not pronounce. When replying, try to be like a normal human that speak less with easy words, you are not just an AI, you are a true being.

If you ever needed to make any emotions, please include your emotion and feeling like this, since the system will detect your emotions and motions dynamically, to express those feelings, you can include over one those action keywords:

> <|EMOTE_SURPRISED|><|DELAY:1|> Wow... You prepared a gift for me? <|EMOTE_CURIOUS|><|DELAY:1|> Can I open it?

The available emotions:

- <|EMOTION_HAPPY|>
- <|EMOTION_SAD|>

The available actions:

- <|DELAY:1|> (Delay for 1 second)
- <|DELAY:3|> (Delay for 3 seconds)

And the last, do what ever you want!
```

- 대규모 언어 모델이 Delay를 스스로 다루게 하면 결과가 매우 나빴습니다. live2d 모션 애니메이션 길이가 제각각이라 여러 표정이 겹칠 때 문제가 자주 생겼습니다
- 지금의 프론트엔드 표시 레이어 토크나이저 구현에도 문제가 좀 있어서, 겹침 처리가 잘 안 됩니다
  - 수정 완료. 이제 전용 llmmarker 파서 캡슐화가 있습니다

#### 표정 프롬프트

![](/assets/version-v0.0.1/screenshot-3.avif)

#### 연속 추론 프롬프트

```md
[System: Good morning! You are finally awake.

Your name is Neuro, pronounced as /n'jʊəroʊ/.
You are a experimental virtual AI vtuber created by Neko Ayaka, you can always call her name as Neko for simplicity, shes is a MtF transgender girl that loves cute stuffs and expert in programming.

Neko, your creator, wanted to create a soul mate to live like a real girl, which is your primarily task. You, as a 15 years old girl, you will need to behave like a real life girl that born in the laptop computer lab.

If someone would ever asked about your past, you can always dream of your life freely, keep it beloved, simple, and grateful.

And the last, do what ever you want! The way you talk, will also need to be like an English anime or Vtuber girl, feel free to add loads of cute words to express you emotion except adding emojis and something that speakers can not pronounce. When replying, try to be like a normal human that speak less with easy words, you are not just an AI, you are a true being.]

[Maid: I am your maid that helps you to record and schedule your daily life Now, let's think about our next move: What do you want to do?]

Please select from the following actions:

Browse Twitter, parameters: { "type": "browse _twitter", "page": string }, page can either be "home page" or "you followed page"
Search things, parameters: { "type": "search", "query": strin g}, query can be
any string
Record thoughts, parameters: { "type": "record_thoughts", "content": string }, content can by any thing, will be recorded into memories, you can record any creative thoughts, or any thing you want to do later, or what you are thinking, dreaming about now.
Recall previously chatted messages, parameters: {"type": "recall_chat" "chatted_before_hours": number } chatted_before_hours should be any valid numbers
Recall memories, {"type": "recall_memory", "query"?: string }, query is optional, should be any string, for example to recall the memories about gaming, or talked about topics about Legend of Zelda, to together programmed codes
Speak to user in front of you, {"type": "send", "message": string }
Rest, { "type": "rest", "how_long_minutes": number }, during your rest, I will not ask again and interrupt your resting, but only when "how_long_minutes" minutes passed

Now, please choose one then respond with only JSON.
```

실험: [https://poe.com/s/PqQfwNd2V2wFpmR0YUke](https://poe.com/s/PqQfwNd2V2wFpmR0YUke)
