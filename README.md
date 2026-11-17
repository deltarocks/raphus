# raphus

Nix build helpers for Deno projects that manage dependencies with pnpm and run
on [dodo](https://github.com/deltarocks/dodo).

- `buildDenoPackage`: installs `node_modules` from `pnpm-lock.yaml` via
  [importPnpmLock](https://github.com/Scrumplex/importPnpmLock.nix) (no
  dependency hash), then runs `deno task` or `deno compile`
- `deno`, `denort`: dodo builds with vulkan in rpath for WebGPU
- `pnpm`: pinned pnpm binary
- `wasmbuildHook`: seeds `wasm-opt` for `@deno/wasmbuild`
- `pnpm-prepare`: transpiles a package to JS + `.d.ts` before `pnpm publish`

`deno.lock` dependencies are not supported.

## Usage

```nix
{
  inputs.raphus = {
    url = "git+file:///home/lach/Projects/contrib/raphus";
    inputs.nixpkgs.follows = "nixpkgs";
  };
}
```

```nix
inputs'.raphus.legacyPackages.buildDenoPackage (finalAttrs: {
  pname = "my-package";
  version = "0.1.0";
  src = ./.;
  binaryEntrypointPath = "main.ts";
})
```

Without `binaryEntrypointPath`, `deno task build` runs and `installPhase` has to
copy artifacts to `$out`:

```nix
inputs'.raphus.legacyPackages.buildDenoPackage {
  pname = "my-site";
  version = "0.1.0";
  src = ./.;
  installPhase = ''
    cp -r dist $out
  '';
}
```

`DENORT_BIN` points at `denort` (`denortPackage = null` drops it), so custom
`buildPhase`s can run `deno compile` directly. The lock file defaults to
`src + "/pnpm-lock.yaml"`; set `pnpmLockFile` when `src` is a derivation or the
lock lives elsewhere.

## Releases

Everything in this repository shares one version, sealed with
[bureaucrate](https://github.com/CertainLach/bureaucrate) in global mode.
