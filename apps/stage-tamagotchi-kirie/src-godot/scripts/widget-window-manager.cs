using System.Text.Json;
using Eventa;
using GdKirie.EventaAdapter;
using Godot;

/// <summary>
/// Owns widget snapshots, reserved IDs, native windows, and monotonic expiry times.
/// All handlers and expiry checks run on the Godot main thread. Shutdown removes handlers before windows.
/// </summary>
internal sealed class WidgetWindowManager : IDisposable
{
    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly Dictionary<string, WidgetSnapshotPayload> _snapshots = new();
    private readonly Dictionary<string, WidgetWindow> _windows = new();
    private readonly Dictionary<string, ulong> _deadlines = new();
    private readonly HashSet<string> _reserved = new();
    private readonly IDisposable _registration;
    private readonly List<string> _expired = new();
    private bool _disposed;

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
        _registration = Attach(context);
    }

    public IDisposable Attach(IEventContext context) => Attach(context, null);

    private IDisposable Attach(IEventContext context, string? rendererWidgetId)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        return new Registrations([
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
                    if (id == rendererWidgetId && _windows.TryGetValue(id, out WidgetWindow? window))
                    {
                        window.MarkRendererMounted();
                    }

                    return Task.FromResult(_snapshots.GetValueOrDefault(id));
                }),
            context.RegisterInvokeHandler(WidgetContracts.Prepare,
                (WidgetIdPayload payload, CancellationToken _) => Task.FromResult(Prepare(payload.Id))),
            context.RegisterInvokeHandler(WidgetContracts.Open,
                (WidgetIdPayload payload, CancellationToken _) => Complete(() => Open(string.IsNullOrWhiteSpace(payload.Id) ? Prepare("default") : payload.Id))),
            context.RegisterInvokeHandler(WidgetContracts.Hide,
                (WidgetIdPayload payload, CancellationToken _) => Complete(() => _windows.GetValueOrDefault(RequireId(payload.Id))?.Hide())),
            context.RegisterInvokeHandler(WidgetContracts.Remove,
                (WidgetIdPayload payload, CancellationToken _) => Complete(() => Remove(RequireId(payload.Id)))),
            context.RegisterInvokeHandler(WidgetContracts.Clear,
                (EmptyPayload _, CancellationToken _) => Complete(Clear)),
        ]);
    }

    public void Process()
    {
        ulong now = Time.GetTicksMsec();
        _expired.Clear();
        foreach (var pair in _deadlines)
        {
            if (pair.Value <= now)
            {
                _expired.Add(pair.Key);
            }
        }

        foreach (string id in _expired)
        {
            Remove(id);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _registration.Dispose();
        Clear();
    }

    private string Prepare(string? id)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        string resolved = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id;
        _reserved.Add(resolved);
        return resolved;
    }

    private string Add(WidgetMutationPayload payload)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (string.IsNullOrWhiteSpace(payload.ComponentName))
        {
            throw new ArgumentException("A widget requires a component name.");
        }

        ValidateTtl(payload.TtlMs);
        string id = Prepare(payload.Id);
        _snapshots[id] = new WidgetSnapshotPayload(
            id, payload.ComponentName, payload.ComponentProps ?? new(),
            payload.AlwaysOnTop ?? false,
            payload.Size ?? JsonSerializer.SerializeToElement("m", WidgetJsonContext.Default.String),
            payload.WindowSize, payload.TtlMs ?? 0);
        Schedule(id, payload.TtlMs ?? 0);
        Open(id);
        return id;
    }

    private void Update(WidgetMutationPayload payload)
    {
        string id = RequireId(payload.Id);
        if (!_snapshots.TryGetValue(id, out WidgetSnapshotPayload? snapshot))
        {
            throw new ArgumentException($"Unknown widget: {id}");
        }

        ValidateTtl(payload.TtlMs);
        snapshot = snapshot with
        {
            ComponentProps = payload.ComponentProps ?? snapshot.ComponentProps,
            AlwaysOnTop = payload.AlwaysOnTop ?? snapshot.AlwaysOnTop,
            Size = payload.Size ?? snapshot.Size,
            WindowSize = payload.WindowSize ?? snapshot.WindowSize,
            TtlMs = payload.TtlMs ?? snapshot.TtlMs,
        };
        _snapshots[id] = snapshot;
        if (payload.TtlMs is { } ttl)
        {
            Schedule(id, ttl);
        }

        _windows.GetValueOrDefault(id)?.Present(snapshot, show: false);
    }

    private void Schedule(string id, double ttl)
    {
        _deadlines.Remove(id);
        if (ttl > 0)
        {
            _deadlines[id] = Time.GetTicksMsec() + (ulong)ttl;
        }
    }

    private void Open(string id)
    {
        if (!_reserved.Contains(id))
        {
            throw new ArgumentException($"Unknown widget: {id}");
        }

        WidgetSnapshotPayload? snapshot = _snapshots.GetValueOrDefault(id);
        if (!_windows.TryGetValue(id, out WidgetWindow? widget))
        {
            var scene = ResourceLoader.Load<PackedScene>("res://src-godot/widget-window.tscn");
            var window = scene.Instantiate<Window>();
            _owner.AddChild(window);
            window.CurrentScreen = _mainWindow.CurrentScreen;
            DesktopWindowSizing.ApplyInitialDisplayScale(window);
            DesktopWindowSizing.MoveToUsableCenter(window);
            try
            {
                widget = new WidgetWindow(window, _registry, _rendererUrl, id,
                    _microphonePermissions, Attach, () => Remove(id));
                _windows[id] = widget;
            }
            catch
            {
                window.QueueFree();
                throw;
            }
        }

        if (snapshot is not null)
        {
            widget.Present(snapshot, show: true);
        }
        else
        {
            widget.Show();
        }
    }

    private void Remove(string id)
    {
        _snapshots.Remove(id);
        _reserved.Remove(id);
        _deadlines.Remove(id);
        if (_windows.Remove(id, out WidgetWindow? window))
        {
            window.Dispose();
        }
    }

    private void Clear()
    {
        foreach (string id in _reserved.ToArray())
        {
            Remove(id);
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

    private static Task<EmptyPayload> Complete(Action action)
    {
        action();
        return Task.FromResult(new EmptyPayload());
    }

    private sealed class Registrations : IDisposable
    {
        private readonly IDisposable[] _registrations;

        public Registrations(IDisposable[] registrations)
        {
            _registrations = registrations;
        }

        public void Dispose()
        {
            foreach (IDisposable registration in _registrations)
            {
                registration.Dispose();
            }
        }
    }
}
