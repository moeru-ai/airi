using System;
using Godot;

/// <summary>
/// Coordinates stage render-effect ownership for avatar source overlays and post-processing.
/// </summary>
public sealed class StageRenderEffectsRuntime : IDisposable
{
    private const int AvatarStencilReference = 1;

    private readonly StageCompositorOwner _compositorOwner;
    private readonly StageMaterialOverlayOwner _overlayOwner;
    private readonly StagePostProcessCompositorEffect _postProcessEffect;
    private bool _disposed;

    public StageRenderEffectsRuntime(Camera3D camera)
    {
        _postProcessEffect = new StagePostProcessCompositorEffect(AvatarStencilReference, camera);
        _overlayOwner = new StageMaterialOverlayOwner(AvatarStencilReference);
        _compositorOwner = new StageCompositorOwner(camera, _postProcessEffect);
    }

    public void UseAvatar(Node avatar)
    {
        if (_disposed)
        {
            return;
        }

        _overlayOwner.UseAvatarMask(avatar);
        _postProcessEffect.AvatarMaskEnabled =
            _overlayOwner.HasSource(StageMaterialOverlaySourceKind.AvatarMask);
    }

    public string CurrentDebugView => StageRenderDebugViewNames.ToTransportValue(_postProcessEffect.DebugView);

    public string SetDebugView(string view)
    {
        if (!StageRenderDebugViewNames.TryParse(view, out var debugView))
        {
            throw new ArgumentException($"Unknown render debug view: {view}.", nameof(view));
        }

        _postProcessEffect.DebugView = debugView;
        return StageRenderDebugViewNames.ToTransportValue(debugView);
    }

    public bool SetAvatarEdgeLightEnabled(bool enabled)
    {
        _postProcessEffect.AvatarEdgeLightEnabled = enabled;
        return _postProcessEffect.AvatarEdgeLightEnabled;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _postProcessEffect.AvatarMaskEnabled = false;
        _postProcessEffect.FinalColorMappingEnabled = false;
        _overlayOwner.Dispose();
        _compositorOwner.Dispose();
        _postProcessEffect.ReleaseRenderingResources();
    }
}
