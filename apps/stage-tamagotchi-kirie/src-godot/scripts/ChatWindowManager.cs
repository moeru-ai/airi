using Eventa;
using GdKirie.EventaAdapter;
using Godot;

/// <summary>
/// Owns the chat windows and the saved choice between the chat modes.
///
/// Both modes load the same chat components, so a mode changes only the window around the chat.
/// Transparency is fixed when a window is created, so the legacy and floating modes have their own
/// windows. A mode switch opens one and closes the other, and <see cref="ChatModeSwitch"/> carries
/// the unsent draft between them. It matches
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
    private readonly Func<IEventContext, IDisposable> _attachSettings;
    private readonly ChatWindowPreferences _preferences = new();
    private readonly FloatingChatHost _floating;
    private readonly ChatModeSwitch _modeSwitch;
    private readonly IDisposable[] _mainRegistrations;
    private ChatWindow? _window;
    private bool _disposed;

    public ChatWindowManager(
        IEventContext context,
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions,
        Func<IEventContext, IDisposable> attachSettings)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _mainContext = context;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
        _attachSettings = attachSettings;
        _floating = new FloatingChatHost(
            owner,
            mainWindow,
            registry,
            rendererUrl,
            microphonePermissions,
            _preferences,
            chatContext => AttachChat(chatContext, ChatWindowPreferences.FloatingMode),
            EmitButtonState);
        _modeSwitch = new ChatModeSwitch(
            () => _preferences.Current.Mode,
            mode => _preferences.Save(_preferences.Current with { Mode = mode }),
            new Dictionary<string, ChatModeWindow>
            {
                [ChatWindowPreferences.LegacyMode] = new(
                    () => LiveLegacyWindow() is not null,
                    OpenLegacy,
                    CloseLegacy,
                    () => LiveLegacyWindow() is { IsRendererReady: true } window
                        ? window.Context
                        : null),
                [ChatWindowPreferences.FloatingMode] = new(
                    () => _floating.IsOpen,
                    _floating.Open,
                    _floating.Close,
                    () => _floating.RendererContext),
            });
        _mainRegistrations =
        [
            // The Controls Island chat button folds and unfolds the floating chat.
            context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenChat,
                async (EmptyPayload _, CancellationToken _) =>
                {
                    await _modeSwitch.RunAsync(Toggle);
                    return new EmptyPayload();
                }),
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
            async (EmptyPayload _, CancellationToken _) =>
            {
                ObjectDisposedException.ThrowIf(_disposed, this);
                await _modeSwitch.ShowAsync();
                return new EmptyPayload();
            });
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

    /// <summary>
    /// Answers the style menu of a chat, lets a mode switch hand a draft to it, and lets it open
    /// settings.
    /// <paramref name="mode"/> is the mode of that chat. The menu shows the style that the user
    /// looks at, a choice moves the chat from there, and the draft handover uses the mode as its
    /// key.
    /// </summary>
    private IDisposable AttachChat(IEventContext context, string mode)
    {
        IDisposable[] registrations =
        [
            _attachSettings(context),
            context.RegisterInvokeHandler(
                ChatWindowContracts.GetPreferences,
                (EmptyPayload _, CancellationToken _) => Task.FromResult(PreferencesFor(mode))),
            // Each control sends only what it changes, so a control that holds older preferences
            // never writes them back. A switch that succeeds closes the window that asked for it,
            // and its reply goes nowhere. A switch that fails rejects, and that window stays.
            context.RegisterInvokeHandler(
                ChatWindowContracts.SetPreferences,
                async (ChatWindowPreferencesChangePayload changes, CancellationToken _) =>
                {
                    await SetPreferencesAsync(changes, mode);
                    return new EmptyPayload();
                }),
            context.RegisterInvokeHandler(
                ChatWindowContracts.TakeDraft,
                (EmptyPayload _, CancellationToken _) =>
                    Task.FromResult(new ChatDraftPayload(_modeSwitch.TakeDraft(mode)))),
            context.RegisterInvokeHandler(
                ChatWindowContracts.DraftSettled,
                (ChatDraftSettledPayload payload, CancellationToken _) =>
                {
                    _modeSwitch.SettleDraft(mode, payload.Restored);
                    return Task.FromResult(new EmptyPayload());
                }),
        ];
        return new DisposableGroup(registrations);
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
    /// them. A new mode moves the chat, with its draft, to the window of that mode.
    /// </summary>
    private async Task SetPreferencesAsync(ChatWindowPreferencesChangePayload changes, string from)
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

        await _modeSwitch.RunAsync(() => SavePreferences(changes));
        try
        {
            await _modeSwitch.SwitchToAsync(changes.Mode ?? from, from);
        }
        finally
        {
            EmitButtonState();
        }
    }

    /// <summary>
    /// Saves the placement, the message feed, and the pin. They are saved before a mode switch, so
    /// a floating window that the switch creates starts in them.
    /// </summary>
    private void SavePreferences(ChatWindowPreferencesChangePayload changes)
    {
        var previous = _preferences.Current;
        var next = previous with
        {
            Placement = changes.Placement ?? previous.Placement,
            Danmaku = changes.Danmaku ?? previous.Danmaku,
            Pinned = changes.Pinned ?? previous.Pinned,
        };

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

    /// <summary>The legacy chat window, or `null` when it is closed or closing.</summary>
    private ChatWindow? LiveLegacyWindow()
    {
        return _window is { } window
            && GodotObject.IsInstanceValid(window)
            && !window.IsQueuedForDeletion()
            ? window
            : null;
    }

    private void OpenLegacy()
    {
        var window = LiveLegacyWindow() ?? CreateLegacyWindow();
        window.Open(_mainWindow.CurrentScreen);
    }

    private ChatWindow CreateLegacyWindow()
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
                chatContext => AttachChat(chatContext, ChatWindowPreferences.LegacyMode));
        }
        catch
        {
            window.QueueFree();
            _window = null;
            throw;
        }

        return window;
    }

    private void CloseLegacy()
    {
        if (LiveLegacyWindow() is { } window)
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
