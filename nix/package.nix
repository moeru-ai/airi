{
  stdenvNoCC,
  callPackage,

  copyDesktopItems,
  makeDesktopItem,
  makeWrapper,
  gitMinimal,
  pnpm,

  asar,
  electron,
  nodejs,
}:

(callPackage ./common.nix { }).overrideAttrs (final: {
  nativeBuildInputs = [
    asar
    copyDesktopItems
    makeWrapper
    gitMinimal
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
    ln -s "$assets" .cache
    mkdir apps/stage-tamagotchi/src/renderer/.cache
    ln -s "$assets" apps/stage-tamagotchi/src/renderer/.cache/assets

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    pnpm run build:packages
    cd apps/stage-tamagotchi
    pnpm run build
    pnpm exec electron-builder build \
      --dir --${if stdenvNoCC.isLinux then "linux" else "mac"} \
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

    # Patch the asar to include the assets
    cd "$out/opt/AIRI/resources"
    asar extract app.asar app
    rm -r app.asar.unpacked
    cp -r "$assets"/{vrm,live2d} app/out/renderer/assets
    asar pack app app.asar

    makeWrapper "${electron}/bin/electron" "$out/bin/airi" \
      --add-flags "$out/opt/AIRI/resources/app.asar" \
      --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--enable-wayland-ime=true --wayland-text-input-version=3}}"

    runHook postInstall
  '';
})
