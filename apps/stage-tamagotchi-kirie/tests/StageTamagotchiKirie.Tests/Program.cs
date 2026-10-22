using System.Net;
using System.Text.Json;
using Godot;
using HttpClient = System.Net.Http.HttpClient;

internal static class Program
{
    private static async Task<int> Main()
    {
        try
        {
            TestsWidgetWirePayloads();
            TestsDesktopWindowGeometry();
            TestsTrayWindowGeometry();
            TestsSpotlightShortcutPolicy();
            TestsNativeResizeEdges();
            TestsOnboardingTitleBarDragRegion();
            TestsRendererUrlFollowerRuntime();
            TestsCefInspectorTargetSelection();
            TestsCefInspectorRequiresLeader();
            TestsMicrophonePermissionPromptCoalescing();
            TestsMicrophonePermissionPersistencePolicy();
            TestsMicrophonePermissionPromptTimeout();
            TestsMicrophonePermissionShutdown();
            await ReturnsCodeForExpectedState();
            await RejectsForgedStateWithoutConsumingServer();
            await SendsRelayCorsWithoutPrivateNetworkHeader();
            Console.WriteLine("StageTamagotchiKirie.Tests passed.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }

    private static void TestsWidgetWirePayloads()
    {
        const string json = """
            {"id":"weather-test","componentName":"weather","componentProps":{"city":"Tokyo"},
            "alwaysOnTop":true,"size":"m","windowSize":{"width":620,"height":760},"ttlMs":1000}
            """;
        WidgetMutationPayload payload = JsonSerializer.Deserialize(
            json, WidgetJsonContext.Default.WidgetMutationPayload)!;
        AssertEqual("Tokyo", payload.ComponentProps!["city"].GetString(), "widget props from renderer");
        AssertEqual(1000d, payload.TtlMs, "widget expiry in milliseconds");
        AssertEqual(620, payload.WindowSize!.Width, "widget logical width");

        WidgetMutationPayload partial = JsonSerializer.Deserialize(
            "{\"id\":\"weather-test\",\"alwaysOnTop\":false}",
            WidgetJsonContext.Default.WidgetMutationPayload)!;
        AssertEqual<double?>(null, partial.TtlMs, "omitted update keeps its expiry");
        AssertEqual(false, partial.AlwaysOnTop, "explicit unpin survives deserialization");

        var snapshot = new WidgetSnapshotPayload(
            payload.Id!, payload.ComponentName!, payload.ComponentProps!, true,
            payload.Size!.Value, payload.WindowSize, payload.TtlMs!.Value);
        using JsonDocument serialized = JsonDocument.Parse(JsonSerializer.Serialize(
            snapshot, WidgetJsonContext.Default.WidgetSnapshotPayload));
        AssertEqual("weather-test", serialized.RootElement.GetProperty("id").GetString(), "snapshot id");
        AssertEqual("m", serialized.RootElement.GetProperty("size").GetString(), "snapshot grid size");
        AssertEqual("Tokyo", serialized.RootElement.GetProperty("componentProps").GetProperty("city").GetString(), "snapshot props");
    }

    private static void TestsMicrophonePermissionPromptCoalescing()
    {
        // ROOT CAUSE:
        //
        // CEF can issue concurrent requests while one AIRI permission prompt is open.
        // Showing one modal per raw request creates conflicting decisions and exposes
        // native request identifiers to the renderer.
        //
        // We fixed this by keeping native requests in one host-owned prompt generation.
        using var permissions = new MicrophonePermissionCoordinator(
            MicrophonePermissionState.NotDetermined,
            TimeSpan.FromMinutes(2));
        var decisions = new List<bool>();

        var prompt = permissions.Request(decisions.Add, 10);
        var duplicatePrompt = permissions.Request(decisions.Add, 20);

        AssertEqual(true, prompt is not null, "first microphone permission prompt");
        AssertEqual<MicrophonePermissionPromptPayload?>(
            null,
            duplicatePrompt,
            "coalesced microphone permission prompt");
        permissions.Resolve(prompt!.PromptId, MicrophonePermissionState.Granted);
        AssertEqual("True,True", string.Join(',', decisions), "coalesced permission decisions");
    }

    private static void TestsMicrophonePermissionPersistencePolicy()
    {
        using var permissions = new MicrophonePermissionCoordinator(
            MicrophonePermissionState.Denied,
            TimeSpan.FromMinutes(2));
        bool? decision = null;

        var prompt = permissions.Request(value => decision = value, 10);

        AssertEqual<MicrophonePermissionPromptPayload?>(
            null,
            prompt,
            "persisted denial prompt");
        AssertEqual(false, decision, "persisted denial decision");

        permissions.Reset();
        prompt = permissions.Request(value => decision = value, 20);
        AssertEqual(true, prompt is not null, "prompt after permission reset");
    }

    private static void TestsMicrophonePermissionPromptTimeout()
    {
        using var permissions = new MicrophonePermissionCoordinator(
            MicrophonePermissionState.NotDetermined,
            TimeSpan.FromMilliseconds(100));
        bool? decision = null;
        var prompt = permissions.Request(value => decision = value, 10);

        AssertEqual<string?>(null, permissions.Expire(109), "permission prompt before timeout");
        AssertEqual(prompt!.PromptId, permissions.Expire(110), "expired permission prompt");
        AssertEqual(false, decision, "expired permission decision");
        AssertEqual(
            MicrophonePermissionState.NotDetermined,
            permissions.State,
            "permission state after timeout");
    }

    private static void TestsMicrophonePermissionShutdown()
    {
        var permissions = new MicrophonePermissionCoordinator(
            MicrophonePermissionState.NotDetermined,
            TimeSpan.FromMinutes(2));
        bool? decision = null;
        permissions.Request(value => decision = value, 10);

        permissions.Dispose();

        AssertEqual(false, decision, "permission decision during shutdown");
    }

    private static void TestsDesktopWindowGeometry()
    {
        // ROOT CAUSE:
        //
        // Godot's ScreenGetScale returns 1 on Windows even when the desktop uses
        // high-DPI scaling, and MoveToCenter includes reserved system UI areas.
        //
        // We fixed this by deriving the Windows scale from native DPI and centering
        // the decorated frame inside ScreenGetUsableRect.
        AssertEqual(
            1.5f,
            DesktopWindowSizing.ResolveDisplayScale("Windows", 1.0f, 144),
            "Windows display scale");
        AssertEqual(
            1.25f,
            DesktopWindowSizing.ResolveDisplayScale("Wayland", 1.25f, 0),
            "Wayland display scale");
        AssertEqual(
            new Vector2I(405, 215),
            DesktopWindowSizing.ResolveUsableCenter(
                new Rect2I(0, 25, 1200, 800),
                new Vector2I(400, 400),
                new Vector2I(5, -10)),
            "usable-area decorated center");
        AssertEqual(
            new Vector2I(240, 201),
            DesktopWindowSizing.ResolveSpotlightPosition(
                new Rect2I(0, 25, 1200, 800),
                new Vector2I(720, 100)),
            "spotlight slot");
    }

    private static void TestsTrayWindowGeometry()
    {
        var workArea = new Rect2I(0, 25, 1200, 800);
        AssertEqual(
            new Vector2I(900, 1200),
            TrayWindowGeometry.ResolvePresetSize(TrayWindowSizePreset.Recommended, workArea, 2.0f),
            "recommended size uses physical pixels");
        AssertEqual(
            new Vector2I(600, 800),
            TrayWindowGeometry.ResolvePresetSize(TrayWindowSizePreset.FullHeight, workArea, 2.0f),
            "full height keeps the recommended aspect ratio");
        AssertEqual(
            new Vector2I(300, 400),
            TrayWindowGeometry.ResolvePresetSize(TrayWindowSizePreset.HalfHeight, workArea, 2.0f),
            "half height keeps the recommended aspect ratio");
        AssertEqual(
            new Rect2I(800, 425, 300, 400),
            TrayWindowGeometry.ResolveAnchoredBounds(
                new Rect2I(500, 225, 600, 600),
                new Vector2I(300, 400),
                workArea),
            "resize keeps the bottom-right edges in the bottom-right quadrant");
        AssertEqual(
            new Rect2I(0, 25, 450, 800),
            TrayWindowGeometry.ResolveAnchoredBounds(
                new Rect2I(-50, 0, 400, 400),
                new Vector2I(450, 1000),
                workArea),
            "resize stays inside the work area");
        AssertEqual(
            new Vector2I(750, 25),
            TrayWindowGeometry.ResolveAlignedPosition(
                TrayWindowAlignment.TopRight,
                workArea,
                new Vector2I(450, 600)),
            "top-right alignment");
        AssertEqual(
            new Vector2I(375, 125),
            TrayWindowGeometry.ResolveAlignedPosition(
                TrayWindowAlignment.Center,
                workArea,
                new Vector2I(450, 600)),
            "center alignment");
        AssertEqual(
            true,
            TrayWindowGeometry.IsPositionMatch(new Vector2I(754, 21), new Vector2I(750, 25)),
            "position match tolerance");
        AssertEqual(
            false,
            TrayWindowGeometry.IsSizeMatch(new Vector2I(453, 600), new Vector2I(450, 600)),
            "size match tolerance");
    }

    private static void TestsSpotlightShortcutPolicy()
    {
        AssertEqual(
            true,
            SpotlightHost.IsSafe(SpotlightHost.Default),
            "default Spotlight shortcut");
        AssertEqual(
            false,
            SpotlightHost.IsSafe(new SpotlightAcceleratorPayload("KeyA", ["shift"])),
            "shift-only Spotlight shortcut");
        AssertEqual(
            true,
            SpotlightHost.IsSafe(new SpotlightAcceleratorPayload("KeyK", ["cmd"])),
            "cmd Spotlight shortcut");
        AssertEqual(
            false,
            SpotlightHost.IsSafe(new SpotlightAcceleratorPayload("", ["ctrl"])),
            "empty-key Spotlight shortcut");
        AssertEqual(
            "KeyA",
            SpotlightHost.TryCreate("KeyA", "ctrl, shift")!.Key,
            "Spotlight modifier parse");
        AssertEqual<SpotlightAcceleratorPayload?>(
            null,
            SpotlightHost.TryCreate("KeyA", "shift"),
            "unsafe persisted Spotlight shortcut");
    }

    private static void TestsOnboardingTitleBarDragRegion()
    {
        var windowSize = new Vector2I(1000, 650);
        var safeTitleMargins = new Vector3I(80, 12, 32);

        // ROOT CAUSE:
        //
        // Godot CEF does not process Electron CSS drag regions. The renderer then
        // started window movement from a DOM mouse event instead of native input.
        //
        // We fixed this by using the safe native title region from Godot WindowInput.
        AssertEqual(
            true,
            OnboardingWindow.IsInSafeTitleRegion(
                new Vector2(80, 0),
                windowSize,
                safeTitleMargins),
            "onboarding safe title region");
        AssertEqual(
            false,
            OnboardingWindow.IsInSafeTitleRegion(
                new Vector2(79, 16),
                windowSize,
                safeTitleMargins),
            "onboarding traffic-light region");
        AssertEqual(
            false,
            OnboardingWindow.IsInSafeTitleRegion(
                new Vector2(988, 16),
                windowSize,
                safeTitleMargins),
            "onboarding right title margin");
        AssertEqual(
            false,
            OnboardingWindow.IsInSafeTitleRegion(
                new Vector2(500, 32),
                windowSize,
                safeTitleMargins),
            "onboarding content region");
    }

    private static void TestsNativeResizeEdges()
    {
        var size = new Vector2I(450, 600);

        // ROOT CAUSE:
        //
        // The Kirie renderer used DOM elements to detect window resize edges. That kept
        // fixed native-window geometry in CEF and made Godot depend on Web mouse events.
        //
        // We fixed this by resolving each edge from Godot WindowInput coordinates.
        AssertEqual(
            DisplayServer.WindowResizeEdge.TopLeft,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(8, 8), size, 5, 10),
            "top-left resize edge");
        AssertEqual(
            DisplayServer.WindowResizeEdge.TopRight,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(442, 8), size, 5, 10),
            "top-right resize edge");
        AssertEqual(
            DisplayServer.WindowResizeEdge.BottomLeft,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(8, 592), size, 5, 10),
            "bottom-left resize edge");
        AssertEqual(
            DisplayServer.WindowResizeEdge.BottomRight,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(442, 592), size, 5, 10),
            "bottom-right resize edge");
        AssertEqual(
            DisplayServer.WindowResizeEdge.Top,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(225, 2), size, 5, 10),
            "top resize edge");
        AssertEqual(
            DisplayServer.WindowResizeEdge.Right,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(448, 300), size, 5, 10),
            "right resize edge");
        AssertEqual(
            DisplayServer.WindowResizeEdge.Bottom,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(225, 598), size, 5, 10),
            "bottom resize edge");
        AssertEqual(
            DisplayServer.WindowResizeEdge.Left,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(2, 300), size, 5, 10),
            "left resize edge");
        AssertEqual<DisplayServer.WindowResizeEdge?>(
            null,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(225, 300), size, 5, 10),
            "window interior");
    }

    private static void TestsRendererUrlFollowerRuntime()
    {
        // ROOT CAUSE:
        //
        // Chat already used the minimal follower runtime. Notice still booted the
        // full Stage runtime, so a second CEF WebView started orchestrator work
        // and competed with software OSR compositing of the main Live2D stage.
        //
        // We fixed this by keeping Settings and developer windows on the full
        // follower runtime, and by giving Notice the same minimal runtime as Chat.
        const string baseUrl = "http://127.0.0.1:5173/";

        AssertEqual(
            "http://127.0.0.1:5173/?synced-leader=false#/settings",
            RendererUrl.ForFollowerRoute(baseUrl, "/settings"),
            "settings full follower URL");
        AssertEqual(
            "http://127.0.0.1:5173/?stage-runtime=minimal&synced-leader=false#/chat",
            RendererUrl.ForMinimalFollowerRoute(baseUrl, "/chat"),
            "chat minimal follower URL");
        AssertEqual(
            "http://127.0.0.1:5173/?stage-runtime=minimal&synced-leader=false#/spotlight",
            RendererUrl.ForMinimalFollowerRoute(baseUrl, "/spotlight"),
            "spotlight minimal follower URL");
        AssertEqual(
            "http://127.0.0.1:5173/?stage-runtime=minimal&synced-leader=false#/notice?id=one",
            RendererUrl.ForMinimalFollowerRoute(baseUrl, "/notice?id=one"),
            "notice minimal follower URL");
    }

    private static void TestsCefInspectorTargetSelection()
    {
        // ROOT CAUSE:
        //
        // The CEF debugging server returns an empty response at its root URL.
        // Opening that URL produced a blank system-browser page instead of DevTools.
        //
        // We fixed this by selecting the main page's frontend URL from /json/list.
        const string targetsJson = """
            [
              {
                "type": "page",
                "url": "http://127.0.0.1:5173/?synced-leader=false#/settings",
                "devtoolsFrontendUrl": "https://devtools.example/inspector.html?ws=follower"
              },
              {
                "type": "worker",
                "url": "http://127.0.0.1:5173/?synced-leader=true#/",
                "devtoolsFrontendUrl": "https://devtools.example/inspector.html?ws=worker"
              },
              {
                "type": "page",
                "url": "http://127.0.0.1:5173/?synced-leader=true#/",
                "devtoolsFrontendUrl": "https://devtools.example/inspector.html?ws=leader"
              }
            ]
            """;

        var inspectorUri = CefInspectorTarget.SelectMainInspectorUri(targetsJson);

        AssertEqual(
            "https://devtools.example/inspector.html?ws=leader",
            inspectorUri.AbsoluteUri,
            "main CEF inspector URL");
    }

    private static void TestsCefInspectorRequiresLeader()
    {
        const string targetsJson = """
            [
              {
                "type": "page",
                "url": "http://127.0.0.1:5173/?synced-leader=false#/settings",
                "devtoolsFrontendUrl": "https://devtools.example/inspector.html?ws=follower"
              }
            ]
            """;

        try
        {
            CefInspectorTarget.SelectMainInspectorUri(targetsJson);
        }
        catch (InvalidDataException)
        {
            return;
        }

        throw new InvalidOperationException("Expected inspector selection to reject a follower-only target list.");
    }

    private static async Task ReturnsCodeForExpectedState()
    {
        using var server = LoopbackAuthServer.Start("state-1");
        using var http = new HttpClient();
        using var response = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=ok&state=state-1");

        AssertEqual(HttpStatusCode.OK, response.StatusCode, "valid callback status");
        AssertEqual("ok", await server.Result, "authorization code");
    }

    private static async Task RejectsForgedStateWithoutConsumingServer()
    {
        using var server = LoopbackAuthServer.Start("expected-state");
        using var http = new HttpClient();
        using var forged = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=forged&state=wrong-state");

        AssertEqual(HttpStatusCode.BadRequest, forged.StatusCode, "forged callback status");
        AssertEqual(false, server.Result.IsCompleted, "server state after forged callback");

        using var valid = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=valid&state=expected-state");
        AssertEqual(HttpStatusCode.OK, valid.StatusCode, "valid callback status after forgery");
        AssertEqual("valid", await server.Result, "authorization code after forgery");
    }

    private static async Task SendsRelayCorsWithoutPrivateNetworkHeader()
    {
        using var server = LoopbackAuthServer.Start("state-1");
        using var http = new HttpClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"http://127.0.0.1:{server.Port}/callback?code=ok&state=state-1");
        request.Headers.Add("Origin", "https://api.airi.build");
        using var response = await http.SendAsync(request);

        AssertEqual(HttpStatusCode.OK, response.StatusCode, "relay callback status");
        AssertEqual(
            "*",
            response.Headers.GetValues("Access-Control-Allow-Origin").Single(),
            "relay CORS origin");
        AssertEqual(
            false,
            response.Headers.Contains("Access-Control-Allow-Private-Network"),
            "private-network response header");
        AssertEqual("ok", await server.Result, "relay authorization code");
    }

    private static void AssertEqual<T>(T expected, T actual, string label)
    {
        if (EqualityComparer<T>.Default.Equals(expected, actual))
        {
            return;
        }

        throw new InvalidOperationException(
            $"Expected {label} to be '{expected}', got '{actual}'.");
    }

}
