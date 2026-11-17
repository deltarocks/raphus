{
  description = "Build Deno projects with pnpm dependencies and the dodo runtime";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    importPnpmLock = {
      url = "git+file:///home/lach/Projects/contrib/importPnpmLock.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    dodo.url = "github:deltarocks/dodo/deltarocks";
  };

  outputs =
    {
      self,
      nixpkgs,
      importPnpmLock,
      dodo,
    }:
    let
      inherit (nixpkgs) lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      scope =
        pkgs:
        import ./. {
          inherit pkgs;
          inherit (import importPnpmLock { inherit pkgs; }) importPnpmLock iplConfigHook;
          dodo = dodo.packages.${pkgs.stdenv.hostPlatform.system};
        };
      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      overlays.default = final: _: { raphus = scope final; };

      legacyPackages = forAllSystems scope;

      packages = forAllSystems (
        pkgs:
        lib.filterAttrs (_: lib.meta.availableOn pkgs.stdenv.hostPlatform) {
          inherit (self.legacyPackages.${pkgs.stdenv.hostPlatform.system})
            deno
            denort
            pnpm
            wasmbuildHook
            ;
        }
      );

      checks = self.packages;

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = lib.filter (lib.meta.availableOn pkgs.stdenv.hostPlatform) (
            with self.legacyPackages.${pkgs.stdenv.hostPlatform.system};
            [
              deno
              pnpm
            ]
          );
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt-tree);
    };
}
