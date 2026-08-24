---
title: 제공자 설정 가이드
description: Project AIRI의 채팅, 비전, 음성 합성, 전사, Artistry 제공자 설정하기
---

AIRI와 대화하려면 최소 하나의 채팅 제공자와 채팅 모델을 설정해야 합니다. 음성 합성(TTS)은 음성 출력을, 자동 음성 인식(ASR/STT)은 마이크 입력을 추가합니다. 음성 입력과 출력은 선택 사항이며 서로 독립적으로 설정할 수 있습니다.

## 최소 필수 설정하기

1. AIRI의 **설정 → 제공자**를 여세요.
2. **채팅** 카테고리에서 제공자를 선택하고, 자격 증명을 입력한 뒤, 제공되는 검증 절차를 완료하세요.
3. **설정 → 모듈 → 의식**을 열어 설정한 제공자와 모델을 선택하세요.
4. 메시지를 보내 AIRI가 응답하는지 확인하세요.

채팅이 동작하면 필요에 따라 음성 입력이나 출력을 추가하세요:

* **[일반 안내](./common.md)**: 설정 과정, 각 필드의 의미, 검증 결과, FAQ를 이해할 수 있습니다.
* **[채팅 모델 설정](./llm.md)**: LLM을 설정하고 의식에서 모델을 선택합니다.
* **[음성 입출력 설정](./audio.md)**: TTS와 ASR/STT를 설정하고 **모듈 → 음성 합성**과 **모듈 → 청각**에서 활성화합니다.
* **[시각 이해 설정](./vision.md)**: 별도의 비전 제공자를 설정하고 이미지를 처리할 수 있는 모델을 선택합니다.
* **[웹 검색 설정](./web-search.md)**: Tavily를 사용해 AIRI가 필요할 때 인터넷에서 최신 정보를 검색하도록 합니다.
* **제공자**: 사이드바에서 **제공자**를 펼쳐 **채팅**, **비전**, **음성 합성**, **전사**, **Artistry** 중 하나를 선택하세요. 제공자 페이지는 자격 증명을 저장하고, 모듈 페이지는 AIRI가 실제로 사용할 제공자와 모델을 선택합니다.

> [!TIP]
> 기본 설정을 확인하려면 채팅을 먼저 설정하세요. TTS와 ASR은 그 후에 추가해야 음성 설정 문제를 분리해서 파악할 수 있습니다.

## 추가 설정

제공자를 설정한 뒤에는 AIRI의 테마를 바꾸거나 표시 모델을 전환할 수도 있습니다. 현재 모델 선택기는 Live2D, Spine, VRM, MMD, Tachie를 지원합니다.

<video autoplay loop muted playsinline preload="metadata" poster="/assets/tutorial-basic-open-settings-poster.avif">
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

서비스 제공자를 설정할 때는 가능한 한 해당 제공자 문서에 나온 기본 주소와 모델 이름을 사용하세요. Base URL, 모델 ID, 리전 파라미터는 제공자마다 다르므로 추측해서 입력하지 마세요.

### 모델 바꾸기

기본 모델을 지원되는 다른 2D 또는 3D 표시 모델로 교체할 수 있습니다.

모델 설정은 **설정 → 모델**에 있습니다.

::: tip VTube Studio 모델을 가져오시나요?
완전한 Live2D 모델 폴더를 ZIP 파일로 압축하세요. AIRI는 가져오기 과정에서 VTube Studio의 `items_pinned_to_model.json` 메타데이터를 무시하므로, 직접 삭제할 필요가 없습니다.
:::

<br />

::: tip 모델 변경
스테이지는 모델 설정 변경을 감지해 선택된 렌더러를 자동으로 다시 불러옵니다. 가져온 모델 자체가 로드되지 않는다면, AIRI를 재시작하기 전에 모델의 패키지 구조와 에셋을 확인하세요.
:::
<br />

<video autoplay loop muted playsinline preload="metadata" poster="/assets/tutorial-settings-change-model-poster.avif">
 <source src="/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>
