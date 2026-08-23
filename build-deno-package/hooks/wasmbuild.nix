{
  makeSetupHook,
  lib,
  binaryen,
}:
makeSetupHook {
  name = "deno-wasmbuild-hook";
  substitutions = {
    wasmOpt = lib.getExe' binaryen "wasm-opt";
    # In a dev shell there is no vendor dir to detect the binaryen tag from;
    # update when wasmbuild bumps it (lib/wasmopt.ts).
    defaultTags = "version_121";
  };
} ./deno-wasmbuild-hook.sh
