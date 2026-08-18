---
title: Azure AI Foundry
description: AIRI에서 Azure AI Foundry 채팅 모델 설정하기
---

Azure AI Foundry를 사용하려면 리소스 이름, 모델 배포 정보, API Key가 필요합니다.

::: info 왜 Azure AI Foundry를 선택하나요?
Azure AI Foundry에서 모델 배포와 접근 제어를 이미 완료했다면, 이 제공자를 통해 해당 배포에 직접 연결할 수 있습니다.
:::

## Azure AI Foundry 리소스 준비하기

1. [Azure AI Foundry](https://ai.azure.com/)에 로그인한 뒤 대상 프로젝트를 만들거나 열고 API Key, 리소스 이름, 모델 배포 정보를 확인하세요.

::: warning API Key 보안
Azure API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Azure AI Foundry**를 열고 **API Key**, 리소스 이름, 모델 ID를 입력하세요.
2. 콘솔에서 특정 API 버전을 요구한다면 화면에 함께 입력하세요. 표시용 모델 이름을 배포 이름으로 착각하지 않도록 주의하세요.

## 설정 확인

1. 필수 항목을 입력하면 AIRI가 API Key, 리소스 이름, 모델 ID가 채워져 있는지 자동으로 확인합니다. 이 확인은 네트워크 연결이나 자격 증명을 테스트하지 않습니다.
2. **설정 → 모듈 → 의식**으로 이동해 Azure AI Foundry 제공자와 배포를 선택한 뒤, 테스트 메시지를 보내 배포가 응답하는지 확인하세요.

## 문제 해결

유효성 검사가 실패하면 API Key, 리소스 이름, 배포 이름, API 버전이 모두 같은 Azure AI Foundry 프로젝트의 것인지 확인하세요. 표시용인 모델 이름이 아니라 배포 이름을 사용해야 합니다.
