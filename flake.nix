{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsForSystem =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
    in
    {
      formatter = forAllSystems (system: (pkgsForSystem system).nixfmt-tree);

      packages = forAllSystems (
        system:
        { default = self.packages.${system}.airi; } // self.overlays.airi (pkgsForSystem system) null
      );

      overlays = {
        default = self.overlays.airi;
        airi = final: _: {
          airi = final.callPackage ./nix/package.nix { };
        };
      };

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsForSystem system;
        in
        with pkgs;
        {
          default = mkShell {
            inputsFrom = [ self.packages.${system}.airi ];
            packages = [
              nixd
              nixfmt-rfc-style
              nixfmt-tree
              pnpm
              python314
            ];
          };

          # FHS environment for running Electron on NixOS
          # Usage: nix develop .#fhs
          fhs = (
            buildFHSEnv {
              name = "airi-electron-fhs";
              targetPkgs =
                p: with p; [
                  nodejs_24
                  pnpm
                  # Electron system library dependencies
                  # Note: some packages need explicit output refs because the
                  # default attribute doesn't point to the output with .so files
                  glib.out # default 'glib' points to 'bin' output
                  nss
                  nspr
                  dbus.lib # libdbus-1.so.3 is in 'lib' output, not 'out'
                  atk
                  at-spi2-atk
                  at-spi2-core
                  cups.lib # libcups.so.2 is in 'lib' output, not 'out'
                  libdrm
                  xorg.libX11
                  xorg.libXcomposite
                  xorg.libXdamage
                  xorg.libXext
                  xorg.libXfixes
                  xorg.libXrandr
                  xorg.libxcb
                  xorg.libXcursor
                  xorg.libXi
                  xorg.libXtst
                  expat
                  libxkbcommon
                  libgbm # libgbm.so.1 is now a separate package from mesa
                  alsa-lib
                  pango.out # default 'pango' points to 'bin' output
                  cairo
                  libGL
                  gtk3
                  systemd
                ];
              runScript = "bash";
            }
          ).env;
        }
      );
    };
}
