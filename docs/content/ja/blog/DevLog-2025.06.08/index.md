---
title: 開発ログ @ 2025.06.08
category: DevLog
date: 2025-06-08
excerpt: |
  Live2D モデルがマウス位置を追従するようにする方法と、マルチディスプレイ環境での計算の難しさについて。
preview-cover:
  light: "@assets('/en/blog/DevLog-2025.06.08/assets/250608-light.avif')"
  dark: "@assets('/en/blog/DevLog-2025.06.08/assets/250608-dark.avif')"
---

こんにちは、AIRI のメンテナの一人、LemonNeko です。今日の DevLog では、AIRI デスクトップペットの Live2D モデルがマウスの位置を注視できるようにする方法についてお話しします。

## 思考の連鎖「Chain of Thoughts」

`<think>`

まず、Live2D には **注視 (focus)** と **タッチ (tap)** という2つの基本的なインタラクションがあることを理解する必要があります。Live2D キャンバスを作成すると、モデルは自動的にマウスの位置を注視し、頭と体がマウスの方を向きます。実装後の効果は以下のようになります：

![](/en/blog/DevLog-2025.06.08/assets/airi-tamagotchi-focus.gif)

しかし、マウスが Web ページの内容から外れると、Live2D はマウスの位置がどこにあるかわからなくなるため、マウスがどこにあるかを手動で教える必要があります。

Live2D にマウスの位置を教えるには、Tauri のネイティブコード呼び出し機能を利用して Windows API と macOS API を呼び出し、~~大量の unsafe を書いて~~ 画面全体におけるマウスの位置とウィンドウ自体の位置を取得し、最後に簡単な計算を行って、マウスとウィンドウの相対位置を取得する必要があります。

`</think>`

## マウスとウィンドウの相対位置を計算する

これが私たちの画面だと仮定しましょう：

![](/en/blog/DevLog-2025.06.08/assets/screen.avif)

青い枠が画面、ピンクが AIRI のウィンドウ、紫の矢印がマウスです。次のように定義します：

- 画面の高さと幅：`A x B`
- AIRI ウィンドウの左上の位置：`(E, F)`
- AIRI ウィンドウのサイズ：`C x D`
- マウスの位置：`G, H`

すると、AIRI ウィンドウ内のマウスの位置は `(G - E, H - F)` になるはずです。

非常に単純に見えますね。ではコードに書き起こすと、このようになります：

```typescript
const live2dFocusAt = ref({ x: innerWidth / 2, y: innerHeight / 2 }) // 初期位置

listen('tauri-app:window-click-through:mouse-location-and-window-frame', (event: { payload: [Point, WindowFrame] }) => {
  const [mouseLocation, windowFrame] = event.payload

  live2dFocusAt.value = {
    x: mouseLocation.x - windowFrame.origin.x,
    y: mouseLocation.y - windowFrame.origin.y,
  }
})
```

`live2dFocusAt` は Live2D モデルに渡す座標データです。

## モデルの注視点を手動で設定する

コードでは、上記で定義した `live2dFocusAt` を Live2D モデルに渡すだけです：

```typescript
const model = ref(Live2DModel.from('url', { autoInteract: false }))

watch(live2dFocusAt, (point) => {
  model.value.focus(point)
})
```

## マルチプラットフォーム対応

残念ながら、物事は私が想像していたほど単純ではありませんでした。マウスとウィンドウの相対位置を取得するという上記のアイデアは Windows では機能しましたが、macOS では機能しないことがわかりました。macOS の座標系では原点が左下隅にあり、**Y 軸が上向き**で、Windows とは逆だからです。しかし Safari ブラウザでは、座標系の原点は左上隅にあり、**Y 軸が下向き**です。そのため、macOS でのマウス位置は `(G - E, D - H + F)` と表現する必要があります。

## 続きを読む

さて、Live2D モデルが Tauri 上でウィンドウ外のマウス位置を追従するように実装しました。今回の DevLog は以上です。以下は実装プロセス中に参照した資料です。詳細な閲覧や議論を歓迎します：

- [モデルのインタラクションを手動で設定する - pixi-live2d-display](https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide#manually-1 "モデルのインタラクションを手動で設定する - pixi-live2d-display")
- [Win32 API: GetCursorPos](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcursorpos "GetCursorPos")
- [Win32 API: GetWindowRect](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect "GetWindowRect")
- [macOS API: `NSWindow.frame`](https://developer.apple.com/documentation/appkit/nswindow/frame "NSWindow.frame")
- [macOS API: `NSEvent.mouseLocation`](https://developer.apple.com/documentation/appkit/nsevent/mouselocation "NSEvent.mouseLocation")

> カバー画像提供：[@Rynco Maekawa](https://github.com/lynzrand)
