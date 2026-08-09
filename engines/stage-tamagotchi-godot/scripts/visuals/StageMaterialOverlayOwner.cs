using System;
using System.Collections.Generic;
using Godot;

/// <summary>
/// Identifies stage overlay source producers that compete for the single MaterialOverlay slot.
/// </summary>
public enum StageMaterialOverlaySourceKind
{
    AvatarMask,
}

/// <summary>
/// Owns stage material overlay assignments used by render-effect source passes.
/// </summary>
public sealed class StageMaterialOverlayOwner : IDisposable
{
    private readonly Material _avatarSourceOverlayMaterial;
    private readonly Dictionary<StageMaterialOverlaySourceKind, StageOverlaySourceClaim> _claims = new();
    private readonly Dictionary<GeometryInstance3D, Material> _previousOverlays = new();
    private bool _disposed;

    public StageMaterialOverlayOwner(int avatarStencilReference)
    {
        _avatarSourceOverlayMaterial = CreateAvatarSourceOverlayMaterial(avatarStencilReference);
    }

    public bool HasSource(StageMaterialOverlaySourceKind sourceKind) => _claims.ContainsKey(sourceKind);

    public void UseAvatarMask(Node avatar)
    {
        if (_disposed)
        {
            return;
        }

        if (avatar == null)
        {
            ClearSource(StageMaterialOverlaySourceKind.AvatarMask);
            return;
        }

        _claims[StageMaterialOverlaySourceKind.AvatarMask] = new StageOverlaySourceClaim(
            avatar,
            _avatarSourceOverlayMaterial
        );
        RefreshOverlayAssignments();
    }

    public void ClearSource(StageMaterialOverlaySourceKind sourceKind)
    {
        if (!_claims.Remove(sourceKind))
        {
            return;
        }

        RefreshOverlayAssignments();
    }

    public void ClearAllSources()
    {
        _claims.Clear();
        ClearOverlayAssignments();
    }

    private void ClearOverlayAssignments()
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

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        ClearAllSources();
    }

    private static StandardMaterial3D CreateAvatarSourceOverlayMaterial(int avatarStencilReference) =>
        new()
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
            StencilReference = avatarStencilReference,
            Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
        };

    private void RefreshOverlayAssignments()
    {
        ClearOverlayAssignments();
        if (_claims.Count == 0)
        {
            return;
        }

        // NOTICE:
        // Godot exposes only one MaterialOverlay slot per GeometryInstance3D. Until the
        // overlay material encodes multiple source channels, the selected claim owns the
        // physical overlay assignment for this refresh.
        var claim = SelectOverlayClaim();
        MarkSource(claim.Root, claim.OverlayMaterial);
    }

    private StageOverlaySourceClaim SelectOverlayClaim()
    {
        if (_claims.TryGetValue(StageMaterialOverlaySourceKind.AvatarMask, out var avatarMaskClaim))
        {
            return avatarMaskClaim;
        }

        throw new InvalidOperationException("Stage overlay owner had no selectable source claim.");
    }

    private void MarkSource(Node node, Material overlayMaterial)
    {
        if (node is GeometryInstance3D geometry
            && !_previousOverlays.ContainsKey(geometry))
        {
            // NOTICE:
            // MaterialOverlay is a single instance-level extra pass. This owner is the only
            // stage runtime allowed to occupy the slot for render-effect source passes.
            _previousOverlays[geometry] = geometry.MaterialOverlay;
            geometry.MaterialOverlay = overlayMaterial;
        }

        foreach (Node child in node.GetChildren())
        {
            MarkSource(child, overlayMaterial);
        }
    }

    private readonly record struct StageOverlaySourceClaim(
        Node Root,
        Material OverlayMaterial
    );
}
