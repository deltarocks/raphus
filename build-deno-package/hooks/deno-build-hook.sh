# shellcheck shell=bash

denoBuildHook() {
  echo "Executing denoBuildHook"

  runHook preBuild

  # have to make sure that DENO_DIR is an absolute path, so we don't run into issues when using workspaces with subdirectories
  if [ -n "${DENO_DIR-}" ]; then
    export DENO_DIR="$(realpath "$DENO_DIR")"
  fi

  local -a flagsArray=()
  local -a extraArray=()

  if [ -n "${binaryEntrypointPath-}" ]; then
    echo "Creating binary"

    concatTo flagsArray denoCompileFlags denoFlags
    concatTo extraArray extraCompileFlags

    if [ -n "${NODE_ENV-}" ]; then
      printf 'NODE_ENV=%s\n' "$NODE_ENV" >"$NIX_BUILD_TOP/deno-compile.env"
      flagsArray+=("--env-file=$NIX_BUILD_TOP/deno-compile.env")
    fi

    mkdir -p "$NIX_BUILD_TOP/deno-compile"
    deno compile \
      --output "$NIX_BUILD_TOP/deno-compile/${pname:-$name}" \
      "${flagsArray[@]}" \
      "${denoWorkspacePath:+$denoWorkspacePath/}$binaryEntrypointPath" \
      "${extraArray[@]}"

  elif [ -n "${denoTaskScript-}" ]; then
    concatTo flagsArray denoTaskFlags denoFlags
    concatTo extraArray extraTaskFlags

    if ! @denoTaskPrefix@ \
      deno task \
      ${denoWorkspacePath:+--cwd=$denoWorkspacePath} \
      "${flagsArray[@]}" \
      "$denoTaskScript" \
      "${extraArray[@]}" \
      @denoTaskSuffix@; then
      echo
      echo 'ERROR: `deno task` failed'
      echo
      echo "Here are a few things you can try, depending on the error:"
      echo "1. Make sure your task script ($denoTaskScript) exists"
      echo

      exit 1
    fi
  else
    echo
    echo "ERROR: nothing to do in buildPhase"
    echo "Specify either 'binaryEntrypointPath' or 'denoTaskScript' or override 'buildPhase'"
    echo

    exit 1
  fi

  runHook postBuild

  echo "Finished denoBuildHook"
}

if [ -z "${buildPhase-}" ]; then
  buildPhase=denoBuildHook
fi
