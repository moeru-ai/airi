# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).


## [5-r.3] - 2025-02-18

### Added

* Add new motion loop processing that seamlessly connects the start and end points of the loop.
  * The `_isLoop` variable was moved from class `CubismMotion` to class `ACubismMotion`.
  * Add the setter for `_isLoop`, `setLoop()`, to class `ACubismMotion`.
  * Add the getter for `_isLoop`, `getLoop()`, to class `ACubismMotion`.
  * The `_isLoopFadeIn` variable was moved from class `CubismMotion` to class `ACubismMotion`.
  * Add the setter for `_isLoopFadeIn`, `setLoopFadeIn()`, to class `ACubismMotion`.
  * Add the getter for `_isLoopFadeIn`, `getLoopFadeIn()`, to class `ACubismMotion`.
  * Add a variable `_motionBehavior` for version control to the `CubismMotion` class.

### Changed

* Change ESLint version to `9.17.0`.
  * With this update, we have added the eslint.confing.mjs required for FlatConfig.

### Deprecated
* Deprecate the following elements due to the change in the variable declaration location.
  * `CubismMotion.setIsLoop()`
  * `CubismMotion.isLoop()`
  * `CubismMotion.setIsLoopFadeIn()`
  * `CubismMotion.isLoopFadeIn()`

## [5-r.2] - 2024-12-19

### Added

