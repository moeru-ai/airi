---
title: Alibaba Cloud Bailian (TTS)
description: AIRI에서 Alibaba Cloud Bailian 음성 합성 설정하기
---

Alibaba Cloud Bailian은 AIRI에서 CosyVoice 음성 합성 모델을 제공합니다.

::: info 왜 Alibaba Cloud Bailian을 선택하나요?
이미 Alibaba Cloud Model Studio를 사용하고 있고 CosyVoice 음성과 모델 중에서 선택하고 싶다면, 이것이 직접 접근하는 방법입니다.
:::

## API Key 발급받기

1. [Alibaba Cloud Bailian Console](https://bailian.console.aliyun.com/)에 로그인한 뒤, 모델 서비스가 활성화되어 있는지 확인하세요.
2. API Key 관리 페이지에서 키를 생성하세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
Bailian API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 음성 합성 → Alibaba Cloud Model Studio**를 여세요.
2. Model Studio API Key를 입력하세요. 기본 Base URL은 Alibaba Cloud의 직접 API가 아니라 AIRI/UnSpeech 게이트웨이인 `https://unspeech.hyp3r.link/v1/`입니다. 키, 합성할 텍스트, 모델/음성 선택, 반환된 오디오가 모두 이 게이트웨이를 거칩니다. 이 신뢰 경계를 수용할 수 있는 경우에만 사용하고, 그렇지 않으면 호환되는 자체 호스팅 게이트웨이 URL을 입력하거나 직접 연결되는 제공자를 선택하세요.

## 설정 확인

1. 제공자 플레이그라운드에서 사용 가능한 음성을 선택하세요. 이 페이지는 AIRI의 기본 CosyVoice 모델을 사용합니다.
2. 같은 페이지의 플레이그라운드에 짧은 텍스트를 입력하고 오디오가 재생되는지 확인하세요.

## AIRI 응답에 사용하기

**설정 → 모듈 → 음성 합성**을 열고 **Alibaba Cloud Model Studio**를 선택한 뒤, 사용 가능한 모델과 음성을 선택하세요. 제공자 플레이그라운드는 자격 증명을 테스트할 뿐이며, 이 모듈 선택이 일반 AIRI 응답에 음성을 활성화하는 단계입니다.

## 문제 해결

플레이그라운드에서 요청이 완료되지 않으면 API Key, Model Studio 결제 및 할당량 상태, 요청 한도, 네트워크 연결을 확인하세요. 모델이나 음성을 사용할 수 없다면 Bailian 계정에서 해당 모델 서비스가 활성화되어 있는지 확인하세요.
