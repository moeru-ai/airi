using System;
using Godot;

/// <summary>
/// Owns the camera-local compositor slot for stage post-process effects.
/// </summary>
public sealed class StageCompositorOwner : IDisposable
{
    private readonly Camera3D _camera;
    private readonly Compositor _ownedCompositor;
    private readonly Compositor _previousCompositor;
    private bool _disposed;

    public StageCompositorOwner(Camera3D camera, CompositorEffect stageEffect)
    {
        _camera = camera ?? throw new ArgumentNullException(nameof(camera));
        _previousCompositor = camera.Compositor;
        _ownedCompositor = new Compositor
        {
            CompositorEffects = CreateCompositorEffects(_previousCompositor, stageEffect),
        };

        _camera.Compositor = _ownedCompositor;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (GodotObject.IsInstanceValid(_camera) && _camera.Compositor == _ownedCompositor)
        {
            _camera.Compositor = _previousCompositor;
        }
    }

    private static Godot.Collections.Array<CompositorEffect> CreateCompositorEffects(
        Compositor previousCompositor,
        CompositorEffect stageEffect
    )
    {
        if (stageEffect == null)
        {
            throw new ArgumentNullException(nameof(stageEffect));
        }

        var effects = new Godot.Collections.Array<CompositorEffect>();
        if (previousCompositor?.CompositorEffects != null)
        {
            foreach (CompositorEffect effect in previousCompositor.CompositorEffects)
            {
                if (effect != null && effect != stageEffect)
                {
                    effects.Add(effect);
                }
            }
        }

        effects.Add(stageEffect);
        return effects;
    }
}
