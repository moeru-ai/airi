using System;
using Godot;

/// <summary>
/// Applies absolute camera pose state and derives camera-local movement vectors.
/// </summary>
public sealed class StageCameraPoseController
{
    private const double BootstrapCameraFovDeg = 40;
    private const float BootstrapDistanceMargin = 1.15f;
    private const float BootstrapMinDistance = 1.0f;
    private const float MinScreenPanDepth = 0.1f;

    private static readonly Vector3 DefaultOrbitCenter = new(0, 1.2f, 0);
    private static readonly Vector3 DefaultAvatarSize = new(1, 1.8f, 1);

    private readonly Camera3D _camera;

    private bool _hasAvatarBounds;
    private Vector3 _avatarBoundsCenter = DefaultOrbitCenter;
    private Vector3 _avatarBoundsSize = DefaultAvatarSize;

    public StageCameraPoseController(Camera3D camera)
    {
        _camera = camera;
    }

    public void UseAvatar(Node avatar)
    {
        if (!TryResolveAvatarBounds(avatar, out var center, out var size))
        {
            _hasAvatarBounds = false;
            _avatarBoundsCenter = DefaultOrbitCenter;
            _avatarBoundsSize = DefaultAvatarSize;
            return;
        }

        _hasAvatarBounds = true;
        _avatarBoundsCenter = center;
        _avatarBoundsSize = size;
    }

    public void Apply(StageCameraPoseState state)
    {
        _camera.GlobalPosition = state.Position.ToVector3();
        _camera.RotationDegrees = new Vector3((float)state.PitchDeg, (float)state.YawDeg, 0);
        _camera.Fov = (float)state.FovDeg;
    }

    public StageCameraPoseState CreateBootstrapPose()
    {
        var center = _hasAvatarBounds ? _avatarBoundsCenter : DefaultOrbitCenter;
        var size = _hasAvatarBounds ? _avatarBoundsSize : DefaultAvatarSize;
        var target = center + new Vector3(0, size.Y / 5, 0);
        var distance = ResolveBootstrapDistance(size, BootstrapCameraFovDeg);
        var position = new Vector3(target.X, target.Y + size.Y / 8, target.Z + distance);

        return new StageCameraPoseState(
            StageViewVec3.FromVector3(position),
            0,
            ResolvePitchDeg(position, target),
            BootstrapCameraFovDeg
        );
    }

    public StageAvatarBoundsPayload ResolveAvatarBounds()
    {
        if (!_hasAvatarBounds)
        {
            return null;
        }

        var maxDimension = Math.Max(
            _avatarBoundsSize.X,
            Math.Max(_avatarBoundsSize.Y, _avatarBoundsSize.Z)
        );
        return new StageAvatarBoundsPayload(
            StageViewVec3.FromVector3(_avatarBoundsCenter),
            StageViewVec3.FromVector3(_avatarBoundsSize),
            maxDimension
        );
    }

    public StageViewVec3 ResolveOrbitCenter()
    {
        if (!_hasAvatarBounds)
        {
            return StageViewVec3.FromVector3(DefaultOrbitCenter);
        }

        return StageViewVec3.FromVector3(_avatarBoundsCenter);
    }

    private static bool TryResolveAvatarBounds(Node avatar, out Vector3 center, out Vector3 size)
    {
        center = DefaultOrbitCenter;
        size = Vector3.Zero;

        if (avatar == null)
        {
            return false;
        }

        var hasBounds = false;
        var min = Vector3.Zero;
        var max = Vector3.Zero;
        AccumulateMeshBounds(avatar, ref hasBounds, ref min, ref max);

        if (!hasBounds)
        {
            return false;
        }

        center = (min + max) * 0.5f;
        size = max - min;
        return true;
    }

    public StageViewPatch CreateOrbitPatch(StageCameraPoseState state, double yawDeltaDeg, double pitchDeltaDeg)
    {
        var currentPitch = state.PitchDeg;
        var nextPitch = StageViewStateRules.ClampCameraPitch(currentPitch + pitchDeltaDeg);
        var effectivePitchDeltaDeg = nextPitch - currentPitch;
        var orbitCenter = ResolveOrbitCenter().ToVector3();
        var position = state.Position.ToVector3();
        var offset = position - orbitCenter;
        var yawBasis = new Basis(Vector3.Up, (float)Mathf.DegToRad(yawDeltaDeg));
        var yawedOffset = yawBasis * offset;
        var pitchAxis = (yawBasis * Right()).Normalized();
        var pitchBasis = new Basis(pitchAxis, (float)Mathf.DegToRad(effectivePitchDeltaDeg));
        var nextPosition = orbitCenter + (pitchBasis * yawedOffset);

        return new StageViewPatch(
            Camera: new StageCameraPosePatch(
                Position: ToPatch(nextPosition),
                YawDeg: state.YawDeg + yawDeltaDeg,
                PitchDeg: nextPitch
            )
        );
    }

