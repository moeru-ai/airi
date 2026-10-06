# Android host JVM fixtures

These fixtures compile unchanged methods extracted from the production Java source in `addons/airi-android/export-plugin.gd`.
Only Android activity, URI, native reply transport, and WebSocket callback boundaries use fixture objects.
The JSON implementation is Pocket's existing `org.json:json:20240303` test dependency.
No Android device, Gradle watcher, Vite build, or Godot build is required.

Set `JAVA_HOME` to a JDK and set `JSON_JAR` to the cached Pocket JSON test JAR.

```sh
python3 run-fixtures.py authentication --json-jar "$JSON_JAR"
```

Authentication expectations come from Pocket's `WebAuthenticationPlugin.kt`.
Missing handlers reject with `BROWSER_UNAVAILABLE`. Other `RuntimeException` failures use the same rejection.
A healthy browser still opens once and resolves once.
The browser-channel Vitest fixture also exercises the actual Eventa rejection path and restores an Error with Pocket's code and message.
Existing string errors from notification scheduling retain their envelope shape.

The generated Java files exist only in a temporary directory.
The `.gdignore` marker excludes these fixture sources from Godot assets.

```sh
python3 run-fixtures.py websocket --json-jar "$JSON_JAR"
```

WebSocket expectations come from Pocket's `OkHttpHostWebSocketSessionFactory.kt` and `HostWebSocketBridge.kt`.
The fixture executes Kirie's unchanged `onFailure`, `createEvent`, and `addEventValue` methods.
A null Throwable message gives the error event its fallback text and omits the close reason.
Empty messages remain empty. An available HTTP response supplies the close code.
All cases retain error-before-close ordering and remove the opened session.

## Native dialog theme

From the repository root, run the fixture with Godot 4.7.2:

```sh
python3 apps/stage-tamagotchi-kirie/tests/android-host-parity/run-theme-fixture.py --godot /path/to/godot
```

The fixture runs the unchanged production `configure_launch_resources` and `write_build_file` methods in a temporary Godot project.
It reads tracked sources and `fixtures/godot-themes.xml`. It never reads the application's ignored Android build directory.
No Android export, Gradle build, or emulator is required.

The XML fixture contains the complete generated item set for the current Android export preset.
Its three default main items and four splash items follow Godot 4.7.2's [`_fix_themes_xml`](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/android/export/export_plugin.cpp#L1019).
The test compares all custom main items against the tracked `export_presets.cfg`.
If the preset or Godot's generated defaults change, update the fixture.

Both cases run the production rewrite twice. The second case adds another generated item.
Reversing only the target parent must restore every input byte, including an unrelated theme with the same original parent.
The test also checks every `AiriAppMainTheme` and `AiriAppSplashTheme` item.
