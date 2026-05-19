using System;
using Godot;

/// <summary>
/// Owns the currently displayed avatar node and applies new scene input atomically.
///
/// Use when:
/// - Electron main sends a materialized VRM file path.
/// - Godot must replace the active stage avatar after a successful load.
///
/// Expects:
/// - The payload has already arrived through the stage bridge.
/// - <see cref="VrmAvatarLoader"/> can import the file into a detached Godot node.
///
/// Returns:
/// - The newly loaded node is added under the configured avatar root.
/// - The previous avatar is removed only after the new import succeeds.
///
/// Call stack:
///
/// StageRoot.HandleMessage
///   -> <see cref="Apply"/>
///     -> <see cref="VrmAvatarLoader.Load"/>
///       -> VrmRuntimeImporter.gd
/// </summary>
public sealed class StageSceneController
{
    private const string SupportedFormat = "vrm";
    private const float MinFacingVectorLengthSquared = 0.0001f;

    // NOTICE:
    // Avatar-facing convention for the Godot stage:
    // - normalized avatar face direction is Godot +Z (`Vector3.Back`)
    // - bootstrap camera sits on +Z with yaw 0 and looks along -Z
    // Keep this aligned with StageCameraPoseController.CreateBootstrapPose().
    private static readonly Vector3 CanonicalFaceForward = Vector3.Back;

    private readonly Node3D _avatarRoot;
    private readonly VrmAvatarLoader _vrmAvatarLoader;

    private Node _currentAvatar;

    public StageSceneController(Node3D avatarRoot, VrmAvatarLoader vrmAvatarLoader)
    {
        _avatarRoot = avatarRoot;
        _vrmAvatarLoader = vrmAvatarLoader;
    }

