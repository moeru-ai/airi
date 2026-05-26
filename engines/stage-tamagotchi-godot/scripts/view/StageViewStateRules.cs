using System;

/// <summary>
/// Validation, defaults, clamping, and patch merge rules for Godot stage view state.
/// </summary>
public static class StageViewStateRules
{
    public const double CameraMinPitchDeg = -80;
    public const double CameraMaxPitchDeg = 80;
    public const double CameraMinFovDeg = 10;
    public const double CameraMaxFovDeg = 120;

    public static StageViewState CreateDefault() => new(
        1,
        0,
        0,
        new StageCameraPoseState(
            new StageViewVec3(0, 1.4, 3.5),
            0,
            -10,
            40
        )
    );

    public static bool HasMutation(StageViewPatch patch)
    {
        if (patch == null)
        {
            return false;
        }

        return HasVec3Mutation(patch.Camera?.Position)
            || patch.Camera?.YawDeg != null
            || patch.Camera?.PitchDeg != null
            || patch.Camera?.FovDeg != null;
    }

    public static StageViewState ApplyPatch(StageViewState current, StageViewPatch patch, long updatedAt)
    {
        if (!HasMutation(patch))
        {
            throw new InvalidOperationException("View patch must include at least one field.");
        }

        var camera = current.Camera;
        if (patch.Camera != null)
        {
            camera = new StageCameraPoseState(
                ApplyVec3Patch(camera.Position, patch.Camera.Position),
                patch.Camera.YawDeg ?? camera.YawDeg,
                patch.Camera.PitchDeg ?? camera.PitchDeg,
                patch.Camera.FovDeg ?? camera.FovDeg
            );
        }

        return CommitCamera(current, camera, updatedAt);
    }

    public static StageViewState ApplyBootstrapCamera(
        StageViewState current,
        StageCameraPoseState camera,
        long updatedAt
    )
    {
        return CommitCamera(current, camera, updatedAt);
    }

    public static StageViewState Normalize(StageViewState state)
    {
        return state with
        {
            SchemaVersion = 1,
            Camera = state.Camera with
            {
                YawDeg = NormalizeDegrees(state.Camera.YawDeg),
                PitchDeg = Clamp(state.Camera.PitchDeg, CameraMinPitchDeg, CameraMaxPitchDeg),
                FovDeg = Clamp(state.Camera.FovDeg, CameraMinFovDeg, CameraMaxFovDeg),
            },
        };
    }

    public static double ClampCameraPitch(double value) =>
        Clamp(value, CameraMinPitchDeg, CameraMaxPitchDeg);

    private static StageViewState CommitCamera(
        StageViewState current,
        StageCameraPoseState camera,
        long updatedAt
    )
    {
        return Normalize(current with
        {
            Revision = current.Revision + 1,
            UpdatedAt = updatedAt,
            Camera = camera,
        });
    }

    private static StageViewVec3 ApplyVec3Patch(StageViewVec3 current, StageViewVec3Patch patch)
    {
        if (patch == null)
        {
            return current;
        }

        return new StageViewVec3(
            patch.X ?? current.X,
            patch.Y ?? current.Y,
            patch.Z ?? current.Z
        );
    }

    private static bool HasVec3Mutation(StageViewVec3Patch patch)
    {
        return patch?.X != null || patch?.Y != null || patch?.Z != null;
    }

    private static double Clamp(double value, double min, double max)
    {
        return Math.Min(max, Math.Max(min, value));
    }

    private static double NormalizeDegrees(double value)
    {
        var normalized = value % 360;

        if (normalized > 180)
        {
            normalized -= 360;
        }

        if (normalized < -180)
        {
            normalized += 360;
        }

        return normalized;
    }
}
