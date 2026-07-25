using System;
using System.Collections.Generic;
using Godot;

public partial class StagePostProcessCompositorEffect
{
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
                "Stage post-process requires the Forward+/Mobile rendering device."
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
        _copyShader = CompileShader("AIRI stage scene copy", CopySceneFragmentShaderCode);
        _extractShader = CompileShader("AIRI avatar source extract", ExtractHighlightsFragmentShaderCode);
        _downsampleShader = CompileShader("AIRI avatar glow downsample", DownsampleFragmentShaderCode);
        _upsampleShader = CompileShader("AIRI avatar glow upsample", UpsampleFragmentShaderCode);
        _glowCompositeShader = CompileShader(
            "AIRI stage glow composite",
            GlowCompositeFragmentShaderCode
        );
        _finalColorShader = CompileShader("AIRI stage final color", FinalColorFragmentShaderCode);
        _avatarMaskShader = CompileShader("AIRI avatar mask", AvatarMaskFragmentShaderCode);
        _edgeLightShader = CompileShader("AIRI avatar edge light", EdgeLightFragmentShaderCode);

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
            && _avatarMaskShader.IsValid
            && _edgeLightShader.IsValid
            && _extractShader.IsValid
            && _downsampleShader.IsValid
            && _upsampleShader.IsValid
            && _glowCompositeShader.IsValid
            && _finalColorShader.IsValid;

