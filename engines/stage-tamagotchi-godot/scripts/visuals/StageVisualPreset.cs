using System;
using Godot;
using GodotEnvironment = Godot.Environment;

/// <summary>
/// Installs the fixed G1.3 default stage visual baseline.
///
/// Use when:
/// - The sidecar starts the default AIRI presentation stage.
/// - Camera, lighting, sky, and ground references should be available without host settings.
///
/// Expects:
/// - The stage root is a live <see cref="Node3D"/>.
/// - Workspace runs can reach the existing stage-ui-three HDRI from the Godot project path.
///
/// Returns:
/// - A single runtime-owned visual preset subtree with sky, ground references, and light rig.
/// </summary>
public static class StageVisualPreset
{
    private const string VisualPresetRootNodeName = "DefaultStageVisualPreset";
    private const string WorldEnvironmentNodeName = "StageWorldEnvironment";
    private const string LightingRigNodeName = "StageLightingRig";
    private const string GroundPlaneNodeName = "StageGroundPlane";
    private const string CenterMarkerNodeName = "StageCenterT";

    private const float GroundExtent = 180.0f;
    private const float LightShadowMaxDistance = 24.0f;
    private const float CenterMarkerElevation = 0.008f;
    private const string FadingGridShaderCode = """
        shader_type spatial;
        render_mode unshaded, cull_disabled, blend_mix;

        uniform vec4 ground_color : source_color;
        uniform vec4 horizon_mist_color : source_color;
        uniform vec4 minor_grid_color : source_color;
        uniform vec4 major_grid_color : source_color;
        uniform vec4 center_grid_color : source_color;
        uniform float minor_spacing = 0.25;
        uniform float major_spacing = 1.0;
        uniform float fade_start = 8.0;
        uniform float fade_end = 22.0;
        uniform float minor_line_width = 0.34;
        uniform float major_line_width = 0.58;
        uniform float axis_width_world = 0.018;

        varying vec3 world_position;

        void vertex() {
            world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
        }

        float grid_line(vec2 position, float spacing, float width) {
            vec2 coordinate = position / spacing;
            vec2 derivative = max(fwidth(coordinate), vec2(0.0001));
            vec2 grid = abs(fract(coordinate - 0.5) - 0.5) / derivative;
            return 1.0 - smoothstep(width, width + 1.0, min(grid.x, grid.y));
        }

        float axis_line(float coordinate) {
            float derivative = max(fwidth(coordinate), 0.0001);
            return 1.0 - smoothstep(axis_width_world, axis_width_world + derivative, abs(coordinate));
        }

        void fragment() {
            float distance_to_camera = distance(CAMERA_POSITION_WORLD.xz, world_position.xz);
            float horizon_fade = smoothstep(fade_start, fade_end, distance_to_camera);
            float grid_fade = pow(1.0 - horizon_fade, 3.2);

            float minor_line = grid_line(world_position.xz, minor_spacing, minor_line_width);
            float major_line = grid_line(world_position.xz, major_spacing, major_line_width);
            float axis_line_alpha = max(axis_line(world_position.x), axis_line(world_position.z));

            vec3 base_color = mix(
                ground_color.rgb,
                horizon_mist_color.rgb,
                horizon_fade * horizon_mist_color.a
            );
            vec3 grid_color = mix(minor_grid_color.rgb, major_grid_color.rgb, major_line);
            grid_color = mix(grid_color, center_grid_color.rgb, axis_line_alpha);

            float line_alpha = max(
                minor_line * minor_grid_color.a,
                major_line * major_grid_color.a
            );
            line_alpha = max(line_alpha, axis_line_alpha * center_grid_color.a) * grid_fade;

            ALBEDO = mix(base_color, grid_color, line_alpha);
            ALPHA = 1.0 - horizon_fade;
            ROUGHNESS = 0.88;
        }
        """;

