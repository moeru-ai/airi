---
title: LM Studio (로컬 모델)
description: 로컬 LM Studio 서비스로 AIRI 채팅 모델 설정하기
---

LM Studio는 모델을 로컬에서 직접 실행하고 자체 API를 제공합니다. 자신의 기기에서 모델을 실행하려는 사용자에게 적합하며, 기본적으로 API Key가 필요하지 않습니다.

::: info 왜 LM Studio를 선택하나요?
모델을 로컬에서 실행하고 모델 파일을 직접 관리하고 싶다면, LM Studio는 클라우드 API Key에 의존하지 않는 선택지입니다.
:::

## 로컬 서비스 시작하기

1. [LM Studio 다운로드 페이지](https://lmstudio.ai/download)에서 LM Studio를 설치하고 실행한 뒤, 채팅 모델을 다운로드해 로드하세요.
2. **Local Server**를 열고 로컬 서버를 시작하세요.
3. AIRI와 LM Studio가 서로 다른 기기에서 실행된다면 LM Studio에서 **Serve on Local Network**를 활성화하거나, 서버를 루프백이 아닌 주소에 바인딩하세요.
4. AIRI가 다른 기기에서 실행된다면 AIRI에서 LM Studio 기기의 LAN 주소를 사용하세요.
5. 브라우저가 CORS 때문에 요청을 차단하면 LM Studio에서 CORS를 활성화하세요. CORS는 네트워크 도달성이나 인증을 제공하지 않습니다.

::: warning 네트워크 보안
LM Studio 서버를 공용 인터넷에 노출하지 마세요. 신뢰할 수 있는 로컬 네트워크에서만 사용하세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → LM Studio**를 여세요.
2. 기본 Base URL을 유지하세요: `http://localhost:1234/v1/`. 다른 기기의 서비스라면 `localhost`를 그 기기의 LAN 주소로 바꾸세요.
3. LM Studio 서비스에 인증이 필요하면 API Key를 입력하고, 그렇지 않으면 비워 두세요.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 로드된 모델을 선택하세요.

## 문제 해결

AIRI가 연결하지 못하면 Local Server가 실행 중인지, 포트가 Base URL과 일치하는지 확인하세요. AIRI와 LM Studio가 서로 다른 기기에서 실행된다면 AIRI 기기에서 접근할 수 있는 LAN 주소를 사용하세요.
