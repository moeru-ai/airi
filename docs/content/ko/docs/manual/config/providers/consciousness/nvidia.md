---
title: NVIDIA NIM
description: AIRI에서 NVIDIA NIM을 채팅 제공자로 설정하기
is_openai_compatible: true
---

NVIDIA NIM은 OpenAI 형식과 호환되는 채팅 API를 제공합니다. 이 페이지의 설정을 완료하면 AIRI가 의식에서 NVIDIA NIM이 제공하는 모델을 사용할 수 있습니다.

::: warning 데스크톱 전용
이 제공자는 현재 Electron 데스크톱 앱에서만 사용할 수 있습니다. AIRI 웹에서는 제공되지 않습니다.
:::

::: info 왜 NVIDIA NIM을 선택하나요?
NVIDIA NIM 플랫폼에서 이미 모델 서비스를 사용하고 있다면 같은 자격 증명을 AIRI에 연결할 수 있습니다.
:::

## API Key 발급받기

1. [NVIDIA NIM Console](https://build.nvidia.com/)을 여세요.
2. API Keys 페이지에서 새 API Key를 만드세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 NVIDIA 콘솔에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → NVIDIA NIM**을 여세요.
2. 기본 설정에 API Key를 붙여넣으세요.
3. 기본 Base URL인 `https://integrate.api.nvidia.com/v1/`를 유지하세요.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

API 확인이 실패하면 API Key, 사용 가능한 크레딧 또는 할당량, 요청 한도, 네트워크 연결을 확인하세요. AIRI가 모델 목록을 불러오지 못하면 **의식** 페이지에서 NVIDIA NIM이 제공하는 정확한 모델 ID를 직접 입력하세요.
