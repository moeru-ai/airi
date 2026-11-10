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
      getPkgs =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
    in
    {
      formatter = forAllSystems (system: (getPkgs system).nixfmt-tree);

      packages = forAllSystems (
        system: { default = self.packages.${system}.airi; } // self.overlays.airi (getPkgs system) null
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
          pkgs = getPkgs system;
          airi = self.packages.${system}.airi;
        in
        with pkgs;
        {
          default = self.devShells.${system}.develop;

          develop = mkShell {
            inputsFrom = [ airi ];
            packages = [
              markdown-oxide
              nixd
              nixfmt
              nixfmt-tree
              airi.pnpm # Use pinned version
              python314
              typescript-language-server
              vscode-langservers-extracted # For vscode-eslint-language-server
            ];
          };

          # FHS environment for running Electron on NixOS
          # Usage: nix develop .#fhs
          fhs =
            (buildFHSEnv {
              name = "airi-electron-fhs";
              targetPkgs =
                p: with p; [
                  nodejs_24
                  airi.pnpm
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
                  libx11
                  libxcomposite
                  libxdamage
                  libxext
                  libxfixes
                  libxrandr
                  libxcb
                  libxcursor
                  libxi
                  libxt
                  libxtst
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
            }).env;
        }
      );
    };
}
