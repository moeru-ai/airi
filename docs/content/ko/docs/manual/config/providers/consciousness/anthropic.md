---
title: Anthropic
description: AIRI에서 Anthropic Claude 채팅 모델 설정하기
---

Anthropic 제공자를 사용하면 AIRI에서 Claude 채팅 모델을 사용할 수 있습니다. AIRI는 Anthropic의 API 주소와 사용자의 API Key를 사용하며, 모델 목록이 AIRI에 내장되어 있어 시작할 때 Base URL이나 모델 ID를 직접 입력할 필요가 없습니다.

::: info 왜 Anthropic을 선택하나요?
이미 Claude API를 사용 중이거나 AIRI에서 Claude 모델을 사용하고 싶다면 Anthropic을 바로 선택할 수 있습니다.
:::

## API Key 생성하기

1. [Anthropic 콘솔](https://platform.claude.com/settings/keys)에 로그인해 API Key를 생성하고, 계정에 API 액세스가 활성화되어 있는지 확인하세요.
2. 키에 적절한 이름, 유효 기간, 사용량 한도를 설정하세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 Anthropic 콘솔에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Anthropic**을 여세요.
2. 기본 설정에 API Key를 붙여넣으세요.
3. 기본 Base URL을 그대로 유지하세요: `https://api.anthropic.com/v1/`.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

제공자 유효성 검사는 짧은 채팅 요청을 보내 연결 상태를 확인합니다. 검사가 실패하면 API Key가 유효한지, 계정에 사용 가능한 크레딧과 충분한 사용량 한도가 있는지, 속도 제한이 걸려 있지 않은지, 네트워크가 Anthropic API에 접근할 수 있는지 확인하세요.

모델 선택기에 원하는 모델이 보이지 않으면 먼저 AIRI를 업데이트하거나, **의식** 페이지에서 Anthropic이 제공하는 정확한 모델 ID를 직접 입력하세요.
