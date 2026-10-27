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
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly WidgetWindowManager _widgets;
    private readonly DeveloperToolsService _developerTools;
    private readonly SpotlightHost _spotlight;
    private readonly IDisposable _openRegistration;
    private SettingsWindow? _window;
    private bool _disposed;

    public SettingsWindowManager(
        IEventContext context,
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        AuthService auth,
        MicrophonePermissionService microphonePermissions,
        DeveloperToolsService developerTools,
        SpotlightHost spotlight,
        WidgetWindowManager widgets)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _auth = auth;
        _microphonePermissions = microphonePermissions;
        _widgets = widgets;
        _developerTools = developerTools;
        _spotlight = spotlight;
        _openRegistration = context.RegisterInvokeHandler(
            AiriDesktopEvents.OpenSettings,
            (OpenSettingsPayload payload, CancellationToken _) => OpenFromRenderer(payload));
    }

    /// <summary>
    /// Lets another renderer open settings, for example a chat window that links to a settings
    /// page. The window disposes the registration when it closes.
    /// </summary>
    public IDisposable Attach(IEventContext context)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        return context.RegisterInvokeHandler(
            AiriDesktopEvents.OpenSettings,
            (OpenSettingsPayload payload, CancellationToken _) => OpenFromRenderer(payload));
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

    private Task<EmptyPayload> OpenFromRenderer(OpenSettingsPayload payload)
    {
        Open(payload.Route);
        return Task.FromResult(new EmptyPayload());
    }

    /// <summary>
    /// Opens or reuses the settings window. A null route opens /settings.
    /// </summary>
    public void Open(string? requestedRoute)
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
                window.TreeExiting += () => OnWindowClosed(window);
                _owner.AddChild(window);
                window.CurrentScreen = _mainWindow.CurrentScreen;
                DesktopWindowSizing.ApplyInitialDisplayScale(window);
                window.Initialize(
                    _registry,
                    _rendererUrl,
                    route,
                    _auth,
                    _microphonePermissions,
                    _developerTools,
                    _spotlight,
                    _widgets);
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
