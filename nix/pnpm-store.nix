# Hand-written Nix derivation for per-package pnpm CAFS store.
#
# Architecture:
#   1. IFD: convert pnpm-lock.yaml → JSON via yj (tiny, cached after first eval)
#   2. Pure Nix: extract package metadata (name, version, url, integrity)
#   3. cafsScript: bundles the .ts source with its node_modules (from fetchurl)
#   4. makePkgStore: per-package derivation that runs the .ts script via Node
#   5. Merge derivation: combines all fragments with cp -rn
#
# All pnpm internal format knowledge is in pnpm-cafs-add.ts (via @pnpm/store.cafs
# and @pnpm/constants). This Nix file is completely format-agnostic.
#
# NOTICE: This file uses IFD (Import From Derivation) to parse pnpm-lock.yaml
# at evaluation time. nix build allows IFD by default; --pure-eval (used by
# nix flake check) disables it — override with --allow-import-from-derivation
# or allow-import-from-derivation = true in nix.conf.
{
  stdenvNoCC,
  lib,
  fetchurl,
  nodejs,
  runCommand,
  yj,
}:
let
  # ---------------------------------------------------------------------------
  # IFD: parse pnpm-lock.yaml → JSON (sub-second, cached by Nix store)
  # ---------------------------------------------------------------------------
  lockfileJson = runCommand "pnpm-lock-json" {
    nativeBuildInputs = [ yj ];
  } ''
    yj < ${../pnpm-lock.yaml} > $out
  '';
  lockfile = builtins.fromJSON (builtins.readFile lockfileJson);

  # ---------------------------------------------------------------------------
  # Pure Nix: extract package metadata from lockfile
  # ---------------------------------------------------------------------------

  # Parse "name@version" key — last @ is the separator (handles @scope/name@version)
  parseKey = key:
    let
      # builtins.match returns null on no match, or a list of capture groups
      # "@scope/name@1.0.0" → ["@scope/name" "1.0.0"]
      # "lodash@4.17.21" → ["lodash" "4.17.21"]
      m = builtins.match "(.+)@([^@]+)" key;
    in {
      name = builtins.elemAt m 0;
      version = builtins.elemAt m 1;
    };

  # Compute npm registry tarball URL from package name and version.
  # Scoped:   @scope/name → registry.npmjs.org/@scope/name/-/name-version.tgz
  # Unscoped: name → registry.npmjs.org/name/-/name-version.tgz
  npmTarballUrl = name: version:
    let
      hasScope = lib.hasInfix "/" name;
      unscopedName = if hasScope
        then lib.last (lib.splitString "/" name)
        else name;
    in "https://registry.npmjs.org/${name}/-/${unscopedName}-${version}.tgz";

  # Build package entry from lockfile key + entry, or null if skipped
  mkPkgEntry = key: entry:
    let
      parsed = parseKey key;
      integrity = entry.resolution.integrity or null;
      url = entry.resolution.tarball or (npmTarballUrl parsed.name parsed.version);
    in
    if (entry.bundled or false) || integrity == null
    then null
    else {
      inherit (parsed) name version;
      inherit url integrity;
    };

  # Extract all non-null package entries from lockfile
  rawEntries = lib.mapAttrs mkPkgEntry (lockfile.packages or {});
  packages = lib.filterAttrs (_: v: v != null) rawEntries;

  # ---------------------------------------------------------------------------
  # Runtime dependencies of nix/scripts/pnpm-cafs-add.ts
  # These are the npm packages needed to run the CAFS script directly (without
  # bundling). Listed here so pnpm-store.nix can fetchurl + extract them into
  # a node_modules for the script. Update this list when @pnpm/store.cafs or
  # @pnpm/constants changes.
  # ---------------------------------------------------------------------------
  cafsScriptDeps = [
    "@pnpm/constants@1001.3.1"
    "@pnpm/graceful-fs@1000.1.0"
    "@pnpm/store.cafs@1000.1.4"
    "@zkochan/rimraf@3.0.2"
    "better-path-resolve@1.0.0"
    "fs-extra@11.3.0"
    "graceful-fs@4.2.11"
    "is-gzip@2.0.0"
    "is-subdir@1.2.0"
    "is-windows@1.0.2"
    "jsonfile@6.2.0"
    "minipass@7.1.3"
    "rename-overwrite@6.0.6"
    "ssri@10.0.5"
    "strip-bom@4.0.0"
    "universalify@2.0.1"
  ];

  # Fetch a package tarball by its key
  fetchPkg = key:
    let pkg = packages.${key};
    in fetchurl { url = pkg.url; hash = pkg.integrity; };

  # Build a node_modules directory with the CAFS script's runtime dependencies.
  # This avoids checking in a bundled .mjs — only the auditable .ts source is in the repo.
  cafsScript = stdenvNoCC.mkDerivation {
    name = "pnpm-cafs-add";
    dontUnpack = true;
    dontConfigure = true;
    dontInstall = true;
    dontFixup = true;
    buildPhase = ''
      # Extract each runtime dependency into a flat node_modules
      ${lib.concatStringsSep "\n" (map (key:
        let
          pkg = packages.${key};
          # e.g. "@pnpm/store.cafs" → "@pnpm/store.cafs", "ssri" → "ssri"
          modPath = pkg.name;
          parentDir =
            if lib.hasPrefix "@" modPath
            then "$out/node_modules/${lib.head (lib.splitString "/" modPath)}"
            else "$out/node_modules";
        in ''
          mkdir -p "${parentDir}"
          mkdir -p "$out/node_modules/${modPath}"
          tar xzf ${fetchPkg key} --strip-components=1 -C "$out/node_modules/${modPath}"
        ''
      ) cafsScriptDeps)}
      cp ${./scripts/pnpm-cafs-add.ts} $out/pnpm-cafs-add.ts
    '';
  };

  # Each package gets its own derivation: fetch tarball → write CAFS fragment.
  # Runs the .ts source directly via Node's built-in TypeScript stripping.
  makePkgStore = key: pkg:
    let
      drv = fetchurl {
        url = pkg.url;
        hash = pkg.integrity;
      };
    in
    stdenvNoCC.mkDerivation {
      name = "airi-pnpm-pkg-${lib.replaceStrings [ "@" "/" ] [ "" "-" ] key}";
      nativeBuildInputs = [ nodejs ];
      buildPhase = ''
        node --experimental-strip-types \
          ${cafsScript}/pnpm-cafs-add.ts \
          "${drv}" \
          "$out" \
          "${key}" \
          "${pkg.integrity}"
      '';
      dontConfigure = true;
      dontUnpack = true;
      dontInstall = true;
      dontFixup = true;
    };

  pkgStores = lib.mapAttrs makePkgStore packages;

