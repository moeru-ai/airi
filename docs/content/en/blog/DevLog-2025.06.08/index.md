---
title: DevLog @ 2025.06.08
category: DevLog
date: 2025-06-08
excerpt: |
  How we make Live2D models follow the cursor position, and the how it's challenging to calculate across multiple displays.
preview-cover:
  light: "@assets('./assets/250608-light.avif')"
  dark: "@assets('./assets/250608-dark.avif')"
---

Hello everyone, here's LemonNeko, one of maintainer of AIRI. Today's DevLog is talking about: Let Live2D model of AIRI Tamagotchi to focus position.

大家好，我是 LemonNeko，AIRI 的维护者之一，由我来为大家带来今天的 DevLog：让 AIRI 桌宠的 Live2D 模型可以注视鼠标位置。

## 思路整理「Chain of Thoughts」

`<think>`

First of all, we need to know, there are two basic interations of Live2D: **Focus**, and **Tap**, when we create a Live2D canvas, model will auto focus the position of our cursor, head will look at it, like this:

首先我们需要了解，在 Live2D 中有两种基础的交互：注视 (focus) 与触碰 (tap)，当我们创建一个 Live2D 画布，模型就会自动注视我们的鼠标位置，头和身体朝向鼠标这一侧。下面是实现后的效果：

![](./assets/airi-tamagotchi-focus.gif)

But, if the cursor is out of web page, Live2D won't know the position of our cursor, so we need to tell the Live2D engine where is our cursor.

但是当鼠标离开网页内容后，Live2D 就不再会知道鼠标的位置在哪了，所以我们需要手动告诉它鼠标在哪。

To tell the position of cursor to Live2D, we need to use native code calling ability of Tauri, and get the position of cursor and window frame. Then we can calculate the relative position of cursor to window.

为了告诉 Live2D 鼠标的位置，我们需要利用 Tauri 的原生代码调用能力来调用 Windows API 和 macOS API，~~写一大堆 unsafe~~ 来取得鼠标在整块屏幕上的位置与窗口本身的位置，最后进行一些简单的计算，得到鼠标与窗口的相对位置。

`</think>`

## Calculate the relative position of cursor to window<br>计算鼠标与窗口的相对位置

For example, we have a screen like this:

假设这是我们的屏幕：

![](./assets/screen.avif)

The blue box is the screen, the pink box is the AIRI window, the purple arrow is the cursor, we define:

蓝色框是屏幕，粉色是 AIRI 的窗口，紫色箭头是鼠标，我们定义：

- The screen size is: `A x B`<br>屏幕高宽为：`A x B`
- The position of AIRI window is: `(E, F)`<br>AIRI 窗口左上角位置为：`(E, F)`
- The size of AIRI window is: `C x D`<br>AIRI 窗口大小为：`C x D`
- The position of cursor is: `G, H`<br>鼠标位置是：`G, H`

Then the relative position of cursor to window is: `(G - E, H - F)`

那么鼠标的位置在 AIRI 窗口中的位置应当是：`(G - E, H - F)`

It seems very simple, right? Then let's write the code.

似乎非常简单啊，那在代码中写出来的话，应该会是这样子的：

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

`live2dFocusAt` 是要传递给 Live2D 模型的坐标数据。

## Set the focus point of Live2D model manually<br>手动设置模型的注视点

We can set the focus point of Live2D model manually by passing the `live2dFocusAt` to the Live2D model.

在代码里就是这样，把我们在上面定义的 `live2dFocusAt` 传递给 Live2D 模型：

```typescript
const model = ref(Live2DModel.from('url', { autoInteract: false }))

watch(live2dFocusAt, (point) => {
  model.value.focus(point)
})
```

## Multi-platform support<br>多平台适配

Unfortunately, the story is not as simple as I thought. The idea of getting the relative position of cursor to window works on Windows, but it doesn't work on macOS. In macOS, the origin of the coordinate system is at the bottom left corner, **Y axis is up**, which is opposite to Windows. But in Safari browser, the origin of the coordinate system is at the top left corner, **Y axis is down**, so the cursor position on macOS should be represented as `(G - E, D - H + F)`.

很不幸的是，事情并没有我想象的那么简单，上面提到的得到鼠标与窗口相对位置的思路在 Windows 上是工作的，来到了 macOS 上就发现不起作用了，因为 macOS 的坐标系中原点在左下角，**Y 轴向上**，与 Windows 相反，但是在 Safari 浏览器中，坐标系的原点在左上角，**Y 轴向下**，所以我们的鼠标位置在 macOS 上应该表示为 `(G - E, D - H + F)`。

## Read more<br>阅读更多

In this DevLog, we learned how to get the relative position of cursor to window, and how to set the focus point of Live2D model manually. If you want to know more about the implementation details, you can check the [source code](https://github.com/moeru-ai/airi/pull/194) of this PR.

好了，我们实现了 Live2D 模型在 Tauri 上跟随窗口之外的鼠标位置，这就是本次 DevLog 的全部内容，以下是我在实现过程中查阅的资料，欢迎详细阅读以及讨论：

- [手动配置模型的交互 - pixi-live2d-display](https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide#manually-1 "手动配置模型的交互 - pixi-live2d-display")
- [Win32 API: GetCursorPos](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcursorpos "GetCursorPos")
- [Win32 API: GetWindowRect](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect "GetWindowRect")
- [macOS API: `NSWindow.frame`](https://developer.apple.com/documentation/appkit/nswindow/frame "NSWindow.frame")
- [macOS API: `NSEvent.mouseLocation`](https://developer.apple.com/documentation/appkit/nsevent/mouselocation "NSEvent.mouseLocation")

> Cover image by [@Rynco Maekawa](https://github.com/lynzrand)
