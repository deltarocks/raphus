{
  pkgs,
  importPnpmLock,
  iplConfigHook,
  dodo,
}:
pkgs.lib.makeScope pkgs.newScope (self: {
  inherit importPnpmLock iplConfigHook;

  deno = self.callPackage ./dodo {
    dodo = dodo.deno;
    mainProgram = "deno";
  };
  denort = self.callPackage ./dodo {
    dodo = dodo.denort;
    mainProgram = "denort";
  };
  pnpm = self.callPackage ./pnpm { };

  denoHooks = self.callPackage ./build-deno-package/hooks { };
  wasmbuildHook = self.callPackage ./build-deno-package/hooks/wasmbuild.nix { };
  buildDenoPackage = self.callPackage ./build-deno-package { };

  pnpm-prepare = self.callPackage ./pnpm-prepare/package.nix { };
})
