# Live2D recording curve fitting

## Decision

Use a channel-aware fitting pipeline, not one generic simplification pass.

1. Preserve event boundaries and important extrema.
2. Split discontinuous and step data before curve fitting.
3. Use a vertical-error Ramer-Douglas-Peucker variant as the baseline and fallback.
4. Fit continuous regions with fixed-time cubic Bézier segments.
5. Keep the dense recording as the source until the user accepts the fitted curves.

Do not use Visvalingam-Whyatt as the primary fitter. Its area measure does not give a direct maximum value-error bound.

## Current AIRI contract

The current `airi-live2d-motion/v6` format stores ordered millisecond samples. Each sample contains 13 normalized scalar channels. Eleven channels are visible in the editor. `eyeOpen` is an editor projection of `1 - eyeSquint`. The two offset channels remain hidden. See the [recording schema](../../../../../apps/stage-tamagotchi/src/renderer/composables/live2d-motion-recording.ts) and [pose contract](../../../../../packages/stage-ui-live2d/src/stores/motion-control.ts).

The current conversion copies every sample to every track. It then rebuilds samples at the union of all track times. See [the current keyframe conversion](../../../../../apps/stage-tamagotchi/src/renderer/composables/live2d-motion-keyframes.ts). This design makes the editor dense even when one channel contains little motion.

Recorded playback currently applies each due sample and holds it until the next sample. The keyframe editor uses linear interpolation. Curve conversion must make this change of interpolation explicit.

## Algorithm comparison

| Method | Output | Error control | Strength | Main problem for this timeline |
| --- | --- | --- | --- | --- |
| Ramer-Douglas-Peucker | Piecewise linear keys | Maximum distance from each source point to a retained segment | Small, deterministic, and easy to validate | Standard Euclidean distance mixes milliseconds and parameter values |
| Visvalingam-Whyatt | Piecewise linear keys | Effective triangle area | Progressive removal gives useful levels of detail | Area is not a direct bound on playback value error |
| Schneider cubic fitting | Piecewise cubic Bézier curves | Maximum squared geometric error | Smooth curves with fewer editable segments | The original algorithm fits a parametric plane curve, not a scalar value at a fixed time |
| Smoothing B-spline | Spline knots and coefficients | Usually a weighted sum of squared residuals | Good noise smoothing and periodic fitting | A global fit can blur short events and is harder to edit locally |

### Ramer-Douglas-Peucker

