---
title: 캐릭터 카드 템플릿
description: AIRI Card 패키지용 Character Card V3 card.json 템플릿
---

이 문서는 AIRI Card 패키지 안의 `card.json` 파일에 사용할 수 있는 최소한의 Character Card V3 템플릿입니다. 필드 이름과 계층 구조는 그대로 유지하면서 예시 내용을 여러분의 캐릭터 설정으로 바꾸세요.

::: warning JSON 파일만으로는 가져올 수 없습니다
현재 AIRI Card 업로드 컨트롤은 루트에 `manifest.json`과 `card.json`이 모두 들어 있는 `.zip` 패키지만 받습니다. 아래에 보이는 JSON만 저장해서 그대로 업로드하면 실패합니다.
:::

::: tip 작성 요령
- `name`, `description`, `personality`, `scenario`, `first_mes`부터 채워 보세요.
- 사용하지 않는 선택 필드는 비워 두세요.
- 패키징하거나 공유하기 전에 최종 내용이 유효한 JSON인지 확인하세요.
:::

## 패키지 구조

```text
my-airi-card.zip
├── manifest.json
└── card.json
```

다음의 최소 `manifest.json`을 사용하세요:

```json
{
  "format": "airi-character-card",
  "version": 1,
  "card": {
    "path": "card.json",
    "spec": "chara_card_v3"
  }
}
```

AIRI가 내보낸 패키지에는 `models/` 아래에 지원되는 표시 모델이 함께 들어 있고 `manifest.json`에 해당 정보가 기술되어 있을 수도 있습니다. 표시 모델을 동봉하지 않는 카드라면 위의 두 파일 구조만으로 충분합니다.

::: warning AIRI Card 패키지는 무손실 CCv3 백업이 아닙니다
AIRI는 명시적 화이트리스트에 포함된 캐릭터 필드와 AIRI 모듈 설정만 가져옵니다. 아래 템플릿에 표시된 필드는 보존하지만, `group_only_greetings`, `mes_example`, `creator`, `tags` 같은 지원되지 않는 CCv3 메타데이터는 버립니다. 서드파티 확장과 `extensions.airi` 안의 지원되지 않는 필드도 제거됩니다. 무손실 백업이 필요하다면 원본 카드를 별도로 보관하세요.
:::

## `card.json` 템플릿

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "data": {
    "name": "Example Character",
    "nickname": "Example",
    "description": "A short description of who this character is.",
    "personality": "Curious, warm, and a little playful.",
    "scenario": "This character is meeting the user for the first time.",
    "first_mes": "Hello! Nice to meet you.",
    "alternate_greetings": [],
    "creator_notes": "",
    "character_version": "1.0.0",
    "system_prompt": "",
    "post_history_instructions": "",
    "extensions": {}
  }
}
```
