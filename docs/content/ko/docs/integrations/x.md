---
title: X / Twitter (사용 불가)
description: AIRI X / Twitter 통합의 현재 구현 상태
---

X / Twitter 통합은 AIRI 0.11.3에서 동작하지 않습니다. **설정 → 모듈 → X / Twitter**에 자격 증명 필드가 표시되고 **configured** 상태가 나타날 수 있지만, 현재 앱은 그 설정을 별도의 X 서비스에 전달할 수 없습니다.

::: warning X 자격 증명을 입력하지 마세요

현재 버전에서는 API Key, API Secret, Access Token, Access Token Secret을 입력하지 마세요. **configured** 상태는 네 필드에 모두 값이 들어 있다는 뜻일 뿐, 서비스 연결이 동작한다는 것을 확인해 주지 않습니다.
:::

## 현재 제한 사항

프로토콜 불일치를 조사하기 전에, 컨트리뷰터는 `ENABLE_AIRI=true`, `AIRI_URL=ws://localhost:6121/ws`, 그리고 **설정 → 연결 → Auth Token**과 일치하는 `AIRI_TOKEN`으로 외부 프로세스를 시작해야 합니다. 저장소에 커밋된 기본값은 AIRI 어댑터를 비활성화하고, 주소를 `http://localhost:3000`으로 지정하며, 토큰을 제공하지 않습니다. 이 설정을 바로잡으면 서비스가 연결될 수 있을 뿐, 아래에 설명한 호환되지 않는 설정 전달 흐름이 고쳐지는 것은 아닙니다.

AIRI 모듈은 모듈 이름 `twitter`로 설정을 발행하지만, 외부 서비스는 `x`를 기대합니다. 채널 프로토콜도 서로 다릅니다. 서버는 설정을 `{ config }` 페이로드가 담긴 `module:configure`로 전달하지만, 서비스는 `ui:configure`를 수신 대기하며 `moduleName` 필드를 기대합니다. 또한 외부 서비스는 별도 프로세스로 실행되며 AIRI가 시작해 주지 않습니다. 따라서 모듈 이름만 고치거나 서비스를 수동으로 시작하는 것만으로는 이 폼이 동작하지 않습니다.

지원되는 최종 사용자용 해결 방법은 없습니다. 구현을 조사하는 컨트리뷰터는 다음을 비교할 수 있습니다:

- `packages/stage-ui/src/stores/modules/twitter.ts`
- `integrations/twitter-services/src/adapters/airi-adapter.ts`

## 자격 증명 보안

이전에 자격 증명을 입력했다면 AIRI에서 제거하고, 유출됐을 가능성이 있다면 [X Developer Portal](https://developer.x.com/en/portal/dashboard)에서 교체하세요. X 자격 증명은 절대 커밋하거나, 스크린샷에 포함하거나, 공유하지 마세요.
