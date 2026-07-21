using System.IO;

/// <summary>
/// Resolves presentation-stage environment assets that are owned outside the Godot project.
///
/// Use when:
/// - The Godot stage is running from a workspace checkout and should reuse existing stage assets.
/// - A fixed visual preset needs a local filesystem path instead of a Godot imported resource.
///
/// Expects:
/// - <c>startDirectory</c> is inside or below the AIRI repository when workspace assets exist.
///
/// Returns:
/// - Absolute filesystem paths for found assets, or an empty string when unavailable.
/// </summary>
public static class StageEnvironmentAssetResolver
{
    private static readonly string[] ThreeStageSkyHdriPathSegments = new[]
    {
        "packages",
        "stage-ui-three",
        "src",
        "components",
        "Environment",
        "assets",
        "sky_linekotsi_23_HDRI.hdr",
    };

    /// <summary>
    /// Resolves the existing three-stage HDRI sky texture from a workspace directory.
    ///
    /// Use when:
    /// - The Godot stage should reuse the stage-ui-three default skybox without copying it.
    ///
    /// Expects:
    /// - <paramref name="startDirectory"/> is a filesystem directory path.
    ///
    /// Returns:
    /// - Absolute path to the HDRI file, or <see cref="string.Empty"/> when it is unavailable.
    /// </summary>
    public static string ResolveThreeStageSkyHdriPath(string startDirectory)
    {
        if (string.IsNullOrWhiteSpace(startDirectory))
        {
            return string.Empty;
        }

        var currentDirectory = Path.GetFullPath(startDirectory);
        while (!string.IsNullOrWhiteSpace(currentDirectory))
        {
            var candidatePath = Path.GetFullPath(Path.Combine(
                currentDirectory,
                Path.Combine(ThreeStageSkyHdriPathSegments)
            ));

            if (File.Exists(candidatePath))
            {
                return candidatePath;
            }

            // Walk upward from the Godot project directory until a repository root candidate matches.
            currentDirectory = Directory.GetParent(currentDirectory)?.FullName;
        }

        return string.Empty;
    }
}
