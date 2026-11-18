{
  pkgs,
  importPnpmLock,
  iplConfigHook,
  dodo,
}:
pkgs.lib.makeScope pkgs.newScope (self: {
  inherit importPnpmLock iplConfigHook;

  inherit (dodo) deno denort;
  pnpm = pkgs.pnpm_12;

  denoHooks = self.callPackage ./build-deno-package/hooks { };
  wasmbuildHook = self.callPackage ./build-deno-package/hooks/wasmbuild.nix { };
  buildDenoPackage = self.callPackage ./build-deno-package { };

  raphus = self.callPackage ./package.nix { };
})
