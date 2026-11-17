{
  makeSetupHook,
}:
{
  denoTaskSuffix,
  denoTaskPrefix,
}:
{
  denoBuildHook = makeSetupHook {
    name = "deno-build-hook";
    substitutions = {
      inherit denoTaskSuffix denoTaskPrefix;
    };
  } ./deno-build-hook.sh;

  denoInstallHook = makeSetupHook {
    name = "deno-install-hook";
  } ./deno-install-hook.sh;
}
