# AIRI Icons

This package supplies AIRI icons to the UnoCSS configuration.
The build converts the SVG files in `assets/` to the Iconify collection in `dist/icons.json`.

## Use

Use `i-airi-icons:capacitor` to show the AIRI subscription icon.
Use the existing Iconify collections for general UI icons, provider logos, and weather icons.

## Add an icon

Add a kebab-case SVG file to `assets/`.
Run `pnpm -F @proj-airi/airi-icons build`.
Use the file name without `.svg` after `i-airi-icons:`.
