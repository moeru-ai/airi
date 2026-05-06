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

    private readonly Node3D _avatarRoot;
    private readonly VrmAvatarLoader _vrmAvatarLoader;

    private Node _currentAvatar;

    /// <summary>
    /// Creates a scene controller for the stage avatar root.
    ///
    /// Use when:
    /// - StageRoot has created or resolved the avatar root node.
    ///
    /// Expects:
    /// - <paramref name="avatarRoot"/> is part of the active scene tree.
    /// - <paramref name="vrmAvatarLoader"/> can import VRM files at runtime.
    ///
    /// Returns:
    /// - A controller ready to apply scene input payloads.
    /// </summary>
    public StageSceneController(Node3D avatarRoot, VrmAvatarLoader vrmAvatarLoader)
    {
        _avatarRoot = avatarRoot;
        _vrmAvatarLoader = vrmAvatarLoader;
    }

    /// <summary>
    /// Loads and displays a new avatar from a materialized VRM file path.
    ///
    /// Use when:
    /// - A <c>host.scene.apply</c> message arrives.
    ///
    /// Expects:
    /// - <paramref name="payload"/> uses the <c>vrm</c> format.
    /// - <paramref name="payload"/> points to a file visible to the Godot process.
    ///
    /// Returns:
    /// - The committed avatar node.
    /// </summary>
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
