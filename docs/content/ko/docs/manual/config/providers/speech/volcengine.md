---
title: Volcano Engine (TTS)
description: AIRI에서 Volcano Engine 음성 합성 설정하기
---

Volcengine 음성 합성을 사용하려면 AIRI에 API Key와 애플리케이션 정보를 입력해야 합니다.

::: info 왜 Volcengine을 선택하나요?
이미 Volcengine에서 음성 애플리케이션을 만들고 음성 리소스를 관리하고 있다면, 해당 설정을 AIRI에서 재사용할 수 있습니다.
:::

## 애플리케이션 자격 증명 준비하기

1. [Volcengine Speech 콘솔](https://console.volcengine.com/speech/app)에 로그인한 다음 음성 애플리케이션을 새로 만들거나 기존 애플리케이션을 여세요.
2. 애플리케이션의 **App ID**를 복사하고 해당 **API Key**를 생성하세요.
3. 두 정보가 같은 계정과 애플리케이션 설정에서 나온 것인지 확인하세요.

::: warning API Key 보안
API Key나 App ID를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키나 ID가 유출되면 즉시 폐기하고 Volcengine 콘솔에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 음성 합성 → Volcano Engine**을 여세요.
2. API Key와 App ID를 입력하세요. 기본 Base URL은 Volcengine의 직접 API가 아니라 AIRI/UnSpeech 게이트웨이인 `https://unspeech.hyp3r.link/v1/`입니다. 자격 증명, 합성할 텍스트, 모델/음성 선택, 반환된 오디오가 모두 이 게이트웨이를 거칩니다. 이 신뢰 경계를 수용할 수 있는 경우에만 사용하고, 그렇지 않으면 호환되는 자체 호스팅 게이트웨이 URL을 입력하거나 직접 연결되는 제공자를 선택하세요.

## 설정 확인

1. 제공자 플레이그라운드에서 사용 가능한 음성을 선택하세요. 이 페이지는 AIRI의 기본 Volcengine 음성 합성 모델을 사용합니다.
2. 같은 페이지의 플레이그라운드에 짧은 텍스트를 입력하고 오디오가 재생되는지 확인하세요.

## AIRI 응답에 사용하기

**설정 → 모듈 → 음성 합성**을 열고 **Volcano Engine**을 선택한 다음 사용 가능한 모델과 음성을 선택하세요. 제공자 플레이그라운드는 자격 증명을 테스트할 뿐이며, 이 모듈 선택이 일반 AIRI 응답에 음성을 활성화합니다.

## 문제 해결

확인에 실패하면 App ID와 API Key가 같은 애플리케이션의 것인지 확인하세요. 소리가 나지 않으면 앱에서 음성 합성이 활성화되어 있고 음성이 선택되어 있는지 확인하세요.
