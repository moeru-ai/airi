[English](NOTICE.md) / [日本語](NOTICE.ja.md)

---

# Notices

## [Caution] Precautions for updating to Cubism 4 SDK for Web R1 or later

With the release of the official version of the Cubism 4 SDK for Web R1 from the previous beta version, the structure of packages and repositories has been changed to improve usability.

The reason for this change is to operate without changing the structure of Cubism 4 SDK for Native, and to avoid mixing files that do not require management by users.

Details on structural changes and how to update from projects prior to Cubism 4 SDK for Web beta2 are described in the [Cubism SDK Manual]. Please be sure to check it when updating.

[Cubism SDK Manual]: https://docs.live2d.com/cubism-sdk-manual/warning-for-cubism4-web-r1-update/


## [Caution] About the duplicate declaration error in dependent packages (2023-02-23)

A duplicate declaration error may occur due to `@types/node` among the dependency packages used in the Cubism 4 SDK for Web Samples.

We have confirmed that this can be resolved by one of the following procedures.

### Solution 1: Use npm-check-updates

1. Navigate to the `/Samples/TypeScript/Demo` directory in Terminal.
1. Execute the command `npm i -g npm-check-updates`.
1. Execute the command `ncu`.

### Solution 2: Reinstall @types/node explicitly

1. Navigate to the `/Samples/TypeScript/Demo` directory in Terminal.
1. Execute the command `npm uninstall @types/node`.
1. Execute the command `npm install @types/node`.

---

©Live2D
