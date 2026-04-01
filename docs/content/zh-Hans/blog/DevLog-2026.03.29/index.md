---
title: DevLog @ 2026.03.29
category: DevLog
date: 2026-03-29
excerpt: |
  我们应该如何在 Godot 中嵌入 WebView？关于 AIRI 改用 Godot 引擎进行场景渲染但是依然用 Web 技术来实现 UI 和逻辑。
preview-cover:
  light: "@assets('./assets/cover-light.avif')"
  dark: "@assets('./assets/cover-dark.avif')"
---

欢迎回来，这里是 [@LemonNekoGH](https://github.com/LemonNekoGH)，AIRI 维护者之一，距离柠猫的上一篇 DevLog 已经过去一个月了，这段时间里又整了一点点小活，今天就来和大家分享一下。

我们在两个月前引入了 Capacitor 来构建基于 WebView 的原生移动端应用，以便利用移动端设备的一些特有功能，比如后台任务驻留、闹钟、日历、计步器什么的。

但是我们发现 Live2D 和 VRM 在 WebGL 上的性能表现不是特别好，而且内存占用偏高，加载一个 VRM 模型就会占用 700+ MB 的内存，这导致在部分设备上会直接崩溃，体验过于糟糕了。

于是我们开始寻找能渲染复杂 3D 场景的替代方案，柠猫负责的部分是调研 Godot 引擎，然而 Godot 的 UI 开发体验过于差了，很难做到现在 Web 页面这样的复杂度，而且几乎所有的 UI 都要重写，所以我在尝试在 Godot 画面前叠加 WebView 的方法，这样我们依然可以继续用现有的 UI 框架。

但是，到底该怎么做呢？

## Android 端

我找了一圈发现并没有什么比较合适的库所以我基于自己贫瘠的 Android 开发知识，拿到 Godot 所在的 Activity 的根 View，直接往根 View 顶上叠一个原生 WebView。

所幸，我通过 `adb shell uiautomator dump` 命令拿到了 Godot 所在的 Activity 的根 View 的 XML 结构，知道了根 View 是 FrameLayout，这样没有什么很复杂的布局代码要写了。

1. 首先我们要在 Godot 项目中启用 Android Gradle 导出，这样 Godot 就会帮我们创建一个 Gradle 工程，然后我们就可以在里面自定义 Android 部分的代码了。
2. 通过搜索功能找到 `GodotApp.java` 这个文件，它是 Godot 的入口类，我们在这个类中可以拿到 Godot 所在的 Activity 的根 View。
    ```java
    public class GodotApp extends Application {
      // ...other code...
      private final Runnable createWebView = () -> {
        var rootView = (FrameLayout) this.findViewById(android.R.id.content).getRootView();
        Log.d("createWebView", rootView.getClass().getName());
      };

      @Override
      public void onGodotMainLoopStarted() {
        super.onGodotMainLoopStarted();

        runOnUiThread(createWebView);
      }
      // ...other code...
    }
    ```
    由于 View 的添加和移除需要运行在主线程，所以我们需要使用 `runOnUiThread` 方法来确保在主线程执行。
3. 创建一个 WebView 实例，并设置相关参数，然后加载 URL。
    ```java
      var webview = new WebView(this);
      webview.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
      webview.getSettings().setJavaScriptEnabled(true);
          webview.getSettings().setDomStorageEnabled(true);
      webview.setWebContentsDebuggingEnabled(true);

      // 对 AIRI 来说很重要，因为我们需要透过 UI 来看 Godot 的场景
      webview.setBackgroundColor(Color.TRANSPARENT);

      webview.loadUrl("https://lemonbookpro.local:5273/");
      rootView.addView(webview);
    ```

如果它按预期运行，应该是能看到这样的效果的。

<video src="./assets/airi-pocket-android-godot-vrm-bg.mp4" autoplay loop muted></video>

按官方推荐的做法，其实我们应该写一个 Godot Android 插件的，但是柠猫这次为了快速验证这个想法，所以直接在 `GodotApp.java` 中写了。

然而，iOS 侧就没那么幸运了，只能写插件了。

## iOS 端

iOS 侧在创建好插件之后，我们并不能在里面找到 AppDelegate 相关的代码，只能在插件配置文件里定义插件入口了：

```gdip
[config]
name="GodotWebView"
binary="GodotWebView.xcframework"
initialization="init_godot_webview"
deinitialization="deinit_godot_webview"
```

这里的 `initialization` 和 `deinitialization` 是插件的初始化和销毁回调，需要在 Objective-C 中实现，所以无论如何我们也需要这么一点点桥来把 Swift 和 Objective-C 联系起来。

```objc
#import <Foundation/Foundation.h>

extern "C" void godot_webview_swift_init(void);
extern "C" void godot_webview_swift_deinit(void);

void init_godot_webview() {
    godot_webview_swift_init();
}

void deinit_godot_webview() {
    godot_webview_swift_deinit();
}
```

类似的，在 iOS 上也需要找到主窗口的根视图：

```swift
private func resolveHostWindow() -> UIWindow? {
  let activeScenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { scene in
          scene.activationState == .foregroundActive || scene.activationState == .foregroundInactive
      }

  logInfo("Resolving host window; activeSceneCount=\(activeScenes.count)")
  for scene in activeScenes {
      let windows = scene.windows
      logInfo(
          "Inspecting scene \(describe(scene: scene)); windowCount=\(windows.count); windows=\(windows.map { describe(view: $0) }.joined(separator: ", "))"
      )
      if let keyWindow = windows.first(where: \.isKeyWindow) {
          logInfo("Selected key window \(describe(view: keyWindow))")
          return keyWindow
      }

      if let firstWindow = windows.first {
          logInfo("Selected first window \(describe(view: firstWindow))")
          return firstWindow
      }
  }

  logError("No eligible foreground scene/window found")
  return nil
}
```

创建 WebView 实例的方法也是类似的：

```swift
  let webViewConfiguration = WKWebViewConfiguration()
  webViewConfiguration.allowsInlineMediaPlayback = true
  webViewConfiguration.defaultWebpagePreferences.allowsContentJavaScript = true

  let webView = WKWebView(frame: .zero, configuration: webViewConfiguration)
  webView.translatesAutoresizingMaskIntoConstraints = false
  webView.navigationDelegate = self
  webView.isOpaque = false
  webView.backgroundColor = .clear
  webView.scrollView.backgroundColor = .clear
  webView.scrollView.contentInsetAdjustmentBehavior = .never
  webView.accessibilityIdentifier = "GodotWebView"

  containerView.addSubview(webView)
  pinToEdges(webView, in: containerView)
```

AI 教了我一种用 yml 来描述项目的工具 [xcodegen](https://github.com/yonaskolb/xcodegen) 这样我们可以不在项目里存一大堆 Xcode 工程文件了，但是我还没找到什么可以像 Android 那样拿到视图树的方法。

## 没写完的东西

到目前为止，这还只是成功叠上了 WebView，我们还没有实现 Godot 和 WebView 的通信，比如点击事件、键盘输入、触摸事件等等。

还有 Live2D、VRM 模型的渲染，我已经把它们放进去了，也进行了 Profile，但是这是下一篇 DevLog 的内容了。

今天的内容就到这里，感谢看到这里。
