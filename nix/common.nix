{
  pkgs,
  lib,
  stdenvNoCC,
  fetchPnpmDeps,

  cacert,
  gitMinimal,
  nodejs,
  pnpmConfigHook,

  # Use project version
  version ? lib.pipe ../package.json [
    builtins.readFile
    (builtins.match ''.*"version": "([^[:space:]]+)".*'')
    builtins.head
  ],
  # Pin pnpm version
  pnpm' ? lib.pipe ../package.json [
    builtins.readFile
    (builtins.match ''.*"packageManager": "pnpm@([[:digit:]]+).*'')
    builtins.head
    (major: pkgs."pnpm_${major}")
  ],
}:

stdenvNoCC.mkDerivation (final: {
  pname = "airi";
  inherit version;

  # NOTICE: Clean some editor files that cause build to fail
  # https://github.com/moeru-ai/airi/issues/1438
  src = lib.cleanSourceWith {
    src = ../.;
    filter =
      path: type:
      let
        baseName = baseNameOf (toString path);
        isEditorMetadataDirectory = type == "directory" && (baseName == ".vscode" || baseName == ".zed");
      in
      !isEditorMetadataDirectory;
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (final) pname version src;
    pnpm = pnpm';
    fetcherVersion = 4;
    hash = builtins.readFile ./pnpm-deps-hash.txt;
  };

  # Cache of assets downloaded during vite build
  assets = stdenvNoCC.mkDerivation {
    pname = "airi-assets";
    inherit (final) version src pnpmDeps;

    nativeBuildInputs = [
      cacert # For network request
      gitMinimal # For unplugin-info
      nodejs
      pnpm'
      pnpmConfigHook
    ];

    buildPhase = ''
      runHook preBuild

      # Build Tamagotchi since it has all assets of web + embedded models.
      # If another stage gets unique assets, this must be updated.
      pnpm -F @proj-airi/stage-tamagotchi... run build

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p "$out"
      cp -vr .cache/* "$out"
      cp -vr apps/stage-tamagotchi/src/renderer/.cache/assets/* "$out"

      runHook postInstall
    '';

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = builtins.readFile ./assets-hash.txt;
  };

  # To be pinned by dev shells
  passthru.pnpm = pnpm';

  meta = {
    description = "Self-hostable AI waifu / companion / VTuber";
    longDescription = ''
      AIRI is a soul container of AI waifu / virtual characters to bring them into our world,
      wishing to achieve Neuro-sama's altitude. It's completely LLM and AI driven, capable of
      realtime voice chat, playing Minecraft and Factorio. It can be run in browser or on desktop.
      This is the desktop version.
    '';
    homepage = "https://github.com/moeru-ai/airi";
    changelog = "https://github.com/moeru-ai/airi/releases/tag/v${final.version}";
    # While airi itself is licensed under MIT, it uses the nonfree Cubism SDK. Whether it's
    # redistributable remains a question, so we say it's not.
    license = lib.licenses.unfree;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = final.pname;
    maintainers = with lib.maintainers; [ weathercold ];
  };
})
