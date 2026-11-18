{
  lib,
  buildDenoPackage,
  deno,
  pnpm,
  makeWrapper,
}:
buildDenoPackage (finalAttrs: {
  pname = "raphus";
  inherit (lib.importJSON ./package.json) version;

  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./pnpm-workspace.yaml
      ./pnpm-lock.yaml
      ./deno.json
      ./mod.ts
    ];
  };

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
    wrapProgram $out/bin/raphus --prefix PATH : ${lib.makeBinPath [ deno ]}
  '';

  meta = {
    mainProgram = "raphus";
    inherit (pnpm.meta) platforms;
  };
})
