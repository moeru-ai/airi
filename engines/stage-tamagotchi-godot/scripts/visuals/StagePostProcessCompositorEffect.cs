using System;
using Godot;

/// <summary>
/// Runs same-frame stage post-process work for avatar source effects and final color mapping.
/// </summary>
public partial class StagePostProcessCompositorEffect : CompositorEffect
{
    private const int MaxBloomLevels = 9;
    private const int BloomQualityFactor = 2;

    private static readonly GlowSettings Glow = new(
        BloomTint: new Color(1.0f, 0.6938719749450684f, 0.6795425415039062f),
        BloomStrength: 0.09f,
        BloomSize: 0.26f,
        HighlightThreshold: 0.56f,
        HighlightSmoothness: 0.5f,
        MaxHighlightBrightness: 1.0e20f
    );

    private static readonly EdgeLightSettings EdgeLight = new(
        WidthPixels: 8.5f,
        VerticalScale: 0.6f,
        DepthThresholdStart: 0.030f,
        DepthThresholdEnd: 0.135f,
        Strength: 1.0f,
        ValueBoost: 2.1f,
        WidthReferenceDepth: 0.65f
    );

    private static readonly NaesTonemapSettings NaesTonemap = new(
        A: 1.36f,
        B: 0.047f,
        C: 0.93f,
        D: 0.56f,
        E: 0.14f,
        InputMax: 10.0f
    );

    private static readonly ToonColorGradeSettings ToonColorGrade = new(
        LumaRiseStart: 0.42f,
        LumaRiseEnd: 0.58f,
        LumaFallStart: 0.66f,
        LumaFallEnd: 0.78f,
        LumaMidDip: 0.050f,
        VibranceLumaStart: 0.24f,
        VibranceLumaEnd: 0.50f,
        VibranceSaturationStart: 0.10f,
        VibranceSaturationEnd: 0.70f,
        ChromaBase: 1.05f,
        ChromaBoost: 0.47f
    );

    private static readonly Color[] ClearColor = { new(0.0f, 0.0f, 0.0f, 0.0f) };

    private readonly uint _stencilReference;
    private readonly Camera3D _camera;

    private RenderingDevice _renderingDevice;
    private Rid _sampler;
    private long _fullscreenVertexFormat = RenderingDevice.InvalidId;
    private Rid _fullscreenVertexBuffer;
    private Rid _fullscreenVertexArray;
    private Rid _copyShader;
    private Rid _avatarMaskShader;
    private Rid _edgeLightShader;
    private Rid _extractShader;
    private Rid _downsampleShader;
    private Rid _upsampleShader;
    private Rid _glowCompositeShader;
    private Rid _finalColorShader;
    private PostProcessResources _resources;
    private bool _missingRenderingDeviceWarningPrinted;
    private bool _missingRenderBuffersWarningPrinted;
    private bool _missingStencilWarningPrinted;
    private bool _missingNormalRoughnessWarningPrinted;
    private bool _missingResolvedDepthWarningPrinted;
    private bool _avatarMaskResolveWarningPrinted;
    private bool _sourceResolveWarningPrinted;

    private bool _avatarMaskEnabled;
    private bool _avatarEdgeLightEnabled = true;
    private bool _finalColorMappingEnabled = true;
    private StageRenderDebugView _debugView = StageRenderDebugView.Final;

    private static readonly StageRenderPipelineStage[] PipelineStages =
    {
        StageRenderPipelineStage.SceneCopy,
        StageRenderPipelineStage.AvatarMask,
        StageRenderPipelineStage.AvatarEdgeLight,
        StageRenderPipelineStage.AvatarGlow,
        StageRenderPipelineStage.FinalColorMapping,
    };

    public StagePostProcessCompositorEffect(int stencilReference, Camera3D camera)
    {
        _stencilReference = (uint)stencilReference;
        _camera = camera ?? throw new ArgumentNullException(nameof(camera));
        AccessResolvedColor = true;
        AccessResolvedDepth = true;
        NeedsNormalRoughness = true;
        EffectCallbackType = EffectCallbackTypeEnum.PostTransparent;
        UpdateEnabled();
    }

    public bool AvatarMaskEnabled
    {
        get => _avatarMaskEnabled;
        set
        {
            _avatarMaskEnabled = value;
            UpdateEnabled();
        }
    }

    public bool FinalColorMappingEnabled
    {
        get => _finalColorMappingEnabled;
        set
        {
            _finalColorMappingEnabled = value;
            UpdateEnabled();
        }
    }

