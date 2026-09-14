using Eventa;
using GdKirie.EventaAdapter;
using Godot;

internal sealed class OnboardingWindowManager : IDisposable
{
    private const string WindowScenePath = "res://src-godot/onboarding-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly IDisposable _openRegistration;
    private OnboardingWindow? _window;
    private bool _disposed;

    public OnboardingWindowManager(
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
            AiriDesktopEvents.OpenOnboarding,
            (EmptyPayload _, CancellationToken _) =>
            {
                Open();
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

    private void Open()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_window is null
            || !GodotObject.IsInstanceValid(_window)
            || _window.IsQueuedForDeletion())
        {
            var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
                ?? throw new InvalidOperationException($"The onboarding window scene is missing: {WindowScenePath}");
            var window = scene.Instantiate<OnboardingWindow>();
            _window = window;
            try
            {
                _owner.AddChild(window);
                window.Initialize(_registry, _rendererUrl, () => OnWindowClosed(window));
            }
            catch
            {
                window.QueueFree();
                _window = null;
                throw;
            }
        }

        _window.Open(_mainWindow.CurrentScreen);
    }

    private void OnWindowClosed(OnboardingWindow window)
    {
        if (_window == window)
        {
            _window = null;
        }
    }
}
