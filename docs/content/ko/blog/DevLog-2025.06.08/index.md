---
title: DevLog @ 2025.06.08
category: DevLog
date: 2025-06-08
excerpt: |
  Live2D 모델이 커서 위치를 따라 시선을 옮기게 만드는 방법과, 여러 디스플레이에 걸쳐 좌표를 계산하는 일이 왜 까다로운지 이야기합니다.
preview-cover:
  light: "@assets('/en/blog/DevLog-2025.06.08/assets/250608-light.avif')"
  dark: "@assets('/en/blog/DevLog-2025.06.08/assets/250608-dark.avif')"
---

안녕하세요, AIRI 메인테이너 중 한 명인 LemonNeko입니다. 오늘의 DevLog 주제는 AIRI 데스크톱 펫의 Live2D 모델이 마우스 위치를 바라보게 만드는 방법입니다.

## 생각의 연쇄 「Chain of Thoughts」

`<think>`

먼저 알아야 할 것이 있습니다. Live2D에는 **주시(focus)**와 **터치(tap)**라는 두 가지 기본 상호작용이 있습니다. Live2D 캔버스를 만들면 모델이 자동으로 커서 위치를 주시하며 머리와 몸이 커서 쪽을 향합니다. 구현 결과는 이렇습니다:

![](/en/blog/DevLog-2025.06.08/assets/airi-tamagotchi-focus.gif)

하지만 커서가 웹 페이지 밖으로 나가면 Live2D는 커서가 어디 있는지 알 수 없게 됩니다. 그래서 커서가 어디 있는지 직접 알려 줘야 합니다.

Live2D에 커서 위치를 알려 주려면 Tauri의 네이티브 코드 호출 기능으로 Windows API와 macOS API를 호출해 ~~unsafe를 잔뜩 써 가며~~ 화면 전체에서의 커서 위치와 창 자체의 위치를 얻은 뒤, 간단한 계산으로 커서와 창의 상대 위치를 구해야 합니다.

`</think>`

## 커서와 창의 상대 위치 계산하기

이런 화면이 있다고 가정해 봅시다:

![](/en/blog/DevLog-2025.06.08/assets/screen.avif)

파란 상자가 화면, 분홍색이 AIRI 창, 보라색 화살표가 커서입니다. 다음과 같이 정의합니다:

- 화면 크기: `A x B`
- AIRI 창의 좌상단 위치: `(E, F)`
- AIRI 창의 크기: `C x D`
- 커서 위치: `G, H`

그러면 창 안에서의 커서 상대 위치는 `(G - E, H - F)`가 됩니다.

아주 간단해 보이죠? 그럼 코드로 옮겨 봅시다.

```typescript
const live2dFocusAt = ref({ x: innerWidth / 2, y: innerHeight / 2 }) // 초기 위치

listen('tauri-app:window-click-through:mouse-location-and-window-frame', (event: { payload: [Point, WindowFrame] }) => {
  const [mouseLocation, windowFrame] = event.payload

  live2dFocusAt.value = {
    x: mouseLocation.x - windowFrame.origin.x,
    y: mouseLocation.y - windowFrame.origin.y,
  }
})
```

`live2dFocusAt`은 Live2D 모델에 전달할 좌표 데이터입니다.

## 모델의 주시 지점을 직접 설정하기

`live2dFocusAt`을 Live2D 모델에 넘겨 주시 지점을 직접 설정할 수 있습니다:

```typescript
const model = ref(Live2DModel.from('url', { autoInteract: false }))

watch(live2dFocusAt, (point) => {
  model.value.focus(point)
})
```

## 멀티 플랫폼 대응

안타깝게도 이야기는 생각만큼 간단하지 않았습니다. 위에서 말한 커서-창 상대 위치 계산 방식은 Windows에서는 동작하지만 macOS에서는 동작하지 않습니다. macOS 좌표계는 원점이 좌하단에 있고 **Y 축이 위를 향해서** Windows와 반대이기 때문입니다. 반면 Safari 브라우저에서는 좌표계 원점이 좌상단이고 **Y 축이 아래를 향합니다**. 그래서 macOS에서의 커서 위치는 `(G - E, D - H + F)`로 표현해야 합니다.

## 더 읽을거리

이번 DevLog에서는 커서와 창의 상대 위치를 구하는 방법과 Live2D 모델의 주시 지점을 직접 설정하는 방법을 살펴봤습니다. 구현 세부 사항이 궁금하시다면 이 PR의 [소스 코드](https://github.com/moeru-ai/airi/pull/194)를 확인해 보세요. 아래는 구현 과정에서 참고한 자료입니다. 자세히 읽어 보시고 논의도 환영합니다:

- [모델 상호작용 직접 설정하기 - pixi-live2d-display](https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide#manually-1 "모델 상호작용 직접 설정하기 - pixi-live2d-display")
- [Win32 API: GetCursorPos](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcursorpos "GetCursorPos")
- [Win32 API: GetWindowRect](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect "GetWindowRect")
- [macOS API: `NSWindow.frame`](https://developer.apple.com/documentation/appkit/nswindow/frame "NSWindow.frame")
- [macOS API: `NSEvent.mouseLocation`](https://developer.apple.com/documentation/appkit/nsevent/mouselocation "NSEvent.mouseLocation")

> 커버 이미지 [@Rynco Maekawa](https://github.com/lynzrand)
