using System;

/// <summary>
/// Coordinates Godot-owned view state, scene application, and snapshots.
/// </summary>
public sealed class StageViewRuntime
{
    private const double SnapshotMinIntervalSeconds = 0.1;
    private const double IdleSnapshotSeconds = 0.25;

    private readonly StageViewController _controller;

    private double _idleSnapshotRemaining = -1;
    private double _snapshotRemaining;
    private bool _pendingIdleSnapshot;
    private bool _hasViewState;
    private string _pendingSnapshotReason;
    private string _pendingSnapshotRequestId;
    private StageViewState _state = StageViewStateRules.CreateDefault();

    public event Action<StageViewSnapshotPayload> SnapshotReady;

    public event Action<StageViewErrorPayload> ErrorReady;

    public StageViewRuntime(StageViewController controller)
    {
        _controller = controller;
    }

    public StageViewState State => _state;

    public bool HasViewState => _hasViewState;

    public void Process(double delta)
    {
        if (_snapshotRemaining > 0)
        {
            _snapshotRemaining -= delta;
        }

        if (!_pendingIdleSnapshot || _idleSnapshotRemaining < 0)
        {
            return;
        }

        _idleSnapshotRemaining -= delta;
        if (_idleSnapshotRemaining > 0)
        {
            return;
        }

        var reason = _pendingSnapshotReason ?? "local-input";
        var requestId = _pendingSnapshotRequestId;
        ClearPendingIdleSnapshot();
        EmitSnapshot(reason, requestId);
    }

    public void BootstrapForAvatar()
    {
        _state = StageViewStateRules.ApplyBootstrapCamera(
            _state,
            _controller.CreateBootstrapCameraPose(),
            CurrentUnixMilliseconds()
        );
        _hasViewState = true;
        _controller.Apply(_state);
        ClearPendingIdleSnapshot();
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
        if (!_hasViewState)
        {
            return;
        }

        EmitSnapshot("request", request.RequestId);
    }

    public void EmitLoadedSnapshot()
    {
        if (!_hasViewState)
        {
            return;
        }

        EmitSnapshot("loaded");
    }

    public StageViewSnapshotPayload CreateSnapshot(string reason, string requestId = null)
    {
        if (!_hasViewState)
        {
            return null;
        }

        return new StageViewSnapshotPayload(
            _state,
            reason,
            requestId,
            _controller.ResolveAvatarBounds()
        );
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
            if (!_hasViewState)
            {
                EmitError(
                    "view-state-unavailable",
                    "Godot stage view state is not available until scene input is applied.",
                    requestId
                );
                return;
            }

            _state = StageViewStateRules.ApplyPatch(_state, patch, CurrentUnixMilliseconds());
            _controller.Apply(_state);

            QueueIdleSnapshot(reason, requestId);
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

    private void QueueIdleSnapshot(string reason, string requestId)
    {
        _pendingIdleSnapshot = true;
        _idleSnapshotRemaining = IdleSnapshotSeconds;
        _pendingSnapshotReason = reason;
        _pendingSnapshotRequestId = requestId;
    }

    private void ClearPendingIdleSnapshot()
    {
        _pendingIdleSnapshot = false;
        _idleSnapshotRemaining = -1;
        _pendingSnapshotReason = null;
        _pendingSnapshotRequestId = null;
    }

    private void EmitSnapshot(string reason, string requestId = null)
    {
        var snapshot = CreateSnapshot(reason, requestId);
        if (snapshot != null)
        {
            SnapshotReady?.Invoke(snapshot);
        }
    }

    private void EmitError(string code, string message, string requestId = null)
    {
        ErrorReady?.Invoke(new StageViewErrorPayload(code, message, requestId));
    }

    private static long CurrentUnixMilliseconds() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
