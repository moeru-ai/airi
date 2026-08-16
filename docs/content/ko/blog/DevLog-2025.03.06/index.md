---
title: DevLog @ 2025.03.06
category: DevLog
date: 2025-03-06
---

## 데자뷔

전날에는 DevStream에서 AIRI의 기본 애니메이션과 전환 효과를 만드는 진행 상황을
보여 드렸습니다.

목표는 [@yui540](https://yui540.com/) 의 멋진 작업을 어떤 Vue 프로젝트에서도 쓸 수 있는
재사용 가능한 Vue 컴포넌트로 이식하고 다듬는 것입니다.

> yui540과 참고한 라이브러리·작업물에 대한 상세 내용은 새로 배포한 문서 사이트
> [https://airi.build/references/design-guidelines/resources/](../references/design-guidelines/resources/)
> 에 이미 정리해 두었습니다.

결과는 꽤 좋고, 이미
[https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/) 에 배포되어 있습니다.

![](/en/blog/DevLog-2025.03.06/assets/animation-transitions.gif)

> 그리고 앞으로 각 패키지의 플레이그라운드는 Netlify 배포 시
> "proj-airi" + "${subDirectory}" + "$｛packageName}" 패턴을 사용합니다.

전날의 목표가 CSS 구현을 Vue 컴포넌트로 분리하는 것이었다면, 실제로 재사용 가능하게 만드는
부분은 아직 끝나지 않았습니다. 다른 페이지들도 쓸 수 있도록 확장 가능하고 유연한 워크플로와
메커니즘을 설계해야 합니다.

## 낮 시간

[`unplugin-vue-router`](https://github.com/posva/unplugin-vue-router)의
[`definePage`](https://uvr.esm.is/guide/extending-routes.html#definepage) 매크로 훅을 실험해 봤는데,
제 상황에 꽤 잘 맞아서 이 방향으로 가기로 했습니다.

그리고 [https://cowardly-witch.netlify.app/](https://cowardly-witch.netlify.app/) 에서
새 애니메이션 전환 3개를 추가로 포팅했고, 이미
[https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/) 에서 볼 수 있습니다.

어제 공식 문서 사이트를 [https://airi.build](https://airi.build)에 배포했더니
[@kwaa](https://github.com/kwaa)가 대신 `https://airi.more.ai/docs` 방식을 써 보라고 제안했습니다.
~~그런데 /docs에 대한 200 리다이렉트 프록시를 만드는 방법을 못 찾았습니다.~~

수정: 결국 알아냈습니다. 방법은 앞으로의 DevLog에서 자세히 다루겠습니다.

CI/CD 파이프라인과 싸우며(네, 또 싸웠습니다) 커밋 열 개쯤 날리며 실험해 봤지만 아직 동작하지 않습니다.

이날 늦게는 DeepSeek 팀이 일주일 전 공개한 몇몇 기술과
[오픈소스 저장소](https://github.com/deepseek-ai/open-infra-index)들, 그리고 ByteDance가 공개했다는
[LLM 게이트웨이 AIBrix](https://github.com/vllm-project/aibrix)를 살펴봤습니다.
새로 발표된 Phi-4-mini를 AIRI에 이식해 쓸 수 있을지도 조사했는데, 좋은 소식은
[Phi-4-mini](https://techcommunity.microsoft.com/blog/educatordeveloperblog/welcome-to-the-new-phi-4-models---microsoft-phi-4-mini--phi-4-multimodal/4386037)
가 함수 호출 능력을 포함하고 있다는 것입니다. 즉 사전 학습된 지원을 바탕으로 에이전트를
만들 수 있다는 뜻이죠.

## DevStream

오후에는 다른 아티스트에게 연락해서, 앞으로 새로 만들 계정들의 아바타로 쓸 맞춤 픽셀 아트
커미션 비용을 지불할 의향이 있다고 전했습니다.

~~네, 아티스트에게 이스터에그를 좀 넣어 달라고 부탁했습니다 하하. 찾아내시길 바랍니다.~~

라이브 스트림의 레이아웃과 세팅을 업데이트했습니다 😻 거의 1년 전에 제가 직접 디자인한 건데,
지금 봐도 훌륭하고 마음이 차분해집니다. 제안이 있으시면 채팅에 남겨 주세요. 정말 감사하겠습니다.

![](/en/blog/DevLog-2025.03.06/assets/live-stream-layout-update.avif)

오늘 DevStream 중에는 스테이지 전환 애니메이션 컴포넌트를 AIRI 웹사이트의 메인 스테이지에
통합하려 했는데 그리 매끄럽지 않았습니다. 이전 애니메이션 컴포넌트 설계에서 버그를 몇 개
발견했거든요. 좋은 소식은 이미 고쳤다는 것이고, 새 애니메이션 전환은 공식 배포
[https://airi.moeru.ai](https://airi.moeru.ai)에서 이미 확인할 수 있습니다.

모듈 설정 UI와 설정 페이지에 대한 이런저런 생각 끝에 마침내 결정을 내렸습니다. 전부 구현해서
반영했고, 이제 설정을 만질 때 느낌이 더 좋아졌을 겁니다. 마음에 드시길 바랍니다.

방송을 마치고 결과물을 휴대폰에서 직접 만져 봤는데, 데스크톱과 태블릿에서는 잘 동작하지만
모바일에서는 제가 실수로 애니메이션을 망가뜨렸더군요. 내일 낮에 고치겠습니다 😹.

오늘의 DevLog는 여기까지입니다. DevStream에 참여해 끝까지 함께해 주신 모든 분께 감사드립니다.
내일 또 만나요.
