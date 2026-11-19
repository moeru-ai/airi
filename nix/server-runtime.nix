{
  lib,
  callPackage,

  makeWrapper,
  pnpmConfigHook,

  # Pinned in common.nix, expose here to make overridable
  nodejs' ? null,
  pnpm' ? null,
}:

(callPackage ./common.nix (
  (lib.optionalAttrs (nodejs' != null) { inherit nodejs'; })
  // (lib.optionalAttrs (pnpm' != null) { inherit pnpm'; })
)).overrideAttrs
  (
    final: prev: {
      pname = "${prev.pname}-server-runtime";

      nativeBuildInputs = [
        makeWrapper
        final.passthru.nodejs
        final.passthru.pnpm
        pnpmConfigHook
      ];

      # Install indirect dependencies in the workspace node_modules instead of
      # in the root node_modules
      prePnpmInstall = ''
        pnpm config set --location project nodeLinker hoisted
        pnpm config set --location project hoistingLimits workspaces
      '';

      buildPhase = ''
        runHook preBuild

        pnpm -F @proj-airi/server-runtime... build

        runHook postBuild
      '';

      installPhase = ''
        runHook preInstall

        mkdir -p "$out/lib"
        cp -rL packages/server-runtime/node_modules "$out/lib/node_modules"
        cp -r packages/server-runtime/dist "$out/lib/node_modules/@proj-airi/server-runtime"

        makeWrapper "${lib.getExe final.passthru.nodejs}" "$out/bin/airi-server-runtime" \
          --add-flags "$out/lib/node_modules/@proj-airi/server-runtime/bin/run.mjs" \
          --prefix NODE_PATH : "$out/lib/node_modules"

        runHook postInstall
      '';

      meta = prev.meta // {
        description = prev.meta.description + " (headless desktop server)";
      };
    }
  )
