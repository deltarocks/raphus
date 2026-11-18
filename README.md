# raphus

Nix build helpers for Deno projects that manage dependencies with pnpm and run
on [dodo](https://github.com/deltarocks/dodo).

- `buildDenoPackage`: installs `node_modules` from `pnpm-lock.yaml` via
  [importPnpmLock](https://github.com/Scrumplex/importPnpmLock.nix) (no
  dependency hash), then runs `deno task` or `deno compile`
- `deno`, `denort`: dodo packages
- `pnpm`: nixpkgs `pnpm_12`
- `wasmbuildHook`: seeds `wasm-opt` for `@deno/wasmbuild`
- `raphus`: the `@deltarocks/raphus` CLI

`deno.lock` dependencies are not supported.

## CLI

`@deltarocks/raphus` transpiles a package written for Deno to JS + `.d.ts` in
`dist/` before `pnpm publish`:

```json
{
	"scripts": {
		"prepack": "raphus"
	},
	"publishConfig": {
		"directory": "dist",
		"linkDirectory": false
	},
	"devDependencies": {
		"@deltarocks/raphus": "^0.1.0"
	}
}
```

Files reachable from `exports`, `bin` and `files` are copied or transpiled;
`catalog:` and `workspace:` dependency specs are resolved. It needs `deno` on
`PATH`, and its `@std/*` dependencies come from JSR, so consumers need
`@jsr:registry=https://npm.jsr.io/` in `.npmrc`.

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

`NODE_ENV` defaults to `production` for the build and is embedded into compiled
binaries as a default (`NODE_ENV = null` disables it). `DENORT_BIN` points at
`denort` (`denortPackage = null` drops it), so custom `buildPhase`s can run
`deno compile` directly. The lock file defaults to `src + "/pnpm-lock.yaml"`;
set `pnpmLockFile` when `src` is a derivation or the lock lives elsewhere.

## Releases

Everything in this repository shares one version, sealed with
[bureaucrate](https://github.com/CertainLach/bureaucrate) in global mode.
