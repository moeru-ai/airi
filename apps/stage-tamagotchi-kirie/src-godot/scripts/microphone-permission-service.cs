using Eventa;
using Godot;

internal enum MicrophonePermissionState
{
    NotDetermined,
    Granted,
    Denied,
}

internal sealed class MicrophonePermissionCoordinator : IDisposable
{
    private readonly List<Action<bool>> _pending = [];
    private readonly ulong _promptTimeoutMilliseconds;
    private string? _promptId;
    private ulong _promptStartedAt;
    private bool _disposed;

    public MicrophonePermissionCoordinator(
        MicrophonePermissionState initialState,
        TimeSpan promptTimeout)
    {
        State = initialState;
        _promptTimeoutMilliseconds = checked((ulong)promptTimeout.TotalMilliseconds);
    }

    public MicrophonePermissionState State { get; private set; }
    public string? PromptId => _promptId;

    public bool HasPrompt(string promptId)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        return _promptId is not null && StringComparer.Ordinal.Equals(_promptId, promptId);
    }

    public MicrophonePermissionPromptPayload? Request(
        Action<bool> resolve,
        ulong nowMilliseconds)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (State != MicrophonePermissionState.NotDetermined)
        {
            resolve(State == MicrophonePermissionState.Granted);
            return null;
        }

        _pending.Add(resolve);
        if (_promptId is not null)
        {
            return null;
        }

        _promptId = Guid.NewGuid().ToString("N");
        _promptStartedAt = nowMilliseconds;
        return new MicrophonePermissionPromptPayload("microphone", _promptId);
    }

    public string Resolve(string promptId, MicrophonePermissionState decision)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (decision == MicrophonePermissionState.NotDetermined)
        {
            throw new ArgumentException("A permission prompt requires a grant or deny decision.", nameof(decision));
        }

        if (_promptId is null || !StringComparer.Ordinal.Equals(_promptId, promptId))
        {
            throw new ArgumentException("The permission decision does not match the active prompt.", nameof(promptId));
        }

        State = decision;
        return CompletePending(decision == MicrophonePermissionState.Granted)!;
    }

    public string? Reset()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        State = MicrophonePermissionState.NotDetermined;
        return CompletePending(granted: false);
    }

    public string? Expire(ulong nowMilliseconds)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_promptId is null
            || nowMilliseconds - _promptStartedAt < _promptTimeoutMilliseconds)
        {
            return null;
        }

        return CompletePending(granted: false);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        CompletePending(granted: false);
    }

    private string? CompletePending(bool granted)
    {
        var completedPromptId = _promptId;
        _promptId = null;
        _promptStartedAt = 0;

        foreach (var resolve in _pending)
        {
            resolve(granted);
        }

        _pending.Clear();
        return completedPromptId;
    }
}

internal sealed class MicrophonePermissionStore
{
    private const string ConfigPath = "user://permissions.cfg";
    private const string Section = "media";
    private const string Key = "microphone";

    public MicrophonePermissionState Load()
    {
        if (!Godot.FileAccess.FileExists(ConfigPath))
        {
            return MicrophonePermissionState.NotDetermined;
        }

        var config = new ConfigFile();
        var error = config.Load(ConfigPath);
        if (error != Error.Ok)
        {
            GD.PushWarning($"Could not load microphone permission state: {error}.");
            return MicrophonePermissionState.NotDetermined;
        }

        var stored = config.GetValue(Section, Key, "not-determined").AsString();
        if (TryParse(stored, out var state))
        {
            return state;
        }

        GD.PushWarning("Ignoring an invalid persisted microphone permission state.");
        return MicrophonePermissionState.NotDetermined;
    }

    public void Save(MicrophonePermissionState state)
    {
        var config = new ConfigFile();
        if (Godot.FileAccess.FileExists(ConfigPath))
        {
            var loadError = config.Load(ConfigPath);
            if (loadError != Error.Ok)
            {
                throw new InvalidOperationException(
                    $"Could not load the permission configuration before saving: {loadError}.");
            }
        }

        config.SetValue(Section, Key, Serialize(state));
        var saveError = config.Save(ConfigPath);
        if (saveError != Error.Ok)
        {
            throw new InvalidOperationException(
                $"Could not save the microphone permission state: {saveError}.");
        }
    }

    public static string Serialize(MicrophonePermissionState state)
    {
        return state switch
        {
            MicrophonePermissionState.NotDetermined => "not-determined",
            MicrophonePermissionState.Granted => "granted",
            MicrophonePermissionState.Denied => "denied",
            _ => throw new ArgumentOutOfRangeException(nameof(state)),
        };
    }

    public static bool TryParse(string value, out MicrophonePermissionState state)
    {
        state = value switch
        {
            "not-determined" => MicrophonePermissionState.NotDetermined,
            "granted" => MicrophonePermissionState.Granted,
            "denied" => MicrophonePermissionState.Denied,
            _ => default,
        };
        return value is "not-determined" or "granted" or "denied";
    }
}

internal sealed class MicrophonePermissionService : IDisposable
{
    private static readonly TimeSpan PromptTimeout = TimeSpan.FromMinutes(2);

    private readonly HashSet<PermissionBinding> _bindings = [];
    private readonly MicrophonePermissionStore _store;
    private readonly MicrophonePermissionCoordinator _coordinator;
    private PermissionBinding? _promptBinding;
    private bool _disposed;

    public MicrophonePermissionService()
    {
        _store = new MicrophonePermissionStore();
        _coordinator = new MicrophonePermissionCoordinator(_store.Load(), PromptTimeout);
    }

