---
title: Cloudflare Workers AI
description: AIRI에서 Cloudflare Workers AI 채팅 모델 설정하기
---

Cloudflare Workers AI는 계정 수준의 자격 증명을 사용합니다. AIRI는 API Token 외에도 Workers AI 리소스를 찾기 위한 Cloudflare Account ID가 필요합니다.

::: info 왜 Cloudflare Workers AI를 선택하나요?
Cloudflare 계정으로 지원되는 Workers AI 모델을 실행하려면 이 제공자를 사용하세요.
:::

## 자격 증명 준비하기

1. [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)를 열고 Workers AI 접근 권한이 있는 API 토큰을 만드세요.
2. Token을 복사하세요.
3. [Cloudflare 콘솔](https://dash.cloudflare.com/)에서 Account ID를 찾아 복사하세요.

::: warning 안전 주의사항
API Token은 계정 권한에 바인딩됩니다. 최소 권한 원칙에 따라 AIRI에 필요한 Workers AI 권한만 부여하세요. Token이나 Account ID를 공개 로그에 포함하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Cloudflare Workers AI**를 여세요.
2. **API Token**과 **Account ID**를 입력하세요.

## 설정 확인

1. AIRI의 자동 필수 필드 검사가 통과될 때까지 기다리세요. 이 검사는 두 필드에 값이 있는지만 확인하며, Cloudflare에 접속하거나 자격 증명을 검증하지는 않습니다.
2. **모델 선택 →** 버튼을 클릭해 **설정 → 모듈 → 의식**을 열고 Cloudflare Workers AI와 사용 가능한 모델을 선택하세요.
3. 채팅으로 돌아가 테스트 메시지를 보내세요. 응답이 성공하면 Account ID, API Token 권한, 선택한 모델이 함께 정상 동작하는 것입니다.

## 문제 해결

필수 필드 검사가 실패하면 **API Token**과 **Account ID**에 모두 값이 있는지 확인하세요. 테스트 메시지가 실패하면 Token에 Workers AI 권한이 있는지, 그리고 Account ID와 같은 Cloudflare 계정에 속하는지 확인하세요. 이 제공자는 편집 가능한 Base URL을 사용하지 않으므로 Worker URL이나 API 경로를 입력하지 마세요.