    public StageViewPatch CreateCameraLocalMovePatch(StageCameraPoseState state, Vector3 localMove)
    {
        var worldMove = (Right() * localMove.X) + (Up() * localMove.Y) + (Forward() * localMove.Z);
        return new StageViewPatch(
            Camera: new StageCameraPosePatch(
                Position: ToPatch(state.Position.ToVector3() + worldMove)
            )
        );
    }

    public StageViewPatch CreateScreenPanPatch(
        StageCameraPoseState state,
        Vector2 screenPosition,
        Vector2 screenDelta
    )
    {
        var zDepth = ResolveScreenPanDepth();
        var previousScreenPosition = screenPosition - screenDelta;
        var previousWorldPosition = _camera.ProjectPosition(previousScreenPosition, zDepth);
        var currentWorldPosition = _camera.ProjectPosition(screenPosition, zDepth);
        var worldMove = previousWorldPosition - currentWorldPosition;

        return new StageViewPatch(
            Camera: new StageCameraPosePatch(
                Position: ToPatch(state.Position.ToVector3() + worldMove)
            )
        );
    }

    private Vector3 Forward() => -_camera.GlobalTransform.Basis.Z.Normalized();

    private Vector3 Right() => _camera.GlobalTransform.Basis.X.Normalized();

    private Vector3 Up() => _camera.GlobalTransform.Basis.Y.Normalized();

    private float ResolveScreenPanDepth()
    {
        var focusOffset = ResolveOrbitCenter().ToVector3() - _camera.GlobalPosition;
        var projectedDepth = focusOffset.Dot(Forward());
        if (projectedDepth >= MinScreenPanDepth)
        {
            return projectedDepth;
        }

        // NOTICE:
        // Camera3D.ProjectPosition expects a positive distance in front of the camera. If the
        // avatar center is at or behind the camera after aggressive dolly movement, keep panning
        // stable by using the focus distance magnitude instead of allowing a zero/negative plane.
        return Math.Max(MinScreenPanDepth, focusOffset.Length());
    }

    private static StageViewVec3Patch ToPatch(Vector3 value) => new(value.X, value.Y, value.Z);

    private static double ResolvePitchDeg(Vector3 position, Vector3 target)
    {
        var direction = target - position;
        var horizontalDistance = new Vector2(direction.X, direction.Z).Length();
        return Mathf.RadToDeg(Mathf.Atan2(direction.Y, horizontalDistance));
    }

    private static float ResolveBootstrapDistance(Vector3 size, double fovDeg)
    {
        var halfHeight = Math.Max(size.Y, DefaultAvatarSize.Y) * 0.5f;
        var halfFovRad = fovDeg * Math.PI / 360;
        var distance = (float)(halfHeight / Math.Tan(halfFovRad)) * BootstrapDistanceMargin;
        return Math.Max(BootstrapMinDistance, distance);
    }

    private static void AccumulateMeshBounds(Node node, ref bool hasBounds, ref Vector3 min, ref Vector3 max)
    {
        if (node is MeshInstance3D mesh)
        {
            AccumulateAabb(mesh, ref hasBounds, ref min, ref max);
        }

        foreach (var child in node.GetChildren())
        {
            AccumulateMeshBounds(child, ref hasBounds, ref min, ref max);
        }
    }

    private static void AccumulateAabb(MeshInstance3D mesh, ref bool hasBounds, ref Vector3 min, ref Vector3 max)
    {
        var aabb = mesh.GetAabb();
        var origin = aabb.Position;
        var size = aabb.Size;

        Span<Vector3> corners = stackalloc Vector3[]
        {
            origin,
            origin + new Vector3(size.X, 0, 0),
            origin + new Vector3(0, size.Y, 0),
            origin + new Vector3(0, 0, size.Z),
            origin + new Vector3(size.X, size.Y, 0),
            origin + new Vector3(size.X, 0, size.Z),
            origin + new Vector3(0, size.Y, size.Z),
            origin + size,
        };

        foreach (var corner in corners)
        {
            var worldCorner = mesh.GlobalTransform * corner;
            if (!hasBounds)
            {
                min = worldCorner;
                max = worldCorner;
                hasBounds = true;
                continue;
            }

            min = new Vector3(
                Math.Min(min.X, worldCorner.X),
                Math.Min(min.Y, worldCorner.Y),
                Math.Min(min.Z, worldCorner.Z)
            );
            max = new Vector3(
                Math.Max(max.X, worldCorner.X),
                Math.Max(max.Y, worldCorner.Y),
                Math.Max(max.Z, worldCorner.Z)
            );
        }
    }
}
