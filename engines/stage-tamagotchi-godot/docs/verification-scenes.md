# Runtime Verification Scenes

Use a verification scene when a renderer change needs isolated visual evidence
that unit tests cannot provide. Keep the main stage WebSocket flow as the final
acceptance path for avatar presentation work.

## When To Use

- Use a temporary verification scene to isolate one renderer question, such as
  alpha cutout behavior, outline geometry, stencil masks, or glow source
  extraction.
- Use the main stage plus a temporary WebSocket host before accepting any change
  that affects the shipped stage view.
- Do not rely on a verification scene as CI evidence when it depends on local
  fixtures that are not tracked by git.

## Scene Shape

For visual renderer checks, create a minimal scene under
`tests/<check-name>/<checkName>.tscn` with one `Node3D` root and a script that
uses the same runtime entry points as the feature under test. C# is preferred
when the check needs stage C# runtime objects. A GDScript scene is acceptable
for non-visual importer/material checks, such as
`tests/material-rendering-check/materialRenderingCheck.tscn`.

A visual renderer script should:

1. Set a deterministic viewport size with `DisplayServer.WindowSetSize`.
2. Apply the normal stage baseline with `StageVisualPreset.Apply(this)`.
3. Load the target avatar or fixture through the same runtime path being tested.
4. Create one active `Camera3D` and use fixed poses.
5. Install the renderer feature runtime being tested. For avatar glow, create
   `StageRenderEffectsRuntime(camera)` and call `UseAvatar(avatar)` after
   loading the avatar; `StageVisualPreset.Apply(this)` alone does not install
   the glow compositor.
6. Wait several frames before each capture so imports, materials, and compositor
   resources settle.
7. Save PNG captures to `Path.Combine(Path.GetTempPath(), "<check-name>")` only
   for intermediate pass diagnostics.
8. Print compact diagnostics that can be compared across runs.
9. Quit with `GetTree().Quit(0)` after the final capture.

## Fixture Rules

- Prefer tracked fixtures when the check is meant to remain in the repository.
- If a check needs a private or large local VRM, keep the scene temporary and
  document the required local path in the experiment notes.
- Do not commit a verification scene that cannot run from a clean checkout
  unless the limitation is intentional and documented next to the scene.

## Renderer Caveats

- Avatar glow uses a depth-tested stencil overlay so opaque objects between the
  camera and avatar occlude the glow source. Transparent occluders may not block
  the mask if their materials do not write depth. This is a normal transparent
  rendering limitation; verify those cases with a dedicated scene before relying
  on them for shipped visuals.

## Capture Pattern

Use frame-number gates instead of timers so the script stays deterministic:

```csharp
public override void _Process(double delta)
{
    _frame++;

    if (_frame == 10)
    {
        SaveCapture("baseline");
        return;
    }

    if (_frame == 22)
    {
        EnableRendererFeatureUnderTest();
        SaveCapture("enabled");
        GetTree().Quit(0);
    }
}
```

The in-scene capture helper may call `GetViewport().GetTexture().GetImage()` for
intermediate data, but this is not final display output. Do not use viewport
readback PNGs as acceptance evidence for color mapping, contrast, glow, rim
light, or other final-frame judgments.

## Run Command

Launch the scene with the Godot mono binary:

```powershell
C:\Godot_v4.6.2-stable_mono_win64\Godot_v4.6.2-stable_mono_win64.exe `
  --path "D:\TAworkspace\AIRIworkspace\airi\engines\stage-tamagotchi-godot" `
  --scene "res://tests/<check-name>/<checkName>.tscn"
```

For shipped stage visuals, export render-stage artifacts instead of relying on a
temporary manual screenshot:

```powershell
pnpm -F @proj-airi/stage-tamagotchi-godot dump:render-stages
```

For rim or edge-light shape checks, prefer the upper-body camera preset:

```powershell
pnpm -F @proj-airi/stage-tamagotchi-godot dump:render-stages:upper-body
```

The dump command runs this flow:

1. Start a local WebSocket host.
2. Launch the main Godot stage with a fixed `--resolution`.
3. Wait for `stage.ready`.
4. Send `host.scene.apply` with the tracked AvatarSample A VRM.
5. Wait for `scene.applied`.
6. Capture the visible Godot window client area for each requested render-stage
   view.
7. Write diagnostic PNGs under `artifacts/`.
8. Send `host.shutdown`.

## Cleanup

After the visual question is answered, either promote the scene into a stable
tracked check with tracked fixtures, or delete the temporary scene and keep only
the experiment result in the relevant design notes.