    public bool AvatarEdgeLightEnabled
    {
        get => _avatarEdgeLightEnabled;
        set => _avatarEdgeLightEnabled = value;
    }

    internal StageRenderDebugView DebugView
    {
        get => _debugView;
        set
        {
            _debugView = value;
            UpdateEnabled();
        }
    }

    private void UpdateEnabled()
    {
        Enabled = _finalColorMappingEnabled || _debugView != StageRenderDebugView.Final;
    }

    public override void _RenderCallback(int effectCallbackType, RenderData renderData)
    {
        if (!Enabled || (EffectCallbackTypeEnum)effectCallbackType != EffectCallbackType)
        {
            return;
        }

        if (!EnsureRenderingDevice())
        {
            return;
        }

        if (renderData.GetRenderSceneBuffers() is not RenderSceneBuffersRD buffers)
        {
            WarnOnce(
                ref _missingRenderBuffersWarningPrinted,
                "Stage post-process requires RenderSceneBuffersRD; compositor callback had no RD buffers."
            );
            return;
        }

        var fullSize = buffers.GetInternalSize();
        if (fullSize.X < 2 || fullSize.Y < 2)
        {
            return;
        }

        var sceneColor = buffers.GetColorTexture(false);
        if (!sceneColor.IsValid)
        {
            return;
        }

        bool includeAvatarMask = _avatarMaskEnabled;
        var stencilDepth = new Rid();
        var resolvedDepth = new Rid();
        var normalRoughness = new Rid();
        bool includeAvatarEdgeLight = false;
        if (includeAvatarMask)
        {
            stencilDepth = SelectStencilDepthTexture(buffers);
            if (!stencilDepth.IsValid)
            {
                includeAvatarMask = false;
            }
            else
            {
                var sceneDepthFormat = _renderingDevice.TextureGetFormat(stencilDepth).Format;
                if (!HasStencil(sceneDepthFormat))
                {
                    WarnOnce(
                        ref _missingStencilWarningPrinted,
                        $"Avatar mask needs a stencil depth texture; scene depth format is {sceneDepthFormat}."
                    );
                    includeAvatarMask = false;
                    stencilDepth = new Rid();
                }
            }

            if (includeAvatarMask)
            {
                resolvedDepth = buffers.GetDepthTexture(false);
                if (!resolvedDepth.IsValid)
                {
                    WarnOnce(
                        ref _missingResolvedDepthWarningPrinted,
                        "Avatar edge light needs a resolved depth texture."
                    );
                }

                normalRoughness = GetNormalRoughnessTexture(buffers);
                if (!normalRoughness.IsValid)
                {
                    WarnOnce(
                        ref _missingNormalRoughnessWarningPrinted,
                        "Avatar edge light needs forward_clustered/normal_roughness."
                    );
                }

                includeAvatarEdgeLight =
                    _avatarEdgeLightEnabled
                    && resolvedDepth.IsValid
                    && normalRoughness.IsValid;
            }
        }

        if (!EnsureResources(
                fullSize,
                sceneColor,
                stencilDepth,
                resolvedDepth,
                normalRoughness,
                includeAvatarMask,
                includeAvatarEdgeLight,
                _debugView
            ))
        {
            return;
        }

        RunPipeline();
    }

    public override void _Notification(int what)
    {
        if (what != NotificationPredelete)
        {
            return;
        }

        ReleaseRenderingResources();
    }

    public void ReleaseRenderingResources()
    {
        if (_renderingDevice != null && !RenderingServer.IsOnRenderThread())
        {
            RenderingServer.CallOnRenderThread(Callable.From(ReleaseRenderingResourcesOnRenderThread));
            RenderingServer.ForceSync();
            return;
        }

        ReleaseRenderingResourcesOnRenderThread();
    }

    private void ReleaseRenderingResourcesOnRenderThread()
    {
        ReleaseResources();
        FreeOwnedRid(ref _sampler);
        FreeOwnedRid(ref _fullscreenVertexArray);
        FreeOwnedRid(ref _fullscreenVertexBuffer);
        FreeOwnedRid(ref _copyShader);
        FreeOwnedRid(ref _avatarMaskShader);
        FreeOwnedRid(ref _edgeLightShader);
        FreeOwnedRid(ref _extractShader);
        FreeOwnedRid(ref _downsampleShader);
        FreeOwnedRid(ref _upsampleShader);
        FreeOwnedRid(ref _glowCompositeShader);
        FreeOwnedRid(ref _finalColorShader);
        _fullscreenVertexFormat = RenderingDevice.InvalidId;
        _renderingDevice = null;
    }
}
