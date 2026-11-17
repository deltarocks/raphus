{
  lib,
  buildDenoPackage,
  deno,
  pnpm,
  makeWrapper,
}:
buildDenoPackage (finalAttrs: {
  pname = "pnpm-prepare";
  inherit (lib.importJSON ./package.json) version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../pnpm-workspace.yaml
      ../pnpm-lock.yaml
      ../deno.json
      ./package.json
      ./mod.ts
    ];
  };

  denoWorkspacePath = "pnpm-prepare";
  binaryEntrypointPath = "mod.ts";
  denoCompileFlags = [
    "--no-check"
    "--allow-read"
    "--allow-write=dist"
    "--allow-env"
    "--allow-run=deno"
  ];

  nativeBuildInputs = [ makeWrapper ];

  postFixup = ''
    wrapProgram $out/bin/pnpm-prepare --prefix PATH : ${lib.makeBinPath [ deno ]}
  '';

  meta = {
    mainProgram = "pnpm-prepare";
    inherit (pnpm.meta) platforms;
  };
})