* Add the functionality to call a function when motion playback starts.
* Add an API to `CubismMotionJson` for verifying the consistency of `motion3.json`. by [@pillowtrucker](https://github.com/Live2D/CubismNativeFramework/pull/57)
  * This API is ported from `Cubism Native Framework`.

### Changed

* Change to create and manage a `CubismShader` for each `GLRenderingContext`.
* Change the access level of the private members in `CubismModelSettingJson` class to protected.
* Move JSON key strings set to the member variables of `CubismModelSettingJson` class.
* Change `FrequestNode` to be exported as part of the module.
* Change to permit to overwrite motion fade by the value specified in .model3.json on `CubismUserModel.loadMotion()`.
* Change the value of pi used in the calculation of `CubismBreath.updateParameters()` to `Math.PI`.

### Deprecated

* Deprecate the following elements because a priority value is not actually used during expression motion playback:
  * `CubismExpressionMotionManager._currentPriority`
  * `CubismExpressionMotionManager._reservePriority`
  * `CubismExpressionMotionManager.startMotionPriority()`
  * `CubismExpressionMotionManager.getCurrentPriority()`
  * `CubismExpressionMotionManager.getReservePriority()`
  * `CubismExpressionMotionManager.setReservePriority()`

  Please use the `CubismMotionQueueManager.startMotion()` instead of `CubismExpressionMotionManager.startMotionPriority()`.


### Fixed

* Fix an issue where already registered keys could be added on `csmMap.appendKey()`.
* Fix a bug that caused an error when playing `CubismExpresionMotion` with `CubismMotionQueueManager.startMotion()`.
* Fix an issue where `CubismMath.cardanoAlgorithmForBezier()` was using a different function than Cubism SDK for Native.
* Fix a potential problem with division by 0 when a pose fade time is set to 0 seconds.
* Fix an issue where `CubismPose._fadeTimeSeconds` does not become 0.


## [5-r.1] - 2024-03-26

### Added

* Add function `mod()` to compute floating-point remainder in `CubismMath` class.

### Changed

* Change the weight value in `Expression` from `CubismExpressionMotion` to have it in the `CubismExpressionMotionManager`.
* Reorganize the names of some functions and variables.
  * This is a change that depends on fixing `eslintrc.yml`.
* Change to output log if the argument `motionQueueEntry` is `null` in the `updateFadeWeight()` function of the `ACubismMotion` class.

### Fixed

* Fix `eslintrc.yml` to conform to the exact wording.

### Deprecated

* Deprecate the `_fadeWeight` variable and the `getFadeWeight()` function of the `CubismExpressionMotion` class.
  * The `_fadeWeight` variable of the `CubismExpressionMotion` class can cause problems.
  * Please use the `getFadeWeight()` function of the `CubismExpressionMotionManager` class with one argument from now on.
* The `startMotion()` function of the `CubismMotionQueueManager` class with the unnecessary third argument `userTimeSeconds` is deprecated.
  * Please use the `startMotion()` function with one arguments from now on.


## [5-r.1-beta.4] - 2024-01-18

### Changed

* Change target to `es6`.

### Fixed

* Fix an issue where models with a specific number of masks could not be drawn correctly.
* Fix to check for error when reading json.


## [5-r.1-beta.3] - 2023-11-30


## [5-r.1-beta.2] - 2023-09-28

### Added

* Add a comment for clarity for the function whose usage is not intuitive.


## [5-r.1-beta.1] - 2023-08-17

### Added

* Add the function to get the ID of a given parameter.(`CubismModel.getParameterId`)
* Add the `CubismExpressionMotionManager` class.

### Changed

* Change the visibility of the `CubismId` constructor to private.
  * Please use `CubismFramework.getIdManager().getId()` to get `CubismId`.
* Change the word `DrawMesh` to `DrawMeshWebGL`.

### Fixed

* Fix a bug that the value applied by multiply was not appropriate during expression transitions.
* Fix the structure of the class in renderer.
* Fix a issue where `ARRAY_BUFFER` was used on multiple targets.
* Separate shader class from `cubismrenderer` class.
* Separate the high precision mask process from the clipping mask setup process.

### Removed

* Remove several arguments of `DrawMesh` function.


## [4-r.7] - 2023-05-25

### Added

* Add compiler options `noImplicitAny` and `useUnknownInCatchVariables` to `tsconfig.json`.
* Add some function for checking consistency of MOC3.
  * Add the function of checking consistency on reviving a MOC3. (`CubismMoc::Create`)
* Add a function to parse the opacity from `.motion3.json`.
* Add some functions to change Multiply and Screen colors on a per part basis.

### Changed

* Change access specifier for `CubismExpressionMotion`.

### Fixed

* Fix to support added compiler options `noImplicitAny` and `useUnknownInCatchVariables`.


## [4-r.6.2] - 2023-03-16

### Fixed

* Fix some problems related to Cubism Core.
  * See `CHANGELOG.md` in Core.


## [4-r.6.1] - 2023-03-10

### Added

* Add function to validate MOC3 files.


## [4-r.6] - 2023-02-21

### Added

* Add support for high-precision masks.
* The number of render textures used can now be increased arbitrarily.
  * The maximum number of masks when using multiple render textures has been increased to "number of render textures * 32".
* Add API to allow users to configure culling.

### Changed

* Change to not reference `CubismClippingManager_WebGL` on models that do not use clipping masks.

### Fixed

* Fix a crash when a `WebGLRenderingContext` is not registered with `Cubism Renderer_WebGL`.
  * It now displays a warning and does not draw models.
* Fix a bug when displaying a model with culling set, some of the other drawn images are missing.
* Fix a bug that caused update information for some models not to be updated when multiple models are displayed.
  * Call the function to extend the initial memory with CubismFramework.initialize(). See `CHANGELOG.md` in Core.


## [4-r.5] - 2022-09-08

### Added

* Add the multilingual supported documents.
* Add immediate stabilization of physics.
* Implemented a process to switch between `CubismJson` parsing and `JSON.parse()`.


## [4-r.5-beta.5] - 2022-08-04

### Fixed

* Fix `csmGetMocVersion` function argument.
* Fix a bug in which processing was interrupted when an invalid vertex was specified in the middle of a physics operation.
* Fix crash with exception when reading .moc3 files of unsupported versions.
* Fix physics system input to be split by the physics setting time.


## [4-r.5-beta.4] - 2022-07-07

### Added

* Add a function to get the latest .moc3 Version and the .moc3 Version of the loaded model.
* Add a function to get the type of parameters of the model.
* Add a function to get the parent part of the model's Drawable.


## [4-r.5-beta.3] - 2022-06-16

### Fixed

* `getDrawableTextureIndices` function in `CubismModel` has been renamed to `getDrawableTextureIndex` because the name was not correct.
  * `getDrawableTextureIndices` function is marked as deprecated.
* Fix physics system behaviour when exists Physics Fps Setting in .physics3.json.


## [4-r.5-beta.2] - 2022-06-02

### Fixed

* Fixed a bug that caused Multiply Color / Screen Color of different objects to be applied.
  * See `CHANGELOG.md` in Core.
  * No modifications to Samples and Framework.


## [4-r.5-beta.1] - 2022-05-19

### Added

* Add processing related to Multiply Color / Screen Color added in Cubism 4.2.

### Fixed

* Fix usage of Anisotropy filtering.
* Fix model was not displayed when the number of masks exceeded the limit.
* Fix getTextureDirectory() to return the directory name of the 0th texture path.


## [4-r.4] - 2021-12-09

### Fixed

* Fix useless void 0.
* Fix a warning when `SegmentType` could not be obtained when loading motion.
* Fix return correct error values for out-of-index arguments in cubismjson by [@cocor-au-lait](https://github.com/cocor-au-lait).
* Fix a bug that motions currently played do not fade out when play a motion.


## [4-r.3] - 2021-06-10

### Fixed

* Fix motion event time value from Int to Float.


## [4-r.3-beta.1] - 2021-05-13

### Added

* Implement a function to get the correct value when the time axis of the Bezier handle cannot be linear.


## [4-r.2] - 2021-03-09

### Fixed

* Fix implementation of `iterator#increment` in `csmmap` and `csmvector`.
* Fix delay in starting fade-out for expressions.
* Fix Physics input reflect flag on evaluate.
* Fix reference size of model matrix.
* Fix `Int` to `Float` when getting `PhysicsSettings.Vertices.Radius` in `physics3.json` parsing.
   * **[INFO]** This fix may change the behavior of the physics operations.
     The behavior changes if the value of `PhysicsSettings.Vertices.Radius` in `physics3.json` is less than `1.0`.
     If you want to return to the behavior before Cubism SDK for Web R1,
     change the value of the corresponding `PhysicsSettings.Vertices.Radius` to `0`.
   * This fix is related to fix applied to `Cubism Editor 4.0.05 beta1` and later.
     Please see [Cubism Editor Changelog](https://docs.live2d.com/cubism-editor-manual/updates4/).
      * **Fix physics and scene blending settings where the length of the pendulum would be converted to an integer when displayed.**

### Changed

* Rename the function name that handles seconds from `Time` to `Seconds`.
* Avoiding needless namespace syntax to simplify imports by [@cocor-au-lait](https://github.com/cocor-au-lait)


## [4-r.1] - 2020-01-30

### Added

* Add `.editorconfig`, `.gitattributes` and `.gitignore`.
* Add document `README.md` and `CHANGELOG.md`.
* Add `package.json` for development and build.
* Add Prettier and ESLint for format and check code quolity.

### Changed

* Move source files to `/src` directory.
* Reformat code using Prettier and ESLint.


[5-r.3]: https://github.com/Live2D/CubismWebFramework/compare/5-r.2...5-r.3
[5-r.2]: https://github.com/Live2D/CubismWebFramework/compare/5-r.1...5-r.2
[5-r.1]: https://github.com/Live2D/CubismWebFramework/compare/5-r.1-beta.4...5-r.1
[5-r.1-beta.4]: https://github.com/Live2D/CubismWebFramework/compare/5-r.1-beta.3...5-r.1-beta.4
[5-r.1-beta.3]: https://github.com/Live2D/CubismWebFramework/compare/5-r.1-beta.2...5-r.1-beta.3
[5-r.1-beta.2]: https://github.com/Live2D/CubismWebFramework/compare/5-r.1-beta.1...5-r.1-beta.2
[5-r.1-beta.1]: https://github.com/Live2D/CubismWebFramework/compare/4-r.7...5-r.1-beta.1
[4-r.7]: https://github.com/Live2D/CubismWebFramework/compare/4-r.6.2...4-r.7
[4-r.6.2]: https://github.com/Live2D/CubismWebFramework/compare/4-r.6.1...4-r.6.2
[4-r.6.1]: https://github.com/Live2D/CubismWebFramework/compare/4-r.6...4-r.6.1
[4-r.6]: https://github.com/Live2D/CubismWebFramework/compare/4-r.5...4-r.6
[4-r.5]: https://github.com/Live2D/CubismWebFramework/compare/4-r.5-beta.5...4-r.5
[4-r.5-beta.5]: https://github.com/Live2D/CubismWebFramework/compare/4-r.5-beta.4...4-r.5-beta.5
[4-r.5-beta.4]: https://github.com/Live2D/CubismWebFramework/compare/4-r.5-beta.3...4-r.5-beta.4
[4-r.5-beta.3]: https://github.com/Live2D/CubismWebFramework/compare/4-r.5-beta.2...4-r.5-beta.3
[4-r.5-beta.2]: https://github.com/Live2D/CubismWebFramework/compare/4-r.5-beta.1...4-r.5-beta.2
[4-r.5-beta.1]: https://github.com/Live2D/CubismWebFramework/compare/4-r.4...4-r.5-beta.1
[4-r.4]: https://github.com/Live2D/CubismWebFramework/compare/4-r.3...4-r.4
[4-r.3]: https://github.com/Live2D/CubismWebFramework/compare/4-r.3-beta.1...4-r.3
[4-r.3-beta.1]: https://github.com/Live2D/CubismWebFramework/compare/4-r.2...4-r.3-beta.1
[4-r.2]: https://github.com/Live2D/CubismWebFramework/compare/4-r.1...4-r.2
[4-r.1]: https://github.com/Live2D/CubismWebFramework/compare/ce2585a919ac6e99f64dd468933772c6f1abbcc7...4-r.1
