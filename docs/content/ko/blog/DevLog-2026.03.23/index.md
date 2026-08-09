---
title: DevLog @ 2026.03.23
category: DevLog
date: 2026-03-23
excerpt: |
  AIRI 모바일 성능 개선을 위한 초기 조사
preview-cover:
  light: "@assets('/en/blog/DevLog-2026.03.23/assets/cover-light.avif')"
  dark: "@assets('/en/blog/DevLog-2026.03.23/assets/cover-dark.avif')"
---

안녕하세요, [@PurCHES5](https://github.com/PurCHES5)입니다.

최근 AIRI 팀에 합류해 모바일 개발을 맡게 됐습니다. 이 프로젝트와 오픈소스 워크플로 전반에 대한 지식이 아직 얕은 상태에서, 첫 과제는 모바일 빌드 성능을 개선하기 위해 게임 엔진이나 다른 기술적 해법을 통합할 수 있는 가능성을 검토하는 것입니다.

현재 AIRI 모바일 통합의 문제는 주로 성능입니다. 최신 모바일 버전인 [`stage-pocket`](https://github.com/moeru-ai/airi/tree/e952fe779e64494e778e44956eb1caf3338c61a7/apps/stage-pocket)은 사실상 메인 Vue.js 애플리케이션을 그대로 복사해 Capacitor로 패키징한 것입니다.

모바일 기기, 특히 iOS 기기와 저사양 하드웨어에서는 Live2D와 VRM 컴포넌트가 WebView에 할당된 메모리를 빠르게 소진해 크래시로 이어집니다.

---

## 문제 분석

### 관찰된 현상

- Live2D / VRM 모델 렌더링 시 높은 메모리 사용량
- iOS와 저사양 Android 기기에서 잦은 크래시
- 장시간 구동 후 성능 저하

### 의심되는 원인

- WebView 메모리 누수
- 모바일 프로세서에서 Three.js 성능 부족

---

## 현재 아키텍처 개요

### 모바일 빌드 스택

| 계층 | 기술 |
|---|---|
| 프론트엔드 | Vue.js |
| 패키징 | Capacitor |
| 렌더링 | WebGL (Three.js) |
| 런타임 | 모바일 WebView |

### 렌더링 흐름

```
Vue UI
  ↓
WebView
  ↓
Three.js / Live2D / VRM
  ↓
Capacitor
  ↓
GPU
```

---

## 모바일의 성능 제약

### WebView 제약

- 네이티브 앱보다 메모리 할당량이 현저히 낮음
- 가비지 컬렉션 동작을 예측하기 어려움
- GPU 메모리 압박이 프로세스를 종료시킬 수 있음

### 기기별 제약

- iOS WebView 메모리 상한
- RAM이 제한된 저사양 Android 기기

---

## 게임 엔진 통합 탐색

### 후보 엔진

#### 2D

- PixiJS
- Cocos Creator
- Unity
- Godot
- Bevy
- Unreal Engine

#### 3D

- Three.js
- Babylon.js
- Unity
- Godot
- Unreal Engine
- 직접 작성한 커스텀 3D 엔진

### 통합 전략

| 전략 | 설명 |
|---|---|
| 엔진 전면 교체 | WebView 렌더러를 네이티브 엔진으로 완전히 대체 |
| 하이브리드 WebView | 엔진이 렌더링을, WebView가 UI를 담당 |
| 네이티브 렌더링 모듈 | 엔진이 배경 레이어로 동작하고 그 위에 Vue.js UI를 겹침 |

### 필요한 기능

- **Live2D**
- **MMD**
- VRM
- Spine2D

---

## Unity 통합 제안

### 렌더링 책임 분담

**Unity 담당:**
- VRM 렌더링
- Live2D 렌더링
- 애니메이션
- 물리 (필요한 경우)

**Vue / WebView 담당:**
- UI
- 설정
- 네트워크 요청

### 제안하는 하이브리드 아키텍처

```
Vue UI
  ↓
Native Bridge
  ↓
Unity Runtime
  ↓
Capacitor
  ↓
GPU
```

---

## 프로토타입 빌드

Unity 3D로 프로토타입 3종을 만들었고, 내보내기 용량을 줄이기 위해 압축을 적용했습니다.

### Unity WebGL 내보내기 설정
![Unity WebGL Export Settings](/en/blog/DevLog-2026.03.23/assets/Unity-web-export.avif)

### Unity Android 렌더러 설정
![Unity Android Renderer Export Settings](/en/blog/DevLog-2026.03.23/assets/Unity-android-export.avif)

### 스크린샷

**Android 렌더러 — Live2D:**
![Android Renderer Live2D prototype](/en/blog/DevLog-2026.03.23/assets/Screenshot-AIRI-Live2D.avif)

**Android 렌더러 — VRM:**
![Android Renderer VRM prototype](/en/blog/DevLog-2026.03.23/assets/Screenshot-AIRI-VRM.avif)

일관성을 위해 모든 프로토타입 빌드에 동일한 Vue.js 프론트엔드를 적용했습니다. Unity WebGL 내보내기의 경우 [`unity-webgl`](https://github.com/Marinerer/unity-webgl)을 써서 WebView의 기존 내용을 Unity WebGL로 바로 대체했습니다. Unity Android 렌더러의 경우 Three.js와 VRM 모듈이 들어 있던 기존 뷰를 완전히 제거하고, Unity가 배경 레이어로 렌더링하며 그 위에 Vue.js UI를 렌더링합니다.

---

## 벤치마크 결과

모든 측정은 동일 조건에서 Samsung A34로 수행했습니다. 성능 차이를 더 뚜렷하게 드러내기 위해 의도적으로 저사양 기기를 골랐습니다.

### Live2D 렌더링

| 지표 | Three.js (기준) | Unity WebGL | Unity Android 렌더러 |
|---|---|---|---|
| 전체 RAM | **354 MB** | **360 MB** | 663 MB |
| 그래픽 메모리 | **210 MB** | **202 MB** | 309 MB |
| CPU 사용률 | 18% | 19% | **7%** |
| FPS | 무난함 | 무난함 | **매끄러움** |

### VRM 렌더링

| 지표 | 기존 VRM (기준) | Unity WebGL | Unity Android 렌더러 |
|---|---|---|---|
| 전체 RAM | 724 MB | **402 MB** | 651 MB |
| 그래픽 메모리 | 566 MB | **247 MB** | **292 MB** |
| CPU 사용률 | 11% | 18% | **5%** |
| FPS | 낮음 | 무난함 | **매끄러움** |

### 참고 스크린샷

**Three.js — Live2D (기준):**
![Original Three.js Live2D](/en/blog/DevLog-2026.03.23/assets/Live2D-threejs.avif)

**Unity WebGL — Live2D:**
![Unity WebGL Live2D](/en/blog/DevLog-2026.03.23/assets/Live2D-webgl.avif)

**Unity Android 렌더러 — Live2D:**
![Unity Android Renderer Live2D](/en/blog/DevLog-2026.03.23/assets/Live2D-android-renderer.avif)

**Three.js — VRM (기준):**
![Original VRM Module from AIRI](/en/blog/DevLog-2026.03.23/assets/VRM-airi.avif)

**Unity WebGL — VRM:**
![Unity WebGL VRM](/en/blog/DevLog-2026.03.23/assets/VRM-webgl.avif)

**Unity Android 렌더러 — VRM:**
![Unity Android Renderer VRM](/en/blog/DevLog-2026.03.23/assets/VRM-android-renderer.avif)

### 핵심 관찰

- **VRM이 결정적인 병목입니다.** 기준이 되는 Three.js VRM 렌더러는 전체 RAM 724 MB, 그래픽 메모리 566 MB를 쓰는데, 대부분의 모바일 WebView가 크래시 없이 버틸 수 있는 수준을 훨씬 넘습니다. Unity WebGL은 이를 402 MB / 247 MB로, Android 렌더러는 651 MB / 292 MB로 낮춥니다.
- **Unity WebGL은 VRM에서 가장 좋은 메모리 프로필을 제공**하며 아키텍처 변경도 최소한입니다. 대신 CPU 사용률이 약간 높습니다.
- **Unity Android 렌더러는 프레임레이트와 CPU 효율이 가장 좋습니다.** 대신 전체 RAM 사용량이 높은데, Unity 런타임 자체의 오버헤드 때문이라 예상된 결과이며 GPU 작업은 WebView 밖으로 옮겨집니다.
- **Live2D 성능은 세 방식 모두 비슷합니다.** 기준인 Three.js 구현도 대부분의 Android 기기에서 충분하지만, 전환의 주된 이득은 앞으로 늘어날 콘텐츠를 위한 여유와 저사양 기기에서의 안정성입니다.

---

## 리스크 평가

| 리스크 | 비고 |
|---|---|
| 앱/내보내기 용량 증가 | Unity 런타임이 상당한 바이너리 무게를 추가 |
| 기여자 요건 | Unity / C# 과 셰이더 전문성이 필요 |
| 크로스 플랫폼 유지보수 | Android와 iOS Unity 빌드를 병행 유지해야 함 |
| 브리지 복잡도 | Vue와 Unity 사이 양방향 통신에 안정적인 API가 필요 |

---

## 평가 기준

앞으로의 프로토타입과 엔진 결정에는 다음 지표를 일관되게 측정해야 합니다:

- 메모리 사용량 (RAM 및 GPU)
- 지속 부하에서의 FPS 안정성
- 시작 / 콜드 런치 시간
- 빌드 / 설치 용량
- 배터리 소모
- 개발 복잡도
- 장기 유지보수성

---

## 다음 단계

### 1. 브리지 복잡도 평가

[Unity as a Library 통합](https://github.com/Unity-Technologies/uaal-example) 또는 유사한 플러그인을 조사해 양방향 통신(예: 채팅으로 촉발된 표정을 Vue에서 Unity로 전달)을 가능하게 합니다.

### 2. iOS 전용 프로토타이핑

iOS는 WebView 메모리에 관해 가장 제약이 심한 환경이므로, 다음 프로토타입은 Unity 네이티브 레이어가 "Total Safari Memory" 제한을 우회하는지 확인하기 위해 iPhone에서 검증해야 합니다.

### 3. 빌드 용량 최적화

Unity의 에셋 관리 시스템을 탐색해 초기 설치 용량을 최소로 유지합니다.

### 4. 커뮤니티 / 기여자 모집

프로젝트가 계속 유지보수 가능하도록, 앞으로의 기여자에게 필요한 역량(Unity/C#, 셰이더 작성)을 정의합니다.
