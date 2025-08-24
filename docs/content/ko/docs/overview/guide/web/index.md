# 웹 버전 가이드

AIRI 웹 버전은 브라우저에서 바로 실행할 수 있는 PWA(Progressive Web App)입니다.

## 시작하기

1. [https://airi.moeru.ai](https://airi.moeru.ai)에 접속
2. 첫 방문시 **설정** 메뉴에서 LLM 제공업체 설정
3. 마이크 권한 허용 (음성 대화를 위해)
4. AIRI와 대화 시작!

## 주요 기능

### 💬 텍스트 채팅
- 하단 입력창에 메시지 입력
- Enter 키로 전송
- 실시간 응답

### 🎤 음성 대화
- 마이크 버튼 클릭하여 음성 입력
- 자동 음성 인식 (STT)
- 음성으로 응답 (TTS)

### 🎭 아바타
- **Live2D 모델**: 2D 애니메이션 캐릭터
- **VRM 모델**: 3D 캐릭터 (실험적)
- 실시간 립싱크
- 자동 깜빡임 및 시선 추적

### ⚙️ 설정
- **LLM 제공업체**: OpenAI, Claude, Gemini 등
- **음성**: TTS/STT 제공업체 선택
- **테마**: 다크/라이트 모드
- **언어**: 한국어, 영어, 중국어, 일본어

## 지원 제공업체

### LLM (대화)
- OpenAI (GPT-4, GPT-3.5)
- Anthropic Claude
- Google Gemini
- Ollama (로컬)
- OpenRouter
- 기타 20+ 제공업체

### TTS (음성 합성)
- ElevenLabs
- OpenAI TTS
- Google Cloud TTS
- Azure Cognitive Services

### STT (음성 인식)
- OpenAI Whisper
- Google Cloud STT
- Azure Speech Services

## 모바일 사용

### PWA 설치
1. 브라우저 메뉴에서 "홈 화면에 추가" 선택
2. 설치 후 네이티브 앱처럼 사용 가능
3. 오프라인에서도 기본 기능 동작

### 터치 조작
- **탭**: 아바타와 상호작용
- **롱탭**: 설정 메뉴 열기
- **스와이프**: 히스토리 탐색

## 성능 최적화

### 브라우저 권장사항
- **Chrome/Edge**: WebGPU 지원으로 최적 성능
- **Firefox**: 안정적이지만 일부 기능 제한
- **Safari**: 모바일에서 PWA 설치 지원

### 네트워크
- **고속 인터넷**: 실시간 음성 대화를 위해 권장
- **데이터 절약**: 텍스트 전용 모드 사용
- **오프라인**: 캐시된 리소스로 제한적 사용 가능

## 제한사항

웹 버전의 제한사항:
- 로컬 파일 접근 불가
- 시스템 트레이 통합 없음
- 일부 고급 음성 처리 기능 제한
- 브라우저 보안 정책으로 인한 제약

더 많은 기능을 원한다면 [데스크톱 클라이언트](../tamagotchi/)를 사용해보세요!