    private Rid GetNormalRoughnessTexture(RenderSceneBuffersRD buffers)
    {
        if (!buffers.HasTexture("forward_clustered", "normal_roughness"))
        {
            return new Rid();
        }

        return buffers.GetTexture("forward_clustered", "normal_roughness");
    }

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
        Rid stencilDepth,
        Rid resolvedDepth,
        Rid normalRoughness,
        bool includeAvatarMask,
        bool includeAvatarEdgeLight,
        StageRenderDebugView debugView
    )
    {
        if (_resources != null
            && _resources.FullSize == fullSize
            && _resources.SceneColor == sceneColor
            && _resources.StencilDepth == stencilDepth
            && _resources.ResolvedDepth == resolvedDepth
            && _resources.NormalRoughness == normalRoughness
            && _resources.IncludesAvatarMask == includeAvatarMask
            && _resources.IncludesAvatarEdgeLight == includeAvatarEdgeLight
            && _resources.DebugView == debugView
            && _resources.IsValid)
        {
            return true;
        }

        ReleaseResources();

        var resources = new PostProcessResources
        {
            FullSize = fullSize,
            SceneColor = sceneColor,
            StencilDepth = stencilDepth,
            ResolvedDepth = resolvedDepth,
            NormalRoughness = normalRoughness,
            IncludesAvatarMask = includeAvatarMask,
            IncludesAvatarEdgeLight = includeAvatarEdgeLight,
            DebugView = debugView,
            BloomLevels = includeAvatarMask ? ComputeBloomLevels(fullSize) : 0,
        };

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

        if (includeAvatarMask)
        {
            var sceneDepthTextureFormat = _renderingDevice.TextureGetFormat(stencilDepth);
            var sourceSamples = sceneDepthTextureFormat.Samples;
            resources.AvatarMaskTexture = CreateColorTexture(
                fullSize,
                RenderingDevice.TextureSamples.Samples1,
                canResolveTo: sourceSamples != RenderingDevice.TextureSamples.Samples1
            );
            resources.AvatarMaskRenderTexture = sourceSamples == RenderingDevice.TextureSamples.Samples1
                ? resources.AvatarMaskTexture
                : CreateColorTexture(fullSize, sourceSamples, canResolveFrom: true);
            resources.AvatarMaskResolveRequired =
                resources.AvatarMaskRenderTexture != resources.AvatarMaskTexture;
            resources.AvatarMaskFramebuffer = GetCachedFramebuffer(
                resources.AvatarMaskRenderTexture,
                stencilDepth
            );
            resources.AvatarMaskUniformSet = GetCachedSamplerUniformSet(
                _avatarMaskShader,
                resources.SceneSourceTexture
            );
            resources.AvatarMaskPushConstants = Array.Empty<byte>();
            resources.AvatarMaskPipeline = CreatePipelineForFramebuffer(
                _avatarMaskShader,
                resources.AvatarMaskFramebuffer,
                useStencil: true,
                sampleCount: sourceSamples
            );

            if (includeAvatarEdgeLight)
            {
                resources.AvatarEdgeLightTexture = CreateColorTexture(fullSize);
                resources.AvatarEdgeLightFramebuffer = GetCachedFramebuffer(
                    resources.AvatarEdgeLightTexture
                );
                resources.AvatarEdgeLightUniformSet = GetCachedSamplerUniformSet(
                    _edgeLightShader,
                    resources.SceneSourceTexture,
                    resolvedDepth,
                    normalRoughness,
                    resources.AvatarMaskTexture
                );
                resources.AvatarEdgeLightPushConstants = CreateEdgeLightPushConstants(
                    fullSize,
                    debugView == StageRenderDebugView.AvatarEdgeMask
                );
                resources.AvatarEdgeLightPipeline = CreatePipelineForFramebuffer(
                    _edgeLightShader,
                    resources.AvatarEdgeLightFramebuffer,
                    useStencil: false,
                    sampleCount: RenderingDevice.TextureSamples.Samples1
                );
            }

            var avatarGlowInputTexture = includeAvatarEdgeLight
                ? resources.AvatarEdgeLightTexture
                : resources.SceneSourceTexture;
            resources.SourceTexture = CreateColorTexture(
                fullSize,
                RenderingDevice.TextureSamples.Samples1,
                canResolveTo: sourceSamples != RenderingDevice.TextureSamples.Samples1
            );
            resources.SourceRenderTexture = sourceSamples == RenderingDevice.TextureSamples.Samples1
                ? resources.SourceTexture
                : CreateColorTexture(fullSize, sourceSamples, canResolveFrom: true);
            resources.SourceResolveRequired = resources.SourceRenderTexture != resources.SourceTexture;
            resources.SourceFramebuffer = GetCachedFramebuffer(resources.SourceRenderTexture, stencilDepth);
            resources.SourceUniformSet = GetCachedSamplerUniformSet(
                _extractShader,
                avatarGlowInputTexture
            );
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
                resources.UpsampleFramebuffers[level] = GetCachedFramebuffer(
                    resources.UpsampleTextures[level]
                );
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

            resources.GlowCompositeTexture = CreateColorTexture(fullSize);
            resources.GlowCompositeFramebuffer = GetCachedFramebuffer(resources.GlowCompositeTexture);
            resources.GlowCompositeUniformSet = GetCachedSamplerUniformSet(
                _glowCompositeShader,
                avatarGlowInputTexture,
                resources.UpsampleTextures[0]
            );
            resources.GlowCompositePushConstants = CreateGlowCompositePushConstants();
            resources.GlowCompositePipeline = CreatePipelineForFramebuffer(
                _glowCompositeShader,
                resources.GlowCompositeFramebuffer,
                useStencil: false,
                sampleCount: RenderingDevice.TextureSamples.Samples1
            );
        }

        resources.FinalColorFramebuffer = GetCachedFramebuffer(sceneColor);
        resources.FinalColorUniformSet = GetCachedSamplerUniformSet(
            _finalColorShader,
            includeAvatarMask
                ? resources.GlowCompositeTexture
                : resources.SceneSourceTexture
        );
        resources.FinalColorPushConstants = CreateFinalColorPushConstants();
        resources.DebugOutputPipeline = CreatePipelineForFramebuffer(
            _copyShader,
            resources.FinalColorFramebuffer,
            useStencil: false,
            sampleCount: RenderingDevice.TextureSamples.Samples1
        );
        resources.DebugSceneCopyUniformSet = GetCachedSamplerUniformSet(
            _copyShader,
            resources.SceneSourceTexture
        );

        if (includeAvatarMask)
        {
            resources.DebugAvatarMaskUniformSet = GetCachedSamplerUniformSet(
                _copyShader,
                resources.AvatarMaskTexture
            );
            if (includeAvatarEdgeLight)
            {
                resources.DebugAvatarEdgeLightUniformSet = GetCachedSamplerUniformSet(
                    _copyShader,
                    resources.AvatarEdgeLightTexture
                );
            }

            resources.DebugGlowCompositeUniformSet = GetCachedSamplerUniformSet(
                _copyShader,
                resources.GlowCompositeTexture
            );
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
        }

        resources.FinalColorPipeline = CreatePipelineForFramebuffer(
            _finalColorShader,
            resources.FinalColorFramebuffer,
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

    // NOTICE:
    // StageRenderEffectsRuntime owns the camera/overlay slots; this compositor owns the
    // same-frame RD pass graph and transient textures for post-process effects.
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

    private static byte[] CreateGlowCompositePushConstants() => PushConstants(
        Glow.BloomTint.R,
        Glow.BloomTint.G,
        Glow.BloomTint.B,
        Glow.BloomStrength
    );

    private byte[] CreateEdgeLightPushConstants(
        Vector2I fullSize,
        bool debugEdgeMask
    ) => PushConstants(
        1.0f / Math.Max(1, fullSize.X),
        1.0f / Math.Max(1, fullSize.Y),
        EdgeLight.WidthPixels,
        EdgeLight.VerticalScale,
        EdgeLight.DepthThresholdStart,
        EdgeLight.DepthThresholdEnd,
        EdgeLight.Strength,
        EdgeLight.ValueBoost,
        debugEdgeMask ? 1.0f : 0.0f,
        _camera.Near,
        _camera.Far,
        EdgeLight.WidthReferenceDepth
    );

    private static byte[] CreateFinalColorPushConstants() => PushConstants(
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

    private readonly record struct EdgeLightSettings(
        float WidthPixels,
        float VerticalScale,
        float DepthThresholdStart,
        float DepthThresholdEnd,
        float Strength,
        float ValueBoost,
        float WidthReferenceDepth
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

    private sealed class PostProcessResources
    {
        public Vector2I FullSize;
        public Rid SceneColor;
        public Rid StencilDepth;
        public Rid ResolvedDepth;
        public Rid NormalRoughness;
        public bool IncludesAvatarMask;
        public bool IncludesAvatarEdgeLight;
        public StageRenderDebugView DebugView;
        public int BloomLevels;

        public Rid AvatarMaskTexture;
        public Rid AvatarMaskRenderTexture;
        public bool AvatarMaskResolveRequired;
        public Rid AvatarMaskFramebuffer;
        public Rid AvatarMaskUniformSet;
        public byte[] AvatarMaskPushConstants;
        public Rid AvatarMaskPipeline;

        public Rid AvatarEdgeLightTexture;
        public Rid AvatarEdgeLightFramebuffer;
        public Rid AvatarEdgeLightUniformSet;
        public byte[] AvatarEdgeLightPushConstants;
        public Rid AvatarEdgeLightPipeline;

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

        public Rid GlowCompositeTexture;
        public Rid GlowCompositeFramebuffer;
        public Rid GlowCompositeUniformSet;
        public byte[] GlowCompositePushConstants;
        public Rid GlowCompositePipeline;

        public Rid FinalColorFramebuffer;
        public Rid FinalColorUniformSet;
        public byte[] FinalColorPushConstants;
        public Rid FinalColorPipeline;
        public Rid DebugOutputPipeline;
        public Rid DebugSceneCopyUniformSet;
        public Rid DebugAvatarMaskUniformSet;
        public Rid DebugAvatarEdgeLightUniformSet;
        public Rid DebugGlowCompositeUniformSet;

        public bool IsValid =>
            SceneSourceTexture.IsValid
            && SceneSourceFramebuffer.IsValid
            && SceneSourceUniformSet.IsValid
            && SceneCopyPipeline.IsValid
            && SceneCopyPushConstants != null
            && DebugOutputPipeline.IsValid
            && DebugSceneCopyUniformSet.IsValid
            && FinalColorFramebuffer.IsValid
            && FinalColorUniformSet.IsValid
            && FinalColorPushConstants != null
            && FinalColorPipeline.IsValid
            && DebugOutputResourcesAreValid
            && (!IncludesAvatarEdgeLight || AvatarEdgeLightResourcesAreValid)
            && (!IncludesAvatarMask || AvatarGlowResourcesAreValid);

        private bool DebugOutputResourcesAreValid =>
            !IncludesAvatarMask
            || (
                DebugAvatarMaskUniformSet.IsValid
                && DebugGlowCompositeUniformSet.IsValid
                && (!IncludesAvatarEdgeLight || DebugAvatarEdgeLightUniformSet.IsValid)
            );

        private bool AvatarGlowResourcesAreValid =>
            AvatarMaskTexture.IsValid
            && AvatarMaskRenderTexture.IsValid
            && AvatarMaskFramebuffer.IsValid
            && AvatarMaskUniformSet.IsValid
            && AvatarMaskPushConstants != null
            && AvatarMaskPipeline.IsValid
            && SourceTexture.IsValid
            && SourceRenderTexture.IsValid
            && SourceFramebuffer.IsValid
            && SourceUniformSet.IsValid
            && ExtractPipeline.IsValid
            && ExtractPushConstants != null
            && DownsampleSizes != null
            && DownsampleSizes.Length == BloomLevels
            && StagePostProcessCompositorEffect.AllRidsValid(DownsampleTextures)
            && StagePostProcessCompositorEffect.AllRidsValid(DownsampleFramebuffers)
            && StagePostProcessCompositorEffect.AllRidsValid(DownsampleUniformSets)
            && AllArraysPresent(DownsamplePushConstants)
            && DownsamplePipeline.IsValid
            && StagePostProcessCompositorEffect.AllRidsValid(UpsampleTextures)
            && StagePostProcessCompositorEffect.AllRidsValid(UpsampleFramebuffers)
            && StagePostProcessCompositorEffect.AllRidsValid(UpsampleUniformSets)
            && AllArraysPresent(UpsamplePushConstants)
            && UpsamplePipeline.IsValid
            && GlowCompositeTexture.IsValid
            && GlowCompositeFramebuffer.IsValid
            && GlowCompositeUniformSet.IsValid
            && GlowCompositePushConstants != null
            && GlowCompositePipeline.IsValid;

        private bool AvatarEdgeLightResourcesAreValid =>
            ResolvedDepth.IsValid
            && NormalRoughness.IsValid
            && AvatarEdgeLightTexture.IsValid
            && AvatarEdgeLightFramebuffer.IsValid
            && AvatarEdgeLightUniformSet.IsValid
            && AvatarEdgeLightPushConstants != null
            && AvatarEdgeLightPipeline.IsValid;

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
                yield return AvatarMaskTexture;
                if (AvatarMaskRenderTexture.IsValid && AvatarMaskRenderTexture != AvatarMaskTexture)
                {
                    yield return AvatarMaskRenderTexture;
                }

                yield return AvatarEdgeLightTexture;
                yield return SourceTexture;
                if (SourceRenderTexture.IsValid && SourceRenderTexture != SourceTexture)
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

                yield return GlowCompositeTexture;
            }
        }

        public IEnumerable<Rid> PipelineRids
        {
            get
            {
                yield return SceneCopyPipeline;
                yield return AvatarMaskPipeline;
                yield return AvatarEdgeLightPipeline;
                yield return ExtractPipeline;
                yield return DownsamplePipeline;
                yield return UpsamplePipeline;
                yield return GlowCompositePipeline;
                yield return FinalColorPipeline;
                yield return DebugOutputPipeline;
            }
        }
    }
}
