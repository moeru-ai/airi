using System;
using System.Text.Json;

/// <summary>
/// Strict JSON parser for Godot view-state transport payloads.
/// </summary>
public static class StageViewJson
{
    public static StageViewPatchRequestPayload ParsePatchRequest(JsonElement payload)
    {
        ExpectObject(payload, "view patch request");

        string requestId = null;
        StageViewPatch patch = null;

        foreach (var property in payload.EnumerateObject())
        {
            switch (property.Name)
            {
                case "requestId":
                    requestId = ReadRequiredRequestId(property.Value, "View patch requestId");
                    break;
                case "patch":
                    patch = ParsePatch(property.Value);
                    break;
                default:
                    throw Invalid($"Unknown view patch request field: {property.Name}.");
            }
        }

        if (requestId == null)
        {
            throw Invalid("View patch requestId is required.");
        }

        if (patch == null)
        {
            throw Invalid("View patch payload is required.");
        }

        return new StageViewPatchRequestPayload(requestId, patch);
    }

    public static string TryReadRequestId(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (!payload.TryGetProperty("requestId", out var requestId)
            || requestId.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = requestId.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    public static StageViewSnapshotRequestPayload ParseSnapshotRequest(JsonElement payload)
    {
        ExpectObject(payload, "view snapshot request");

        string requestId = null;
        foreach (var property in payload.EnumerateObject())
        {
            switch (property.Name)
            {
                case "requestId":
                    requestId = ReadRequiredRequestId(property.Value, "View snapshot requestId");
                    break;
                default:
                    throw Invalid($"Unknown view snapshot request field: {property.Name}.");
            }
        }

        if (requestId == null)
        {
            throw Invalid("View snapshot requestId is required.");
        }

        return new StageViewSnapshotRequestPayload(requestId);
    }

    public static StageViewState ParseState(JsonElement payload)
    {
        ExpectObject(payload, "view state");

        int? schemaVersion = null;
        long? revision = null;
        long? updatedAt = null;
        StageCameraPoseState camera = null;

        foreach (var property in payload.EnumerateObject())
        {
            switch (property.Name)
            {
                case "schemaVersion":
                    schemaVersion = ReadInt32(property.Value, "schemaVersion");
                    break;
                case "revision":
                    revision = ReadInt64(property.Value, "revision");
                    break;
                case "updatedAt":
                    updatedAt = ReadInt64(property.Value, "updatedAt");
                    break;
                case "camera":
                    camera = ParseCameraState(property.Value);
                    break;
                default:
                    throw Invalid($"Unknown view state field: {property.Name}.");
            }
        }

        if (schemaVersion != 1)
        {
            throw Invalid("Unsupported view state schemaVersion.");
        }

        if (revision == null || updatedAt == null || camera == null)
        {
            throw Invalid("View state is missing required fields.");
        }

        return StageViewStateRules.Normalize(new StageViewState(
            schemaVersion.Value,
            revision.Value,
            updatedAt.Value,
            camera
        ));
    }

    private static StageViewPatch ParsePatch(JsonElement payload)
    {
        ExpectObject(payload, "view patch");

        StageCameraPosePatch camera = null;

        foreach (var property in payload.EnumerateObject())
        {
            switch (property.Name)
            {
                case "camera":
                    camera = ParseCameraPatch(property.Value);
                    break;
                default:
                    throw Invalid($"Unknown view patch field: {property.Name}.");
            }
        }

        var patch = new StageViewPatch(camera);
        if (!StageViewStateRules.HasMutation(patch))
        {
            throw Invalid("View patch must include at least one field.");
        }

        return patch;
    }

    private static StageCameraPosePatch ParseCameraPatch(JsonElement payload)
    {
        var camera = ParseCameraFields(payload, "camera patch", false);
        return new StageCameraPosePatch(
            camera.Position, camera.YawDeg, camera.PitchDeg, camera.FovDeg
        );
    }

    private static StageCameraPoseState ParseCameraState(JsonElement payload)
    {
        var camera = ParseCameraFields(payload, "camera state", true);

        return new StageCameraPoseState(
            new StageViewVec3(
                camera.Position.X.Value,
                camera.Position.Y.Value,
                camera.Position.Z.Value
            ),
            camera.YawDeg.Value,
            camera.PitchDeg.Value,
            camera.FovDeg.Value
        );
    }

    private static (
        StageViewVec3Patch Position,
        double? YawDeg,
        double? PitchDeg,
        double? FovDeg
    ) ParseCameraFields(JsonElement payload, string label, bool requireAll)
    {
        ExpectObject(payload, label);

        StageViewVec3Patch position = null;
        double? yawDeg = null;
        double? pitchDeg = null;
        double? fovDeg = null;
        var positionField = requireAll ? "camera.position" : "camera position patch";
        var unknownFieldLabel = requireAll ? "camera state field" : "camera patch field";
        var unknownVectorFieldLabel = requireAll ? "vector field" : "vector patch field";

        foreach (var property in payload.EnumerateObject())
        {
            switch (property.Name)
            {
                case "position":
                    position = ParseVec3Coordinates(
                        property.Value,
                        positionField,
                        requireAll,
                        unknownVectorFieldLabel
                    );
                    break;
                case "yawDeg":
                    yawDeg = ReadFiniteDouble(property.Value, "camera.yawDeg");
                    break;
                case "pitchDeg":
                    pitchDeg = ReadFiniteDouble(property.Value, "camera.pitchDeg");
                    break;
                case "fovDeg":
                    fovDeg = ReadFiniteDouble(property.Value, "camera.fovDeg");
                    break;
                default:
                    throw Invalid($"Unknown {unknownFieldLabel}: {property.Name}.");
            }
        }

        if (requireAll
            && (position == null || yawDeg == null || pitchDeg == null || fovDeg == null))
        {
            throw Invalid("Camera state is missing required fields.");
        }

        return (position, yawDeg, pitchDeg, fovDeg);
    }

    private static StageViewVec3Patch ParseVec3Coordinates(
        JsonElement payload,
        string field,
        bool requireAll,
        string unknownFieldLabel
    )
    {
        ExpectObject(payload, field);

        double? x = null;
        double? y = null;
        double? z = null;

        foreach (var property in payload.EnumerateObject())
        {
            switch (property.Name)
            {
                case "x":
                    x = ReadFiniteDouble(property.Value, $"{field}.x");
                    break;
                case "y":
                    y = ReadFiniteDouble(property.Value, $"{field}.y");
                    break;
                case "z":
                    z = ReadFiniteDouble(property.Value, $"{field}.z");
                    break;
                default:
                    throw Invalid($"Unknown {unknownFieldLabel}: {property.Name}.");
            }
        }

        if (requireAll && (x == null || y == null || z == null))
        {
            throw Invalid($"{field} is missing required coordinates.");
        }

        return new StageViewVec3Patch(x, y, z);
    }

    private static void ExpectObject(JsonElement payload, string label)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            throw Invalid($"Expected {label} to be an object, got {payload.ValueKind}.");
        }
    }

