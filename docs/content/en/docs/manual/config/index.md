---
title: Configuration Guide
description: How to use Project AIRI
---

## Settings

You can open settings in the system tray for further customization, for example,
changing the theme color of AIRI, or switching to another model, either
Live2D (2D) or VRM (3D, like Grok Companion).

<video autoplay loop muted>
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

There are so many options in the settings, try experiment and discover what
you would like to try.

### Changing Model

It's possible to swap the default model out for other Live2D (2D) and VRM (3D, again,
similar 3D model like Grok Companion as long as you have it),

Models setting located under [Settings] -> [Models].

::: tip Importing models from VTuber Studio?
The library we used to render the Live2D model is having difficulties to read the ZIP
file bundled from a VTuber Studio model because of the unknown files used by VTuber Studio
but not Live2D engine known files.

So when importing, before compressing the VTuber Studio model into a ZIP file, make sure
to exclude the following files:

- `items_pinned_to_model.json`
:::

<br />

::: warning Bugs inside
Currently the functionality of the reloading the scene of models is not working as intended.
You will have to restart AIRI after loaded the model.
:::

<br />

<video autoplay loop muted>
 <source src="/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>
