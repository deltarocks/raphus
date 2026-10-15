{ deno }:
deno.overrideAttrs (
  final: prev: {
    pname = "denort";

    outputs = [ "out" ];

    cargoBuildFlags = [ "--package=denort" ];
    cargoBuildNoDefaultFeatures = false;
    cargoBuildFeatures = [ ];

    postInstall = "";
    postFixup = builtins.replaceStrings [ "$out/bin/deno" ] [ "$out/bin/denort" ] (
      prev.postFixup or ""
    );
    doCheck = false;
    doInstallCheck = false;

    meta = prev.meta // {
      description = "Slim version of the deno runtime, usually bundled with deno projects into standalone binaries";
      mainProgram = "denort";
    };
  }
)
