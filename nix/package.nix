{
  stdenvNoCC,
  callPackage,

  copyDesktopItems,
  makeDesktopItem,
  makeWrapper,
  pnpm,

  electron,
  nodejs,
}:

(callPackage ./common.nix { }).overrideAttrs (final: {
  nativeBuildInputs = [
    copyDesktopItems
    makeWrapper
    nodejs
    pnpm.configHook
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
    mkdir apps/stage-tamagotchi/src/renderer/.cache
    cp -r "$assets/assets" apps/stage-tamagotchi/src/renderer/.cache

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    pnpm run build:packages
    cd apps/stage-tamagotchi
    pnpm run build
    pnpm exec electron-builder build \
      --dir --${if stdenvNoCC.isLinux then "linux" else "darwin"} \
      -c.electronDist="${electron.dist}" \
      -c.electronVersion="${electron.version}"

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/opt"
    cp -r dist/*-unpacked "$out/opt/AIRI"
    # The icon is actually 1500x1500... install it anyway
    install -Dm644 resources/icon.png "$out/share/icons/hicolor/64x64/apps/airi.png"

    makeWrapper "${electron}/bin/electron" "$out/bin/airi" \
      --add-flags "$out/opt/AIRI/resources/app.asar" \
      --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform-hint=auto --enable-features=WaylandWindowDecorations --enable-wayland-ime=true --wayland-text-input-version=3}}"

    runHook postInstall
  '';
})
