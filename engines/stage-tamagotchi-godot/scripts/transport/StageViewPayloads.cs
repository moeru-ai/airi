using Godot;

/// <summary>
/// Three-dimensional numeric vector used by Godot stage view state.
/// </summary>
public sealed record StageViewVec3(double X, double Y, double Z)
{
    public Vector3 ToVector3() => new((float)X, (float)Y, (float)Z);

    public static StageViewVec3 FromVector3(Vector3 value) => new(value.X, value.Y, value.Z);
}

/// <summary>
/// Partial vector mutation sent by host-origin view-state patches.
/// </summary>
public sealed record StageViewVec3Patch(double? X = null, double? Y = null, double? Z = null);

/// <summary>
/// Camera pose portion of the Godot-owned stage view state.
/// </summary>
public sealed record StageCameraPoseState(
    StageViewVec3 Position,
    double YawDeg,
    double PitchDeg,
    double FovDeg
);

/// <summary>
/// Godot-owned view state for the current sidecar process.
/// </summary>
public sealed record StageViewState(
    int SchemaVersion,
    long Revision,
    long UpdatedAt,
    StageCameraPoseState Camera
);

/// <summary>
/// Runtime-only avatar bounds emitted with view snapshots for remote UI range decisions.
/// </summary>
public sealed record StageAvatarBoundsPayload(
    StageViewVec3 Center,
    StageViewVec3 Size,
    double MaxDimension
);

/// <summary>
/// Partial camera pose mutation.
/// </summary>
public sealed record StageCameraPosePatch(
    StageViewVec3Patch Position = null,
    double? YawDeg = null,
    double? PitchDeg = null,
    double? FovDeg = null
);

/// <summary>
/// Host-origin or local-input stage view-state mutation.
/// </summary>
public sealed record StageViewPatch(
    StageCameraPosePatch Camera = null
);

/// <summary>
/// Host-origin request to mutate Godot view state.
/// </summary>
public sealed record StageViewPatchRequestPayload(string RequestId, StageViewPatch Patch);

/// <summary>
/// Host-origin request to report the current Godot view-state snapshot.
/// </summary>
public sealed record StageViewSnapshotRequestPayload(string RequestId);

/// <summary>
/// Snapshot emitted by Godot after load, mutation, local input, or request.
/// </summary>
public sealed record StageViewSnapshotPayload(
    StageViewState State,
    string Reason,
    string RequestId = null,
    StageAvatarBoundsPayload AvatarBounds = null
);

/// <summary>
/// Error emitted by Godot for view-state validation or lifecycle failures.
/// </summary>
public sealed record StageViewErrorPayload(
    string Code,
    string Message,
    string RequestId = null
);
