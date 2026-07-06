public partial class StagePostProcessCompositorEffect
{
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

    private const string AvatarMaskFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D scene_texture;

        layout(location = 0) in vec2 uv;
        layout(location = 0) out vec4 out_color;

        void main()
        {
            out_color = vec4(1.0);
        }
        """;

    private const string EdgeLightFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D scene_texture;
        layout(set = 0, binding = 1) uniform sampler2D depth_texture;
        layout(set = 0, binding = 2) uniform sampler2D normal_roughness_texture;
        layout(set = 0, binding = 3) uniform sampler2D avatar_mask_texture;
        layout(push_constant, std430) uniform Params
        {
            vec4 edge0;
            vec4 edge1;
            vec4 edge2;
        } params;

        layout(location = 0) in vec2 uv;
        layout(location = 0) out vec4 out_color;

        vec4 normal_roughness_compatibility(vec4 normal_roughness)
        {
            float roughness = normal_roughness.w;
            if (roughness > 0.5)
            {
                roughness = 1.0 - roughness;
            }

            roughness /= 127.0 / 255.0;
            return vec4(normalize(normal_roughness.xyz * 2.0 - 1.0) * 0.5 + 0.5, roughness);
        }

        float sample_mask(vec2 sample_uv)
        {
            return clamp(texture(avatar_mask_texture, sample_uv).r, 0.0, 1.0);
        }

        float linearize_reverse_z_depth(float depth, float near_plane, float far_plane)
        {
            return (near_plane * far_plane) / max(near_plane + depth * (far_plane - near_plane), 0.00001);
        }

        float sample_linear_depth(vec2 sample_uv, float near_plane, float far_plane)
        {
            float depth = texture(depth_texture, clamp(sample_uv, vec2(0.0), vec2(1.0))).r;
            return linearize_reverse_z_depth(depth, near_plane, far_plane);
        }

        float sample_filtered_displaced_linear_depth(
            vec2 sample_uv,
            vec2 offset_uv,
            vec2 pixel_size,
            float near_plane,
            float far_plane
        )
        {
            vec2 major_axis = length(offset_uv) > 0.000001
                ? normalize(offset_uv)
                : vec2(1.0, 0.0);
            vec2 minor_axis = vec2(-major_axis.y, major_axis.x);
            vec2 filter_major = major_axis * pixel_size;
            vec2 filter_minor = minor_axis * pixel_size;

            float filtered_depth = sample_linear_depth(sample_uv, near_plane, far_plane) * 0.5;
            filtered_depth += sample_linear_depth(sample_uv + filter_major, near_plane, far_plane) * 0.125;
            filtered_depth += sample_linear_depth(sample_uv - filter_major, near_plane, far_plane) * 0.125;
            filtered_depth += sample_linear_depth(sample_uv + filter_minor, near_plane, far_plane) * 0.125;
            filtered_depth += sample_linear_depth(sample_uv - filter_minor, near_plane, far_plane) * 0.125;
            return filtered_depth;
        }

        void main()
        {
            vec4 scene = texture(scene_texture, uv);
            float avatar_mask = sample_mask(uv);
            float debug_edge_mask = params.edge2.x;
            if (avatar_mask <= 0.001)
            {
                if (debug_edge_mask > 0.5)
                {
                    out_color = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                out_color = scene;
                return;
            }

            float width_pixels = params.edge0.z;
            float vertical_scale = params.edge0.w;
            float threshold_start = params.edge1.x;
            float threshold_end = params.edge1.y;
            float strength = params.edge1.z;
            float value_boost = params.edge1.w;
            float near_plane = max(params.edge2.y, 0.00001);
            float far_plane = max(params.edge2.z, near_plane + 0.00001);
            float width_reference_depth = max(params.edge2.w, near_plane);

            float current_depth = texture(depth_texture, uv).r;
            float current_linear_depth = linearize_reverse_z_depth(current_depth, near_plane, far_plane);
            float depth_width_scale = width_reference_depth / max(current_linear_depth, near_plane);
            float effective_width_pixels = clamp(width_pixels * depth_width_scale, width_pixels * 0.35, width_pixels * 1.5);

            vec2 pixel_size = params.edge0.xy;
            vec4 normal_roughness = normal_roughness_compatibility(
                texture(normal_roughness_texture, uv)
            );
            vec3 view_normal = normalize(normal_roughness.xyz * 2.0 - 1.0);
            vec2 offset_pixels = view_normal.xy * vec2(-effective_width_pixels, -effective_width_pixels * vertical_scale);
            vec2 offset_uv = offset_pixels * pixel_size;
            vec2 shifted_uv = clamp(uv + offset_uv, vec2(0.0), vec2(1.0));

            float shifted_linear_depth = sample_filtered_displaced_linear_depth(
                shifted_uv,
                offset_uv,
                pixel_size,
                near_plane,
                far_plane
            );
            float linear_depth_delta = max(shifted_linear_depth - current_linear_depth, 0.0);
            float depth_edge = smoothstep(
                threshold_start,
                threshold_end,
                linear_depth_delta
            );

            float edge_mask = clamp(depth_edge * avatar_mask * strength, 0.0, 1.0);
            if (debug_edge_mask > 0.5)
            {
                out_color = vec4(vec3(edge_mask), 1.0);
                return;
            }

            vec3 brightened = scene.rgb * value_boost;
            out_color = vec4(mix(scene.rgb, brightened, edge_mask), scene.a);
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

    private const string GlowCompositeFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D scene_texture;
        layout(set = 0, binding = 1) uniform sampler2D bloom_texture;
        layout(push_constant, std430) uniform Params
        {
            vec4 bloom_tint_strength;
        } params;

        layout(location = 0) in vec2 uv;
        layout(location = 0) out vec4 out_color;

        void main()
        {
            vec4 scene = texture(scene_texture, uv);
            vec3 bloom = texture(bloom_texture, uv).rgb;
            vec3 hdr = max(
                scene.rgb + bloom * params.bloom_tint_strength.rgb * params.bloom_tint_strength.a,
                vec3(0.0)
            );
            out_color = vec4(hdr, scene.a);
        }
        """;

    private const string FinalColorFragmentShaderCode = """
        #version 450

        layout(set = 0, binding = 0) uniform sampler2D hdr_texture;
        layout(push_constant, std430) uniform Params
        {
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
            vec4 hdr = texture(hdr_texture, uv);
            vec3 mapped = apply_toon_color_grade(naes_tonemap(hdr.rgb));
            out_color = vec4(mapped, hdr.a);
        }
        """;
}
