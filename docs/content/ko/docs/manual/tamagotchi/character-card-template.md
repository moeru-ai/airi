---
title: 캐릭터 카드 템플릿
description: Project AIRI용 Character Card V3 JSON 템플릿입니다.
---

이 템플릿은 새 AIRI 캐릭터를 만들 때 쓸 수 있는 최소한의 Character Card V3 구조를 제공합니다. 아래 JSON을 복사한 뒤 예시 값을 여러분의 캐릭터 설정으로 바꾸고, 필드 이름과 중첩 구조는 그대로 유지하세요.

::: tip 작성 요령
- `name`, `description`, `personality`, `scenario`, `first_mes`부터 채워 보세요.
- 아직 필요하지 않은 선택 필드는 비워 두어도 됩니다.
- 가져오거나 공유하기 전에 최종 내용이 여전히 유효한 JSON인지 확인하세요.
:::

## 템플릿

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "data": {
    "name": "예시 캐릭터",
    "nickname": "예시",
    "description": "이 캐릭터가 어떤 인물인지 짧게 설명합니다.",
    "personality": "호기심 많고, 따뜻하며, 장난기가 있습니다.",
    "scenario": "캐릭터가 사용자를 처음 만나는 상황입니다.",
    "first_mes": "안녕하세요! 만나서 반가워요.",
    "alternate_greetings": [],
    "group_only_greetings": [],
    "mes_example": "",
    "creator": "당신의 이름",
    "creator_notes": "",
    "character_version": "1.0.0",
    "system_prompt": "",
    "post_history_instructions": "",
    "tags": ["example"],
    "extensions": {}
  }
}
```
