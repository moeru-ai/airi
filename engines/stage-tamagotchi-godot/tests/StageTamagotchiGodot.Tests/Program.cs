using System;
using System.IO;

/// <summary>
/// Runs focused engine-local regression checks that do not require the Godot editor.
///
/// Call stack:
///
/// dotnet run --project tests/StageTamagotchiGodot.Tests
///   -> <see cref="Main"/>
///     -> <see cref="CameraGroundConstraint"/>
///       -> <see cref="StageViewStateRules"/>
///     -> <see cref="StageEnvironmentAssets"/>
///       -> <see cref="StageEnvironmentAssetResolver"/>
/// </summary>
internal static class Program
{
    private const double ExpectedCameraMinY = 0.05;
    private const string ThreeStageSkyHdriRelativePath =
        "packages/stage-ui-three/src/components/Environment/assets/sky_linekotsi_23_HDRI.hdr";

    private static int Main()
    {
        try
        {
            CameraGroundConstraint.ApplyPatchClampsCameraYToStageGround();
            CameraGroundConstraint.NormalizeClampsCameraYToStageGround();
            CameraGroundConstraint.NormalizePreservesCameraYAboveStageGround();
            StageEnvironmentAssets.ResolvesThreeStageSkyHdriFromGodotProjectDirectory();
            StageEnvironmentAssets.ReturnsEmptyPathWhenThreeStageSkyHdriIsUnavailable();
            Console.WriteLine("StageTamagotchiGodot.Tests passed.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    private static class StageEnvironmentAssets
    {
        public static void ResolvesThreeStageSkyHdriFromGodotProjectDirectory()
        {
            var projectDirectory = FindGodotProjectDirectory();

            var skyHdriPath = StageEnvironmentAssetResolver.ResolveThreeStageSkyHdriPath(
                projectDirectory
            );

            AssertEqual(
                NormalizePath(FindRepositoryRootFrom(projectDirectory), ThreeStageSkyHdriRelativePath),
                skyHdriPath,
                "three-stage sky HDRI path"
            );
        }

        public static void ReturnsEmptyPathWhenThreeStageSkyHdriIsUnavailable()
        {
            var missingRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

            var skyHdriPath = StageEnvironmentAssetResolver.ResolveThreeStageSkyHdriPath(missingRoot);

            AssertEqual(string.Empty, skyHdriPath, "missing three-stage sky HDRI path");
        }
    }

    private static class CameraGroundConstraint
    {
        public static void ApplyPatchClampsCameraYToStageGround()
        {
            var current = StageViewStateRules.CreateDefault();
            var patch = new StageViewPatch(
                Camera: new StageCameraPosePatch(
                    Position: new StageViewVec3Patch(Y: -2)
                )
            );

            var next = StageViewStateRules.ApplyPatch(current, patch, 123);

            AssertEqual(ExpectedCameraMinY, next.Camera.Position.Y, "remote patch camera Y");
            AssertEqual(1, next.Revision, "revision after camera ground clamp");
            AssertEqual(123, next.UpdatedAt, "updatedAt after camera ground clamp");
        }

        public static void NormalizeClampsCameraYToStageGround()
        {
            var state = StageViewStateRules.CreateDefault() with
            {
                Camera = StageViewStateRules.CreateDefault().Camera with
                {
                    Position = new StageViewVec3(0, -100, 3.5),
                },
            };

            var normalized = StageViewStateRules.Normalize(state);

            AssertEqual(ExpectedCameraMinY, normalized.Camera.Position.Y, "normalized camera Y");
        }

        public static void NormalizePreservesCameraYAboveStageGround()
        {
            var state = StageViewStateRules.CreateDefault() with
            {
                Camera = StageViewStateRules.CreateDefault().Camera with
                {
                    Position = new StageViewVec3(0, 2.5, 3.5),
                },
            };

            var normalized = StageViewStateRules.Normalize(state);

            AssertEqual(2.5, normalized.Camera.Position.Y, "above-ground camera Y");
        }
    }

    private static void AssertEqual(double expected, double actual, string label)
    {
        if (Math.Abs(expected - actual) <= 0.000001)
        {
            return;
        }

        throw new InvalidOperationException(
            $"Expected {label} to be {expected}, got {actual}."
        );
    }

    private static void AssertEqual(long expected, long actual, string label)
    {
        if (expected == actual)
        {
            return;
        }

        throw new InvalidOperationException(
            $"Expected {label} to be {expected}, got {actual}."
        );
    }

    private static void AssertEqual(string expected, string actual, string label)
    {
        if (string.Equals(expected, actual, StringComparison.Ordinal))
        {
            return;
        }

        throw new InvalidOperationException(
            $"Expected {label} to be '{expected}', got '{actual}'."
        );
    }

    private static string FindGodotProjectDirectory()
    {
        var currentDirectory = AppContext.BaseDirectory;
        while (!string.IsNullOrWhiteSpace(currentDirectory))
        {
            if (File.Exists(Path.Combine(currentDirectory, "project.godot")))
            {
                return currentDirectory;
            }

            currentDirectory = Directory.GetParent(currentDirectory)?.FullName;
        }

        throw new InvalidOperationException("Could not find Godot project directory.");
    }

    private static string FindRepositoryRootFrom(string startDirectory)
    {
        var currentDirectory = startDirectory;
        while (!string.IsNullOrWhiteSpace(currentDirectory))
        {
            var gitMarkerPath = Path.Combine(currentDirectory, ".git");
            // Git worktrees store .git as a file that points to the real common directory.
            if (Directory.Exists(gitMarkerPath) || File.Exists(gitMarkerPath))
            {
                return currentDirectory;
            }

            currentDirectory = Directory.GetParent(currentDirectory)?.FullName;
        }

        throw new InvalidOperationException("Could not find repository root.");
    }

    private static string NormalizePath(string root, string relativePath) =>
        Path.GetFullPath(
            Path.Combine(root, relativePath.Replace('/', Path.DirectorySeparatorChar))
        );
}
