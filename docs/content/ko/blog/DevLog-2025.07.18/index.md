---
title: DevLog @ 2025.07.18
category: DevLog
date: 2025-07-18
excerpt: |
  Factorio Learning Environment 논문을 바탕으로 저희 Factorio AI 에이전트 프로젝트 `airi-factorio`를 어떻게 개선할 계획인지 나눠 봅니다.
preview-cover:
  light: "@assets('/en/blog/DevLog-2025.07.18/assets/factorio-belt.gif')"
  dark: "@assets('/en/blog/DevLog-2025.07.18/assets/factorio-belt.gif')"
---

안녕하세요, AIRI 메인테이너 중 한 명인 [@LemonNeko](https://github.com/LemonNekoGH)입니다.

## 돌아보기

반년 전, 저는 유명한 자동화 생산 시뮬레이션 게임 [Factorio](https://www.factorio.com/)를 플레이할 수 있는 AI 에이전트 [`airi-factorio`](https://github.com/moeru-ai/airi-factorio)를 처음 만들어 봤고, 다음과 같은 일들을 했습니다:

- TypeScript로 Factorio 모드 작성하기: [tstl](https://github.com/TypeScriptToLua/TypeScriptToLua)로 TypeScript 코드를 Lua 코드로 컴파일합니다.
- RCON으로 Factorio 모드와 상호작용하기: [factorio-rcon-api](https://github.com/nekomeowww/factorio-rcon-api)로 Factorio와 통신하고, `/c` 명령을 호출해 모드가 등록한 함수를 실행합니다. [@nekomeowww](https://github.com/nekomeowww)에게 정말 감사드립니다.
- LLM으로 의사결정하고 플레이어를 조종하는 Lua 코드 생성하기: 프롬프트 엔지니어링으로 LLM에게 게임 조작 방법과 계획 수립 방법을 알려 주고, RCON 상호작용 코드를 LLM이 호출할 수 있는 도구로 감쌌습니다.
- 게임 내장 채팅 시스템으로 LLM과 소통하기: 게임의 표준 출력을 읽고 정규식으로 게임 내 플레이어 채팅 내용을 파싱한 뒤 LLM에게 보내 처리합니다.
- Factorio 모드 핫 리로드: tstl 플러그인을 작성해 코드 변경을 실시간으로 감지하고 새 모드 내용을 RCON으로 게임에 보냅니다. 새 모드 코드를 받으면 모든 인터페이스를 언로드하고 모드 코드를 한 번 실행해 핫 리로드를 구현합니다. 다만 기존 모드 상태를 어떻게 제대로 처리할지가 큰 난제가 됐습니다.
- DevContainer에서 개발하기: 환경을 더 통제 가능하게 만들고 프로젝트 시작을 단순화합니다.
- 심볼릭 링크로 `tstl` 출력 디렉터리를 게임 디렉터리에 연결하기: 게임 디렉터리에서 컴파일된 Lua 코드를 바로 볼 수 있어 디버깅이 쉬워집니다.

이 과정에서 정말 많은 걸 배웠습니다 ~~(특히 Lua 배열 인덱스는 1부터 시작한다는 것)~~.

하지만 문제도 많이 겪었습니다. 주요 동작을 모드 안에 작성하다 보니 디버깅이 아주 번거로웠습니다. 모드 변경을 적용하려면 맵에서 나와 게임 메인 화면으로 돌아갔다가 다시 들어와야 했죠. `data.lua`가 들어간 조금 더 복잡한 모드라면 게임 자체를 재시작해야 했습니다.

LLM에게 Lua 코드를 생성하게 한 뒤 RCON으로 게임 명령 `/c`를 호출해 실행했는데, Factorio는 명령 하나당 길이 제한이 있습니다. 코드가 길어지면 여러 번 나눠 실행해야 했습니다.

지금 코드는 견고성과 유지보수성이 떨어집니다. 새 친구가 개발에 참여하거나, 심지어 그냥 한번 써 보려고만 해도 이 프로젝트를 시작하는 게 매우 어렵습니다.

## Factorio Learning Environment

시간이 흘러 지금, 이 프로젝트를 제대로 정리하려 했지만 어디서부터 시작해야 할지 몰랐습니다. 마침 누군가 [Factorio Learning Environment](https://arxiv.org/abs/2503.09617)라는 논문을 언급하더군요. 간단히 훑어보겠습니다.

이 논문에서 저자들은 Factorio Learning Environment(FLE)라는 프레임워크를 제안하고, 장기 계획 수립, 프로그램 합성, 자원 관리, 공간 추론에서 AI의 능력을 테스트했습니다.

FLE에는 두 가지 모드가 있습니다:

- Lab-play: 자원이 제한된, 사람이 직접 설계한 24개 레벨에서 테스트하며, 제한된 자원으로 AI가 효율적으로 생산 라인을 지을 수 있는지 봅니다.
- Open-play: 제한 없는 대형 맵에서 절차적으로 생성된 지형 위에 가장 큰 공장을 짓는 것이 목표이며, AI의 장기적 자율 목표 설정·탐험·확장 능력을 테스트합니다.

저자들은 Claude 3.5 Sonnet, GPT-4o, Deepseek-v3, Gemini-2 같은 주요 LLM을 평가했는데, Lab-play에서는 당시 가장 강했던 Claude 3.5 조차 7개 레벨만 완료했습니다.

여기까지 읽고 나니 궁금해졌습니다. 평가가 이렇게 복잡한데 기술적 유지보수성도 확보했을 텐데, 어떻게 했을까? 계속 읽어 보니 구현 방식이 `airi-factorio`와 아주 비슷하면서도 여러 장점이 있었습니다:

- Python으로 작성되어 있어 LLM이 Python 코드를 생성하면 Python REPL에서 바로 실행하고 표준 출력에서 결과를 바로 읽을 수 있습니다. Python은 Lua보다 데이터셋이 훨씬 많아 생성 정확도가 높고 더 복잡한 코드도 만들 수 있습니다.
- Lua 모드는 place_entity처럼 실행을 위한 기본 동작만 담고, 더 복잡한 로직은 Python에 둡니다. 덕분에 Lua 모드에 버그가 생길 여지가 줄어 게임을 그렇게 자주 재시작하지 않아도 됩니다.
- Lua 코드 실행에 `/c` 대신 `/sc` 명령을 씁니다. 코드를 콘솔에 출력하지 않아 콘솔이 깔끔하게 유지되고 필요한 내용만 남아, 표준 입력 파싱 난이도가 낮아집니다.

LLM 능력을 더 잘 평가하기 위해 필요한 모든 레시피 생산 과정과 난이도도 면밀히 분석해, 아이템 생산 비용이나 LLM 점수 계산 방법 같은 몇 가지 공식을 정리해 두었습니다.

[시스템 프롬프트](https://arxiv.org/html/2503.09617v1#A8.SS4)도 공개했는데, 환경 구조, 응답 형식, 모범 사례, 게임 출력을 이해하는 방법 등이 명시되어 있습니다.

## 다시 `airi-factorio`로

FLE와 비교하면 저희 구현은 꽤 순진해 보입니다. 그럼 `airi-factorio`를 어떻게 개선해야 할까요?

저는 Python을 쓰고 싶지 않고, TypeScript와 Golang 에만 익숙합니다. 마침 얼마 전 가능한 모든 MCP 서버에 적합한 빌더인 [mcp-launcher](https://github.com/moeru-ai/mcp-launcher)를 만들었습니다. 이걸 Golang과 함께 써서 MCP 서버를 구현하고, LLM이 이를 호출하게 하면 됩니다.

그래서 구조도가 이렇게 바뀌었습니다:

<div class="flex flex-row gap-4">

![이전](/en/blog/DevLog-2025.07.18/assets/structure-before.avif)

![이후](/en/blog/DevLog-2025.07.18/assets/structure-after.avif)

</div>

플레이어 채팅 내용은 더 이상 LLM으로 보내지 않고 [RconChat](https://gitlab.com/FishBus/rconchat) 모드에 저장하며, LLM은 MCP 서버를 통해 이 내용을 읽습니다. MCP 서버 방식이라면 LLM이 Lua 코드를 생성할 필요도 없어집니다.

시스템 프롬프트는 현재 AI가 생성한 것이라 아직 충분히 명확하지 않고 우선순위도 흐릿합니다. FLE의 시스템 프롬프트를 참고해 개선할 계획입니다.

자, 이전 설계를 사실상 전부 뒤엎었습니다. 처음부터 다시 시작할 시간이네요.

## 맺으며

읽어 주셔서 감사합니다. 관심 있으시다면 FLE의 논문과 [코드](https://github.com/JackHopkins/factorio-learning-environment)를 직접 읽어 보세요. 제 이해가 틀렸을 수도 있으니 정정 환영합니다! 이번 읽기는 충분히 깊지 않았을지도 모르지만, 앞으로 제 아이디어대로 `airi-factorio`를 개선해 나가면서 반복해 읽고 진전이 있을 때마다 업데이트하겠습니다.

이번 DevLog는 여기까지입니다. 좋은 주말 보내세요!

> 커버 일러스트 [@anrew10](https://es.pixilart.com/art/factorio-yellow-belt-132272fb3d727dd)