    private static readonly Color GroundColor = new(0.31f, 0.31f, 0.31f, 1.0f);
    private static readonly Color HorizonMistColor = new(0.68f, 0.68f, 0.68f, 0.82f);
    private static readonly Color MinorGridColor = new(1.0f, 1.0f, 1.0f, 0.20f);
    private static readonly Color MajorGridColor = new(1.0f, 1.0f, 1.0f, 0.38f);
    private static readonly Color CenterGridColor = new(1.0f, 1.0f, 1.0f, 0.72f);
    private static readonly Color CenterMarkerColor = new(0.72f, 0.94f, 1.0f, 0.92f);
    private static readonly Color AmbientLightColor = new(0.06f, 0.06f, 0.06f, 1.0f);
    private static readonly Color StageBackgroundColor = new(0.015f, 0.014f, 0.018f, 1.0f);

    /// <summary>
    /// Applies the stage visual preset under the provided root node.
    ///
    /// Use when:
    /// - A stage scene should install its default visual baseline during startup.
    ///
    /// Expects:
    /// - <paramref name="stageRoot"/> is not null.
    ///
    /// Returns:
    /// - Existing preset subtree is replaced with a fresh fixed visual preset.
    /// </summary>
    public static void Apply(Node3D stageRoot)
    {
        if (stageRoot == null)
        {
            throw new ArgumentNullException(nameof(stageRoot));
        }

        ConfigureViewport(stageRoot.GetViewport());
        RemoveExistingPreset(stageRoot);

        var visualRoot = new Node3D
        {
            Name = VisualPresetRootNodeName,
        };
        stageRoot.AddChild(visualRoot);

        visualRoot.AddChild(CreateWorldEnvironment());
        visualRoot.AddChild(CreateGroundPlane());
        visualRoot.AddChild(CreateCenterMarker());
        visualRoot.AddChild(CreateLightingRig());
    }

    private static void ConfigureViewport(Viewport viewport)
    {
        if (viewport == null)
        {
            return;
        }

        viewport.UseHdr2D = true;
        viewport.UseDebanding = true;
    }

    private static void RemoveExistingPreset(Node stageRoot)
    {
        var existingPreset = stageRoot.GetNodeOrNull<Node>(VisualPresetRootNodeName);
        if (existingPreset == null)
        {
            return;
        }

        stageRoot.RemoveChild(existingPreset);
        existingPreset.QueueFree();
    }

    private static WorldEnvironment CreateWorldEnvironment()
    {
        var skyMaterial = new PanoramaSkyMaterial
        {
            EnergyMultiplier = 1.0f,
            Panorama = LoadSkyTexture(),
        };
        var sky = new Sky
        {
            ProcessMode = Sky.ProcessModeEnum.Quality,
            SkyMaterial = skyMaterial,
        };
        var environment = new GodotEnvironment
        {
            AmbientLightColor = AmbientLightColor,
            AmbientLightEnergy = 0.26f,
            AmbientLightSkyContribution = 0.0f,
            AmbientLightSource = GodotEnvironment.AmbientSource.Color,
            AdjustmentBrightness = 1.0f,
            AdjustmentColorCorrection = null,
            AdjustmentContrast = 1.0f,
            BackgroundColor = StageBackgroundColor,
            BackgroundEnergyMultiplier = 1.0f,
            // Show the sky as a background while keeping ambient and reflections neutral.
            BackgroundMode = GodotEnvironment.BGMode.Sky,
            ReflectedLightSource = GodotEnvironment.ReflectionSource.Disabled,
            Sky = sky,
            AdjustmentSaturation = 1.0f,
            AdjustmentEnabled = false,
            GlowEnabled = false,
            TonemapExposure = 1.0f,
            TonemapMode = GodotEnvironment.ToneMapper.Linear,
            TonemapWhite = 1.0f,
        };

        return new WorldEnvironment
        {
            Name = WorldEnvironmentNodeName,
            Environment = environment,
        };
    }

    private static Texture2D LoadSkyTexture()
    {
        var skyHdriPath = StageEnvironmentAssetResolver.ResolveThreeStageSkyHdriPath(
            ProjectSettings.GlobalizePath("res://")
        );
        if (string.IsNullOrWhiteSpace(skyHdriPath))
        {
            GD.PushWarning("Default stage HDR skybox could not be found in stage-ui-three assets.");
            return null;
        }

        var image = Image.LoadFromFile(skyHdriPath);
        if (image == null || image.GetWidth() <= 0 || image.GetHeight() <= 0)
        {
            GD.PushWarning($"Default stage HDR skybox could not be loaded: {skyHdriPath}.");
            return null;
        }

        return ImageTexture.CreateFromImage(image);
    }