    public IDisposable Attach(IEventContext context, bool ownsPrompt = false)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (ownsPrompt && _promptBinding is not null)
        {
            throw new InvalidOperationException("Only the main renderer can own permission prompts.");
        }

        var binding = new PermissionBinding(this, context, ownsPrompt);
        _bindings.Add(binding);
        if (ownsPrompt)
        {
            _promptBinding = binding;
        }

        return binding;
    }

    public void Request(Action<bool> resolve)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var prompt = _coordinator.Request(resolve, Time.GetTicksMsec());
        if (prompt is null)
        {
            return;
        }

        var promptBinding = _promptBinding;
        if (promptBinding is null || !promptBinding.IsActive)
        {
            _coordinator.Reset();
            return;
        }

        promptBinding.Context.Emit(AiriDesktopEvents.MicrophonePermissionPromptRequested, prompt);
    }

    public void Process()
    {
        if (_disposed)
        {
            return;
        }

        var promptId = _coordinator.Expire(Time.GetTicksMsec());
        if (promptId is not null)
        {
            DismissPrompt(promptId);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        foreach (var binding in _bindings.ToArray())
        {
            binding.Dispose();
        }

        _coordinator.Dispose();
    }

    private MicrophonePermissionStatePayload GetState()
    {
        return CreateStatePayload(_coordinator.State);
    }

    private MicrophonePermissionPromptSnapshotPayload GetPrompt()
    {
        return new MicrophonePermissionPromptSnapshotPayload(
            "microphone",
            _coordinator.PromptId);
    }

    private MicrophonePermissionStatePayload Reset()
    {
        _store.Save(MicrophonePermissionState.NotDetermined);
        var promptId = _coordinator.Reset();
        BroadcastState();
        if (promptId is not null)
        {
            DismissPrompt(promptId);
        }

        return GetState();
    }

    private void Resolve(MicrophonePermissionDecisionPayload payload)
    {
        if (!MicrophonePermissionStore.TryParse(payload.Decision, out var decision)
            || decision == MicrophonePermissionState.NotDetermined)
        {
            throw new ArgumentException("The microphone permission decision is invalid.", nameof(payload));
        }

        if (!_coordinator.HasPrompt(payload.PromptId))
        {
            throw new ArgumentException(
                "The permission decision does not match the active prompt.",
                nameof(payload));
        }

        _store.Save(decision);
        var promptId = _coordinator.Resolve(payload.PromptId, decision);
        BroadcastState();
        DismissPrompt(promptId);
    }

    private void BroadcastState()
    {
        var payload = GetState();
        foreach (var binding in _bindings.ToArray())
        {
            if (binding.IsActive)
            {
                binding.Context.Emit(AiriDesktopEvents.MicrophonePermissionStateChanged, payload);
            }
        }
    }

    private void DismissPrompt(string promptId)
    {
        if (_promptBinding is { IsActive: true } promptBinding)
        {
            promptBinding.Context.Emit(
                AiriDesktopEvents.MicrophonePermissionPromptDismissed,
                new MicrophonePermissionPromptDismissedPayload(promptId));
        }
    }

    private void Detach(PermissionBinding binding)
    {
        _bindings.Remove(binding);
        if (_promptBinding != binding)
        {
            return;
        }

        _promptBinding = null;
        if (!_disposed)
        {
            _coordinator.Reset();
        }
    }

    private static MicrophonePermissionStatePayload CreateStatePayload(
        MicrophonePermissionState state)
    {
        return new MicrophonePermissionStatePayload(
            "microphone",
            MicrophonePermissionStore.Serialize(state));
    }

    private sealed class PermissionBinding : IDisposable
    {
        private readonly MicrophonePermissionService _service;
        private readonly IDisposable _getStateRegistration;
        private readonly IDisposable _getPromptRegistration;
        private readonly IDisposable _resetRegistration;
        private readonly IDisposable? _resolveRegistration;
        private int _disposeState;

        public PermissionBinding(
            MicrophonePermissionService service,
            IEventContext context,
            bool ownsPrompt)
        {
            _service = service;
            Context = context;
            _getStateRegistration = context.RegisterInvokeHandler(
                AiriDesktopEvents.GetMicrophonePermissionState,
                (EmptyPayload _, CancellationToken _) => Task.FromResult(service.GetState()));
            _getPromptRegistration = context.RegisterInvokeHandler(
                AiriDesktopEvents.GetMicrophonePermissionPrompt,
                (EmptyPayload _, CancellationToken _) => Task.FromResult(service.GetPrompt()));
            _resetRegistration = context.RegisterInvokeHandler(
                AiriDesktopEvents.ResetMicrophonePermission,
                (EmptyPayload _, CancellationToken _) => Task.FromResult(service.Reset()));

            if (ownsPrompt)
            {
                _resolveRegistration = context.RegisterInvokeHandler(
                    AiriDesktopEvents.ResolveMicrophonePermissionPrompt,
                    (MicrophonePermissionDecisionPayload payload, CancellationToken _) =>
                    {
                        service.Resolve(payload);
                        return Task.FromResult(new EmptyPayload());
                    });
            }
        }

        public IEventContext Context { get; }
        public bool IsActive => _disposeState == 0;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposeState, 1) != 0)
            {
                return;
            }

            _resolveRegistration?.Dispose();
            _resetRegistration.Dispose();
            _getPromptRegistration.Dispose();
            _getStateRegistration.Dispose();
            _service.Detach(this);
        }
    }
}
