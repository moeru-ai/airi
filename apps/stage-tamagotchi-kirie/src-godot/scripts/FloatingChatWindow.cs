using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

/// <summary>
/// The transparent window of the floating chat mode. It owns the renderer transport.
/// <see cref="FloatingChatHost"/> owns the fold, the placement, and the chat handlers.
/// </summary>
public partial class FloatingChatWindow : Window
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private WebViewPermissionHandler? _permissions;
    private IDisposable? _microphonePermissionRegistration;
    private IDisposable? _readyRegistration;
    private IDisposable? _chatRegistration;
    private bool _nativeTransparentArmed;

    /// <summary>The renderer mounted its page. The window shows only after this.</summary>
    internal event Action? RendererReady;

    internal IEventContext Context =>
        _eventa?.Context
        ?? throw new InvalidOperationException("The floating chat window is not initialized.");

    public override void _Ready()
    {
        ApplyTransparentSurface();
    }

    internal void Initialize(
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions,
        Func<IEventContext, IDisposable> attachChat)
    {
        if (!IsInsideTree())
        {
            throw new InvalidOperationException(
                "The floating chat window must be inside the scene tree before initialization.");
        }

        if (_kirie is not null)
        {
            throw new InvalidOperationException("The floating chat window is already initialized.");
        }

        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            throw new InvalidOperationException(
                "Kirie is unavailable for the floating chat window.");
        }

        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, this);
        _microphonePermissionRegistration = microphonePermissions.Attach(_eventa.Context);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl, microphonePermissions);
        _chatRegistration = attachChat(_eventa.Context);
        _readyRegistration = _eventa.Context.Subscribe(
            AiriDesktopEvents.ChatReady,
            _ => RendererReady?.Invoke());

        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;
        _kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(rendererUrl, "/chat-floating"));
    }

    /// <summary>
    /// Shows the window. <paramref name="focus"/> also gives the keyboard to the chat.
    /// </summary>
    internal void ShowChat(bool focus)
    {
        ApplyTransparentSurface();
        Show();
        ArmNativeTransparency();
        if (focus)
        {
            GrabFocus();
            CallDeferred(MethodName.FocusWebView);
        }
    }

    public override void _ExitTree()
    {
        if (_kirie is not null)
        {
            _kirie.IpcError -= OnIpcError;
        }

        if (_eventa is not null)
        {
            _eventa.Adapter.Error -= OnEventaError;
        }

        _readyRegistration?.Dispose();
        _chatRegistration?.Dispose();
        _permissions?.Dispose();
        _microphonePermissionRegistration?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
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

        // NOTICE:
        // A non-embedded Window node can keep an opaque black swapchain when
        // WINDOW_FLAG_TRANSPARENT is set only at creation. Cycling the flag
        // after Show() lets macOS pick up per-pixel alpha. SpotlightWindow
        // does the same.
        // Source: https://github.com/godotengine/godot/issues/71642
        // Removal: when Godot applies the flag of a window created transparent.
        if (!_nativeTransparentArmed)
        {
            DisplayServer.WindowSetFlag(DisplayServer.WindowFlags.Transparent, false, windowId);
            _nativeTransparentArmed = true;
        }

        DisplayServer.WindowSetFlag(DisplayServer.WindowFlags.Transparent, true, windowId);
        SetFlag(Flags.Transparent, true);
    }

    private static void OnIpcError(string error)
    {
        GD.PushError($"Floating chat Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Floating chat Kirie Eventa error: {error.Message}");
    }
}
