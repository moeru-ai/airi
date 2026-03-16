# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).


## 2024-12-19

### Removed

* [Native] Remove Visual Studio 2013 (MSVC 120) static library.


## 2024-11-07

### Added

* [Native] Add experimental support `arm64` library for linux.

### Removed

* [Unity,Native,Java] Remove Android ARM v7 library.


## 2024-04-04

### Added

* [Unity] Add library(.so) for HarmonyOS build.


## 2024-03-26

### Remove

* [Unity] Remove built with Emscripten 1.38.48.
 * Unity 2021.2 or later uses only Core under `Assets/Live2D/Cubism/Plugins/Experimental/Emscripten/latest`.


## 2023-09-28

### Remove

* Remove bitcode from IOS build.


## 2023-08-17

### Added

* Enhance Blend Shape features.
  * Please see [here](https://docs.live2d.com/en/cubism-editor-manual/blend-shape/).

### Changed

* Upgrade Core version to 05.00.0000.


## 2023-05-09

### Changed

* Change the GCC version of the library for Linux from 6.5.0 to 8.3.0.


## 2023-03-16

### Fixed

* Fix a case in which the index of the mask's drawable object was negative value for `csmGetDrawableMasks()`.
* Fix a problem in which `csmHasMocConsistency()` was returned as 0 even though the MOC3 file was in the correct format.
  * This problem was occurring in some models using the blendshape weight limit settings.
* Fix a problem that could cause a crash if a MOC3 file that is not in the correct format is loaded with `csmHasMocConsistency()`.

### Changed

* Upgrade Core version to 04.02.0004.


## 2023-03-10

### Added

* Add the function `csmHasMocConsistency`.
  * This function verifies that the `MOC3` file is valid.

### Changed

* Upgrade Core version to 04.02.0003.


## 2023-02-21

### Added

* [Web] Added classes related to `Memory`.
  * Add the funciton `initializeAmountOfMemory()` to adjust the amount of memory at initialization.


## 2022-10-28

### Fixed

* [Java] Remove unnecessary methods.


## 2022-10-06

### Added

* [Java] Add AAR file for Android.


## 2022-09-08

### Added

* Add the multilingual supported documents.
* Support Visual Studio 2022.


## 2022-08-04

### Fixed

* [Web] Fix `csmGetMocVersion` function argument.


## 2022-07-07

### Added

* Add functions
  * `csmGetParameterTypes`
  * `csmGetDrawableParentPartIndices`

* Add type `csmMocVersion` and enum. This type is the return value of `csmGetMocVersion`, `csmGetLatestMocVersion`.

### Changed

* Upgrade Core version to 04.02.0002.


## 2022-06-02

### Changed

* Upgrade Core version to 04.02.0001.

### Fixed

* Fixed a bug that caused Multiply Color / Screen Color of different objects to be applied.


## 2022-05-19

### Added

* Support new Multiply Color / Screen Color features.
* Support new Blend Shape features.

### Changed

* Upgrade Core version to 04.02.0000. This upgrade is following Cubism Editor 4.2 features.


## 2022-02-10

### Added

* [Unity] Add bitcode library(.bc) for Emscripten latest version build.

### Changed

* [Unity] Change the bitcode file directory location.
  * emsdk latest version build bitcode file in `latest` directory.
  * emsdk 1.38.48 build bitcode file in `1_38_48` directory.


## 2021-12-09

### Added

* Add static library(.a) for Mac Catalyst.


## 2021-10-07

### Added

* Add `x86_64` library for Android.
* Add `arm64` library for macOS.


## 2021-03-09

### Added

* Add funtcions for Viewer.
  * `csmGetParameterKeyCounts`
  * `csmGetParameterKeyValues`


### Changed

* Update Core version to `04.01.0000`.


## 2020-01-30

### Added

* Add static library(.lib) for statically linking DLL.
* Add symbol file for Windows dynamic library (dll).


## 2019-11-19

### Fixed

* Fix linking static libraries for Windows (.lib).


## 2019-11-14

### Added

* Support Visual Studio 2019.
* Support macOS dynamic library (dylib).

### Changed

* Update Windows dynamic library:  Use Visual Studio 2019 for building.

### Security

* Bundle certificate and notary ticket to macOS shared library.


## 2019-09-04

### Added

* Support new Inverted Masking features.
* Support ARM64 architecture for Universal Windows Platform.

### Changed

* Upgrade Core version to 04.00.0000 (67108864). This upgrade is following Cubism Editor 4.0 features.
* Add calling convention for *Windows/x86 DLL* only.

### Removed

* Remove bitcode binary due to suspension of *Cubism Bindings.*


## 2019-04-09

### Added

* Support Universal Windows Platform for Windows Store Application.


## 2019-01-31

### Added

* Add API to get the parent part of the specified part.
* Add API to get moc3 version.


## 2018-12-20

### Added

* [Native] Add new function: `csmGetPartParentPartIndices`.
* [Native, 3.3 Support] Support new Warp Deformer features.

### Changed

* Upgrade Core version to 03.03.0000 (50528256). This upgrade is following Cubism Editor 3.3 features.


## 2018-08-22

### Added

* [Native] Add support for Neon.


## 2018-05-14

### Added

* [Native] Add Windows **Visual C++ 2013** library.
* [Windows] Add runtime library choice `MT`, `MD`, `MTd`, `MDd`.
* [iOS] Add support for iPhone Simulator SDK.

### Fixed

* Fix an error occurred when linking libraries for Android `arm64-v8a`.


## 2017-11-17

### Fixed

* Fix processing of vertex index.


## 2017-10-05

### Added

* Provide bitcode for iOS.


## 2017-08-09

### Added

* [Native] Add Android *arm64-v8a* ABI library.

### Fixed

* Fix drawing order in certain scenarios.


## 2017-07-12

### Added

* Add experimental support for Emscripten.
* Add `CHANGELOG.md`.

### Fixed

* Fix access violation in certain scenarios.
* Fix update result in certain scenarios.


## 2017-05-02

### Added

* [Native] Add experimental support for Raspberry PI.
* Add `README.md`.
