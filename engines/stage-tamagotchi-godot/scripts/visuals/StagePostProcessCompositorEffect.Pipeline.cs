using System;
using Godot;

public partial class StagePostProcessCompositorEffect
{
    private void RunPipeline()
    {
        foreach (var stage in PipelineStages)
        {
            DrawStage(stage);
        }

        DrawDebugOutputStage();
    }

    private void DrawStage(StageRenderPipelineStage stage)
    {
        switch (stage)
        {
            case StageRenderPipelineStage.SceneCopy:
                DrawSceneCopyStage();
                break;
            case StageRenderPipelineStage.AvatarMask:
                DrawAvatarMaskStage();
                break;
            case StageRenderPipelineStage.AvatarEdgeLight:
                DrawAvatarEdgeLightStage();
                break;
            case StageRenderPipelineStage.AvatarGlow:
                DrawAvatarGlowStage();
                break;
            case StageRenderPipelineStage.FinalColorMapping:
                DrawFinalColorMappingStage();
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(stage), stage, null);
        }
    }

    private void DrawSceneCopyStage()
    {
        DrawPass(
            _resources.SceneSourceFramebuffer,
            _resources.SceneCopyPipeline,
            _resources.SceneSourceUniformSet,
            _resources.SceneCopyPushConstants,
            clearColor: false,
            preserveDepthStencil: false
        );
    }

    private void DrawAvatarMaskStage()
    {
        if (!_resources.IncludesAvatarMask)
        {
            return;
        }

        DrawPass(
            _resources.AvatarMaskFramebuffer,
            _resources.AvatarMaskPipeline,
            _resources.AvatarMaskUniformSet,
            _resources.AvatarMaskPushConstants,
            clearColor: true,
            preserveDepthStencil: true
        );
        if (_resources.AvatarMaskResolveRequired)
        {
            var resolveError = _renderingDevice.TextureResolveMultisample(
                _resources.AvatarMaskRenderTexture,
                _resources.AvatarMaskTexture
            );
            if (resolveError != Error.Ok)
            {
                WarnOnce(
                    ref _avatarMaskResolveWarningPrinted,
                    $"Avatar mask MSAA resolve failed: {resolveError}."
                );
            }
        }
    }

    private void DrawAvatarEdgeLightStage()
    {
        if (!_resources.IncludesAvatarEdgeLight)
        {
            return;
        }

        DrawPass(
            _resources.AvatarEdgeLightFramebuffer,
            _resources.AvatarEdgeLightPipeline,
            _resources.AvatarEdgeLightUniformSet,
            _resources.AvatarEdgeLightPushConstants,
            clearColor: true,
            preserveDepthStencil: false
        );
    }

    private void DrawAvatarGlowStage()
    {
        if (!_resources.IncludesAvatarMask)
        {
            return;
        }

        DrawPass(
            _resources.SourceFramebuffer,
            _resources.ExtractPipeline,
            _resources.SourceUniformSet,
            _resources.ExtractPushConstants,
            clearColor: true,
            preserveDepthStencil: true
        );
        if (_resources.SourceResolveRequired)
        {
            var resolveError = _renderingDevice.TextureResolveMultisample(
                _resources.SourceRenderTexture,
                _resources.SourceTexture
            );
            if (resolveError != Error.Ok)
            {
                WarnOnce(
                    ref _sourceResolveWarningPrinted,
                    $"Avatar glow source MSAA resolve failed: {resolveError}."
                );
                return;
            }
        }

        for (int level = 0; level < _resources.BloomLevels; level++)
        {
            DrawPass(
                _resources.DownsampleFramebuffers[level],
                _resources.DownsamplePipeline,
                _resources.DownsampleUniformSets[level],
                _resources.DownsamplePushConstants[level],
                clearColor: true,
                preserveDepthStencil: false
            );
        }

        for (int level = _resources.BloomLevels - 2; level >= 0; level--)
        {
            DrawPass(
                _resources.UpsampleFramebuffers[level],
                _resources.UpsamplePipeline,
                _resources.UpsampleUniformSets[level],
                _resources.UpsamplePushConstants[level],
                clearColor: true,
                preserveDepthStencil: false
            );
        }

        DrawPass(
            _resources.GlowCompositeFramebuffer,
            _resources.GlowCompositePipeline,
            _resources.GlowCompositeUniformSet,
            _resources.GlowCompositePushConstants,
            clearColor: true,
            preserveDepthStencil: false
        );
    }

    private void DrawFinalColorMappingStage()
    {
        DrawPass(
            _resources.FinalColorFramebuffer,
            _resources.FinalColorPipeline,
            _resources.FinalColorUniformSet,
            _resources.FinalColorPushConstants,
            clearColor: false,
            preserveDepthStencil: false
        );
    }

    private void DrawDebugOutputStage()
    {
        if (_debugView == StageRenderDebugView.Final)
        {
            return;
        }

        var uniformSet = ResolveDebugOutputUniformSet();
        if (!uniformSet.IsValid)
        {
            return;
        }

        DrawPass(
            _resources.FinalColorFramebuffer,
            _resources.DebugOutputPipeline,
            uniformSet,
            Array.Empty<byte>(),
            clearColor: false,
            preserveDepthStencil: false
        );
    }

    private Rid ResolveDebugOutputUniformSet()
    {
        return _debugView switch
        {
            StageRenderDebugView.SceneCopy => _resources.DebugSceneCopyUniformSet,
            StageRenderDebugView.AvatarMask => _resources.DebugAvatarMaskUniformSet,
            StageRenderDebugView.AvatarEdgeMask => _resources.DebugAvatarEdgeLightUniformSet,
            StageRenderDebugView.AfterAvatarEdgeLight => _resources.DebugAvatarEdgeLightUniformSet,
            StageRenderDebugView.AfterAvatarGlow => _resources.DebugGlowCompositeUniformSet,
            _ => new Rid(),
        };
    }
}

