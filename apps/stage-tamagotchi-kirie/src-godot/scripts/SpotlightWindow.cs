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
    private Action? _onClosed;
    private bool _ready;
    private bool _userVisible;
    private bool _showRequested;
    private bool _nativeTransparentArmed;
    private int _webFocusFrames;
    private bool _webClickSent;
    private ulong _focusArmedFrame;

    public override void _Ready()
    {
        ApplyTransparentSurface();
    }

    internal void Initialize(
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions,
        ChatWindowManager chat,
        Action onClosed)
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

        _onClosed = onClosed;
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
        _onClosed?.Invoke();
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
        _userVisible = true;
        _webFocusFrames = 0;
        _webClickSent = false;
        Unfocusable = false;
        Show();
        ArmNativeTransparency();
        GrabFocus();
        _focusArmedFrame = Engine.GetProcessFrames() + 2;
        CallDeferred(MethodName.FocusWebView);
    }

    private void FocusWebView()
    {
        var cef = FindCefControl();
        if (cef is null)
        {
            RetryFocusWebView();
            return;
        }

        // CefTexture FOCUS_ENTER is what calls CEF host.set_focus(true).
        // GrabFocus on KirieNode never reaches that notification.
        cef.FocusMode = Control.FocusModeEnum.All;
        cef.GrabFocus();
        if (!_webClickSent)
        {
            ForwardMouseClick(cef);
            _webClickSent = true;
        }

        if (cef.HasMethod("eval"))
        {
            cef.Call(
                "eval",
                "window.focus();document.querySelector('input')?.focus()");
        }

        RetryFocusWebView();
    }

    private void RetryFocusWebView()
    {
        if (_webFocusFrames >= 2)
        {
            return;
        }

        _webFocusFrames++;
        CallDeferred(MethodName.FocusWebView);
    }

    private void ForwardMouseClick(Control cef)
    {
        var local = cef.Size / 2.0f;
        var global = cef.GlobalPosition + local;
        PushInput(CreateMouseButton(local, global, true), true);
        PushInput(CreateMouseButton(local, global, false), true);
    }

    private InputEventMouseButton CreateMouseButton(
        Vector2 local,
        Vector2 global,
        bool pressed)
    {
        return new InputEventMouseButton
        {
            ButtonIndex = MouseButton.Left,
            ButtonMask = pressed ? MouseButtonMask.Left : 0,
            Pressed = pressed,
            Position = local,
            GlobalPosition = global,
            WindowId = GetWindowId(),
        };
    }

    private Control? FindCefControl()
    {
        if (GetNodeOrNull<Control>("KirieNode/KirieCefWebView") is { } named)
        {
            return named;
        }

        var kirie = GetNodeOrNull<Control>("KirieNode");
        if (kirie is null)
        {
            return null;
        }

        foreach (var child in kirie.GetChildren())
        {
            if (child is Control control)
            {
                return control;
            }
        }

        return kirie;
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

        DisplayServer.WindowSetFlag(DisplayServer.WindowFlags.Borderless, true, windowId);
        DisplayServer.WindowSetFlag(DisplayServer.WindowFlags.AlwaysOnTop, true, windowId);
        DisplayServer.WindowSetFlag(DisplayServer.WindowFlags.ResizeDisabled, true, windowId);

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
        if (!_userVisible || Engine.GetProcessFrames() <= _focusArmedFrame)
        {
            return;
        }

        CallDeferred(MethodName.HideIfUnfocused);
    }

    private void HideIfUnfocused()
    {
        if (!_userVisible || HasFocus())
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
        _userVisible = false;
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
