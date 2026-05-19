using Godot;

/// <summary>
/// Converts local Godot mouse and keyboard input into camera pose patches.
/// </summary>
public sealed class StageCameraInputController
{
    private const double OrbitDegreesPerPixel = 0.2;
    private const float KeyboardMoveUnitsPerSecond = 2.5f;
    private const float WheelMoveUnits = 0.25f;

    private readonly StageCameraPoseController _cameraController;
    private readonly StageViewRuntime _runtime;

    private bool _orbiting;
    private bool _panning;

    public StageCameraInputController(StageViewRuntime runtime, StageCameraPoseController cameraController)
    {
        _runtime = runtime;
        _cameraController = cameraController;
    }

    public void Process(double delta)
    {
        if (!_runtime.HasViewState)
        {
            return;
        }

        var x = 0.0f;
        var z = 0.0f;

        if (Input.IsKeyPressed(Key.W))
        {
            z += 1;
        }

        if (Input.IsKeyPressed(Key.S))
        {
            z -= 1;
        }

        if (Input.IsKeyPressed(Key.D))
        {
            x += 1;
        }

        if (Input.IsKeyPressed(Key.A))
        {
            x -= 1;
        }

        if (x == 0 && z == 0)
        {
            return;
        }

        var direction = new Vector3(x, 0, z).Normalized();
        MoveCameraLocal(direction * KeyboardMoveUnitsPerSecond * (float)delta);
    }

    public void HandleInput(InputEvent inputEvent)
    {
        if (inputEvent is InputEventMouseButton mouseButton)
        {
            HandleMouseButton(mouseButton);
            return;
        }

        if (inputEvent is InputEventMouseMotion mouseMotion)
        {
            HandleMouseMotion(mouseMotion);
        }
    }

    private void HandleMouseButton(InputEventMouseButton mouseButton)
    {
        if (mouseButton.ButtonIndex == MouseButton.Left)
        {
            _orbiting = mouseButton.Pressed;
            return;
        }

        if (mouseButton.ButtonIndex == MouseButton.Middle)
        {
            _panning = mouseButton.Pressed;
            return;
        }

        if (!mouseButton.Pressed)
        {
            return;
        }

        if (mouseButton.ButtonIndex == MouseButton.WheelUp)
        {
            MoveCameraLocal(new Vector3(0, 0, WheelMoveUnits));
            return;
        }

        if (mouseButton.ButtonIndex == MouseButton.WheelDown)
        {
            MoveCameraLocal(new Vector3(0, 0, -WheelMoveUnits));
        }
    }

    private void HandleMouseMotion(InputEventMouseMotion mouseMotion)
    {
        if (_orbiting)
        {
            Orbit(mouseMotion);
            return;
        }

        if (_panning)
        {
            Pan(mouseMotion);
        }
    }

    private void Orbit(InputEventMouseMotion mouseMotion)
    {
        if (!_runtime.HasViewState)
        {
            return;
        }

        var camera = _runtime.State.Camera;
        _runtime.ApplyLocalPatch(_cameraController.CreateOrbitPatch(
            camera,
            // NOTICE: Godot yaw and pointer X have opposite signs for the expected stage orbit.
            // Keep this negated so horizontal left-drag does not regress into mirrored control.
            -mouseMotion.Relative.X * OrbitDegreesPerPixel,
            -mouseMotion.Relative.Y * OrbitDegreesPerPixel
        ));
    }

    private void Pan(InputEventMouseMotion mouseMotion)
    {
        if (!_runtime.HasViewState)
        {
            return;
        }

        _runtime.ApplyLocalPatch(_cameraController.CreateScreenPanPatch(
            _runtime.State.Camera,
            mouseMotion.Position,
            mouseMotion.Relative
        ));
    }

    private void MoveCameraLocal(Vector3 localMove)
    {
        if (!_runtime.HasViewState)
        {
            return;
        }

        _runtime.ApplyLocalPatch(_cameraController.CreateCameraLocalMovePatch(
            _runtime.State.Camera,
            localMove
        ));
    }
}
