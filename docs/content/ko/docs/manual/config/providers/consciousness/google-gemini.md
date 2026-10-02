---
title: Google Gemini
description: AIRI에서 Google Gemini 채팅 모델 설정하기
---

Google Gemini 제공자는 Google Generative Language API의 OpenAI 호환 엔드포인트를 사용합니다. 설정을 완료한 후 **설정 → 모듈 → 의식**에서 Gemini 모델을 선택하세요.

::: info 왜 Google Gemini를 선택하나요?
이미 Gemini API Key가 있거나 AIRI에서 Gemini 모델을 사용하고 싶다면 이 서비스 제공자를 선택할 수 있습니다.
:::

## API Key 생성하기

1. [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)에 로그인한 뒤 Gemini API Key를 생성하세요.
2. 키가 속한 프로젝트에서 Gemini API가 활성화되어 있고 대상 모델을 사용할 수 있는지 확인하세요.
3. API Key를 복사하세요.

::: warning API Key 보안
키가 유출되면 Google AI 개발자 콘솔에서 즉시 폐기하고 다시 생성하세요. 키를 코드, 스크린샷, 공개 설정 파일에 넣지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Google Gemini**를 여세요.
2. API Key를 입력하세요.
3. 기본 Base URL을 유지하세요: `https://generativelanguage.googleapis.com/v1beta/openai/`.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

제공자 유효성 검사는 연결 상태, 모델 목록, 채팅 요청을 확인합니다. AIRI가 권한 오류나 사용할 수 없는 모델을 보고하면, API Key가 속한 프로젝트에서 Gemini API가 활성화되어 있는지, 해당 프로젝트의 리전에서 모델을 사용할 수 있는지 확인하세요. Google AI Studio에 표시된 이름을 고쳐 쓰지 말고 AIRI에 반환된 모델 이름을 사용하세요.
