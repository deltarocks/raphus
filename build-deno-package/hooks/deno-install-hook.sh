# shellcheck shell=bash

denoInstallHook() {
  echo "Executing denoInstallHook"

  runHook preInstall

  if [ -n "${binaryEntrypointPath-}" ]; then
    mkdir -p "$out/bin"
    cp "$NIX_BUILD_TOP/deno-compile/"* "$out/bin"
  else
    echo
    echo "ERROR: nothing to do in installPhase"
    echo "Specify either 'binaryEntrypointPath' or override 'installPhase'"
    echo

    exit 1
  fi

  runHook postInstall

  echo "Finished denoInstallHook"
}

if [ -z "${dontDenoInstall-}" ] && [ -z "${installPhase-}" ]; then
  installPhase=denoInstallHook
fi
