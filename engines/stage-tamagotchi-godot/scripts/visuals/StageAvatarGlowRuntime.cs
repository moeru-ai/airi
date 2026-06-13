using System;
using System.Collections.Generic;
using Godot;

/// <summary>
/// Owns avatar-only stencil masking and the camera-local glow compositor.
/// </summary>
public sealed class StageAvatarGlowRuntime : IDisposable
{
    private const int AvatarStencilReference = 1;

    private readonly Camera3D _camera;
    private readonly StageAvatarGlowCompositorEffect _avatarGlowEffect;
    private readonly StandardMaterial3D _avatarGlowMaskMaterial;
    private readonly Dictionary<GeometryInstance3D, Material> _previousOverlays = new();
    private bool _disposed;

    public StageAvatarGlowRuntime(Camera3D camera)
    {
        _camera = camera ?? throw new ArgumentNullException(nameof(camera));
        _avatarGlowEffect = new StageAvatarGlowCompositorEffect(AvatarStencilReference);
        _avatarGlowMaskMaterial = CreateAvatarGlowMaskMaterial();

        // NOTICE:
        // Camera3D owns compositor effects. Avatar glow is the only stage compositor today;
        // replace this direct assignment with a shared owner before adding more camera passes.
        var compositor = new Compositor();
        compositor.CompositorEffects = new Godot.Collections.Array<CompositorEffect>
        {
            _avatarGlowEffect,
        };
        _camera.Compositor = compositor;
    }

    public void UseAvatar(Node avatar)
    {
        if (_disposed)
        {
            return;
        }

        ClearAvatarMask();
        if (avatar == null)
        {
            _avatarGlowEffect.Enabled = false;
            return;
        }

        MarkAvatarMask(avatar);
        _avatarGlowEffect.Enabled = _previousOverlays.Count > 0;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _avatarGlowEffect.Enabled = false;
        ClearAvatarMask();
        if (_camera.Compositor?.CompositorEffects.Contains(_avatarGlowEffect) == true)
        {
            _camera.Compositor = null;
        }

        _avatarGlowEffect.ReleaseRenderingResources();
    }

    private StandardMaterial3D CreateAvatarGlowMaskMaterial() => new()
    {
        AlbedoColor = new Color(0.0f, 0.0f, 0.0f, 0.0f),
        CullMode = BaseMaterial3D.CullModeEnum.Disabled,
        // NOTICE:
        // Keep the mask depth-tested but non-writing: occluded avatar fragments do not mark
        // stencil, and the mask pass does not mutate scene depth.
        DepthDrawMode = BaseMaterial3D.DepthDrawModeEnum.Disabled,
        DisableFog = true,
        NoDepthTest = false,
        RenderPriority = (int)Material.RenderPriorityMax,
        ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
        StencilCompare = BaseMaterial3D.StencilCompareEnum.Always,
        StencilFlags = (int)BaseMaterial3D.StencilFlagsEnum.Write,
        StencilMode = BaseMaterial3D.StencilModeEnum.Custom,
        StencilReference = AvatarStencilReference,
        Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
    };

    private void MarkAvatarMask(Node node)
    {
        if (node is GeometryInstance3D geometry)
        {
            // NOTICE:
            // MaterialOverlay is a single instance-level extra pass. Save and restore it while
            // this runtime uses the slot as a temporary avatar mask producer.
            _previousOverlays[geometry] = geometry.MaterialOverlay;
            geometry.MaterialOverlay = _avatarGlowMaskMaterial;
        }

        foreach (Node child in node.GetChildren())
        {
            MarkAvatarMask(child);
        }
    }

    private void ClearAvatarMask()
    {
        foreach (var (geometry, previousOverlay) in _previousOverlays)
        {
            if (GodotObject.IsInstanceValid(geometry))
            {
                geometry.MaterialOverlay = previousOverlay;
            }
        }

        _previousOverlays.Clear();
    }
}
