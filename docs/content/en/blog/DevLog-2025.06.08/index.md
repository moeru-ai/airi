---
title: DevLog @ 2025.06.08
category: DevLog
date: 2025-06-08
excerpt: |
  How to make the Live2D model follow the mouse position, and the challenges of computing it in a multi-display environment.
preview-cover:
  light: "/blog/DevLog-2025.06.08/assets/250608-light.avif"
  dark: "/blog/DevLog-2025.06.08/assets/250608-dark.avif"
---


Hello everyone, here's LemonNeko, one of the maintainers of AIRI. Today's DevLog is about: letting the Live2D model of the AIRI Tamagotchi focus on the cursor position.


## Chain of Thoughts


First of all, we need to know that there are two basic interactions in Live2D: **Focus** and **Tap**. When we create a Live2D canvas, the model will automatically focus the position of our cursor — the head and body turn toward the cursor. Here is the effect after implementation:


![](/blog/DevLog-2025.06.08/assets/airi-tamagotchi-focus.gif)


But if the cursor leaves the web page content, Live2D no longer knows where the cursor is. So we need to tell it manually.


To tell the cursor position to Live2D, we need to use the native code calling ability of Tauri and call the Windows API and macOS API to get the cursor position on the whole screen and the position of the window itself. Then, with some simple calculations, we get the relative position of the cursor to the window.


## Calculate the Relative Position of Cursor to Window


For example, we have a screen like this:


![](/blog/DevLog-2025.06.08/assets/screen.avif)


The blue box is the screen, the pink box is the AIRI window, and the purple arrow is the cursor. We define:


- The screen size is: `A x B`
- The position of the AIRI window's top-left corner is: `(E, F)`
- The size of the AIRI window is: `C x D`
- The position of the cursor is: `G, H`


Then the relative position of the cursor to the window is: `(G - E, H - F)`


It seems very simple, right? Then let's write the code:

```typescript

const live2dFocusAt = ref({ x: innerWidth / 2, y: innerHeight / 2 }) // initial position

listen('tauri-app:window-click-through:mouse-location-and-window-frame', (event: { payload: [Point, WindowFrame] }) => {

  const [mouseLocation, windowFrame] = event.payload

  live2dFocusAt.value = {

    x: mouseLocation.x - windowFrame.origin.x,

    y: mouseLocation.y - windowFrame.origin.y,

  }

})

```


`live2dFocusAt` is the coordinate data that will be passed to the Live2D model.


## Set the Focus Point of the Live2D Model Manually


In the code, we pass the `live2dFocusAt` defined above to the Live2D model:

```typescript

const model = ref(Live2DModel.from('url', { autoInteract: false }))

watch(live2dFocusAt, (point) => {

  model.value.focus(point)

})

```


## Multi-platform Support


Unfortunately, the story is not as simple as I thought. The idea of getting the relative position of the cursor to the window works on Windows, but it does not work on macOS. On macOS, the origin of the coordinate system is at the bottom left corner — **Y axis is up** — which is opposite to Windows. But in the Safari browser, the origin of the coordinate system is at the top left corner — **Y axis is down** — so the cursor position on macOS should be represented as `(G - E, D - H + F)`.


## Read More


In this DevLog, we learned how to get the relative position of the cursor to the window, and how to set the focus point of the Live2D model manually. If you want to know more about the implementation details, you can check the [source code](https://github.com/moeru-ai/airi/pull/194) of this PR.


- [Manually configure the model's interaction - pixi-live2d-display](https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide#manually-1 "Manually configure the model's interaction - pixi-live2d-display")
- [Win32 API: GetCursorPos](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcursorpos "GetCursorPos")
- [Win32 API: GetWindowRect](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect "GetWindowRect")
- [macOS API: `NSWindow.frame`](https://developer.apple.com/documentation/appkit/nswindow/frame "NSWindow.frame")
- [macOS API: `NSEvent.mouseLocation`](https://developer.apple.com/documentation/appkit/nsevent/mouselocation "NSEvent.mouseLocation")


> Cover image by [@Rynco Maekawa](https://github.com/lynzrand)