    private static MeshInstance3D CreateGroundPlane()
    {
        var shader = new Shader
        {
            Code = FadingGridShaderCode,
        };
        var material = new ShaderMaterial
        {
            Shader = shader,
        };
        material.SetShaderParameter("ground_color", GroundColor);
        material.SetShaderParameter("horizon_mist_color", HorizonMistColor);
        material.SetShaderParameter("minor_grid_color", MinorGridColor);
        material.SetShaderParameter("major_grid_color", MajorGridColor);
        material.SetShaderParameter("center_grid_color", CenterGridColor);

        return new MeshInstance3D
        {
            CastShadow = GeometryInstance3D.ShadowCastingSetting.Off,
            MaterialOverride = material,
            Mesh = new PlaneMesh
            {
                Orientation = PlaneMesh.OrientationEnum.Y,
                Size = new Vector2(GroundExtent * 2.0f, GroundExtent * 2.0f),
                SubdivideDepth = 24,
                SubdivideWidth = 24,
            },
            Name = GroundPlaneNodeName,
        };
    }

    private static Node3D CreateCenterMarker()
    {
        var root = new Node3D
        {
            Name = CenterMarkerNodeName,
        };
        var material = new StandardMaterial3D
        {
            AlbedoColor = CenterMarkerColor,
            ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
        };

        root.AddChild(CreateCenterMarkerBar(
            "Top",
            new Vector3(0.0f, CenterMarkerElevation, 0.15f),
            new Vector3(0.36f, 0.012f, 0.0275f),
            material
        ));
        root.AddChild(CreateCenterMarkerBar(
            "Stem",
            new Vector3(0.0f, CenterMarkerElevation, -0.02f),
            new Vector3(0.0275f, 0.012f, 0.34f),
            material
        ));

        return root;
    }

    private static MeshInstance3D CreateCenterMarkerBar(
        string name,
        Vector3 position,
        Vector3 size,
        Material material
    )
    {
        return new MeshInstance3D
        {
            CastShadow = GeometryInstance3D.ShadowCastingSetting.Off,
            MaterialOverride = material,
            Mesh = new BoxMesh
            {
                Size = size,
            },
            Name = name,
            Position = position,
        };
    }

    private static Node3D CreateLightingRig()
    {
        var rig = new Node3D
        {
            Name = LightingRigNodeName,
        };

        rig.AddChild(CreateDirectionalLight(
            "KeyLight",
            new Vector3(-48.0f, -34.0f, 0.0f),
            new Color(1.0f, 1.0f, 1.0f),
            0.76f,
            1.1f,
            true
        ));
        rig.AddChild(CreateDirectionalLight(
            "FillLight",
            new Vector3(-20.0f, 122.0f, 0.0f),
            new Color(1.0f, 1.0f, 1.0f),
            0.06f,
            0.0f,
            false
        ));
        rig.AddChild(CreateDirectionalLight(
            "RimLight",
            new Vector3(-18.0f, 205.0f, 0.0f),
            new Color(1.0f, 1.0f, 1.0f),
            0.20f,
            0.0f,
            false
        ));

        return rig;
    }

    private static DirectionalLight3D CreateDirectionalLight(
        string name,
        Vector3 rotationDegrees,
        Color color,
        float energy,
        float angularDistance,
        bool shadowEnabled
    )
    {
        return new DirectionalLight3D
        {
            DirectionalShadowMaxDistance = LightShadowMaxDistance,
            LightAngularDistance = angularDistance,
            LightColor = color,
            LightEnergy = energy,
            Name = name,
            RotationDegrees = rotationDegrees,
            ShadowEnabled = shadowEnabled,
            SkyMode = DirectionalLight3D.SkyModeEnum.LightOnly,
        };
    }
}
