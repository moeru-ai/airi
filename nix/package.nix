{
  stdenvNoCC,
  pkgs,
  lib,
  callPackage,
  makeDesktopItem,

  asar,
  copyDesktopItems,
  gitMinimal,
  makeWrapper,
  nodejs,
  pnpmConfigHook,

  libxt,
  libxtst,

  # Pinned in common.nix, expose here to make overridable
  pnpm' ? null,
  # Pin electron version
  electron' ? lib.pipe ../pnpm-workspace.yaml [
    builtins.readFile
    (builtins.match ''.*electron: \^([[:digit:]]+).*'')
    builtins.head
    (major: pkgs."electron_${major}")
  ],
}:

let
  libraryPath = lib.makeLibraryPath [
    libxt
    libxtst
  ];
in

(callPackage ./common.nix (lib.optionalAttrs (pnpm' != null) { inherit pnpm'; })).overrideAttrs (
  final: prev: {
    nativeBuildInputs = [
      asar
      copyDesktopItems
      gitMinimal
      makeWrapper
      nodejs
      final.passthru.pnpm
      pnpmConfigHook
    ];

    desktopItems = [
      (makeDesktopItem {
        desktopName = "AIRI";
        comment = final.meta.description;
        categories = [
          "AudioVideo"
          "Amusement"
        ];
        exec = final.meta.mainProgram;
        icon = final.meta.mainProgram;
        name = final.meta.mainProgram;
      })
    ];

    env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

    configurePhase = ''
      runHook preConfigure

      echo Setting up asset cache
      ln -s "$assets" .cache
      mkdir apps/stage-tamagotchi/src/renderer/.cache
      ln -s "$assets" apps/stage-tamagotchi/src/renderer/.cache/assets

      runHook postConfigure
    '';

    buildPhase = ''
      runHook preBuild

      pnpm -F @proj-airi/stage-tamagotchi... run build
      cd apps/stage-tamagotchi
      pnpm exec electron-builder build \
        --dir --${if stdenvNoCC.hostPlatform.isLinux then "linux" else "mac"} \
        -c.electronDist="${electron'.dist}" \
        -c.electronVersion="${electron'.version}"

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p "$out/opt"
      cp -r dist/*-unpacked "$out/opt/AIRI"
      # The icon is actually 1500x1500... install it anyway
      install -Dm644 resources/icon.png "$out/share/icons/hicolor/64x64/apps/airi.png"

      # Patch the asar to include the assets
      cd "$out/opt/AIRI/resources"
      asar extract app.asar app
      rm -r app.asar.unpacked
      cp -r "$assets"/{vrm,live2d} app/out/renderer/assets
      asar pack app app.asar

      # DevTools opens since nix build is not packaged, therefore considered
      # as dev build. Set MAIN_APP_DEBUG to 0 by default to disable DevTools.
      # See src/main/libs/electron/devtools.ts
      #
      # The app runs from the read-only Nix store, and Nix owns its updates.
      # AIRI_DISTRIBUTION=nix disables the built-in updater.
      # See isExternallyUpdatedInstall in src/main/services/electron/auto-updater.ts
      makeWrapper "${lib.getExe electron'}" "$out/bin/airi" \
        --add-flags "$out/opt/AIRI/resources/app.asar" \
        --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--enable-wayland-ime=true --wayland-text-input-version=3}}" \
        --prefix LD_LIBRARY_PATH : "${libraryPath}" \
        --set-default MAIN_APP_DEBUG 0 \
        --set AIRI_DISTRIBUTION nix

      runHook postInstall
    '';

    passthru = prev.passthru // {
      electron = electron';
    };
  }
)