    private static string ReadRequiredRequestId(JsonElement payload, string field)
    {
        var value = ReadString(payload, field);
        if (string.IsNullOrWhiteSpace(value))
        {
            throw Invalid($"{field} is required.");
        }

        return value;
    }

    private static string ReadString(JsonElement payload, string field)
    {
        if (payload.ValueKind != JsonValueKind.String)
        {
            throw Invalid($"Expected {field} to be a string.");
        }

        return payload.GetString();
    }

    private static int ReadInt32(JsonElement payload, string field)
    {
        if (payload.ValueKind != JsonValueKind.Number || !payload.TryGetInt32(out var value))
        {
            throw Invalid($"Expected {field} to be an integer.");
        }

        return value;
    }

    private static long ReadInt64(JsonElement payload, string field)
    {
        if (payload.ValueKind != JsonValueKind.Number || !payload.TryGetInt64(out var value))
        {
            throw Invalid($"Expected {field} to be an integer.");
        }

        return value;
    }

    private static double ReadFiniteDouble(JsonElement payload, string field)
    {
        if (payload.ValueKind != JsonValueKind.Number || !payload.TryGetDouble(out var value))
        {
            throw Invalid($"Expected {field} to be a number.");
        }

        if (!double.IsFinite(value))
        {
            throw Invalid($"Expected {field} to be finite.");
        }

        return value;
    }

    private static InvalidOperationException Invalid(string message) => new(message);
}
