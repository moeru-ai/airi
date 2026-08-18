using Godot;

/// <summary>
/// Applies Godot-owned view state to scene nodes.
/// </summary>
public sealed class StageViewController
{
    private readonly Node3D _avatarRoot;
    private readonly StageCameraPoseController _cameraController;

    public StageViewController(Node3D avatarRoot, StageCameraPoseController cameraController)
    {
        _avatarRoot = avatarRoot;
        _cameraController = cameraController;
    }

    public void UseAvatar(Node avatar)
    {
        _cameraController.UseAvatar(avatar);
    }

    public void Apply(StageViewState state)
    {
        _avatarRoot.Position = Vector3.Zero;
        _cameraController.Apply(state.Camera);
    }

    public StageCameraPoseState CreateBootstrapCameraPose() =>
        _cameraController.CreateBootstrapPose();

    public StageAvatarBoundsPayload ResolveAvatarBounds() =>
        _cameraController.ResolveAvatarBounds();
}
