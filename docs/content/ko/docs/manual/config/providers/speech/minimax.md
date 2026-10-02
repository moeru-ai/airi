---
title: MiniMax Speech (TTS, 사용 불가)
description: AIRI에서 MiniMax 음성 합성의 현재 사용 가능 여부
---

MiniMax Speech는 AIRI의 제공자 레지스트리에 표시되지만, 현재 앱에는 MiniMax Speech 설정 페이지가 포함되어 있지 않습니다. 따라서 **설정 → 제공자 → 음성 합성**에서 선택해도 사용 가능한 설정을 완료할 수 없습니다.

::: warning AIRI 0.11.3에서 사용 불가
이 버전에서는 자격 증명을 입력하거나 MiniMax 설정 절차를 따라 하지 마세요. 제공자 라우트가 구현되어 있지 않아 AIRI가 UI에서 필요한 설정을 저장하거나 테스트할 수 없습니다.
:::

## 대신 사용할 수 있는 방법

**설정 → 제공자 → 음성 합성**에서 설정 페이지가 동작하는 다른 제공자를 선택하세요. 사용 중인 서비스가 OpenAI 호환 음성 엔드포인트를 제공한다면 [OpenAI Compatible API (TTS)](./openai.md)를 사용하고 해당 서비스가 문서화한 Base URL과 모델 ID를 따르세요.
