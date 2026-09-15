using Eventa;
using GdKirie.EventaAdapter;
using Godot;

internal sealed class ChatWindowManager : IDisposable
{
    private const string WindowScenePath = "res://src-godot/chat-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly IDisposable _openRegistration;
    private ChatWindow? _window;
    private bool _disposed;

    public ChatWindowManager(
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
            AiriDesktopEvents.OpenChat,
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
                ?? throw new InvalidOperationException($"The chat window scene is missing: {WindowScenePath}");
            var window = scene.Instantiate<ChatWindow>();
            _window = window;
            try
            {
                _owner.AddChild(window);
                window.CurrentScreen = _mainWindow.CurrentScreen;
                DesktopWindowSizing.ApplyInitialDisplayScale(window);
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

    private void OnWindowClosed(ChatWindow window)
    {
        if (_window == window)
        {
            _window = null;
        }
    }
}
