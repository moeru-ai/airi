using System;

/// <summary>
/// Coordinates Godot-owned view state, scene application, persistence, and snapshots.
/// </summary>
public sealed class StageViewRuntime
{
    private const double SnapshotMinIntervalSeconds = 0.1;
    private const double PersistIdleSeconds = 0.25;

    private readonly StageViewController _controller;
    private readonly StageViewStateStore _store;

    private double _persistIdleRemaining = -1;
    private double _snapshotRemaining;
    private bool _pendingPersist;
    private string _pendingPersistReason;
    private string _pendingPersistRequestId;
    private StageViewState _state = StageViewStateRules.CreateDefault();

    public event Action<StageViewSnapshotPayload> SnapshotReady;

    public event Action<StageViewErrorPayload> ErrorReady;

    public StageViewRuntime(StageViewStateStore store, StageViewController controller)
    {
        _store = store;
        _controller = controller;
    }

    public StageViewState State => _state;

    public void Initialize()
    {
        var loadResult = _store.Load();
        _state = loadResult.State;
        _controller.Apply(_state);

        if (!string.IsNullOrWhiteSpace(loadResult.ErrorMessage))
        {
            EmitError("invalid-state-file", loadResult.ErrorMessage);
        }

        EmitSnapshot("loaded");
    }

    public void Process(double delta)
    {
        if (_snapshotRemaining > 0)
        {
            _snapshotRemaining -= delta;
        }

        if (!_pendingPersist || _persistIdleRemaining < 0)
        {
            return;
        }

        _persistIdleRemaining -= delta;
        if (_persistIdleRemaining > 0)
        {
            return;
        }

        var reason = _pendingPersistReason ?? "local-input";
        var requestId = _pendingPersistRequestId;

        if (!PersistCurrentState(reason, requestId))
        {
            _persistIdleRemaining = PersistIdleSeconds;
            return;
        }

        ClearPendingPersist();
        EmitSnapshot(reason, requestId);
    }

    public void BootstrapForAvatar()
    {
        _state = StageViewStateRules.ApplyBootstrapCamera(
            _state,
            _controller.CreateBootstrapCameraPose(),
            CurrentUnixMilliseconds()
        );
        _controller.Apply(_state);
        QueueIdlePersist("loaded", null);
        EmitSnapshot("loaded");
    }

    public void ApplyRemotePatch(StageViewPatchRequestPayload request)
    {
        ApplyMutation(request.Patch, "remote-patch", request.RequestId);
    }

    public void ApplyLocalPatch(StageViewPatch patch)
    {
        ApplyMutation(patch, "local-input", null);
    }

    public void RequestSnapshot(StageViewSnapshotRequestPayload request)
    {
        EmitSnapshot("request", request.RequestId);
    }

    public void FlushForShutdown()
    {
        if (_pendingPersist)
        {
            if (!PersistCurrentState("shutdown-flush"))
            {
                return;
            }

            ClearPendingPersist();
        }

        EmitSnapshot("shutdown-flush");
    }

    public void EmitInvalidPayload(string message, string requestId = null)
    {
        EmitError("invalid-payload", message, requestId);
    }

    private void ApplyMutation(
        StageViewPatch patch,
        string reason,
        string requestId
    )
    {
        try
        {
            _state = StageViewStateRules.ApplyPatch(_state, patch, CurrentUnixMilliseconds());
            _controller.Apply(_state);

            QueueIdlePersist(reason, requestId);
            if (_snapshotRemaining <= 0)
            {
                _snapshotRemaining = SnapshotMinIntervalSeconds;
                EmitSnapshot(reason, requestId);
            }
        }
        catch (Exception error)
        {
            EmitError("invalid-payload", error.Message, requestId);
        }
    }

    private void QueueIdlePersist(string reason, string requestId)
    {
        _pendingPersist = true;
        _persistIdleRemaining = PersistIdleSeconds;
        _pendingPersistReason = reason;
        _pendingPersistRequestId = requestId;
    }

    private bool PersistCurrentState(string reason, string requestId = null)
    {
        try
        {
            _store.Save(_state);
            return true;
        }
        catch (Exception error)
        {
            EmitError("persistence-failed", $"Failed to persist {reason}: {error.Message}", requestId);
            return false;
        }
    }

    private void ClearPendingPersist()
    {
        _pendingPersist = false;
        _persistIdleRemaining = -1;
        _pendingPersistReason = null;
        _pendingPersistRequestId = null;
    }

    private void EmitSnapshot(string reason, string requestId = null)
    {
        SnapshotReady?.Invoke(new StageViewSnapshotPayload(
            _state,
            reason,
            requestId,
            _controller.ResolveAvatarBounds()
        ));
    }

    private void EmitError(string code, string message, string requestId = null)
    {
        ErrorReady?.Invoke(new StageViewErrorPayload(code, message, requestId));
    }

    private static long CurrentUnixMilliseconds() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
