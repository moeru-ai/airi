using Eventa;
using GdKirie.EventaAdapter;
using Godot;

/// <summary>
/// Owns the chat windows and the saved choice between the chat modes.
///
/// Both modes load the same chat components, so a mode changes only the window around the chat.
/// Transparency is fixed when a window is created, so the legacy and floating modes have their own
/// windows. A mode switch opens one and closes the other. It matches
/// `apps/stage-tamagotchi/src/main/windows/chat/index.ts`, without the fullscreen mode.
/// </summary>
internal sealed class ChatWindowManager : IDisposable
{
    private const string WindowScenePath = "res://src-godot/chat-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly IEventContext _mainContext;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly ChatWindowPreferences _preferences = new();
    private readonly FloatingChatHost _floating;
    private readonly IDisposable[] _mainRegistrations;
    private ChatWindow? _window;
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
        _mainContext = context;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
        _floating = new FloatingChatHost(
            owner,
            mainWindow,
            registry,
            rendererUrl,
            microphonePermissions,
            _preferences,
            chatContext => AttachPreferences(chatContext, ChatWindowPreferences.FloatingMode),
            EmitButtonState);
        _mainRegistrations =
        [
            // The Controls Island chat button folds and unfolds the floating chat.
            context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenChat,
                (EmptyPayload _, CancellationToken _) => Complete(Toggle)),
            context.RegisterInvokeHandler(
                ChatWindowContracts.GetChatButtonState,
                (EmptyPayload _, CancellationToken _) => Task.FromResult(ButtonState())),
        ];
    }

    // Spotlight result notifications open Chat from the Spotlight renderer.
    // Bind OpenChat on that context as well as the main renderer (GAP-029).
    public IDisposable Attach(IEventContext context)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        return context.RegisterInvokeHandler(
            AiriDesktopEvents.OpenChat,
            (EmptyPayload _, CancellationToken _) => Complete(Show));
    }

    /// <summary>
    /// Lets an attached floating chat follow the main window. The main node calls this on each
    /// frame.
    /// </summary>
    public void Process()
    {
        _floating.Process();
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        foreach (var registration in _mainRegistrations)
        {
            registration.Dispose();
        }

        _floating.Dispose();
    }

    private static Task<EmptyPayload> Complete(Action action)
    {
        action();
        return Task.FromResult(new EmptyPayload());
    }

    /// <summary>
    /// Answers the style menu of a chat. <paramref name="mode"/> is the mode of that chat, so the
    /// menu shows the style that the user looks at, and a choice moves the chat from there.
    /// </summary>
    private IDisposable AttachPreferences(IEventContext context, string mode)
    {
        var getRegistration = context.RegisterInvokeHandler(
            ChatWindowContracts.GetPreferences,
            (EmptyPayload _, CancellationToken _) => Task.FromResult(PreferencesFor(mode)));
        // Each control sends only what it changes, so a control that holds older preferences never
        // writes them back. A switch closes the window that asked for it after this handler
        // answers.
        var setRegistration = context.RegisterInvokeHandler(
            ChatWindowContracts.SetPreferences,
            (ChatWindowPreferencesChangePayload changes, CancellationToken _) =>
                Complete(() => SetPreferences(changes, mode)));
        return new DisposableGroup(getRegistration, setRegistration);
    }

    private ChatWindowPreferencesPayload PreferencesFor(string mode)
    {
        var settings = _preferences.Current;
        return new ChatWindowPreferencesPayload(
            mode,
            settings.Placement,
            settings.Danmaku,
            settings.Pinned);
    }

    /// <summary>
    /// Saves the preferences. <paramref name="from"/> is the mode of the chat where the user chose
    /// them.
    /// </summary>
    private void SetPreferences(ChatWindowPreferencesChangePayload changes, string from)
    {
        if (changes.Mode is { } requestedMode && !ChatWindowPreferences.IsMode(requestedMode))
        {
            throw new ArgumentException($"Unknown chat window mode: {requestedMode}");
        }

        if (changes.Placement is { } requestedPlacement
            && !ChatWindowPreferences.IsPlacement(requestedPlacement))
        {
            throw new ArgumentException($"Unknown floating chat placement: {requestedPlacement}");
        }

        var previous = _preferences.Current;
        var next = previous with
        {
            Placement = changes.Placement ?? previous.Placement,
            Danmaku = changes.Danmaku ?? previous.Danmaku,
            Pinned = changes.Pinned ?? previous.Pinned,
        };

        // The placement is saved first, so a floating window that the switch below creates starts
        // in it.
        _preferences.Save(next);
        // Only a new placement attaches the chat again. An attached chat keeps its layout through a
        // new pin or message feed, so it does not jump to the preferred side while the main window
        // stays still.
        if (next.Placement != previous.Placement)
        {
            _floating.ApplyPlacement();
        }
        else if (next.Danmaku != previous.Danmaku || next.Pinned != previous.Pinned)
        {
            _floating.ApplyPreferences();
        }

        var mode = changes.Mode ?? from;
        if (mode != from)
        {
            SwitchTo(mode);
        }

        EmitButtonState();
    }

    /// <summary>
    /// Saves <paramref name="mode"/>, opens its window, and closes the window of the other mode.
    /// </summary>
    private void SwitchTo(string mode)
    {
        _preferences.Save(_preferences.Current with { Mode = mode });
        Show();
    }

    /// <summary>
    /// Shows the chat in the saved mode, and closes the window of the other mode.
    /// </summary>
    private void Show()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_preferences.Current.Mode == ChatWindowPreferences.FloatingMode)
        {
            _floating.Open();
            CloseLegacy();
            return;
        }

        OpenLegacy();
        _floating.Close();
    }

    /// <summary>
    /// Runs the Controls Island chat button. The floating chat folds when it is shown and unfolds
    /// otherwise. The legacy window comes to the front.
    /// </summary>
    private void Toggle()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_preferences.Current.Mode == ChatWindowPreferences.FloatingMode)
        {
            _floating.Toggle();
            return;
        }

        OpenLegacy();
    }

    private ChatButtonStatePayload ButtonState()
    {
        var mode = _preferences.Current.Mode;
        return new ChatButtonStatePayload(
            mode,
            mode == ChatWindowPreferences.FloatingMode && _floating.IsUnfolded);
    }

    private void EmitButtonState()
    {
        if (!_disposed)
        {
            _mainContext.Emit(ChatWindowContracts.ChatButtonStateChanged, ButtonState());
        }
    }

    private void OpenLegacy()
    {
        if (_window is null
            || !GodotObject.IsInstanceValid(_window)
            || _window.IsQueuedForDeletion())
        {
            var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
                ?? throw new InvalidOperationException(
                    $"The chat window scene is missing: {WindowScenePath}");
            var window = scene.Instantiate<ChatWindow>();
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
                    _microphonePermissions,
                    chatContext => AttachPreferences(
                        chatContext,
                        ChatWindowPreferences.LegacyMode));
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

    private void CloseLegacy()
    {
        if (_window is { } window
            && GodotObject.IsInstanceValid(window)
            && !window.IsQueuedForDeletion())
        {
            window.Hide();
            window.QueueFree();
        }

        _window = null;
    }

    private void OnWindowClosed(ChatWindow window)
    {
        if (_window == window)
        {
            _window = null;
        }
    }
}
