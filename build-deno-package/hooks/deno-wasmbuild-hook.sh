# shellcheck shell=bash

denoWasmbuildSeed() {
  local cacheRoot="$1" tag binDir
  shift
  for tag in "$@"; do
    binDir="$cacheRoot/wasmbuild/$tag/binaryen-$tag/bin"
    mkdir -p "$binDir"
    ln -sfT "@wasmOpt@" "$binDir/wasm-opt"
  done
}

denoWasmbuildHook() {
  echo "Executing denoWasmbuildHook"

  local wasmoptFiles tags
  local -r searchDir="${vendorDir:-node_modules}"
  wasmoptFiles=$(
    {
      find "$searchDir" -path '*wasmbuild*' -name 'wasmopt.ts'
      find -L "$searchDir" -maxdepth 4 -path '*wasmbuild*' -name 'wasmopt.ts'
    } 2>/dev/null | sort -u
  )

  if [ -z "$wasmoptFiles" ]; then
    echo "wasmbuild not found in $searchDir, skipping wasm-opt seeding"
    return
  fi

  # shellcheck disable=SC2086
  tags=$(grep -hoE '"version_[0-9]+"' $wasmoptFiles | tr -d '"' | sort -u)

  if [ -z "$tags" ]; then
    echo
    echo "ERROR: could not extract the binaryen tag from wasmbuild's wasmopt.ts"
    echo "The wasmbuild internals this hook relies on have probably changed."
    echo
    exit 1
  fi

  if [ -z "${XDG_CACHE_HOME-}" ]; then
    export XDG_CACHE_HOME="${NIX_BUILD_TOP:-$PWD}/.wasmbuild-cache"
  fi

  # shellcheck disable=SC2086
  denoWasmbuildSeed "$XDG_CACHE_HOME" $tags
  echo "Seeded wasm-opt for wasmbuild: $(echo $tags | tr '\n' ' ')"

  echo "Finished denoWasmbuildHook"
}

postConfigureHooks+=(denoWasmbuildHook)

shellHook="${shellHook-}"'
for _dwTag in @defaultTags@; do
  _dwDir="${XDG_CACHE_HOME:-$HOME/.cache}/wasmbuild/$_dwTag/binaryen-$_dwTag/bin"
  { mkdir -p "$_dwDir" && ln -sfT "@wasmOpt@" "$_dwDir/wasm-opt"; } || true
done
unset _dwTag _dwDir
'
