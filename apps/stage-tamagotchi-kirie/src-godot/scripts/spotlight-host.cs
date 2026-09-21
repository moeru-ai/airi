using Eventa;
using GdKirie.EventaAdapter;
using Godot;

internal sealed class SpotlightHost : IDisposable
{
    internal const string Id = "spotlight";
    internal const string InvalidReason = "invalid";

    internal static readonly SpotlightAcceleratorPayload Default = new(
        "KeyA",
        ["ctrl", "shift"]);

    private const string WindowScenePath = "res://src-godot/spotlight-window.tscn";
    private const string ConfigPath = "user://spotlight.cfg";
    private const string Section = "shortcut";

    private static readonly HashSet<string> SafeModifiers = new(StringComparer.Ordinal)
    {
        "cmd",
        "ctrl",
        "alt",
        "super",
    };

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly ChatWindowManager _chat;
    private readonly HashSet<ShortcutBinding> _bindings = [];
    private readonly IDisposable _openRegistration;
    private SpotlightAcceleratorPayload _accelerator;
    private SpotlightWindow? _window;
    private bool _disposed;

    public SpotlightHost(
        IEventContext context,
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions,
        ChatWindowManager chat)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
        _chat = chat;
        _accelerator = Load();
        Attach(context);
        _openRegistration = context.RegisterInvokeHandler(
            AiriDesktopEvents.OpenSpotlight,
            (EmptyPayload _, CancellationToken _) =>
            {
                Open();
                return Task.FromResult(new EmptyPayload());
            });
    }

    internal static bool IsSafe(SpotlightAcceleratorPayload accelerator)
    {
        if (string.IsNullOrWhiteSpace(accelerator.Key) || accelerator.Modifiers.Length == 0)
        {
            return false;
        }

        foreach (var modifier in accelerator.Modifiers)
        {
            if (SafeModifiers.Contains(modifier))
            {
                return true;
            }
        }

        return false;
    }

    internal static string FormatModifiers(IReadOnlyList<string> modifiers)
    {
        return string.Join(',', modifiers);
    }

    internal static SpotlightAcceleratorPayload? TryCreate(string key, string modifiers)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        var accelerator = new SpotlightAcceleratorPayload(
            key,
            modifiers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        return IsSafe(accelerator) ? accelerator : null;
    }

    // Settings and the main renderer both await shortcut get/set. A context
    // without a binding never answers, and the renderer stalls (GAP-029).
    public IDisposable Attach(IEventContext context)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var binding = new ShortcutBinding(this, context);
        _bindings.Add(binding);
        return binding;
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

        if (_window is not null
            && GodotObject.IsInstanceValid(_window)
            && !_window.IsQueuedForDeletion())
        {
            _window.QueueFree();
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
                ?? throw new InvalidOperationException(
                    $"The Spotlight window scene is missing: {WindowScenePath}");
            var window = scene.Instantiate<SpotlightWindow>();
            _window = window;
            try
            {
                _owner.AddChild(window);
                window.CurrentScreen = _mainWindow.CurrentScreen;
                DesktopWindowSizing.ApplyInitialDisplayScale(window);
                window.Initialize(
                    _registry,
                    _rendererUrl,
                    _microphonePermissions,
                    _chat,
                    () =>
                    {
                        if (_window == window)
                        {
                            _window = null;
                        }
                    });
            }
            catch
            {
                window.QueueFree();
                _window = null;
                throw;
            }
        }

        _mainWindow.GrabFocus();
        _window.Open(_mainWindow.CurrentScreen);
    }

    private SpotlightShortcutRegistrationResultPayload Set(SpotlightShortcutSetPayload payload)
    {
        var next = payload.Accelerator ?? Default;
        if (!IsSafe(next))
        {
            return new SpotlightShortcutRegistrationResultPayload(Id, false, InvalidReason, null);
        }

        var config = new ConfigFile();
        config.SetValue(Section, "key", next.Key);
        config.SetValue(Section, "modifiers", FormatModifiers(next.Modifiers));
        var saveError = config.Save(ConfigPath);
        if (saveError != Error.Ok)
        {
            throw new InvalidOperationException(
                $"Could not save the Spotlight shortcut: {saveError}.");
        }

        _accelerator = next;
        foreach (var binding in _bindings.ToArray())
        {
            if (binding.IsActive)
            {
                binding.Context.Emit(AiriDesktopEvents.SpotlightShortcutChanged, next);
            }
        }

        return new SpotlightShortcutRegistrationResultPayload(Id, true, null, next);
    }

    private SpotlightAcceleratorPayload Load()
    {
        if (!Godot.FileAccess.FileExists(ConfigPath))
        {
            return Default;
        }

        var config = new ConfigFile();
        var error = config.Load(ConfigPath);
        if (error != Error.Ok)
        {
            GD.PushWarning($"Could not load the Spotlight shortcut: {error}.");
            return Default;
        }

        var accelerator = TryCreate(
            config.GetValue(Section, "key", string.Empty).AsString(),
            config.GetValue(Section, "modifiers", string.Empty).AsString());
        if (accelerator is not null)
        {
            return accelerator;
        }

        GD.PushWarning("Ignoring an invalid persisted Spotlight shortcut.");
        return Default;
    }

    private void Detach(ShortcutBinding binding)
    {
        _bindings.Remove(binding);
    }

    private sealed class ShortcutBinding : IDisposable
    {
        private readonly SpotlightHost _host;
        private readonly IDisposable _getRegistration;
        private readonly IDisposable _setRegistration;
        private bool _disposed;

        public ShortcutBinding(SpotlightHost host, IEventContext context)
        {
            _host = host;
            Context = context;
            _getRegistration = context.RegisterInvokeHandler(
                AiriDesktopEvents.GetSpotlightShortcut,
                (EmptyPayload _, CancellationToken _) => Task.FromResult(host._accelerator));
            _setRegistration = context.RegisterInvokeHandler(
                AiriDesktopEvents.SetSpotlightShortcut,
                (SpotlightShortcutSetPayload payload, CancellationToken _) =>
                    Task.FromResult(host.Set(payload)));
        }

        public IEventContext Context { get; }
        public bool IsActive => !_disposed;

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            _setRegistration.Dispose();
            _getRegistration.Dispose();
            _host.Detach(this);
        }
    }
}
