using Eventa;
using GdKirie.EventaAdapter;
using Godot;

internal sealed class SettingsWindowManager : IDisposable
{
    private const string DefaultRoute = "/settings";
    private const string WindowScenePath = "res://src-godot/settings-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly AuthService _auth;
    private readonly IDisposable _openRegistration;
    private SettingsWindow? _window;
    private bool _disposed;

    public SettingsWindowManager(
        IEventContext context,
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        AuthService auth)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _auth = auth;
        _openRegistration = context.RegisterInvokeHandler(
            AiriDesktopEvents.OpenSettings,
            (OpenSettingsPayload payload, CancellationToken _) =>
            {
                Open(payload.Route);
                return Task.FromResult(new EmptyPayload());
            });
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _openRegistration.Dispose();
    }

    private void Open(string? requestedRoute)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var route = ResolveRoute(requestedRoute);
        if (_window is null
            || !GodotObject.IsInstanceValid(_window)
            || _window.IsQueuedForDeletion())
        {
            var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
                ?? throw new InvalidOperationException($"The settings window scene is missing: {WindowScenePath}");
            var window = scene.Instantiate<SettingsWindow>();
            _window = window;
            try
            {
                _owner.AddChild(window);
                window.CurrentScreen = _mainWindow.CurrentScreen;
                DesktopWindowSizing.ApplyInitialDisplayScale(window);
                window.Initialize(_registry, _rendererUrl, route, _auth, () => OnWindowClosed(window));
            }
            catch
            {
                window.QueueFree();
                _window = null;
                throw;
            }
        }

        _window.Open(_mainWindow.CurrentScreen, route);
    }

    private static string ResolveRoute(string? route)
    {
        if (string.IsNullOrEmpty(route))
        {
            return DefaultRoute;
        }

        if (!StringComparer.Ordinal.Equals(route, DefaultRoute)
            && !route.StartsWith($"{DefaultRoute}/", StringComparison.Ordinal))
        {
            throw new ArgumentException("The settings window route must start with /settings.", nameof(route));
        }

        return route;
    }

    private void OnWindowClosed(SettingsWindow window)
    {
        if (_window == window)
        {
            _window = null;
        }
    }
}