Ramer approximates a region with its endpoint line. The algorithm splits at the source point with the largest distance until the fit meets a tolerance. The result has a bounded maximum distance, but it does not guarantee the minimum key count. [Ramer's original paper](https://doi.org/10.1016/S0146-664X(72)80017-0) and [Douglas and Peucker's original paper](https://doi.org/10.3138/FM57-6770-U75U-7727) describe this family.

Standard implementations treat `(time, value)` as a Euclidean point. For example, Simplify.js calculates squared `x` and `y` distance to a segment before recursive splitting. It includes TypeScript declarations. [Simplify.js source](https://github.com/mourner/simplify-js/blob/master/simplify.js) and [type declaration](https://github.com/mourner/simplify-js/blob/master/index.d.ts) show this behavior.

That metric is unsuitable without scaling. A duration of 20,000 ms dominates a value range of 2. Scaling time changes which details survive. A screen-space scale also makes results depend on editor size.

For AIRI, use time only to evaluate the candidate line. Measure the vertical residual at each original sample:

```text
u = (sampleTime - leftTime) / (rightTime - leftTime)
predictedValue = leftValue + u * (rightValue - leftValue)
error = abs(sampleValue - predictedValue)
```

This variant gives a maximum error in the channel's normalized value units. It also keeps each retained key at its original time.

### Visvalingam-Whyatt

Visvalingam and Whyatt repeatedly remove the point with the smallest effective triangle area. Their paper presents the method as progressive line simplification. [The authors' institutional record and paper](https://hull-repository.worktribe.com/output/376330/line-generalisation-by-repeated-elimination-of-points) describe the effective-area rule.

The method can produce visually balanced polylines. However, its threshold has `time × value` units for this data. It does not directly limit the value error at source times. Mandatory extrema and discontinuity anchors would also require a custom implementation.

Visvalingam-Whyatt is useful as an optional visual comparison. It is not the best acceptance rule for motion parameters.

### Schneider cubic Bézier fitting

Schneider fits a cubic Bézier to digitized points with endpoint tangents and least squares. The algorithm uses chord-length parameters, improves them with Newton-Raphson iterations, and splits at the largest squared error. [The original Graphics Gems chapter](https://lhf.impa.br/cursos/tmg/Schneider-1990.pdf) and [original C source](https://github.com/erich666/GraphicsGems/blob/master/gems/FitCurves.c) define the algorithm.

Schneider also recommends preprocessing coincident points and splitting at corners or discontinuities. Each resulting subcurve is fitted independently. This rule applies directly to sharp blinks, button-like channels, and capture gaps.

The original algorithm treats time and value as two geometric coordinates. Therefore, time/value scaling changes chord lengths, tangents, and fitting error. A fitted control point can also move backward in time.

Cubism already defines linear, cubic Bézier, stepped, and inverse-stepped motion segments. Its restricted cubic segments place control times at one-third and two-thirds of the segment duration. [The official `motion3.json` specification](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/motion3.json.md) defines these segments.

For AIRI, adapt Schneider to a scalar time function:

- Fix each segment's endpoint times.
- Fix the two control times at one-third and two-thirds of the duration.
- Use actual normalized time as the Bézier parameter.
- Solve only the two control values with least squares.
- Measure maximum vertical error at every source time.
- Split at the largest error and fit each side again.

This adaptation removes temporal scaling from the fit. It also produces curves that map directly to Cubism's restricted Bézier representation. This is an AIRI design recommendation, not a claim from Schneider's paper.

A TypeScript port of Schneider's general algorithm exists in [`odiak/fit-curve`](https://github.com/odiak/fit-curve/blob/master/packages/fit-curve/src/index.ts). It is useful as a reference or experiment. It still uses parametric two-dimensional error, so it does not provide AIRI's required value-at-time guarantee without adaptation.

### Smoothing splines

Smoothing splines are useful when sensor noise is the main problem. SciPy's official `splprep` interface uses weighted least squares and a smoothing condition based on summed squared residuals. It also supports periodic fitting. [The SciPy documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.splprep.html) describes these controls and recommends its newer replacement for new code.

This objective can hide one bad blink or mouth peak inside a low total error. A global spline can also change distant regions after one edit. These properties make smoothing splines a poor first representation for the timeline.

## Channel policy

### Continuous bounded channels

The head, body, eye direction, mouth shape, model offsets, eye squint, and mouth opening are continuous scalars. Fit each track independently. Validate the fitted result against that track's legal range.

Do not rely only on runtime clamping. A cubic overshoot can create a flat clipped region. Sample every fitted segment densely and reject or split a segment that leaves its legal range.

### Extrema

Ramer notes that a large tolerance can remove important features. Cubic fitting can also round a short peak. Preserve these points before fitting:

- the first and last sample;
- accepted local maxima and minima;
- both ends of each discontinuity;
- user-authored keys;
- loop boundaries.

Raw sign changes can identify noise as extrema. Use a prominence or hysteresis threshold tied to the channel error tolerance. For `eyeSquint`, preserve the most closed point of each blink. For `mouthOpen`, preserve meaningful opening peaks.

### Discontinuities and capture gaps

Do not fit across duplicate timestamps, long capture gaps, or changes classified as discontinuous. Split the track first. Preserve both sides of the split.

Represent a true jump with a stepped or inverse-stepped segment. Cubism uses both segment types, and the Cubism editor exposes linear, stepped, inverse-step, and Bézier curves. See the [Cubism Graph Editor manual](https://docs.live2d.com/en/cubism-editor-manual/grapheditor/).

### Cyclic channels

The current v6 channels are bounded values, not cyclic angles. If a future track wraps, unwrap it before fitting. Then enforce matching loop endpoints and derivatives before wrapping the evaluated result. A periodic spline can provide an offline comparison, but it is not necessary for the first implementation.

### Error report

Use maximum absolute value error as the acceptance rule. Also report root-mean-square error and the retained-key ratio for diagnostics. Calculate all errors at the original sample times.

Do not use root-mean-square error alone. One short facial event can have a large local error and a small total contribution.

## Practical TypeScript options

| Option | Use |
| --- | --- |
| Small local vertical-RDP function | Recommended baseline. It matches AIRI's scalar error rule and needs no dependency. |
| `simplify-js` | Good experiment for standard geometric RDP. Use `highQuality: true` to skip its radial pre-pass. It still needs coordinate scaling. |
| Adapted local cubic fitter | Recommended production target. It can share segmentation, anchors, and validation with vertical RDP. |
| `odiak/fit-curve` | Good Schneider reference and prototype. Do not adopt it unchanged for scalar timeline curves. |
| [Mapshaper](https://github.com/mbloch/mapshaper/blob/master/docs/guides/simplification.md) | It contains Douglas-Peucker and Visvalingam variants, but its cartographic scope is too large for this devtool. |

No matching simplification or fitting package is present in the current workspace lockfile. If implementation uses a new package, select it with the user before adding it.

## Staged implementation plan

### Stage 1: establish a safe baseline

1. Add fixtures for a head turn, body sway, blink, mouth pulse, pause, discontinuity, and loop boundary.
2. Add track metadata for range, tolerance, interpolation policy, and cyclic behavior.
3. Detect segment boundaries and mandatory anchors.
4. Implement vertical-error RDP between mandatory anchors.
5. Compare source and reconstructed values at every original timestamp.
6. Show source samples as a faint line and simplified keys as editable points.

Start with a maximum normalized error of `0.02`. Tune each track from visual fixtures. Use a smaller error for channels where the model amplifies small parameter changes.

### Stage 2: fit editable cubic curves

1. Add linear, cubic, and step segment types to the editor model.
2. Implement the fixed-time cubic fit described above.
3. Split failed fits at the sample with the largest vertical error.
4. Keep RDP output when cubic fitting gives no useful key reduction.
5. Add value-range and time-order checks for every segment.
6. Add draggable Bézier handles without changing anchor times by default.

### Stage 3: integrate recording safely

1. Keep the original dense v6 recording while the derived fit remains unaccepted.
2. Fit each channel separately after recording or import.
3. Play the derived curves through the existing spring target.
4. Refit only the changed source range after a local edit.
5. Export a curve-native format after its interpolation semantics are stable.
6. Bake curves to v6 samples only when compatibility requires dense output.

### Acceptance criteria

- No fitted sample exceeds its per-track maximum error.
- Mandatory extrema keep their source time and value.
- Discontinuities never receive a linear or cubic bridge.
- Bounded channels do not overshoot their legal range.
- A loop has no unintended value or velocity seam.
- The editor shows tens of keys for a typical 20-second track, not hundreds.

## Recommendation

Implement Stage 1 first, then use the fixed-time cubic fitter as the normal continuous-track representation. Keep vertical RDP as the test oracle and fallback. Preserve blinks, mouth peaks, discontinuities, and loop boundaries as mandatory anchors. This approach gives a measurable value-error bound and produces curves that match Live2D's native segment model.
