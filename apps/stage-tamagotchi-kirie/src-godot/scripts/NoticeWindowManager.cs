using Eventa;
using GdKirie.EventaAdapter;
using Godot;

internal sealed class NoticeWindowManager : IDisposable
{
    private const string FadeOnHoverRoute = "/notice/fade-on-hover";
    private const string FadeOnHoverType = "fade-on-hover";
    private const string WindowScenePath = "res://src-godot/notice-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly IDisposable _openRegistration;
    private NoticeWindow? _window;
    private bool _disposed;

    public NoticeWindowManager(
        IEventContext context,
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _openRegistration = context.RegisterInvokeHandler(
            AiriDesktopEvents.OpenNotice,
            (NoticeOpenPayload payload, CancellationToken cancellationToken) =>
                Open(payload, cancellationToken));
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _openRegistration.Dispose();
        _window?.CloseWithoutAction();
    }

    private Task<bool> Open(NoticeOpenPayload payload, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        Validate(payload);

        var id = string.IsNullOrEmpty(payload.Id)
            ? Guid.NewGuid().ToString("N")[..8]
            : payload.Id;
        if (_window is not null
            && GodotObject.IsInstanceValid(_window)
            && !_window.IsQueuedForDeletion())
        {
            return _window.Open(_mainWindow.CurrentScreen, id, payload, cancellationToken);
        }

        var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
            ?? throw new InvalidOperationException($"The notice window scene is missing: {WindowScenePath}");
        var window = scene.Instantiate<NoticeWindow>();
        _window = window;
        try
        {
            _owner.AddChild(window);
            window.CurrentScreen = _mainWindow.CurrentScreen;
            DesktopWindowSizing.ApplyInitialDisplayScale(window);
            window.Initialize(_registry, _rendererUrl, () => OnWindowClosed(window));
            return window.Open(_mainWindow.CurrentScreen, id, payload, cancellationToken);
        }
        catch
        {
            window.QueueFree();
            _window = null;
            throw;
        }
    }

    private static void Validate(NoticeOpenPayload payload)
    {
        if (!StringComparer.Ordinal.Equals(payload.Route, FadeOnHoverRoute)
            || !StringComparer.Ordinal.Equals(payload.Type, FadeOnHoverType)
            || payload.Payload is not null)
        {
            throw new ArgumentException(
                "The AIRI Kirie host currently supports only the fade-on-hover notice without a payload.",
                nameof(payload));
        }
    }

    private void OnWindowClosed(NoticeWindow window)
    {
        if (_window == window)
        {
            _window = null;
        }
    }
}
