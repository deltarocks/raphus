# NOTE: much of this structure is inspired from https://github.com/NixOS/nixpkgs/tree/fff29a3e5f7991512e790617d1a693df5f3550f6/pkgs/build-support/node
{
  lib,
  stdenvNoCC,
  rustPlatform,
  importPnpmLock,
  iplConfigHook,
  deno,
  denort,
  pnpm,
  denoHooks,
  wasmbuildHook,
}:
lib.extendMkDerivation {
  constructDrv = stdenvNoCC.mkDerivation;

  excludeDrvArgNames = [
    "pnpmLockFile"
    "denoPackage"
    "denortPackage"
    "pnpmPackage"
    "NODE_ENV"
    "denoBuildHook"
    "denoInstallHook"
    "denoTaskPrefix"
    "denoTaskSuffix"
    "wasmbuildCrates"
    "rustToolchain"
  ];

  extendDrvArgs =
    finalAttrs:
    {
      pnpmLockFile ? finalAttrs.src + "/pnpm-lock.yaml",
      mitmCache ? importPnpmLock {
        inherit (finalAttrs) pname version;
        lockFile = pnpmLockFile;
        useBuiltinFetchurl = true;
      },
      # The package used for every deno command in the build
      denoPackage ? deno,
      denortPackage ? denort,
      pnpmPackage ? pnpm,
      NODE_ENV ? "production",
      # The script to run to build the project.
      # You still need to specify in the installPhase, what artifacts to copy to `$out`.
      denoTaskScript ? "build",
      # If not null, create a binary using the specified path as the entrypoint,
      # copy it to `$out/bin` in installPhase and fix it in fixupPhase.
      binaryEntrypointPath ? null,
      # Flags to pass to all deno commands.
      denoFlags ? [ ],
      # Flags to pass to `deno task [denoTaskFlags] ${denoTaskScript}`.
      denoTaskFlags ? [ ],
      # Flags to pass to `deno compile [denoTaskFlags] ${binaryEntrypointPath}`.
      denoCompileFlags ? [ "--no-check" ],
      # Flags to pass to `deno task [denoTaskFlags] ${denoTaskScript} [extraTaskFlags]`.
      extraTaskFlags ? [ ],
      # Flags to pass to `deno compile [denoTaskFlags] ${binaryEntrypointPath} [extraCompileFlags]`.
      extraCompileFlags ? [ ],
      nativeBuildInputs ? [ ],
      dontFixup ? true,
      dontPatchELF ? true,
      dontStrip ? true,
      # Custom denoBuildHook
      denoBuildHook ? null,
      # Custom denoInstallHook
      denoInstallHook ? null,
      # Path to deno workspace, where the denoTaskScript should be run, also used when compiling
      denoWorkspacePath ? null,
      # Unquoted string injected before `deno task`
      denoTaskPrefix ? "",
      # Unquoted string injected after `deno task` and all its flags
      denoTaskSuffix ? "",
      # Crates built by @deno/wasmbuild during the build, as a list of
      # { lockFile, cargoRoot }. Vendors cargo dependencies for offline builds and
      # seeds wasm-opt so wasmbuild does not try to download binaryen.
      wasmbuildCrates ? [ ],
      # Rust toolchain with the wasm32-unknown-unknown target, required when
      # wasmbuildCrates is non-empty. Plain nixpkgs rustc lacks the wasm32 std.
      rustToolchain ? null,
      ...
    }@args:
    let
      wasmbuildCargoConfigs = lib.concatMapStrings (
        crate:
        let
          vendor = rustPlatform.importCargoLock { inherit (crate) lockFile; };
        in
        ''
          mkdir -p ${lib.escapeShellArg crate.cargoRoot}/.cargo
          cat >> ${lib.escapeShellArg crate.cargoRoot}/.cargo/config.toml <<'CARGO_VENDOR_EOF'
          [source.crates-io]
          replace-with = "vendored-sources"
          [source.vendored-sources]
          directory = "${vendor}"
          CARGO_VENDOR_EOF
        ''
      ) wasmbuildCrates;

      denoHooks' = denoHooks {
        inherit denoTaskSuffix denoTaskPrefix;
      };
    in
    {
      inherit
        mitmCache
        dontPatchELF
        dontStrip
        binaryEntrypointPath
        denoTaskScript
        denoWorkspacePath
        denoFlags
        denoTaskFlags
        denoCompileFlags
        extraTaskFlags
        extraCompileFlags
        ;

      nativeBuildInputs = [
        denoPackage
        pnpmPackage
        iplConfigHook
        # Prefer passed hooks
        (if denoBuildHook != null then denoBuildHook else denoHooks'.denoBuildHook)
        (if denoInstallHook != null then denoInstallHook else denoHooks'.denoInstallHook)
      ]
      ++ lib.optional (wasmbuildCrates != [ ]) wasmbuildHook
      ++ lib.optional (rustToolchain != null) rustToolchain
      ++ nativeBuildInputs;

      DENO_NO_UPDATE_CHECK = "1";

      dontFixup = if binaryEntrypointPath != null then false else dontFixup;

      meta = (args.meta or { }) // {
        platforms = args.meta.platforms or denoPackage.meta.platforms;
      };
    }
    // lib.optionalAttrs (NODE_ENV != null) {
      inherit NODE_ENV;
    }
    // lib.optionalAttrs (denortPackage != null) {
      DENORT_BIN = lib.getExe' denortPackage "denort";
    }
    // lib.optionalAttrs (wasmbuildCrates != [ ]) {
      postConfigure = (args.postConfigure or "") + wasmbuildCargoConfigs;
    };
}