internal enum StageRenderPipelineStage
{
    SceneCopy,
    AvatarMask,
    AvatarEdgeLight,
    AvatarGlow,
    FinalColorMapping,
}

internal enum StageRenderDebugView
{
    Final,
    SceneCopy,
    AvatarMask,
    AvatarEdgeMask,
    AfterAvatarEdgeLight,
    AfterAvatarGlow,
}

internal static class StageRenderDebugViewNames
{
    public const string Final = "final";
    public const string SceneCopy = "scene-copy";
    public const string AvatarMask = "avatar-mask";
    public const string AvatarEdgeMask = "avatar-edge-mask";
    public const string AfterAvatarEdgeLight = "after-avatar-edge-light";
    public const string AfterAvatarGlow = "after-avatar-glow";

    public static bool TryParse(string value, out StageRenderDebugView debugView)
    {
        switch (value)
        {
            case Final:
                debugView = StageRenderDebugView.Final;
                return true;
            case SceneCopy:
                debugView = StageRenderDebugView.SceneCopy;
                return true;
            case AvatarMask:
                debugView = StageRenderDebugView.AvatarMask;
                return true;
            case AvatarEdgeMask:
                debugView = StageRenderDebugView.AvatarEdgeMask;
                return true;
            case AfterAvatarEdgeLight:
                debugView = StageRenderDebugView.AfterAvatarEdgeLight;
                return true;
            case AfterAvatarGlow:
                debugView = StageRenderDebugView.AfterAvatarGlow;
                return true;
            default:
                debugView = StageRenderDebugView.Final;
                return false;
        }
    }

    public static string ToTransportValue(StageRenderDebugView debugView)
    {
        return debugView switch
        {
            StageRenderDebugView.Final => Final,
            StageRenderDebugView.SceneCopy => SceneCopy,
            StageRenderDebugView.AvatarMask => AvatarMask,
            StageRenderDebugView.AvatarEdgeMask => AvatarEdgeMask,
            StageRenderDebugView.AfterAvatarEdgeLight => AfterAvatarEdgeLight,
            StageRenderDebugView.AfterAvatarGlow => AfterAvatarGlow,
            _ => Final,
        };
    }
}
