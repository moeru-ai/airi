---
title: Aliyun NLS
description: AIRI에서 Alibaba Cloud 지능형 음성 상호작용 서비스(ASR) 설정하기
---

Alibaba Cloud NLS는 AIRI에 실시간 음성 인식(ASR)을 제공합니다. 설정을 완료한 후 **설정 → 모듈 → 청각**에서 **Aliyun NLS**를 선택하고 마이크 입력을 테스트하세요.

::: info 왜 Alibaba Cloud NLS를 선택하나요?
이미 Alibaba Cloud 계정을 사용 중이고 실시간 음성 인식 기능이 필요하다면 Alibaba Cloud NLS를 선택할 수 있습니다.
:::

## 자격 증명 준비하기

1. [Alibaba Cloud 지능형 음성 상호작용 콘솔](https://nls-portal.console.aliyun.com/overview)에서 서비스를 활성화하고 프로젝트를 만든 뒤 **AppKey**를 복사하세요.
2. **AccessKey Management**에서 필요한 권한을 가진 RAM 사용자 AccessKey를 만드세요.
3. **AccessKey ID**와 **AccessKey Secret**을 복사하세요. Secret은 보통 전체 값이 한 번만 표시됩니다.

::: warning AccessKey 보안
AccessKey ID, AccessKey Secret, AppKey를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. RAM 사용자에게는 필요한 권한만 부여하세요. 자격 증명이 유출되면 즉시 비활성화하고 Alibaba Cloud 콘솔에서 대체 자격 증명을 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 전사 → Aliyun NLS**를 여세요.
2. **AccessKey ID**, **AccessKey Secret**, **AppKey**를 입력하세요.
3. 중국 동부 `cn-shanghai`, 중국 북부 `cn-beijing`, 중국 남부 `cn-shenzhen`처럼 가장 가까운 지역을 선택하세요.

## 설정 확인

1. 확인 페이지에 기본 자격 증명 검증이 통과되었다는 안내가 표시됩니다.
2. **설정 → 모듈 → 청각**에서 **Aliyun NLS**와 오디오 입력 장치를 선택하세요.
3. "Start Monitoring"을 클릭한 뒤 마이크에 대고 말하거나 오디오 클립을 재생하세요.
4. 전사 영역에 텍스트가 실시간으로 출력되는지 확인하세요. 인식 결과가 부정확하면 감도를 조정한 뒤 다시 테스트할 수 있습니다.

## 문제 해결

자격 증명 검증에 실패하면 세 가지 자격 증명이 모두 같은 Alibaba Cloud 계정과 프로젝트에서 발급된 것인지 확인한 뒤 RAM 사용자 권한을 점검하세요. 텍스트가 표시되지 않으면 운영 체제가 AIRI에 마이크 접근 권한을 부여했는지 확인하세요.
