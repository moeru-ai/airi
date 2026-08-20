---
title: Microsoft Azure Speech (TTS)
description: AIRI에서 Microsoft Azure Speech 음성 합성 설정하기
---

Microsoft Azure Speech는 AIRI에서 Azure 음성 합성 기능을 제공합니다.

::: info 왜 Microsoft Azure Speech를 선택하나요?
팀이 이미 Azure에서 음성 리소스와 리전 구성을 관리하고 있다면, 같은 자격 증명을 사용하는 것이 더 편리합니다.
:::

## Azure Speech 리소스 준비하기

1. [Azure Portal](https://portal.azure.com/)에 로그인한 뒤, Speech 리소스를 만들거나 여세요.
2. 리소스의 **API Key**와 리전을 기록해 두세요. 둘 다 같은 Speech 리소스에서 가져와야 합니다.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
Azure 키는 Speech 리소스에 대한 접근 권한을 제공합니다. 키를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 음성 합성 → Microsoft / Azure Speech**를 여세요.
2. API Key와 리전을 입력하세요. 기본 Base URL은 Azure의 직접 API가 아니라 AIRI/UnSpeech 게이트웨이인 `https://unspeech.hyp3r.link/v1/`입니다. 키, 리전, 합성할 텍스트, 음성 선택, 반환된 오디오가 모두 이 게이트웨이를 거칩니다. 이 신뢰 경계를 수용할 수 있는 경우에만 사용하고, 그렇지 않으면 호환되는 자체 호스팅 게이트웨이 URL을 입력하거나 직접 연결되는 제공자를 선택하세요.

## 설정 확인

1. 제공자 플레이그라운드에서 사용 가능한 음성을 선택하세요. 이 페이지는 AIRI의 기본 Azure Speech 모델을 사용합니다.
2. 같은 페이지의 플레이그라운드에 짧은 텍스트를 입력하고 오디오가 재생되는지 확인하세요.

## AIRI 응답에 사용하기

**설정 → 모듈 → 음성 합성**을 열고 **Microsoft / Azure Speech**를 선택한 뒤, 사용 가능한 모델과 음성을 선택하세요. 제공자 플레이그라운드는 자격 증명을 테스트할 뿐이며, 이 모듈 선택이 일반 AIRI 응답에 음성을 활성화합니다.

## 문제 해결

확인에 실패하면 먼저 리전이 Speech 리소스와 일치하는지 확인하세요. 소리가 나지 않으면 **설정 → 모듈 → 음성 합성**에서 음성이 선택되어 있는지, 리소스에 사용 가능한 할당량이 있는지 확인하세요.
