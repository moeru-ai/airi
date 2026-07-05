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
/// Host-origin diagnostic request to save the current stage viewport as a PNG.
/// </summary>
public sealed record StageViewCapturePngRequestPayload(
    string RequestId,
    string Path,
    int SettleFrames
);

/// <summary>
/// Host-origin request to display a render pipeline diagnostic stage in the final window.
/// </summary>
public sealed record StageRenderDebugViewRequestPayload(string RequestId, string View);

/// <summary>
/// Host-origin diagnostic request to enable or bypass the avatar edge-light stage.
/// </summary>
public sealed record StageRenderAvatarEdgeLightRequestPayload(string RequestId, bool Enabled);

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

/// <summary>
/// Diagnostic PNG capture emitted after Godot writes the current viewport image.
/// </summary>
public sealed record StageViewCapturePngPayload(
    string RequestId,
    string Path,
    int Width,
    int Height
);

/// <summary>
/// Acknowledgement emitted after Godot applies a render pipeline diagnostic stage.
/// </summary>
public sealed record StageRenderDebugViewPayload(string RequestId, string View);

/// <summary>
/// Acknowledgement emitted after Godot applies the avatar edge-light diagnostic toggle.
/// </summary>
public sealed record StageRenderAvatarEdgeLightPayload(string RequestId, bool Enabled);
