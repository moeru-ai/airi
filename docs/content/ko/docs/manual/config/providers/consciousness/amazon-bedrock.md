---
title: Amazon Bedrock
description: AIRI에서 Amazon Bedrock 채팅 모델 설정하기
---

Amazon Bedrock은 Bedrock API Key와 AWS 리전을 사용해 접근이 허용된 기반 모델에 액세스합니다.

::: info 왜 Amazon Bedrock을 선택하나요?
이미 AWS에서 모델 액세스, 리전, 결제를 관리하고 있다면 Bedrock은 동일한 계정 관리 방식을 그대로 활용할 수 있습니다.
:::

## Bedrock API Key 준비하기

1. [Amazon Bedrock 콘솔](https://console.aws.amazon.com/bedrock/)을 열어 필요한 모델에 대한 액세스를 활성화하고, 같은 계정과 리전에서 Bedrock API Key를 생성하세요.

::: warning AWS 자격 증명 보안
Bedrock API Key를 노출하지 마세요. AIRI의 제공자 설정에만 저장하고, 더 이상 필요하지 않으면 폐기하세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Amazon Bedrock**을 열고 **Amazon Bedrock API Key**와 **AWS Region**을 입력하세요. 기본 리전은 `us-east-1`입니다.
2. AWS 계정이 해당 리전에서 대상 모델에 액세스할 수 있는지 확인하세요. AIRI 폼에는 커스텀 엔드포인트 필드가 없습니다.

## 설정 확인

1. API Key와 리전을 입력한 뒤 AIRI의 자동 유효성 검사가 끝나기를 기다리세요.
2. **설정 → 모듈 → 의식**으로 이동해 Amazon Bedrock과 접근이 허용된 모델을 선택한 뒤, 메시지를 보내 설정을 확인하세요.

## 문제 해결

확인이 실패하면 Bedrock API Key, 선택한 AWS 리전, 모델 액세스가 같은 계정에 속하는지 점검하세요. 모델을 선택할 수 없다면 Bedrock 콘솔에서 해당 계정이 선택한 리전에서 그 모델에 액세스할 수 있는지 확인하세요.
