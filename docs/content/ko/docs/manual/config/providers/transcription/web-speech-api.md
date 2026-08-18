---
title: 브라우저 Web Speech API (ASR/STT)
description: AIRI 웹에서 브라우저 내장 음성 인식 사용하기
---

Web Speech API는 브라우저에 내장된 음성 인식 기능을 사용하며 API Key가 필요하지 않습니다.

::: info 왜 Web Speech API를 선택하나요?
웹에서 음성 입력을 빠르게 시험해 보고 싶고 브라우저가 Web Speech API를 지원한다면, 이것이 가장 간단한 설정 옵션입니다.
:::

## 브라우저 지원 확인

1. AIRI 웹을 사용하세요. Web Speech API 제공자는 데스크톱 버전(Electron)에서는 사용할 수 없습니다.
2. 현재 브라우저가 Web Speech API를 지원하고 마이크 권한을 허용할 준비가 되어 있는지 확인하세요.

::: warning 브라우저 제한
Web Speech API는 브라우저 환경에서만 사용할 수 있으며, AIRI 데스크톱 버전(Electron)에서는 지원되지 않습니다. 인식 성능은 브라우저, 네트워크 환경, 언어에 따라 다를 수 있습니다.
:::

## AIRI에서 설정하기

1. 웹 버전에서 **설정 → 제공자 → 전사 → Web Speech API**를 여세요.
2. **Recognition Language**를 선택한 뒤, 필요에 따라 **Continuous Recognition**과 **Show Interim Results**를 설정하세요.

## 설정 확인

1. **설정 → 모듈 → 청각**으로 이동해 Web Speech API와 오디오 입력 장치를 선택하세요.
2. 브라우저의 마이크 접근을 허용하고 짧은 음성 입력 테스트를 시작하세요.
3. AIRI에 전사 결과가 표시되는지 확인하세요.

## 문제 해결

전사 결과가 표시되지 않으면 브라우저의 마이크 권한, 선택한 입력 장치, 인식 언어를 확인하세요. 브라우저가 이 API를 지원하지 않으면 로컬 또는 클라우드 전사 제공자를 대신 사용하세요.