in
# Merge all per-package CAFS fragments into one complete pnpm store.
# CAFS is content-addressed: cp -rn is safe (same hash = same file, no conflicts).
#
# NOTICE: pkgStoresList is passed via passAsFile instead of being interpolated
# directly into buildPhase. With ~3000 packages each path is ~50 chars, the
# concatenated string exceeds ARG_MAX (~2 MB) when bash is invoked with all
# environment variables, causing E2BIG. passAsFile writes the content to a
# temp file and sets pkgStoresListPath, keeping the env small. Nix still
# tracks the string context (i.e. dependencies on all pkgStores) correctly.
stdenvNoCC.mkDerivation {
  name = "airi-pnpm-deps";
  passAsFile = [ "pkgStoresList" ];
  pkgStoresList = (lib.concatStringsSep "\n" (lib.attrValues pkgStores)) + "\n";
  buildPhase = ''
    while IFS= read -r store; do
      [ -z "$store" ] && continue
      cp -rn --no-preserve=mode "$store/." "$out/"
    done < "$pkgStoresListPath"
    # NOTICE: CAFS files with -exec suffix denote executable binaries (e.g. turbo, esbuild).
    # Set their permissions to 555 (r-xr-xr-x) so pnpm can execute them during install.
    find "$out" -type f -name "*-exec" -exec chmod 555 {} +
  '';
  dontConfigure = true;
  dontUnpack = true;
  dontInstall = true;
  dontFixup = true;
}
