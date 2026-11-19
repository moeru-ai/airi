using System.Text.Json;
using Eventa;
using GdKirie.EventaAdapter;
using Godot;

/// <summary>
/// Owns widget snapshots, reserved IDs, native windows, and monotonic expiry times.
/// Each reserved ID owns one state record, with an optional snapshot, window, and expiry time.
/// All handlers and expiry checks run on the Godot main thread. Shutdown removes handlers before windows.
/// </summary>
internal sealed class WidgetWindowManager : IDisposable
{
    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly Dictionary<string, WidgetState> _widgets = new();
    private readonly Action _detach;

    public WidgetWindowManager(
        IEventContext context, Node owner, Window mainWindow,
        KirieEventaJsonRegistry registry, string rendererUrl,
        MicrophonePermissionService microphonePermissions)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
        _detach = Attach(context);
    }

    public Action Attach(IEventContext context, string? rendererWidgetId = null)
    {
        IDisposable[] registrations = [
            context.Subscribe(WidgetContracts.CloseRequested, message =>
            {
                // Only a widget renderer can close itself through this event.
                if (rendererWidgetId is not null && message.Body.Id == rendererWidgetId)
                {
                    Remove(rendererWidgetId);
                }
            }),
            context.RegisterInvokeHandler(WidgetContracts.Add,
                (WidgetMutationPayload payload, CancellationToken _) => Task.FromResult(Add(payload))),
            context.RegisterInvokeHandler(WidgetContracts.Update,
                (WidgetMutationPayload payload, CancellationToken _) => Complete(() => Update(payload))),
            context.RegisterInvokeHandler(WidgetContracts.Fetch,
                (WidgetIdPayload payload, CancellationToken _) =>
                {
                    string id = RequireId(payload.Id);
                    _widgets.TryGetValue(id, out WidgetState? widget);
                    if (id == rendererWidgetId)
                    {
                        widget?.Window?.MarkRendererMounted();
                    }

                    return Task.FromResult(widget?.Snapshot);
                }),
            context.RegisterInvokeHandler(WidgetContracts.Prepare,
                (WidgetIdPayload payload, CancellationToken _) => Task.FromResult(Prepare(payload.Id))),
            context.RegisterInvokeHandler(WidgetContracts.Open,
                (WidgetIdPayload payload, CancellationToken _) => Complete(() => Open(string.IsNullOrWhiteSpace(payload.Id) ? Prepare("default") : payload.Id))),
            context.RegisterInvokeHandler(WidgetContracts.Hide,
                (WidgetIdPayload payload, CancellationToken _) => Complete(() => _widgets.GetValueOrDefault(RequireId(payload.Id))?.Window?.Hide())),
            context.RegisterInvokeHandler(WidgetContracts.Remove,
                (WidgetIdPayload payload, CancellationToken _) => Complete(() => Remove(RequireId(payload.Id)))),
            context.RegisterInvokeHandler(WidgetContracts.Clear,
                (EmptyPayload _, CancellationToken _) => Complete(Clear)),
        ];
        return () =>
        {
            foreach (IDisposable registration in registrations)
            {
                registration.Dispose();
            }
        };
    }

    public void Process()
    {
        ulong now = Time.GetTicksMsec();
        foreach (var pair in _widgets)
        {
            if (pair.Value.ExpiresAt is { } deadline && deadline <= now)
            {
                Remove(pair.Key);
            }
        }
    }

    public void Dispose()
    {
        _detach();
        Clear();
    }

    private string Prepare(string? id)
    {
        string resolved = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id;
        if (!_widgets.ContainsKey(resolved))
        {
            _widgets.Add(resolved, new WidgetState());
        }
        return resolved;
    }

    private string Add(WidgetMutationPayload payload)
    {
        if (string.IsNullOrWhiteSpace(payload.ComponentName))
        {
            throw new ArgumentException("A widget requires a component name.");
        }

        ValidateTtl(payload.TtlMs);
        string id = Prepare(payload.Id);
        WidgetState widget = _widgets[id];
        widget.Snapshot = new WidgetSnapshotPayload(
            id, payload.ComponentName, payload.ComponentProps ?? new(),
            payload.AlwaysOnTop ?? false,
            payload.Size ?? JsonSerializer.SerializeToElement("m", WidgetJsonContext.Default.String),
            payload.WindowSize, payload.TtlMs ?? 0);
        Schedule(widget, payload.TtlMs ?? 0);
        Open(id);
        return id;
    }

    private void Update(WidgetMutationPayload payload)
    {
        string id = RequireId(payload.Id);
        if (!_widgets.TryGetValue(id, out WidgetState? widget) || widget.Snapshot is not { } snapshot)
        {
            throw new ArgumentException($"Unknown widget: {id}");
        }

        ValidateTtl(payload.TtlMs);
        widget.Snapshot = snapshot with
        {
            ComponentProps = payload.ComponentProps ?? snapshot.ComponentProps,
            AlwaysOnTop = payload.AlwaysOnTop ?? snapshot.AlwaysOnTop,
            Size = payload.Size ?? snapshot.Size,
            WindowSize = payload.WindowSize ?? snapshot.WindowSize,
            TtlMs = payload.TtlMs ?? snapshot.TtlMs,
        };
        if (payload.TtlMs is { } ttl)
        {
            Schedule(widget, ttl);
        }

        widget.Window?.Present(widget.Snapshot);
    }

    private static void Schedule(WidgetState widget, double ttl)
    {
        widget.ExpiresAt = ttl > 0 ? Time.GetTicksMsec() + (ulong)ttl : null;
    }

    private void Open(string id)
    {
        if (!_widgets.TryGetValue(id, out WidgetState? widget))
        {
            throw new ArgumentException($"Unknown widget: {id}");
        }

        if (widget.Window is null)
        {
            var scene = ResourceLoader.Load<PackedScene>("res://src-godot/widget-window.tscn");
            var window = scene.Instantiate<Window>();
            _owner.AddChild(window);
            window.CurrentScreen = _mainWindow.CurrentScreen;
            DesktopWindowSizing.ApplyInitialDisplayScale(window);
            DesktopWindowSizing.MoveToUsableCenter(window);
            try
            {
                widget.Window = new WidgetWindow(window, _registry, _rendererUrl, id,
                    _microphonePermissions, this);
                void OnWindowClosed()
                {
                    // A queued window can exit after another widget reuses its ID.
                    if (_widgets.GetValueOrDefault(id) == widget)
                    {
                        Remove(id);
                    }
                }

                window.CloseRequested += OnWindowClosed;
                window.TreeExiting += OnWindowClosed;
            }
            catch
            {
                window.QueueFree();
                throw;
            }
        }

        if (widget.Snapshot is { } snapshot)
        {
            widget.Window.Present(snapshot);
        }
        widget.Window.Show();
    }

    private void Remove(string id)
    {
        // Remove the state before disposal, because QueueFree also triggers TreeExiting.
        if (_widgets.Remove(id, out WidgetState? widget))
        {
            widget.Window?.Dispose();
        }
    }

    private void Clear()
    {
        foreach (var pair in _widgets)
        {
            Remove(pair.Key);
        }
    }

    private static string RequireId(string? id) =>
        !string.IsNullOrWhiteSpace(id) ? id : throw new ArgumentException("A widget ID is required.");

    private static void ValidateTtl(double? ttl)
    {
        if (ttl is { } value && (!double.IsFinite(value) || value < 0 || value > uint.MaxValue))
        {
            throw new ArgumentOutOfRangeException(nameof(ttl), "Widget expiry must be between zero and 4294967295 milliseconds.");
        }
    }

    private sealed class WidgetState
    {
        public WidgetSnapshotPayload? Snapshot { get; set; }
        public WidgetWindow? Window { get; set; }
        public ulong? ExpiresAt { get; set; }
    }

    private static Task<EmptyPayload> Complete(Action action)
    {
        action();
        return Task.FromResult(new EmptyPayload());
    }
}
