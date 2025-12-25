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
        system: with (pkgsForSystem system); {
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
        }
      );
    };
}
