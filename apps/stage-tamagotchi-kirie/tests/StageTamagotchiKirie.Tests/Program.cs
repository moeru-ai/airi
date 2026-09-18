using System.Net;
using Godot;
using HttpClient = System.Net.Http.HttpClient;

internal static class Program
{
    private static async Task<int> Main()
    {
        try
        {
            TestsDesktopWindowGeometry();
            TestsNativeResizeEdges();
            TestsOnboardingTitleBarDragRegion();
            TestsDeveloperWindowRequests();
            TestsCefInspectorTargetSelection();
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

    private static void TestsDeveloperWindowRequests()
    {
        // ROOT CAUSE:
        //
        // The Kirie host did not register the Electron developer-window contracts.
        // Each developer action reached Godot as an unregistered Eventa request.
        //
        // We fixed this with one validated request model for reusable native windows.
        var editor = DeveloperWindowRequest.ForEditor();
        AssertEqual("/editor", editor.Route, "editor route");
        AssertEqual(true, editor.UsesMinimalRuntime, "editor runtime");

        var devtools = DeveloperWindowRequest.ForDevtools(
            new OpenDevtoolsWindowPayload(
                "io-tracer",
                "/devtools/io-tracer",
                1600,
                900,
                null,
                null));
        AssertEqual("io-tracer", devtools.Key, "developer window key");
        AssertEqual(1600, devtools.Width, "developer window width");
        AssertEqual(900, devtools.Height, "developer window height");
        AssertEqual(false, devtools.UsesMinimalRuntime, "developer window runtime");

        AssertThrows<ArgumentException>(
            () => DeveloperWindowRequest.ForDevtools(
                new OpenDevtoolsWindowPayload(
                    "settings",
                    "/settings",
                    null,
                    null,
                    null,
                    null)),
            "developer window route validation");
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
                "url": "",
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

    private static void AssertThrows<TException>(Action action, string label)
        where TException : Exception
    {
        try
        {
            action();
        }
        catch (TException)
        {
            return;
        }

        throw new InvalidOperationException($"Expected {label} to throw {typeof(TException).Name}.");
    }
}
