using Eventa;
using GdKirie.EventaAdapter;
using Godot;

internal sealed class ChatWindowManager : IDisposable
{
    private const string ConfigPath = "user://chat-window.cfg";
    private const string WindowScenePath = "res://src-godot/chat-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly IDisposable _openRegistration;
    private ChatWindow? _window;
    private ChatWindowPreferences _preferences = LoadPreferences();
    private readonly List<Binding> _bindings = [];
    private bool _folded = true;
    private string _side = "left";
    private bool _disposed;

    public ChatWindowManager(
        IEventContext context,
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
        _openRegistration = Attach(context);
    }

    public IDisposable Attach(IEventContext context)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var binding = new Binding(context, _bindings);
        _bindings.Add(binding);
        binding.Registrations = [
            context.RegisterInvokeHandler(AiriDesktopEvents.OpenChat,
                (EmptyPayload _, CancellationToken _) =>
                {
                    if (_preferences.Mode == "floating" && _window?.Visible == true && !_folded)
                    {
                        Fold();
                    }
                    else
                    {
                        Open();
                    }
                    return Task.FromResult(new EmptyPayload());
                }),
            context.RegisterInvokeHandler(ChatWindowContracts.GetPreferences,
                (EmptyPayload _, CancellationToken _) => Task.FromResult(_preferences)),
            context.RegisterInvokeHandler(ChatWindowContracts.SetPreferences,
                (ChatWindowPreferences payload, CancellationToken _) =>
                {
                    SetPreferences(payload);
                    return Task.FromResult(new EmptyPayload());
                }),
            context.RegisterInvokeHandler(ChatWindowContracts.GetState,
                (EmptyPayload _, CancellationToken _) =>
                {
                    binding.Ready = true;
                    return Task.FromResult(State);
                }),
            context.RegisterInvokeHandler(ChatWindowContracts.GetButtonState,
                (EmptyPayload _, CancellationToken _) =>
                {
                    binding.Ready = true;
                    return Task.FromResult(ButtonState);
                }),
        ];
        return binding;
    }

    private ChatWindowState State => new(_preferences, _side, _folded,
        _preferences.Mode == "floating" && (_preferences.Placement == "free"
            ? _preferences.Pinned : _mainWindow.AlwaysOnTop));
    private ChatButtonState ButtonState => new(_preferences.Mode,
        _preferences.Mode == "floating" && !_folded);

    public void Process()
    {
        if (_window is not { Visible: true } || _preferences.Mode != "floating")
        {
            return;
        }

        string previousSide = _side;
        bool pinned = _preferences.Placement == "free" ? _preferences.Pinned : _mainWindow.AlwaysOnTop;
        if (_window.AlwaysOnTop != pinned)
        {
            _window.AlwaysOnTop = pinned;
        }
        if (_preferences.Placement == "attached")
        {
            FollowMainWindow();
        }
        if (previousSide != _side || _lastPublished?.Pinned != pinned)
        {
            Publish();
        }
    }

    internal void Fold()
    {
        _folded = true;
        Publish();
    }

    internal void ContentHidden()
    {
        if (_folded)
        {
            _window?.Hide();
        }
    }

    private ChatWindowState? _lastPublished;

    private void Publish()
    {
        _lastPublished = State;
        foreach (var binding in _bindings)
        {
            if (binding.Ready)
            {
                binding.Context.Emit(ChatWindowContracts.StateChanged, State);
                binding.Context.Emit(ChatWindowContracts.ButtonStateChanged, ButtonState);
            }
        }
    }

    private void SetPreferences(ChatWindowPreferences preferences)
    {
        if (!preferences.IsValid)
        {
            throw new ArgumentException("Unsupported chat window style.", nameof(preferences));
        }

        var config = new ConfigFile();
        config.SetValue("chat", "mode", preferences.Mode);
        config.SetValue("chat", "placement", preferences.Placement);
        config.SetValue("chat", "pinned", preferences.Pinned);
        var error = config.Save(ConfigPath);
        if (error != Error.Ok)
        {
            throw new InvalidOperationException($"Cannot save the chat window style: {error}.");
        }

        bool changedMode = _preferences.Mode != preferences.Mode;
        _preferences = preferences;
        if (_window is not null)
        {
            ApplyStyle(changedMode);
        }
        Publish();
    }

    private static ChatWindowPreferences LoadPreferences()
    {
        if (!Godot.FileAccess.FileExists(ConfigPath))
        {
            return ChatWindowPreferences.Default;
        }

        var config = new ConfigFile();
        if (config.Load(ConfigPath) != Error.Ok)
        {
            throw new InvalidOperationException("Cannot load the chat window style.");
        }
        var preferences = new ChatWindowPreferences(
            config.GetValue("chat", "mode", "legacy").AsString(),
            config.GetValue("chat", "placement", "attached").AsString(),
            config.GetValue("chat", "pinned", false).AsBool());
        return preferences.IsValid ? preferences
            : throw new InvalidOperationException("The saved chat window style is invalid.");
    }

    private void ApplyStyle(bool resize)
    {
        var window = _window!;
        bool floating = _preferences.Mode == "floating";
        window.Borderless = floating;
        window.Transparent = true;
        window.TransparentBg = true;
        window.GetNode<CanvasItem>("WindowBackground").Visible = !floating;
        window.AlwaysOnTop = State.Pinned;
        if (resize)
        {
            float scale = DesktopWindowSizing.GetDisplayScale(window);
            var workArea = DisplayServer.ScreenGetUsableRect(window.CurrentScreen);
            window.MinSize = new Vector2I((int)(280 * scale), (int)(280 * scale));
            window.Size = new Vector2I(
                Math.Min((int)((floating ? 380 : 600) * scale), workArea.Size.X),
                Math.Min((int)((floating ? 560 : 800) * scale), workArea.Size.Y));
            DesktopWindowSizing.MoveToUsableCenter(window);
        }
        if (floating && _preferences.Placement == "attached")
        {
            FollowMainWindow();
        }
    }

    private void FollowMainWindow()
    {
        var window = _window!;
        window.CurrentScreen = _mainWindow.CurrentScreen;
        var workArea = DisplayServer.ScreenGetUsableRect(window.CurrentScreen);
        float scale = DesktopWindowSizing.GetDisplayScale(window);
        int gap = (int)(12 * scale);
        int left = _mainWindow.Position.X - window.Size.X - gap;
        int right = _mainWindow.Position.X + _mainWindow.Size.X + gap;
        _side = left >= workArea.Position.X || right + window.Size.X > workArea.End.X
            ? "left" : "right";
        var position = new Vector2I(
            Math.Clamp(_side == "left" ? left : right, workArea.Position.X,
                Math.Max(workArea.Position.X, workArea.End.X - window.Size.X)),
            Math.Clamp(_mainWindow.Position.Y + _mainWindow.Size.Y - window.Size.Y,
                workArea.Position.Y, Math.Max(workArea.Position.Y, workArea.End.Y - window.Size.Y)));
        if (window.Position != position)
        {
            window.Position = position;
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
        foreach (var binding in _bindings.ToArray())
        {
            binding.Dispose();
        }
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
                window.TreeExiting += () => OnWindowClosed(window);
                _owner.AddChild(window);
                window.CurrentScreen = _mainWindow.CurrentScreen;
                DesktopWindowSizing.ApplyInitialDisplayScale(window);
                window.Initialize(_registry, _rendererUrl, _microphonePermissions, this);
                ApplyStyle(true);
            }
            catch
            {
                window.QueueFree();
                _window = null;
                throw;
            }
        }

        _folded = false;
        _window.Open(_mainWindow.CurrentScreen);
        Publish();
    }

    private void OnWindowClosed(ChatWindow window)
    {
        if (_window == window)
        {
            _window = null;
        }
    }

    private sealed class Binding(IEventContext context, List<Binding> bindings) : IDisposable
    {
        public IEventContext Context { get; } = context;
        public IDisposable[] Registrations { get; set; } = [];
        public bool Ready { get; set; }

        public void Dispose()
        {
            bindings.Remove(this);
            foreach (var registration in Registrations)
            {
                registration.Dispose();
            }
            Registrations = [];
        }
    }
}