    public Node Apply(StageSceneApplyPayload payload)
    {
        if (!string.Equals(payload.Format, SupportedFormat, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Unsupported scene input format: {payload.Format}.");
        }

        var nextAvatar = _vrmAvatarLoader.Load(payload);
        nextAvatar.Name = AvatarNodeName(payload.ModelId);

        CommitAvatar(nextAvatar);
        return nextAvatar;
    }

    private void CommitAvatar(Node nextAvatar)
    {
        var previousAvatar = _currentAvatar;

        _avatarRoot.AddChild(nextAvatar);
        RefreshSkeletonPoseState(nextAvatar);
        NormalizeAvatarFacing(nextAvatar);
        _currentAvatar = nextAvatar;

        if (previousAvatar == null)
        {
            return;
        }

        if (previousAvatar.GetParent() == _avatarRoot)
        {
            _avatarRoot.RemoveChild(previousAvatar);
        }

        previousAvatar.QueueFree();
    }

    private static string AvatarNodeName(string modelId)
    {
        return $"Avatar_{modelId}";
    }

    private static void NormalizeAvatarFacing(Node avatar)
    {
        if (avatar is not Node3D avatar3D)
        {
            return;
        }

        if (!TryResolveAvatarFaceForward(avatar, out var faceForward))
        {
            return;
        }

        var horizontalForward = new Vector3(faceForward.X, 0, faceForward.Z);
        if (horizontalForward.LengthSquared() <= MinFacingVectorLengthSquared)
        {
            return;
        }

        horizontalForward = horizontalForward.Normalized();
        var yaw = SignedYawAngle(horizontalForward, CanonicalFaceForward);
        if (Math.Abs(yaw) <= 0.001f)
        {
            return;
        }

        avatar3D.RotateY(yaw);
    }

    private static bool TryResolveAvatarFaceForward(Node avatar, out Vector3 faceForward)
    {
        faceForward = Vector3.Zero;

        if (!TryFindSkeleton(avatar, out var skeleton))
        {
            return false;
        }

        // NOTICE:
        // The vendored VRM importer does not expose a direct three-vrm `lookAt.faceFront`
        // equivalent to C#. Prefer explicit look-at data, then eye bones, then a humanoid body
        // plane fallback. The body fallback assumes regular VRM humanoid retargeted bone names.
        return TryResolveFaceForwardFromLookOffset(skeleton, out faceForward)
            || TryResolveFaceForwardFromEyes(skeleton, out faceForward)
            || TryResolveFaceForwardFromBody(skeleton, out faceForward);
    }

    private static bool TryResolveFaceForwardFromLookOffset(
        Skeleton3D skeleton,
        out Vector3 faceForward
    )
    {
        faceForward = Vector3.Zero;

        if (!TryFindNode3D(skeleton, "LookOffset", out var lookOffset)
            || lookOffset.GetParent() is not Node3D parent)
        {
            return false;
        }

        return TryUseHorizontalDirection(lookOffset.GlobalPosition - parent.GlobalPosition, out faceForward);
    }

    private static bool TryResolveFaceForwardFromEyes(Skeleton3D skeleton, out Vector3 faceForward)
    {
        faceForward = Vector3.Zero;

        if (!TryGetBoneGlobalPosition(skeleton, "Head", out var head)
            || !TryGetBoneGlobalPosition(skeleton, "LeftEye", out var leftEye)
            || !TryGetBoneGlobalPosition(skeleton, "RightEye", out var rightEye))
        {
            return false;
        }

        var eyeCenter = (leftEye + rightEye) * 0.5f;
        return TryUseHorizontalDirection(eyeCenter - head, out faceForward);
    }

    private static bool TryResolveFaceForwardFromBody(Skeleton3D skeleton, out Vector3 faceForward)
    {
        faceForward = Vector3.Zero;

        if (!TryGetPairedBonePosition(
                skeleton,
                "LeftShoulder",
                "LeftUpperArm",
                out var leftShoulder
            )
            || !TryGetPairedBonePosition(
                skeleton,
                "RightShoulder",
                "RightUpperArm",
                out var rightShoulder
            )
            || !TryGetBoneGlobalPosition(skeleton, "Head", out var head)
            || !TryGetPairedBonePosition(skeleton, "Hips", "Spine", out var bodyBase))
        {
            return false;
        }

        var right = rightShoulder - leftShoulder;
        var up = head - bodyBase;
        return TryUseHorizontalDirection(up.Cross(right), out faceForward);
    }

    private static bool TryGetPairedBonePosition(
        Skeleton3D skeleton,
        string preferred,
        string fallback,
        out Vector3 position
    )
    {
        return TryGetBoneGlobalPosition(skeleton, preferred, out position)
            || TryGetBoneGlobalPosition(skeleton, fallback, out position);
    }

    private static bool TryGetBoneGlobalPosition(
        Skeleton3D skeleton,
        string boneName,
        out Vector3 position
    )
    {
        position = Vector3.Zero;

        var boneIndex = skeleton.FindBone(boneName);
        if (boneIndex < 0)
        {
            return false;
        }

        position = skeleton.GlobalTransform * skeleton.GetBoneGlobalPose(boneIndex).Origin;
        return true;
    }

    private static bool TryFindSkeleton(Node node, out Skeleton3D skeleton)
    {
        if (node is Skeleton3D candidate)
        {
            skeleton = candidate;
            return true;
        }

        foreach (Node child in node.GetChildren())
        {
            if (TryFindSkeleton(child, out skeleton))
            {
                return true;
            }
        }

        skeleton = null;
        return false;
    }

    private static bool TryFindNode3D(Node node, string name, out Node3D result)
    {
        if (node is Node3D node3D && string.Equals(node.Name.ToString(), name, StringComparison.Ordinal))
        {
            result = node3D;
            return true;
        }

        foreach (Node child in node.GetChildren())
        {
            if (TryFindNode3D(child, name, out result))
            {
                return true;
            }
        }

        result = null;
        return false;
    }

    private static bool TryUseHorizontalDirection(Vector3 direction, out Vector3 horizontalDirection)
    {
        horizontalDirection = new Vector3(direction.X, 0, direction.Z);
        if (horizontalDirection.LengthSquared() <= MinFacingVectorLengthSquared)
        {
            return false;
        }

        horizontalDirection = horizontalDirection.Normalized();
        return true;
    }

    private static float SignedYawAngle(Vector3 from, Vector3 to)
    {
        var cross = from.Cross(to);
        return Mathf.Atan2(cross.Y, from.Dot(to));
    }

    private static void RefreshSkeletonPoseState(Node node)
    {
        if (node is Skeleton3D skeleton)
        {
            // NOTICE:
            // Godot 4.6 runtime GLTFDocument import can leave Skeleton3D pose-global state stale
            // after VRM 0.x retargeting, even though rest, pose, Skin binds, and global rest are
            // correct. Reapplying the current local pose after the node enters the scene tree marks
            // the pose state dirty and makes get_bone_global_pose() match editor-imported VRM
            // scenes. Remove when Godot or the vendored VRM importer initializes runtime skeleton
            // pose globals consistently with editor import.
            for (var boneIndex = 0; boneIndex < skeleton.GetBoneCount(); boneIndex++)
            {
                var pose = skeleton.GetBonePose(boneIndex);
                skeleton.SetBonePosePosition(boneIndex, pose.Origin);
                skeleton.SetBonePoseRotation(boneIndex, pose.Basis.GetRotationQuaternion());
                skeleton.SetBonePoseScale(boneIndex, pose.Basis.Scale);
            }
        }

        foreach (Node child in node.GetChildren())
        {
            RefreshSkeletonPoseState(child);
        }
    }
}
