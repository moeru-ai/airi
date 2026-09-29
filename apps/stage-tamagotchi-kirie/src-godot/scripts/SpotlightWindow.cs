using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class SpotlightWindow : Window
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private WebViewPermissionHandler? _permissions;
    private IDisposable? _microphonePermissionRegistration;
    private IDisposable? _chatOpenRegistration;
    private IDisposable? _hideRegistration;
    private bool _ready;
    private bool _showRequested;
    private bool _nativeTransparentArmed;
    private ulong _focusArmedFrame;

    public override void _Ready()
    {
        ApplyTransparentSurface();
    }

    internal void Initialize(
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions,
        ChatWindowManager chat)
    {
        if (!IsInsideTree())
        {
            throw new InvalidOperationException(
                "The Spotlight window must be inside the scene tree before initialization.");
        }

        if (_kirie is not null)
        {
            throw new InvalidOperationException("The Spotlight window is already initialized.");
        }

        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            throw new InvalidOperationException("Kirie is unavailable for the Spotlight window.");
        }

        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, this);
        _microphonePermissionRegistration = microphonePermissions.Attach(_eventa.Context);
        _chatOpenRegistration = chat.Attach(_eventa.Context);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);
        _hideRegistration = _eventa.Context.RegisterInvokeHandler(
            AiriDesktopEvents.HideSpotlight,
            (EmptyPayload _, CancellationToken _) =>
            {
                HideWindow();
                return Task.FromResult(new EmptyPayload());
            });

        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;
        CloseRequested += OnCloseRequested;
        FocusExited += OnFocusExited;
        _kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(rendererUrl, "/spotlight"));
    }

    public void Open(int screen)
    {
        CurrentScreen = screen;
        _showRequested = true;
        if (_ready)
        {
            ShowAndFocus();
        }
    }

    public override void _ExitTree()
    {
        CloseRequested -= OnCloseRequested;
        FocusExited -= OnFocusExited;
        if (_kirie is not null)
        {
            _kirie.WebViewReady -= OnWebViewReady;
            _kirie.IpcError -= OnIpcError;
        }

        if (_eventa is not null)
        {
            _eventa.Adapter.Error -= OnEventaError;
        }

        _hideRegistration?.Dispose();
        _permissions?.Dispose();
        _chatOpenRegistration?.Dispose();
        _microphonePermissionRegistration?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
    }

    private void OnWebViewReady()
    {
        _ready = true;
        if (_showRequested)
        {
            ShowAndFocus();
        }
    }

    private void ShowAndFocus()
    {
        ApplyTransparentSurface();
        DesktopWindowSizing.MoveToSpotlightSlot(this);

        Show();
        ArmNativeTransparency();
        GrabFocus();
        _focusArmedFrame = Engine.GetProcessFrames() + 2;
        CallDeferred(MethodName.FocusWebView);
    }

    private void FocusWebView()
    {
        var cef = GetNode<Control>("KirieNode/KirieCefWebView");

        cef.FocusMode = Control.FocusModeEnum.All;
        cef.GrabFocus();
    }

    private void ApplyTransparentSurface()
    {
        // GAP-020: project transparency settings apply only to the main window.
        // Auxiliary Window nodes keep an opaque viewport unless this window
        // opts in before it is shown.
        Transparent = true;
        TransparentBg = true;
        Disable3D = true;
        RenderingServer.ViewportSetTransparentBackground(GetViewportRid(), true);
    }

    private void ArmNativeTransparency()
    {
        var windowId = GetWindowId();
        if (windowId == DisplayServer.InvalidWindowId)
        {
            return;
        }

        // Non-embedded Window nodes can keep an opaque black swapchain when
        // WINDOW_FLAG_TRANSPARENT is set only at creation. Cycling the flag
        // after Show() lets macOS pick up per-pixel alpha.
        // https://github.com/godotengine/godot/issues/71642
        if (!_nativeTransparentArmed)
        {
            DisplayServer.WindowSetFlag(DisplayServer.WindowFlags.Transparent, false, windowId);
            _nativeTransparentArmed = true;
        }

        DisplayServer.WindowSetFlag(DisplayServer.WindowFlags.Transparent, true, windowId);
        SetFlag(Flags.Transparent, true);
    }

    private void OnFocusExited()
    {
        if (!Visible || Engine.GetProcessFrames() <= _focusArmedFrame)
        {
            return;
        }

        CallDeferred(MethodName.HideIfUnfocused);
    }

    private void HideIfUnfocused()
    {
        if (!Visible || HasFocus())
        {
            return;
        }

        HideWindow();
    }

    private void OnCloseRequested()
    {
        HideWindow();
    }

    private void HideWindow()
    {
        _showRequested = false;
        Hide();
    }

    private static void OnIpcError(string error)
    {
        GD.PushError($"Spotlight Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Spotlight Kirie Eventa error: {error.Message}");
    }
}
