using Eventa;
using GdKirie.EventaAdapter;
using Godot;

/// <summary>
/// Owns the floating chat window: its placement beside the main window, the fold that the chat
/// button drives, and the keyboard move and resize. It matches
/// `apps/stage-tamagotchi/src/main/windows/chat/floating.ts`.
///
/// State model:
/// - `_folded` is the chat button state. It starts `true`, because no chat shows yet. The renderer
///   animates a fold first. The window hides when the renderer reports the content hidden.
/// - `_layout` is where the attached placement puts the chat against the main window. It changes
///   only when the current layout stops fitting, or when the preferred one fits again.
/// - `_relocating` is `true` while the chat moves to the other side of the main window. The
///   renderer folds the content toward the character, and the window moves while the content is
///   hidden. Then the content unfolds again.
/// - `_slide` animates a change of the vertical anchor, which does not cross the character.
/// - The window is created on the first open and freed on a switch to the legacy mode.
/// - On macOS, an attached chat is a child window of the main window, so the window server moves
///   it with the main window during a drag.
///
/// The main window has no move or resize signal, so <see cref="Process"/> compares its rectangle on
/// each frame. All handlers and frame updates run on the Godot main thread.
/// </summary>
internal sealed class FloatingChatHost : IDisposable
{
    private const string WindowScenePath = "res://src-godot/floating-chat-window.tscn";

    /// <summary>
    /// Room, in logical pixels, that an attached chat needs beyond a fit before it returns to the
    /// preferred layout.
    /// </summary>
    private const int ReturnMarginLogical = 24;

    private const ulong SlideMilliseconds = 220;
    private const ulong PersistDelayMilliseconds = 300;

    /// <summary>
    /// The longest wait, in milliseconds, for the renderer to report a fold or a relocation as
    /// done. The fold animation takes 380 ms. A renderer that cannot animate never reports, and the
    /// window would stay on screen.
    /// </summary>
    private const ulong SettleTimeoutMilliseconds = 1000;

    /// <summary>
    /// The smallest floating chat that still shows the composer above one short bubble, in logical
    /// pixels.
    /// </summary>
    private static readonly Vector2I MinimumLogicalSize = new(300, 260);

    // NOTICE:
    // The window server drags the main window by itself. During a drag, the attached chat that
    // Process places moved about 9 times a second, while the main window moved at the display
    // rate. A child window moves with its parent inside the window server.
    // Only macOS moves a child window with its parent, so only macOS links the chat.
    // Source: `attachToMain` in apps/stage-tamagotchi/src/main/windows/chat/floating.ts, and a
    // CGWindowList recording of a drag in Kirie on 2026-10-27.
    // Removal: when Godot reports the main window position on each frame of a native drag.
    private static readonly bool LinksToMain = OperatingSystem.IsMacOS();

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly ChatWindowPreferences _preferences;
    private readonly Func<IEventContext, IDisposable> _attachChat;
    private readonly Action _onFoldedChanged;
    private FloatingChatWindow? _window;
    private bool _ready;
    private bool _folded = true;
    private bool _relocating;
    private AttachedChatLayout _layout = AttachedChatLayout.Preferred;

    /// <summary>
    /// The size the chat is meant to have, in native pixels. Only a resize changes it.
    /// </summary>
    private Vector2I _size;

    private Rect2I _lastMainRect;
    private bool _lastMainVisible;
    private bool _lastMainPinned;
    private Vector2I _lastPosition;
    private Slide? _slide;
    private ulong? _settleDeadline;
    private ulong? _persistAt;
    private bool _disposed;

