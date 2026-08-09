---
title: 설정 가이드
description: Project AIRI 사용법
---

## 설정

시스템 트레이에서 설정을 열어 더 자세히 커스터마이즈할 수 있습니다. 예를 들어
AIRI의 테마 색상을 바꾸거나, Live2D(2D) 또는 VRM(3D, Grok Companion과 비슷한 형태)
같은 다른 모델로 전환할 수 있습니다.

<video autoplay loop muted>
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

설정에는 정말 많은 항목이 있으니, 이것저것 시도해 보면서 마음에 드는 조합을 찾아보세요.

### 모델 바꾸기

기본 모델을 다른 Live2D(2D)나 VRM(3D, 마찬가지로 Grok Companion과 비슷한 3D 모델이라면
가지고 계신 것으로) 모델로 교체할 수 있습니다.

모델 설정은 [설정] -> [모델] 아래에 있습니다.

::: tip VTuber Studio 모델을 가져오시나요?
Live2D 모델을 렌더링하는 데 사용하는 라이브러리는 VTuber Studio 모델에서 만들어진 ZIP 파일을
읽는 데 어려움을 겪습니다. VTuber Studio는 사용하지만 Live2D 엔진은 알지 못하는 파일이 섞여 있기 때문입니다.

따라서 가져오기 전에, VTuber Studio 모델을 ZIP으로 압축하기 전에 다음 파일을 반드시 제외하세요.

- `items_pinned_to_model.json`
:::

<br />

::: warning 알려진 버그
현재 모델의 장면을 다시 불러오는 기능이 의도대로 동작하지 않습니다.
모델을 불러온 뒤에는 AIRI를 재시작해야 합니다.
:::

<br />

<video autoplay loop muted>
 <source src="/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>
