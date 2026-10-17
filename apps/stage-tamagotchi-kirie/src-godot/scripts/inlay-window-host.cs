using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

/// <summary>Owns the reusable native voice overlay and its follower transport.</summary>
internal sealed class InlayWindowHost : IDisposable
{
    private readonly Node _owner;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly IDisposable _openRegistration;
    private Window? _window;
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private WebViewPermissionHandler? _permissions;
    private IDisposable? _microphoneRegistration;
    private IDisposable? _homeRegistration;
    private IDisposable? _readyRegistration;
    private IDisposable? _escapeRegistration;
    private MacOsInlayEscapeObserver? _escapeObserver;
    private bool _ready;
    private bool _disposed;
    private Rect2I _workArea;
    private ulong _nextDisplayCheck;

    public InlayWindowHost(
        IEventContext context, Node owner, KirieEventaJsonRegistry registry,
        string rendererUrl, MicrophonePermissionService microphonePermissions)
    {
        _owner = owner;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
        _openRegistration = context.RegisterInvokeHandler(InlayContracts.Open,
            (EmptyPayload _, CancellationToken _) =>
            {
                Open();
                return Task.FromResult(new EmptyPayload());
            });
    }

    public void Process()
    {
        if (OperatingSystem.IsMacOS() && _escapeObserver?.TakeEscape() == true)
        {
            _eventa!.Context.Emit(InlayContracts.Escape, new EmptyPayload());
        }
        if (_window is null || Time.GetTicksMsec() < _nextDisplayCheck)
        {
            return;
        }

        _nextDisplayCheck = Time.GetTicksMsec() + 1000;
        if (_workArea != DisplayServer.ScreenGetUsableRect(DisplayServer.GetPrimaryScreen()))
        {
            ReturnHome();
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _openRegistration.Dispose();
        ReleaseWindow();
    }

    private void Open()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_window is null)
        {
            CreateWindow();
        }
        if (_ready)
        {
            Show();
        }
    }

    private void CreateWindow()
    {
        var scene = ResourceLoader.Load<PackedScene>("res://src-godot/inlay-window.tscn")
            ?? throw new InvalidOperationException("The voice inlay scene is missing.");
        _window = scene.Instantiate<Window>();
        try
        {
            _owner.AddChild(_window);
            _window.TransparentBg = true;
            _window.Disable3D = true;
            _window.CloseRequested += Hide;
            _window.TreeExiting += ReleaseWindow;
            ReturnHome();
            _kirie = KirieClient.FromNode(_window.GetNode("KirieNode"));
            _eventa = _kirie.CreateEventaContext(_registry);
            _platform = GdKiriePlatform.Attach(_eventa.Context, _window);
            _permissions = new WebViewPermissionHandler(_kirie, _rendererUrl);
            _microphoneRegistration = _microphonePermissions.Attach(_eventa.Context);
            _escapeRegistration = _eventa.Context.RegisterInvokeHandler(InlayContracts.WatchEscape,
                (InlayEscapeWatchPayload payload, CancellationToken _) => Task.FromResult(WatchEscape(payload.Enabled)));
            _homeRegistration = _eventa.Context.RegisterInvokeHandler(InlayContracts.ReturnHome,
                (EmptyPayload _, CancellationToken _) =>
                {
                    ReturnHome();
                    return Task.FromResult(new EmptyPayload());
                });
            _readyRegistration = _eventa.Context.Subscribe(InlayContracts.Ready, _ =>
            {
                _ready = true;
                Show();
            });
            _kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(_rendererUrl, "/inlay"));
        }
        catch
        {
            ReleaseWindow();
            throw;
        }
    }

    private void Show()
    {
        if (_window!.Visible)
        {
            return;
        }
        // Showing the empty overlay must keep keyboard focus in the current app.
        _window.Unfocusable = true;
        _window.Show();
        _window.Unfocusable = false;
    }

    private void Hide() => _window?.Hide();

    private void ReturnHome()
    {
        var window = _window!;
        window.CurrentScreen = DisplayServer.GetPrimaryScreen();
        _workArea = DisplayServer.ScreenGetUsableRect(window.CurrentScreen);
        float scale = DesktopWindowSizing.GetDisplayScale(window);
        var bounds = ResolveHome(_workArea, scale);
        window.Size = bounds.Size;
        window.Position = bounds.Position;
    }

    internal static Rect2I ResolveHome(Rect2I workArea, float scale)
    {
        float logicalWidth = workArea.Size.X / scale;
        float fraction = logicalWidth < 1281 ? 0.5f
            : logicalWidth < 1921 ? 0.33f
            : logicalWidth < 2561 ? 0.25f : 0.2f;
        int width = Mathf.RoundToInt(Math.Min(520, logicalWidth * fraction) * scale);
        int height = Math.Min((int)(200 * scale), workArea.Size.Y);
        int bottomGap = Math.Max((int)(56 * scale), workArea.Size.Y / 10);
        return new Rect2I(
            workArea.Position.X + (workArea.Size.X - width) / 2,
            Math.Max(workArea.Position.Y, workArea.End.Y - bottomGap - height), width, height);
    }

    private bool WatchEscape(bool enabled)
    {
        if (!OperatingSystem.IsMacOS())
        {
            return false;
        }
        if (enabled)
        {
            _escapeObserver ??= new MacOsInlayEscapeObserver();
        }
        else
        {
            _escapeObserver?.Dispose();
            _escapeObserver = null;
        }
        return true;
    }

    private void ReleaseWindow()
    {
        if (OperatingSystem.IsMacOS())
        {
            _escapeObserver?.Dispose();
            _escapeObserver = null;
        }
        _escapeRegistration?.Dispose();
        _escapeRegistration = null;
        _readyRegistration?.Dispose();
        _homeRegistration?.Dispose();
        _microphoneRegistration?.Dispose();
        _permissions?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
        _readyRegistration = null;
        _homeRegistration = null;
        _microphoneRegistration = null;
        _permissions = null;
        _platform = null;
        _eventa = null;
        _kirie = null;
        _ready = false;
        if (_window is not null)
        {
            _window.CloseRequested -= Hide;
            _window.TreeExiting -= ReleaseWindow;
            _window.QueueFree();
            _window = null;
        }
    }
}
