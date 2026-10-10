## AIRI VRM Motion Library preview

This fork release adds a reusable body-motion runtime and a local VRMA library.

- Bow, dance, run in a circle, wave, nod, shake head, celebrate, stretch, and present.
- Optional natural idle and a 48-second relaxed-arms idle, saved separately for each avatar.
- Self-contained binary VRMA import with LINEAR keyframes, catalog search, playback speed, finite repeats, queues, and stop-to-idle.
- Existing ACT motion cues select eligible catalog IDs. Facial expressions and speech remain independent.
- Middle-click visible model geometry to choose the orbit center. Middle-drag still zooms.
- Camera recentering preserves viewing angle and distance. Reset orbit center restores the model center.

This is a prerelease. It contains original procedural motion, not motion-capture footage.
STEP and CUBICSPLINE keyframes are rejected because the upstream VRMA retargeter does not preserve their interpolation.
Clothing, hair, foot shapes, and unusual rigs need avatar-specific visual checks.
The library supports hundreds of entries without loading all animation files at startup.
It does not include hundreds of finished animations.

The package includes no custom avatar or private reference artwork.
Import your own VRM model, then select a motion in Settings > Models > Motion Library.
The existing AIRI idle remains the default. Select Relaxed arms idle to enable the new relaxed idle.

The attached source.json records the exact tested source commit. SHA256SUMS covers the DEB package and update manifest. This fork checks its own GitHub releases for updates; automatic downloading stays disabled.
This build targets Linux amd64. Other architectures and operating systems are not part of this release.
