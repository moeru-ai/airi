---
title: DevLog @ 2026.03.29
category: DevLog
date: 2026-03-29
excerpt: |
  How should we embed a WebView in Godot? About AIRI switching to the Godot engine for scene rendering while still using web technologies for UI and logic.
preview-cover:
  light: "/blog/DevLog-2026.03.29/assets/cover-light.avif"
  dark: "/blog/DevLog-2026.03.29/assets/cover-dark.avif"
---


Welcome back. This is [@LemonNekoGH](https://github.com/LemonNekoGH), one of the maintainers of AIRI. It has been a month since LemonNeko's previous DevLog; during this time I have done a bit more work, and today I want to share it with you.


Two months ago, we introduced Capacitor to build native mobile applications based on WebView, in order to take advantage of some mobile-specific features, such as background task residency, alarms, calendar, pedometer, and so on.


But we found that Live2D and VRM do not perform very well on WebGL, and the memory usage is quite high — loading a single VRM model takes more than 700 MB of memory. This causes direct crashes on some devices, and the experience is simply too bad.


So we started looking for alternatives that can render complex 3D scenes. The part LemonNeko was responsible for was researching the Godot engine. However, Godot's UI development experience is too poor to achieve the complexity of current web pages, and almost all UI would need to be rewritten. So I am experimenting with overlaying a WebView on top of the Godot view, so we can continue using our existing UI framework.


But how exactly do we do it?


## Android Side


I searched around and found no suitable library, so based on my meager Android development knowledge, I got the root View of the Activity hosting Godot and directly overlaid a native WebView on top of the root View.


Fortunately, I obtained the XML structure of the root View of the Activity hosting Godot via the `adb shell uiautomator dump` command, and learned that the root View is a FrameLayout, so there is not much complex layout code to write.


1. First, enable Android Gradle export in the Godot project, so Godot creates a Gradle project for us, where we can customize the Android part of the code.
2. Use the search feature to find the file `GodotApp.java`, which is Godot's entry class. In this class, we can get the root View of the Activity hosting Godot.

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


    Since adding and removing Views must run on the main thread, we need to use the `runOnUiThread` method to ensure execution on the main thread.


3. Create a WebView instance, set the relevant parameters, and load the URL.

    ```java

      var webview = new WebView(this);

      webview.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

      webview.getSettings().setJavaScriptEnabled(true);

          webview.getSettings().setDomStorageEnabled(true);

      webview.setWebContentsDebuggingEnabled(true);

      // Very important for AIRI, because we need to see the Godot scene through the UI

      webview.setBackgroundColor(Color.TRANSPARENT);

      webview.loadUrl("https://lemonbookpro.local:5273/");

      rootView.addView(webview);

    ```


If it runs as expected, you should see an effect like this.


<video src="/blog/DevLog-2026.03.29/assets/airi-pocket-android-godot-vrm-bg.mp4" autoplay loop muted></video>


According to the officially recommended approach, we should actually write a Godot Android plugin, but this time LemonNeko wrote it directly in `GodotApp.java` to quickly validate the idea.


However, on the iOS side, we were not so lucky — we had to write a plugin.


## iOS Side


After creating the plugin on the iOS side, we could not find the AppDelegate-related code inside it; we could only define the plugin entry point in the plugin configuration file:

```gdip

[config]

name="GodotWebView"

binary="GodotWebView.xcframework"

initialization="init_godot_webview"

deinitialization="deinit_godot_webview"

```


Here, `initialization` and `deinitialization` are the plugin's initialization and destruction callbacks, which need to be implemented in Objective-C. So in any case, we need this small bridge to connect Swift and Objective-C.

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
Similarly, on iOS we also need to find the root view of the main window:
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
The way to create the WebView instance is similar:
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
AI taught me a tool for describing projects with yml, [xcodegen](https://github.com/yonaskolb/xcodegen), so we do not have to store a bunch of Xcode project files in the repository. But I have not yet found a way to get the view tree like on Android.
## Unfinished Things
So far, this is only successfully overlaying a WebView; we have not yet implemented communication between Godot and the WebView, such as click events, keyboard input, touch events, and so on.
There is also the rendering of Live2D and VRM models. I have already put them in and profiled them, but that is the content of the next DevLog.
That's it for today. Thank you for reading this far.