    public FloatingChatHost(
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions,
        ChatWindowPreferences preferences,
        Func<IEventContext, IDisposable> attachChat,
        Action onFoldedChanged)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
        _preferences = preferences;
        _attachChat = attachChat;
        _onFoldedChanged = onFoldedChanged;
    }

    /// <summary>Whether the chat is unfolded. The chat button shows this as pressed.</summary>
    public bool IsUnfolded => !_folded;

    /// <summary>Whether the floating chat window exists, shown or folded.</summary>
    public bool IsOpen => _window is not null;

    /// <summary>The context of the mounted chat page, or `null` before it mounts.</summary>
    public IEventContext? RendererContext =>
        _window is { } window && _ready ? window.Context : null;

    private bool IsAttached =>
        _preferences.Current.Placement == ChatWindowPreferences.AttachedPlacement;

    /// <summary>Shows the chat unfolded and focused. It creates the window when needed.</summary>
    public void Open()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var window = _window ?? CreateWindow();
        SetFolded(false);
        EmitState();
        if (_ready)
        {
            window.ShowChat(focus: true);
        }
    }

    /// <summary>Folds a shown chat, or opens a folded one. The chat button calls this.</summary>
    public void Toggle()
    {
        if (_window is { } window && !_folded)
        {
            Fold(window);
            return;
        }

        Open();
    }

    /// <summary>Frees the window. A switch to the legacy mode calls this.</summary>
    public void Close()
    {
        if (_window is not { } window)
        {
            return;
        }

        PersistNow();
        Detach(window);
        window.Hide();
        window.QueueFree();
    }

    /// <summary>Moves the window into the saved placement.</summary>
    public void ApplyPlacement()
    {
        if (_window is { } window)
        {
            ApplyPlacementTo(window);
        }
    }

    /// <summary>
    /// Applies the saved pin and message feed without moving the window. An attached chat keeps the
    /// pin of the main window and its layout.
    /// </summary>
    public void ApplyPreferences()
    {
        if (_window is not { } window)
        {
            return;
        }

        if (!IsAttached)
        {
            window.AlwaysOnTop = _preferences.Current.Pinned;
        }

        EmitState();
    }

    /// <summary>
    /// Follows the main window, runs the anchor slide, and saves a moved or resized chat.
    /// </summary>
    public void Process()
    {
        if (_window is not { } window)
        {
            return;
        }

        var now = Time.GetTicksMsec();
        if (_settleDeadline is { } deadline && deadline <= now)
        {
            _settleDeadline = null;
            OnContentHidden(window);
        }

        // A resize from the native edges changes the size outside this host.
        if (window.Size != _size)
        {
            _size = window.Size;
            if (IsAttached)
            {
                MoveToLayout(window);
            }

            SchedulePersist(now);
        }

        if (IsAttached)
        {
            FollowMain(window, now);
        }

        if (window.Position != _lastPosition)
        {
            _lastPosition = window.Position;
            if (!IsAttached)
            {
                SchedulePersist(now);
            }
        }

        if (_persistAt is { } persistAt && persistAt <= now)
        {
            PersistNow();
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        Close();
    }

    private FloatingChatWindow CreateWindow()
    {
        var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
            ?? throw new InvalidOperationException(
                $"The floating chat window scene is missing: {WindowScenePath}");
        var window = scene.Instantiate<FloatingChatWindow>();
        _window = window;
        try
        {
            window.TreeExiting += () => OnWindowExiting(window);
            window.CloseRequested += () => Fold(window);
            window.RendererReady += () => OnRendererReady(window);
            _owner.AddChild(window);
            window.CurrentScreen = _mainWindow.CurrentScreen;
            DesktopWindowSizing.ApplyInitialDisplayScale(window);
            var scale = DesktopWindowSizing.GetDisplayScale(window);
            var saved = _preferences.Current.Floating;
            window.MinSize = ToNative(MinimumLogicalSize, scale);
            window.Size = new Vector2I(
                Math.Max(window.MinSize.X, Mathf.RoundToInt(saved.Width * scale)),
                Math.Max(window.MinSize.Y, Mathf.RoundToInt(saved.Height * scale)));
            _size = window.Size;

            // The saved position can be on a display that is gone or smaller now.
            if (!IsAttached && saved.Position is { } position)
            {
                var kept = FloatingChatPlacement.KeepOnDisplay(
                    new Rect2I(position, _size),
                    Displays());
                _size = kept.Size;
                window.Size = kept.Size;
                window.Position = kept.Position;
            }
            else
            {
                DesktopWindowSizing.MoveToUsableCenter(window);
            }

            window.Initialize(_registry, _rendererUrl, _microphonePermissions, Attach);
            ApplyPlacementTo(window);
            _lastPosition = window.Position;
        }
        catch
        {
            Detach(window);
            window.QueueFree();
            throw;
        }

        return window;
    }

    private IDisposable Attach(IEventContext context)
    {
        IDisposable[] registrations =
        [
            _attachChat(context),
            context.RegisterInvokeHandler(
                ChatWindowContracts.GetFloatingState,
                (EmptyPayload _, CancellationToken _) => Task.FromResult(CurrentState())),
            context.RegisterInvokeHandler(
                ChatWindowContracts.FloatingContentHidden,
                (EmptyPayload _, CancellationToken _) => Complete(OnContentHidden)),
            context.RegisterInvokeHandler(
                ChatWindowContracts.FloatingFold,
                (EmptyPayload _, CancellationToken _) => Complete(Fold)),
            context.RegisterInvokeHandler(
                ChatWindowContracts.FloatingMoveBy,
                (ChatFloatingMoveByPayload payload, CancellationToken _) =>
                    Complete(window => MoveBy(window, payload))),
            context.RegisterInvokeHandler(
                ChatWindowContracts.FloatingResizeBy,
                (ChatFloatingResizeByPayload payload, CancellationToken _) =>
                    Complete(window => ResizeBy(window, payload))),
        ];
        return new DisposableGroup(registrations);
    }

    private Task<EmptyPayload> Complete(Action<FloatingChatWindow> action)
    {
        if (_window is { } window)
        {
            action(window);
        }

        return Task.FromResult(new EmptyPayload());
    }

    private void OnRendererReady(FloatingChatWindow window)
    {
        if (window != _window)
        {
            return;
        }

        _ready = true;
        if (!_folded)
        {
            window.ShowChat(focus: true);
        }
    }

    private void OnWindowExiting(FloatingChatWindow window)
    {
        if (window == _window)
        {
            Detach(window);
        }
    }

    /// <summary>Forgets the window. A later open creates a new one, folded until then.</summary>
    private void Detach(FloatingChatWindow window)
    {
        if (window != _window)
        {
            return;
        }

        _window = null;
        _ready = false;
        _relocating = false;
        _slide = null;
        _settleDeadline = null;
        _persistAt = null;
        SetFolded(true);
    }

    private ChatFloatingStatePayload CurrentState()
    {
        var settings = _preferences.Current;
        var attached = IsAttached;
        return new ChatFloatingStatePayload(
            settings.Placement,
            settings.Danmaku,
            attached && _layout.Side == AttachedChatSide.Right ? "right" : "left",
            ResizeEdges(),
            _folded,
            _relocating,
            attached ? _mainWindow.AlwaysOnTop : (_window?.AlwaysOnTop ?? false));
    }

    private string[] ResizeEdges()
    {
        return IsAttached
            ? FloatingChatPlacement.AttachedResizeEdges(_layout)
            : FloatingChatPlacement.AllResizeEdges;
    }

    private void EmitState()
    {
        // The renderer reads the first state when it mounts. Events go only to a mounted renderer.
        if (_window is { } window && _ready)
        {
            window.Context.Emit(ChatWindowContracts.FloatingStateChanged, CurrentState());
        }
    }

    private void SetFolded(bool value)
    {
        if (_folded == value)
        {
            return;
        }

        _folded = value;
        _onFoldedChanged();
    }

    private void Fold(FloatingChatWindow window)
    {
        SetFolded(true);
        // A renderer that is not mounted has no content to fold.
        if (!_ready || !window.Visible)
        {
            _relocating = false;
            window.Hide();
            return;
        }

        _settleDeadline = Time.GetTicksMsec() + SettleTimeoutMilliseconds;
        EmitState();
    }

    private void OnContentHidden(FloatingChatWindow window)
    {
        _settleDeadline = null;
        // A fold wins over a relocation, because the next open places the chat anyway.
        // An unfold that overtook the animation leaves the window shown.
        if (_folded)
        {
            _relocating = false;
            window.Hide();
            return;
        }

        if (_relocating)
        {
            FinishRelocation(window);
        }
    }

    private void ApplyPlacementTo(FloatingChatWindow window)
    {
        _slide = null;
        if (IsAttached)
        {
            var main = MainRect();
            _layout = FloatingChatPlacement.ChooseAttachedLayout(
                main,
                _size,
                WorkAreaOf(main),
                AttachedChatLayout.Preferred,
                ReturnMargin(window));
            MoveToLayout(window);
            LinkToMain(window);
            _lastMainRect = main;
            _lastMainVisible = _mainWindow.Visible;
            _lastMainPinned = _mainWindow.AlwaysOnTop;
        }
        else
        {
            window.Transient = false;
            window.AlwaysOnTop = _preferences.Current.Pinned;
        }

        EmitState();
    }

    /// <summary>
    /// Gives an attached chat the pin of the main window. On macOS the chat becomes a child window
    /// of the main window, which takes the level of its parent. Godot does not link a window that
    /// stays on top, so the chat drops its own pin first.
    /// </summary>
    private void LinkToMain(FloatingChatWindow window)
    {
        if (LinksToMain)
        {
            window.AlwaysOnTop = false;
            window.Transient = true;
            return;
        }

        window.AlwaysOnTop = _mainWindow.AlwaysOnTop;
    }

    /// <summary>
    /// Keeps an attached chat beside the main window, with its pin and its visibility.
    /// </summary>
    private void FollowMain(FloatingChatWindow window, ulong now)
    {
        var mainPinned = _mainWindow.AlwaysOnTop;
        if (mainPinned != _lastMainPinned)
        {
            _lastMainPinned = mainPinned;
            LinkToMain(window);
            EmitState();
        }

        var mainVisible = _mainWindow.Visible;
        if (mainVisible != _lastMainVisible)
        {
            _lastMainVisible = mainVisible;
            if (!mainVisible)
            {
                window.Hide();
            }
            else if (!_folded && _ready)
            {
                window.ShowChat(focus: false);
            }
        }

        var main = MainRect();
        if (main != _lastMainRect)
        {
            _lastMainRect = main;
            OnMainMoved(window, main);
        }

        if (_slide is { } slide)
        {
            var progress = Math.Min(1.0, (now - slide.StartedAt) / (double)SlideMilliseconds);
            // outCubic, as the Electron slide uses.
            var eased = 1.0 - Math.Pow(1.0 - progress, 3);
            var offset = new Vector2I(
                Mathf.RoundToInt(slide.From.X + ((slide.To.X - slide.From.X) * eased)),
                Mathf.RoundToInt(slide.From.Y + ((slide.To.Y - slide.From.Y) * eased)));
            PlaceAt(window, main.Position + offset);
            if (progress >= 1.0)
            {
                _slide = null;
            }
        }
    }

    private void OnMainMoved(FloatingChatWindow window, Rect2I main)
    {
        if (_relocating)
        {
            return;
        }

        var next = FloatingChatPlacement.ChooseAttachedLayout(
            main,
            _size,
            WorkAreaOf(main),
            _layout,
            ReturnMargin(window));
        var sideChanged = next.Side != _layout.Side;
        var anchorChanged = next.Anchor != _layout.Anchor;

        // A hidden chat has nothing to animate.
        if (!window.Visible || _folded)
        {
            _slide = null;
            _layout = next;
            MoveToLayout(window);
            if (sideChanged || anchorChanged)
            {
                EmitState();
            }

            return;
        }

        if (sideChanged)
        {
            // The layout changes in FinishRelocation. Until then the renderer folds toward the
            // character on the old side.
            _slide = null;
            _relocating = true;
            _settleDeadline = Time.GetTicksMsec() + SettleTimeoutMilliseconds;
            EmitState();
            return;
        }

        if (anchorChanged)
        {
            var from = window.Position - main.Position;
            _layout = next;
            var to = FloatingChatPlacement.AttachedOffset(main, _size, WorkAreaOf(main), _layout);
            _slide = new Slide(from, to, Time.GetTicksMsec());
            // The chat resizes from the edges away from the new anchor.
            EmitState();
            return;
        }

        // A running slide places the chat on every frame.
        if (_slide is null)
        {
            MoveToLayout(window);
        }
    }

    private void FinishRelocation(FloatingChatWindow window)
    {
        _relocating = false;
        var main = MainRect();
        // The main window can move on while the content folds.
        _layout = FloatingChatPlacement.ChooseAttachedLayout(
            main,
            _size,
            WorkAreaOf(main),
            _layout,
            ReturnMargin(window));
        MoveToLayout(window);
        EmitState();
    }

    private void MoveToLayout(FloatingChatWindow window)
    {
        var main = MainRect();
        var offset = FloatingChatPlacement.AttachedOffset(main, _size, WorkAreaOf(main), _layout);
        PlaceAt(window, main.Position + offset);
    }

    private static void PlaceAt(Window window, Vector2I position)
    {
        if (window.Position != position)
        {
            window.Position = position;
        }
    }

    private void MoveBy(FloatingChatWindow window, ChatFloatingMoveByPayload payload)
    {
        // An attached chat takes its position from the main window.
        if (IsAttached)
        {
            return;
        }

        var scale = DesktopWindowSizing.GetDisplayScale(window);
        var delta = ToNative(new Vector2I(payload.DeltaX, payload.DeltaY), scale);
        var kept = FloatingChatPlacement.KeepOnDisplay(
            new Rect2I(window.Position + delta, _size),
            Displays());
        _size = kept.Size;
        window.Size = kept.Size;
        PlaceAt(window, kept.Position);
        SchedulePersist(Time.GetTicksMsec());
    }

    private void ResizeBy(FloatingChatWindow window, ChatFloatingResizeByPayload payload)
    {
        // An edge that the chat shares with the main window stays in place.
        if (!ResizeEdges().Contains(payload.Direction))
        {
            return;
        }

        // The layout stays during a resize, so the chat never jumps to the other side under the
        // cursor.
        _slide = null;
        var scale = DesktopWindowSizing.GetDisplayScale(window);
        var resized = FloatingChatPlacement.ResizeByDelta(
            new Rect2I(window.Position, _size),
            ToNative(new Vector2I(payload.DeltaX, payload.DeltaY), scale),
            payload.Direction,
            window.MinSize);
        // The chat stops growing at the edges of the work area, so the edge under the cursor stays
        // in reach.
        var kept = FloatingChatPlacement.KeepOnDisplay(resized, Displays());
        _size = kept.Size;
        window.Size = kept.Size;
        PlaceAt(window, kept.Position);
        if (IsAttached)
        {
            MoveToLayout(window);
        }

        SchedulePersist(Time.GetTicksMsec());
    }

    private void SchedulePersist(ulong now)
    {
        _persistAt = now + PersistDelayMilliseconds;
    }

    private void PersistNow()
    {
        _persistAt = null;
        if (_window is not { } window)
        {
            return;
        }

        var scale = DesktopWindowSizing.GetDisplayScale(window);
        var settings = _preferences.Current;
        // An attached chat takes its position from the main window, so only a free chat saves one.
        var position = IsAttached ? settings.Floating.Position : window.Position;
        _preferences.Save(settings with
        {
            Floating = new FloatingChatBounds(
                Mathf.RoundToInt(_size.X / scale),
                Mathf.RoundToInt(_size.Y / scale),
                position),
        });
    }

    private Rect2I MainRect()
    {
        return new Rect2I(_mainWindow.Position, _mainWindow.Size);
    }

    private static Rect2I WorkAreaOf(Rect2I bounds)
    {
        var screen = DisplayServer.GetScreenFromRect(new Rect2(bounds.Position, bounds.Size));
        return DisplayServer.ScreenGetUsableRect(
            screen == DisplayServer.InvalidScreen ? 0 : screen);
    }

    private static DisplayArea[] Displays()
    {
        var count = DisplayServer.GetScreenCount();
        var displays = new DisplayArea[count];
        for (var screen = 0; screen < count; screen++)
        {
            displays[screen] = new DisplayArea(
                new Rect2I(
                    DisplayServer.ScreenGetPosition(screen),
                    DisplayServer.ScreenGetSize(screen)),
                DisplayServer.ScreenGetUsableRect(screen));
        }

        return displays;
    }

    private static int ReturnMargin(Window window)
    {
        return Mathf.RoundToInt(ReturnMarginLogical * DesktopWindowSizing.GetDisplayScale(window));
    }

    private static Vector2I ToNative(Vector2I logical, float scale)
    {
        return new Vector2I(
            Mathf.RoundToInt(logical.X * scale),
            Mathf.RoundToInt(logical.Y * scale));
    }

    /// <summary>
    /// An anchor change in progress: the offset from the main window origin at the start and at the
    /// end.
    /// </summary>
    private sealed record Slide(Vector2I From, Vector2I To, ulong StartedAt);
}
