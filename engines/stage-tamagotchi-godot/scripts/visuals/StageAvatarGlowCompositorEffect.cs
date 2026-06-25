using System;
using System.Collections.Generic;
using Godot;

/// <summary>
/// Runs same-frame avatar glare and toon color mapping for meshes marked by stencil.
/// </summary>
public partial class StageAvatarGlowCompositorEffect : CompositorEffect
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

    private const string FullscreenVertexShaderCode = """
        #version 450

        layout(location = 0) in vec2 position;
        layout(location = 0) out vec2 uv;

        void main()
        {
            uv = position * 0.5 + vec2(0.5);
            gl_Position = vec4(position, 0.0, 1.0);
        }
        """;

    private const string CopySceneFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D scene_texture;

        layout(location = 0) in vec2 uv;
        layout(location = 0) out vec4 out_color;

        void main()
        {
            out_color = texture(scene_texture, uv);
        }
        """;

    private const string ExtractHighlightsFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D input_texture;
        layout(push_constant, std430) uniform Params
        {
            vec4 values;
        } params;

        layout(location = 0) in vec2 uv;
        layout(location = 0) out vec4 out_color;

        float max_channel_of(vec3 color)
        {
            return max(max(color.r, color.g), color.b);
        }

        float smooth_min(float a, float b, float smoothness)
        {
            if (smoothness == 0.0)
            {
                return min(a, b);
            }

            float h = max(smoothness - abs(a - b), 0.0) / smoothness;
            return min(a, b) - h * h * smoothness * 0.25;
        }

        float smooth_max(float a, float b, float smoothness)
        {
            return -smooth_min(-a, -b, smoothness);
        }

        float smooth_clamp(
            float value,
            float min_value,
            float max_value,
            float min_smoothness,
            float max_smoothness
        )
        {
            return smooth_min(
                max_value,
                smooth_max(min_value, value, min_smoothness),
                max_smoothness
            );
        }

        float adaptive_smooth_clamp(
            float value,
            float min_value,
            float max_value,
            float smoothness
        )
        {
            float range_distance = abs(max_value - min_value);
            float min_smoothness = min(smoothness, min(min_value, range_distance));
            float max_smoothness = min(smoothness, min(max_value, range_distance));
            return smooth_clamp(value, min_value, max_value, min_smoothness, max_smoothness);
        }

        void main()
        {
            vec3 color = texture(input_texture, uv).rgb;
            float threshold = params.values.x;
            float smoothness = params.values.y;
            float max_brightness = params.values.z;

            float value = max_channel_of(color);
            float clamped_value = adaptive_smooth_clamp(
                value,
                threshold,
                threshold + max_brightness,
                smoothness
            );
            float extracted_value = max(clamped_value - threshold, 0.0);
            float source = extracted_value / max(value, 0.001);
            out_color = vec4(color * source, 1.0);
        }
        """;

    private const string DownsampleFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D input_texture;
        layout(push_constant, std430) uniform Params
        {
            vec4 values;
        } params;

        layout(location = 0) in vec2 uv;
        layout(location = 0) out vec4 out_color;

        float reduce_max(vec4 color)
        {
            return max(max(max(color.r, color.g), color.b), color.a);
        }

        vec4 weighted_sum(vec4 a, vec4 b, vec4 c, vec4 d, vec4 weights)
        {
            float total_weight = weights.x + weights.y + weights.z + weights.w;
            return (a * weights.x + b * weights.y + c * weights.z + d * weights.w) /
                max(total_weight, 0.0001);
        }

        vec4 karis_brightness_weighted_sum(vec4 a, vec4 b, vec4 c, vec4 d)
        {
            vec4 brightness = vec4(reduce_max(a), reduce_max(b), reduce_max(c), reduce_max(d));
            vec4 weights = vec4(1.0) / (brightness + vec4(1.0));
            return weighted_sum(a, b, c, d, weights);
        }

        void main()
        {
            vec2 pixel_size = params.values.xy;
            float use_karis_average = params.values.z;

            vec4 center = texture(input_texture, uv);
            vec4 upper_left_near = texture(input_texture, uv + pixel_size * vec2(-1.0, 1.0));
            vec4 upper_right_near = texture(input_texture, uv + pixel_size * vec2(1.0, 1.0));
            vec4 lower_left_near = texture(input_texture, uv + pixel_size * vec2(-1.0, -1.0));
            vec4 lower_right_near = texture(input_texture, uv + pixel_size * vec2(1.0, -1.0));
            vec4 left_far = texture(input_texture, uv + pixel_size * vec2(-2.0, 0.0));
            vec4 right_far = texture(input_texture, uv + pixel_size * vec2(2.0, 0.0));
            vec4 upper_far = texture(input_texture, uv + pixel_size * vec2(0.0, 2.0));
            vec4 lower_far = texture(input_texture, uv + pixel_size * vec2(0.0, -2.0));
            vec4 upper_left_far = texture(input_texture, uv + pixel_size * vec2(-2.0, 2.0));
            vec4 upper_right_far = texture(input_texture, uv + pixel_size * vec2(2.0, 2.0));
            vec4 lower_left_far = texture(input_texture, uv + pixel_size * vec2(-2.0, -2.0));
            vec4 lower_right_far = texture(input_texture, uv + pixel_size * vec2(2.0, -2.0));

            vec4 result;
            if (use_karis_average > 0.5)
            {
                vec4 center_weighted_sum = karis_brightness_weighted_sum(
                    upper_left_near,
                    upper_right_near,
                    lower_right_near,
                    lower_left_near
                );
                vec4 upper_left_weighted_sum = karis_brightness_weighted_sum(
                    upper_left_far,
                    upper_far,
                    center,
                    left_far
                );
                vec4 upper_right_weighted_sum = karis_brightness_weighted_sum(
                    upper_far,
                    upper_right_far,
                    right_far,
                    center
                );
                vec4 lower_right_weighted_sum = karis_brightness_weighted_sum(
                    center,
                    right_far,
                    lower_right_far,
                    lower_far
                );
                vec4 lower_left_weighted_sum = karis_brightness_weighted_sum(
                    left_far,
                    center,
                    lower_far,
                    lower_left_far
                );

                result = center_weighted_sum * (4.0 / 8.0) +
                    (
                        upper_left_weighted_sum +
                        upper_right_weighted_sum +
                        lower_left_weighted_sum +
                        lower_right_weighted_sum
                    ) * (1.0 / 8.0);
            }
            else
            {
                result = center * (4.0 / 32.0) +
                    (
                        upper_left_near +
                        upper_right_near +
                        lower_left_near +
                        lower_right_near
                    ) * (4.0 / 32.0) +
                    (left_far + right_far + upper_far + lower_far) * (2.0 / 32.0) +
                    (
                        upper_left_far +
                        upper_right_far +
                        lower_left_far +
                        lower_right_far
                    ) * (1.0 / 32.0);
            }

            out_color = vec4(result.rgb, 1.0);
        }
        """;

    private const string UpsampleFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D base_texture;
        layout(set = 0, binding = 1) uniform sampler2D input_texture;
        layout(push_constant, std430) uniform Params
        {
            vec4 values;
        } params;

        layout(location = 0) in vec2 uv;
        layout(location = 0) out vec4 out_color;

        void main()
        {
            vec2 pixel_size = params.values.xy;
            vec4 upsampled = vec4(0.0);
            upsampled += texture(input_texture, uv) * (4.0 / 16.0);
            upsampled += texture(input_texture, uv + pixel_size * vec2(-1.0, 0.0)) * (2.0 / 16.0);
            upsampled += texture(input_texture, uv + pixel_size * vec2(0.0, 1.0)) * (2.0 / 16.0);
            upsampled += texture(input_texture, uv + pixel_size * vec2(1.0, 0.0)) * (2.0 / 16.0);
            upsampled += texture(input_texture, uv + pixel_size * vec2(0.0, -1.0)) * (2.0 / 16.0);
            upsampled += texture(input_texture, uv + pixel_size * vec2(-1.0, -1.0)) * (1.0 / 16.0);
            upsampled += texture(input_texture, uv + pixel_size * vec2(-1.0, 1.0)) * (1.0 / 16.0);
            upsampled += texture(input_texture, uv + pixel_size * vec2(1.0, -1.0)) * (1.0 / 16.0);
            upsampled += texture(input_texture, uv + pixel_size * vec2(1.0, 1.0)) * (1.0 / 16.0);

            vec3 base = texture(base_texture, uv).rgb;
            out_color = vec4(base + upsampled.rgb, 1.0);
        }
        """;

    private const string CompositeFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D scene_texture;
        layout(set = 0, binding = 1) uniform sampler2D bloom_texture;
        layout(push_constant, std430) uniform Params
        {
            vec4 bloom_tint_strength;
            vec4 naes_curve0;
            vec4 naes_curve1;
            vec4 luma_curve;
            vec4 color_grade0;
            vec4 color_grade1;
        } params;

        layout(location = 0) in vec2 uv;
        layout(location = 0) out vec4 out_color;

        vec3 clamp_tonemap_input(vec3 color)
        {
            return clamp(max(color, vec3(0.0)), 0.0, params.naes_curve1.y);
        }

        vec3 naes_tonemap(vec3 color)
        {
            vec3 x = clamp_tonemap_input(color);
            return (x * (params.naes_curve0.x * x + vec3(params.naes_curve0.y))) /
                (
                    x * (params.naes_curve0.z * x + vec3(params.naes_curve0.w)) +
                    vec3(params.naes_curve1.x)
                );
        }

        float apply_luma_curve(float luma)
        {
            float mid_gate =
                smoothstep(params.luma_curve.x, params.luma_curve.y, luma) *
                (1.0 - smoothstep(params.luma_curve.z, params.luma_curve.w, luma));
            return max(luma * (1.0 - params.color_grade0.x * mid_gate), 0.0);
        }

        vec3 apply_toon_color_grade(vec3 color)
        {
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            float max_channel = max(max(color.r, color.g), color.b);
            float min_channel = min(min(color.r, color.g), color.b);
            float saturation = max_channel <= 0.001
                ? 0.0
                : (max_channel - min_channel) / max_channel;
            float luma_gate = smoothstep(params.color_grade0.y, params.color_grade0.z, luma);
            float saturation_gate =
                1.0 - smoothstep(params.color_grade0.w, params.color_grade1.x, saturation);
            float chroma_scale =
                params.color_grade1.y + params.color_grade1.z * luma_gate * saturation_gate;
            float luma2 = apply_luma_curve(luma);
            vec3 gray = vec3(luma);

            return max(vec3(luma2) + (color - gray) * chroma_scale, vec3(0.0));
        }

        void main()
        {
            vec4 scene = texture(scene_texture, uv);
            vec3 bloom = texture(bloom_texture, uv).rgb;
            vec3 hdr = max(
                scene.rgb + bloom * params.bloom_tint_strength.rgb * params.bloom_tint_strength.a,
                vec3(0.0)
            );
            vec3 mapped = apply_toon_color_grade(naes_tonemap(hdr));
            out_color = vec4(mapped, scene.a);
        }
        """;

    private static readonly Color[] ClearColor = { new(0.0f, 0.0f, 0.0f, 0.0f) };

    private readonly uint _stencilReference;

    private RenderingDevice _renderingDevice;
    private Rid _sampler;
    private long _fullscreenVertexFormat = RenderingDevice.InvalidId;
    private Rid _fullscreenVertexBuffer;
    private Rid _fullscreenVertexArray;
    private Rid _copyShader;
    private Rid _extractShader;
    private Rid _downsampleShader;
    private Rid _upsampleShader;
    private Rid _compositeShader;
    private BloomResources _resources;
    private bool _missingRenderingDeviceWarningPrinted;
    private bool _missingRenderBuffersWarningPrinted;
    private bool _missingStencilWarningPrinted;
    private bool _sourceResolveWarningPrinted;

    public StageAvatarGlowCompositorEffect(int stencilReference)
    {
        _stencilReference = (uint)stencilReference;
        AccessResolvedColor = true;
        AccessResolvedDepth = false;
        EffectCallbackType = EffectCallbackTypeEnum.PostTransparent;
        Enabled = false;
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
                "Avatar glow requires RenderSceneBuffersRD; compositor callback had no RD buffers."
            );
            return;
        }

        var fullSize = buffers.GetInternalSize();
        if (fullSize.X < 2 || fullSize.Y < 2)
        {
            return;
        }

        var sceneColor = buffers.GetColorTexture(false);
        var sceneDepth = SelectStencilDepthTexture(buffers);
        if (!sceneColor.IsValid || !sceneDepth.IsValid)
        {
            return;
        }

        var sceneDepthFormat = _renderingDevice.TextureGetFormat(sceneDepth).Format;
        if (!HasStencil(sceneDepthFormat))
        {
            WarnOnce(
                ref _missingStencilWarningPrinted,
                $"Avatar glow needs a stencil depth texture; scene depth format is {sceneDepthFormat}."
            );
            return;
        }

        if (!EnsureResources(fullSize, sceneColor, sceneDepth))
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

        DrawPass(
            _resources.SceneSourceFramebuffer,
            _resources.SceneCopyPipeline,
            _resources.SceneSourceUniformSet,
            _resources.SceneCopyPushConstants,
            clearColor: false,
            preserveDepthStencil: false
        );

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
            _resources.CompositeFramebuffer,
            _resources.CompositePipeline,
            _resources.CompositeUniformSet,
            _resources.CompositePushConstants,
            clearColor: false,
            preserveDepthStencil: false
        );
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
        FreeOwnedRid(ref _extractShader);
        FreeOwnedRid(ref _downsampleShader);
        FreeOwnedRid(ref _upsampleShader);
        FreeOwnedRid(ref _compositeShader);
        _fullscreenVertexFormat = RenderingDevice.InvalidId;
        _renderingDevice = null;
    }

    private bool EnsureRenderingDevice()
    {
        if (_renderingDevice != null)
        {
            if (RenderingResourcesAreValid())
            {
                return true;
            }

            ReleaseRenderingResourcesOnRenderThread();
        }

        _renderingDevice = RenderingServer.GetRenderingDevice();
        if (_renderingDevice == null)
        {
            WarnOnce(
                ref _missingRenderingDeviceWarningPrinted,
                "Avatar glow requires the Forward+/Mobile rendering device."
            );
            return false;
        }

        _sampler = _renderingDevice.SamplerCreate(new RDSamplerState
        {
            MagFilter = RenderingDevice.SamplerFilter.Linear,
            MinFilter = RenderingDevice.SamplerFilter.Linear,
            MipFilter = RenderingDevice.SamplerFilter.Linear,
            RepeatU = RenderingDevice.SamplerRepeatMode.ClampToEdge,
            RepeatV = RenderingDevice.SamplerRepeatMode.ClampToEdge,
            RepeatW = RenderingDevice.SamplerRepeatMode.ClampToEdge,
        });
        _fullscreenVertexFormat = _renderingDevice.VertexFormatCreate(
            new Godot.Collections.Array<RDVertexAttribute>
            {
                new()
                {
                    Binding = 0,
                    Format = RenderingDevice.DataFormat.R32G32Sfloat,
                    Frequency = RenderingDevice.VertexFrequency.Vertex,
                    Location = 0,
                    Offset = 0,
                    Stride = sizeof(float) * 2,
                },
            }
        );
        _fullscreenVertexBuffer = _renderingDevice.VertexBufferCreate(
            sizeof(float) * 2 * 3,
            CreateFullscreenTriangleVertexData(),
            (RenderingDevice.BufferCreationBits)0
        );
        _fullscreenVertexArray = _renderingDevice.VertexArrayCreate(
            3,
            _fullscreenVertexFormat,
            new Godot.Collections.Array<Rid>
            {
                _fullscreenVertexBuffer,
            },
            new long[] { 0 }
        );
        _copyShader = CompileShader("AIRI avatar glow scene copy", CopySceneFragmentShaderCode);
        _extractShader = CompileShader("AIRI avatar glow extract", ExtractHighlightsFragmentShaderCode);
        _downsampleShader = CompileShader("AIRI avatar glow downsample", DownsampleFragmentShaderCode);
        _upsampleShader = CompileShader("AIRI avatar glow upsample", UpsampleFragmentShaderCode);
        _compositeShader = CompileShader("AIRI avatar glow composite", CompositeFragmentShaderCode);

        if (RenderingResourcesAreValid())
        {
            return true;
        }

        ReleaseRenderingResourcesOnRenderThread();
        return false;
    }

    private bool RenderingResourcesAreValid() =>
        _renderingDevice != null
            && _sampler.IsValid
            && _fullscreenVertexFormat != RenderingDevice.InvalidId
            && _fullscreenVertexBuffer.IsValid
            && _fullscreenVertexArray.IsValid
            && _copyShader.IsValid
            && _extractShader.IsValid
            && _downsampleShader.IsValid
            && _upsampleShader.IsValid
            && _compositeShader.IsValid;

    private Rid SelectStencilDepthTexture(RenderSceneBuffersRD buffers)
    {
        var resolvedDepth = buffers.GetDepthTexture(false);
        if (resolvedDepth.IsValid && HasStencil(_renderingDevice.TextureGetFormat(resolvedDepth).Format))
        {
            return resolvedDepth;
        }

        var msaaDepth = buffers.GetDepthTexture(true);
        if (msaaDepth.IsValid && HasStencil(_renderingDevice.TextureGetFormat(msaaDepth).Format))
        {
            return msaaDepth;
        }

        return resolvedDepth;
    }

    private bool EnsureResources(
        Vector2I fullSize,
        Rid sceneColor,
        Rid sceneDepth
    )
    {
        if (_resources != null
            && _resources.FullSize == fullSize
            && _resources.SceneColor == sceneColor
            && _resources.SceneDepth == sceneDepth
            && _resources.IsValid)
        {
            return true;
        }

        ReleaseResources();

        var resources = new BloomResources
        {
            FullSize = fullSize,
            SceneColor = sceneColor,
            SceneDepth = sceneDepth,
            BloomLevels = ComputeBloomLevels(fullSize),
        };
        var sceneDepthTextureFormat = _renderingDevice.TextureGetFormat(sceneDepth);
        var sourceSamples = sceneDepthTextureFormat.Samples;
        resources.SourceTexture = CreateColorTexture(
            fullSize,
            RenderingDevice.TextureSamples.Samples1,
            canResolveTo: sourceSamples != RenderingDevice.TextureSamples.Samples1
        );
        resources.SourceRenderTexture = sourceSamples == RenderingDevice.TextureSamples.Samples1
            ? resources.SourceTexture
            : CreateColorTexture(fullSize, sourceSamples, canResolveFrom: true);
        resources.SourceResolveRequired = resources.SourceRenderTexture != resources.SourceTexture;
        resources.SourceFramebuffer = GetCachedFramebuffer(resources.SourceRenderTexture, sceneDepth);
        resources.SourceUniformSet = GetCachedSamplerUniformSet(_extractShader, sceneColor);
        resources.ExtractPipeline = CreatePipelineForFramebuffer(
            _extractShader,
            resources.SourceFramebuffer,
            useStencil: true,
            sampleCount: sourceSamples
        );
        resources.ExtractPushConstants = PushConstants(
            Glow.HighlightThreshold,
            Glow.HighlightSmoothness,
            Glow.MaxHighlightBrightness,
            0.0f
        );

        resources.SceneSourceTexture = CreateColorTexture(fullSize);
        resources.SceneSourceFramebuffer = GetCachedFramebuffer(resources.SceneSourceTexture);
        resources.SceneSourceUniformSet = GetCachedSamplerUniformSet(_copyShader, sceneColor);
        resources.SceneCopyPipeline = CreatePipelineForFramebuffer(
            _copyShader,
            resources.SceneSourceFramebuffer,
            useStencil: false,
            sampleCount: RenderingDevice.TextureSamples.Samples1
        );
        resources.SceneCopyPushConstants = Array.Empty<byte>();

        resources.DownsampleSizes = CreateDownsampleSizes(fullSize, resources.BloomLevels);
        resources.DownsampleTextures = new Rid[resources.BloomLevels];
        resources.DownsampleFramebuffers = new Rid[resources.BloomLevels];
        resources.DownsampleUniformSets = new Rid[resources.BloomLevels];
        resources.DownsamplePushConstants = new byte[resources.BloomLevels][];

        for (int level = 0; level < resources.BloomLevels; level++)
        {
            var outputSize = resources.DownsampleSizes[level];
            var inputSize = level == 0 ? fullSize : resources.DownsampleSizes[level - 1];
            var inputTexture = level == 0
                ? resources.SourceTexture
                : resources.DownsampleTextures[level - 1];

            resources.DownsampleTextures[level] = CreateColorTexture(outputSize);
            resources.DownsampleFramebuffers[level] = GetCachedFramebuffer(
                resources.DownsampleTextures[level]
            );
            resources.DownsampleUniformSets[level] = GetCachedSamplerUniformSet(
                _downsampleShader,
                inputTexture
            );
            resources.DownsamplePushConstants[level] = PushConstants(
                1.0f / Math.Max(1, inputSize.X),
                1.0f / Math.Max(1, inputSize.Y),
                level == 0 ? 1.0f : 0.0f,
                0.0f
            );
        }

        resources.UpsampleTextures = new Rid[resources.BloomLevels - 1];
        resources.UpsampleFramebuffers = new Rid[resources.BloomLevels - 1];
        resources.UpsampleUniformSets = new Rid[resources.BloomLevels - 1];
        resources.UpsamplePushConstants = new byte[resources.BloomLevels - 1][];

        for (int level = resources.BloomLevels - 2; level >= 0; level--)
        {
            var outputSize = resources.DownsampleSizes[level];
            var baseTexture = resources.DownsampleTextures[level];
            var inputTexture = level == resources.BloomLevels - 2
                ? resources.DownsampleTextures[level + 1]
                : resources.UpsampleTextures[level + 1];

            resources.UpsampleTextures[level] = CreateColorTexture(outputSize);
            resources.UpsampleFramebuffers[level] = GetCachedFramebuffer(resources.UpsampleTextures[level]);
            resources.UpsampleUniformSets[level] = GetCachedSamplerUniformSet(
                _upsampleShader,
                baseTexture,
                inputTexture
            );
            resources.UpsamplePushConstants[level] = PushConstants(
                1.0f / Math.Max(1, outputSize.X),
                1.0f / Math.Max(1, outputSize.Y),
                0.0f,
                0.0f
            );
        }

        resources.CompositeFramebuffer = GetCachedFramebuffer(sceneColor);
        resources.CompositeUniformSet = GetCachedSamplerUniformSet(
            _compositeShader,
            resources.SceneSourceTexture,
            resources.UpsampleTextures[0]
        );
        resources.CompositePushConstants = CreateCompositePushConstants();

        resources.DownsamplePipeline = CreatePipelineForFramebuffer(
            _downsampleShader,
            resources.DownsampleFramebuffers[0],
            useStencil: false,
            sampleCount: RenderingDevice.TextureSamples.Samples1
        );
        resources.UpsamplePipeline = CreatePipelineForFramebuffer(
            _upsampleShader,
            resources.UpsampleFramebuffers[0],
            useStencil: false,
            sampleCount: RenderingDevice.TextureSamples.Samples1
        );
        resources.CompositePipeline = CreatePipelineForFramebuffer(
            _compositeShader,
            resources.CompositeFramebuffer,
            useStencil: false,
            sampleCount: RenderingDevice.TextureSamples.Samples1
        );

        if (resources.IsValid)
        {
            _resources = resources;
            return true;
        }

        _resources = resources;
        ReleaseResources();
        return false;
    }

    private Rid CompileShader(string name, string fragmentShaderCode)
    {
        var shaderSource = new RDShaderSource
        {
            Language = RenderingDevice.ShaderLanguage.Glsl,
            SourceVertex = FullscreenVertexShaderCode,
            SourceFragment = fragmentShaderCode,
        };
        var spirv = _renderingDevice.ShaderCompileSpirVFromSource(shaderSource, true);
        if (!string.IsNullOrWhiteSpace(spirv.CompileErrorVertex)
            || !string.IsNullOrWhiteSpace(spirv.CompileErrorFragment))
        {
            GD.PushError(
                $"Failed to compile {name}: " +
                $"{spirv.CompileErrorVertex} {spirv.CompileErrorFragment}"
            );
            return new Rid();
        }

        return _renderingDevice.ShaderCreateFromSpirV(spirv, name);
    }

    // TODO: When rim light, post-process outline, or other custom post effects land,
    // split pass orchestration and shared transient render textures from this avatar-glow
    // feature. Effect-owned textures are acceptable for this isolated glow pipeline, but
    // multiple effects should share one viewport-level post-process resource context.
    private Rid CreateColorTexture(
        Vector2I size,
        RenderingDevice.TextureSamples samples = RenderingDevice.TextureSamples.Samples1,
        bool canResolveFrom = false,
        bool canResolveTo = false
    )
    {
        var usageBits =
            RenderingDevice.TextureUsageBits.SamplingBit |
            RenderingDevice.TextureUsageBits.ColorAttachmentBit;
        if (canResolveFrom)
        {
            usageBits |= RenderingDevice.TextureUsageBits.CanCopyFromBit;
        }

        if (canResolveTo)
        {
            usageBits |= RenderingDevice.TextureUsageBits.CanCopyToBit;
        }

        var textureFormat = new RDTextureFormat
        {
            Format = RenderingDevice.DataFormat.R16G16B16A16Sfloat,
            Width = (uint)Math.Max(1, size.X),
            Height = (uint)Math.Max(1, size.Y),
            Depth = 1,
            ArrayLayers = 1,
            Mipmaps = 1,
            Samples = samples,
            TextureType = RenderingDevice.TextureType.Type2D,
            UsageBits = usageBits,
        };

        return _renderingDevice.TextureCreate(
            textureFormat,
            new RDTextureView(),
            new Godot.Collections.Array<byte[]>()
        );
    }

    private static Rid GetCachedFramebuffer(params Rid[] textures)
    {
        if (!AllRidsValid(textures))
        {
            return new Rid();
        }

        var attachments = new Godot.Collections.Array<Rid>();
        foreach (var texture in textures)
        {
            attachments.Add(texture);
        }

        return FramebufferCacheRD.GetCacheMultipass(
            attachments,
            new Godot.Collections.Array<RDFramebufferPass>(),
            1
        );
    }

    private Rid GetCachedSamplerUniformSet(Rid shader, params Rid[] textures)
    {
        if (!_sampler.IsValid || !shader.IsValid || !AllRidsValid(textures))
        {
            return new Rid();
        }

        var uniforms = new Godot.Collections.Array<RDUniform>();
        for (int index = 0; index < textures.Length; index++)
        {
            var uniform = new RDUniform
            {
                Binding = index,
                UniformType = RenderingDevice.UniformType.SamplerWithTexture,
            };
            uniform.AddId(_sampler);
            uniform.AddId(textures[index]);
            uniforms.Add(uniform);
        }

        return UniformSetCacheRD.GetCache(shader, 0, uniforms);
    }

    private Rid CreatePipelineForFramebuffer(
        Rid shader,
        Rid framebuffer,
        bool useStencil,
        RenderingDevice.TextureSamples sampleCount
    )
    {
        if (!framebuffer.IsValid)
        {
            return new Rid();
        }

        return CreatePipeline(
            shader,
            _renderingDevice.FramebufferGetFormat(framebuffer),
            useStencil,
            sampleCount
        );
    }

    private Rid CreatePipeline(
        Rid shader,
        long framebufferFormat,
        bool useStencil,
        RenderingDevice.TextureSamples sampleCount
    )
    {
        if (!shader.IsValid
            || framebufferFormat == RenderingDevice.InvalidId
            || _fullscreenVertexFormat == RenderingDevice.InvalidId)
        {
            return new Rid();
        }

        var blendAttachment = new RDPipelineColorBlendStateAttachment
        {
            EnableBlend = false,
            WriteR = true,
            WriteG = true,
            WriteB = true,
            WriteA = true,
        };

        var blendAttachments = new Godot.Collections.Array<RDPipelineColorBlendStateAttachment>
        {
            blendAttachment,
        };
        var depthStencil = new RDPipelineDepthStencilState();
        if (useStencil)
        {
            ConfigureStencilTest(depthStencil);
        }

        return _renderingDevice.RenderPipelineCreate(
            shader,
            framebufferFormat,
            _fullscreenVertexFormat,
            RenderingDevice.RenderPrimitive.Triangles,
            new RDPipelineRasterizationState
            {
                CullMode = RenderingDevice.PolygonCullMode.Disabled,
            },
            new RDPipelineMultisampleState
            {
                SampleCount = sampleCount,
            },
            depthStencil,
            new RDPipelineColorBlendState
            {
                Attachments = blendAttachments,
            },
            (RenderingDevice.PipelineDynamicStateFlags)0,
            0,
            new Godot.Collections.Array<RDPipelineSpecializationConstant>()
        );
    }

    private void ConfigureStencilTest(RDPipelineDepthStencilState depthStencil)
    {
        depthStencil.EnableStencil = true;

        depthStencil.FrontOpFail = RenderingDevice.StencilOperation.Keep;
        depthStencil.FrontOpPass = RenderingDevice.StencilOperation.Keep;
        depthStencil.FrontOpDepthFail = RenderingDevice.StencilOperation.Keep;
        depthStencil.FrontOpCompare = RenderingDevice.CompareOperator.Equal;
        depthStencil.FrontOpCompareMask = 0xff;
        depthStencil.FrontOpWriteMask = 0x00;
        depthStencil.FrontOpReference = _stencilReference;

        depthStencil.BackOpFail = RenderingDevice.StencilOperation.Keep;
        depthStencil.BackOpPass = RenderingDevice.StencilOperation.Keep;
        depthStencil.BackOpDepthFail = RenderingDevice.StencilOperation.Keep;
        depthStencil.BackOpCompare = RenderingDevice.CompareOperator.Equal;
        depthStencil.BackOpCompareMask = 0xff;
        depthStencil.BackOpWriteMask = 0x00;
        depthStencil.BackOpReference = _stencilReference;
    }

    private void DrawPass(
        Rid framebuffer,
        Rid pipeline,
        Rid uniformSet,
        byte[] pushConstants,
        bool clearColor,
        bool preserveDepthStencil
    )
    {
        if (!framebuffer.IsValid || !pipeline.IsValid || !uniformSet.IsValid)
        {
            return;
        }

        var drawFlags = clearColor
            ? RenderingDevice.DrawFlags.ClearColor0
            : 0;
        if (!preserveDepthStencil)
        {
            drawFlags |= RenderingDevice.DrawFlags.IgnoreDepth;
            drawFlags |= RenderingDevice.DrawFlags.IgnoreStencil;
        }

        var drawList = _renderingDevice.DrawListBegin(
            framebuffer,
            drawFlags,
            ClearColor,
            1.0f,
            0,
            null,
            0
        );
        _renderingDevice.DrawListBindRenderPipeline(drawList, pipeline);
        _renderingDevice.DrawListBindUniformSet(drawList, uniformSet, 0);
        _renderingDevice.DrawListBindVertexArray(drawList, _fullscreenVertexArray);
        if (pushConstants.Length > 0)
        {
            _renderingDevice.DrawListSetPushConstant(drawList, pushConstants, (uint)pushConstants.Length);
        }

        _renderingDevice.DrawListDraw(drawList, false, 1, 0);
        _renderingDevice.DrawListEnd();
    }

    private void ReleaseResources()
    {
        if (_resources == null)
        {
            return;
        }

        if (_renderingDevice == null)
        {
            _resources = null;
            return;
        }

        foreach (var rid in _resources.PipelineRids)
        {
            FreeRenderPipelineRid(rid);
        }

        foreach (var rid in _resources.TextureRids)
        {
            FreeTextureRid(rid);
        }

        _resources = null;
    }

    private void FreeRenderPipelineRid(Rid rid)
    {
        if (_renderingDevice != null
            && rid.IsValid
            && _renderingDevice.RenderPipelineIsValid(rid))
        {
            _renderingDevice.FreeRid(rid);
        }
    }

    private void FreeTextureRid(Rid rid)
    {
        if (_renderingDevice != null
            && rid.IsValid
            && _renderingDevice.TextureIsValid(rid))
        {
            _renderingDevice.FreeRid(rid);
        }
    }

    private void FreeOwnedRid(ref Rid rid)
    {
        if (_renderingDevice != null && rid.IsValid)
        {
            _renderingDevice.FreeRid(rid);
            rid = new Rid();
        }
    }

    private static int ComputeBloomLevels(Vector2I fullSize)
    {
        var glareSize = GetGlareImageSize(fullSize);
        int smallerDimension = Math.Max(1, Math.Min(glareSize.X, glareSize.Y));
        float scaledDimension = Math.Max(1.0f, smallerDimension * Glow.BloomSize);
        int levels = Math.Max(2, Mathf.FloorToInt(Mathf.Log(scaledDimension) / Mathf.Log(2.0f)));
        return Math.Min(levels, MaxBloomLevels);
    }

    private static Vector2I GetGlareImageSize(Vector2I fullSize) => new(
        Math.Max(2, (fullSize.X + BloomQualityFactor - 1) / BloomQualityFactor),
        Math.Max(2, (fullSize.Y + BloomQualityFactor - 1) / BloomQualityFactor)
    );

    private static Vector2I[] CreateDownsampleSizes(Vector2I fullSize, int bloomLevels)
    {
        var sizes = new Vector2I[bloomLevels];
        sizes[0] = GetGlareImageSize(fullSize);
        for (int index = 1; index < sizes.Length; index++)
        {
            sizes[index] = new Vector2I(
                Math.Max(2, sizes[index - 1].X / 2),
                Math.Max(2, sizes[index - 1].Y / 2)
            );
        }

        return sizes;
    }

    private static bool HasStencil(RenderingDevice.DataFormat format) =>
        format == RenderingDevice.DataFormat.D16UnormS8Uint
        || format == RenderingDevice.DataFormat.D24UnormS8Uint
        || format == RenderingDevice.DataFormat.D32SfloatS8Uint;

    private static bool AllRidsValid(Rid[] rids)
    {
        if (rids == null || rids.Length == 0)
        {
            return false;
        }

        foreach (var rid in rids)
        {
            if (!rid.IsValid)
            {
                return false;
            }
        }

        return true;
    }

    private static byte[] CreateCompositePushConstants() => PushConstants(
        Glow.BloomTint.R,
        Glow.BloomTint.G,
        Glow.BloomTint.B,
        Glow.BloomStrength,
        NaesTonemap.A,
        NaesTonemap.B,
        NaesTonemap.C,
        NaesTonemap.D,
        NaesTonemap.E,
        NaesTonemap.InputMax,
        0.0f,
        0.0f,
        ToonColorGrade.LumaRiseStart,
        ToonColorGrade.LumaRiseEnd,
        ToonColorGrade.LumaFallStart,
        ToonColorGrade.LumaFallEnd,
        ToonColorGrade.LumaMidDip,
        ToonColorGrade.VibranceLumaStart,
        ToonColorGrade.VibranceLumaEnd,
        ToonColorGrade.VibranceSaturationStart,
        ToonColorGrade.VibranceSaturationEnd,
        ToonColorGrade.ChromaBase,
        ToonColorGrade.ChromaBoost,
        0.0f
    );

    private static byte[] PushConstants(params float[] values)
    {
        var bytes = new byte[sizeof(float) * values.Length];
        Buffer.BlockCopy(values, 0, bytes, 0, bytes.Length);
        return bytes;
    }

    private static byte[] CreateFullscreenTriangleVertexData()
    {
        var vertices = new[]
        {
            -1.0f, -1.0f,
            -1.0f, 3.0f,
            3.0f, -1.0f,
        };
        var bytes = new byte[vertices.Length * sizeof(float)];
        Buffer.BlockCopy(vertices, 0, bytes, 0, bytes.Length);
        return bytes;
    }

    private static void WarnOnce(ref bool printed, string message)
    {
        if (printed)
        {
            return;
        }

        printed = true;
        GD.PushWarning(message);
    }

    private readonly record struct GlowSettings(
        Color BloomTint,
        float BloomStrength,
        float BloomSize,
        float HighlightThreshold,
        float HighlightSmoothness,
        float MaxHighlightBrightness
    );

    private readonly record struct NaesTonemapSettings(
        float A,
        float B,
        float C,
        float D,
        float E,
        float InputMax
    );

    private readonly record struct ToonColorGradeSettings(
        float LumaRiseStart,
        float LumaRiseEnd,
        float LumaFallStart,
        float LumaFallEnd,
        float LumaMidDip,
        float VibranceLumaStart,
        float VibranceLumaEnd,
        float VibranceSaturationStart,
        float VibranceSaturationEnd,
        float ChromaBase,
        float ChromaBoost
    );

    private sealed class BloomResources
    {
        public Vector2I FullSize;
        public Rid SceneColor;
        public Rid SceneDepth;
        public int BloomLevels;

        public Rid SourceTexture;
        public Rid SourceRenderTexture;
        public bool SourceResolveRequired;
        public Rid SourceFramebuffer;
        public Rid SourceUniformSet;
        public Rid ExtractPipeline;
        public byte[] ExtractPushConstants;

        public Rid SceneSourceTexture;
        public Rid SceneSourceFramebuffer;
        public Rid SceneSourceUniformSet;
        public Rid SceneCopyPipeline;
        public byte[] SceneCopyPushConstants;

        public Vector2I[] DownsampleSizes;
        public Rid[] DownsampleTextures;
        public Rid[] DownsampleFramebuffers;
        public Rid[] DownsampleUniformSets;
        public byte[][] DownsamplePushConstants;
        public Rid DownsamplePipeline;

        public Rid[] UpsampleTextures;
        public Rid[] UpsampleFramebuffers;
        public Rid[] UpsampleUniformSets;
        public byte[][] UpsamplePushConstants;
        public Rid UpsamplePipeline;

        public Rid CompositeFramebuffer;
        public Rid CompositeUniformSet;
        public byte[] CompositePushConstants;
        public Rid CompositePipeline;

        public bool IsValid =>
            SourceTexture.IsValid
            && SourceRenderTexture.IsValid
            && SourceFramebuffer.IsValid
            && SourceUniformSet.IsValid
            && ExtractPipeline.IsValid
            && ExtractPushConstants != null
            && SceneSourceTexture.IsValid
            && SceneSourceFramebuffer.IsValid
            && SceneSourceUniformSet.IsValid
            && SceneCopyPipeline.IsValid
            && SceneCopyPushConstants != null
            && DownsampleSizes != null
            && DownsampleSizes.Length == BloomLevels
            && StageAvatarGlowCompositorEffect.AllRidsValid(DownsampleTextures)
            && StageAvatarGlowCompositorEffect.AllRidsValid(DownsampleFramebuffers)
            && StageAvatarGlowCompositorEffect.AllRidsValid(DownsampleUniformSets)
            && AllArraysPresent(DownsamplePushConstants)
            && DownsamplePipeline.IsValid
            && StageAvatarGlowCompositorEffect.AllRidsValid(UpsampleTextures)
            && StageAvatarGlowCompositorEffect.AllRidsValid(UpsampleFramebuffers)
            && StageAvatarGlowCompositorEffect.AllRidsValid(UpsampleUniformSets)
            && AllArraysPresent(UpsamplePushConstants)
            && UpsamplePipeline.IsValid
            && CompositeFramebuffer.IsValid
            && CompositeUniformSet.IsValid
            && CompositePushConstants != null
            && CompositePipeline.IsValid;

        private static bool AllArraysPresent(byte[][] arrays)
        {
            if (arrays == null || arrays.Length == 0)
            {
                return false;
            }

            foreach (var array in arrays)
            {
                if (array == null)
                {
                    return false;
                }
            }

            return true;
        }

        public IEnumerable<Rid> TextureRids
        {
            get
            {
                yield return SourceTexture;
                if (SourceRenderTexture != SourceTexture)
                {
                    yield return SourceRenderTexture;
                }

                yield return SceneSourceTexture;

                for (int level = 0; DownsampleTextures != null && level < DownsampleTextures.Length; level++)
                {
                    yield return DownsampleTextures[level];
                }

                for (int level = 0; UpsampleTextures != null && level < UpsampleTextures.Length; level++)
                {
                    yield return UpsampleTextures[level];
                }
            }
        }

        public IEnumerable<Rid> PipelineRids
        {
            get
            {
                yield return SceneCopyPipeline;
                yield return ExtractPipeline;
                yield return DownsamplePipeline;
                yield return UpsamplePipeline;
                yield return CompositePipeline;
            }
        }
    }
}
