{
  stdenvNoCC,
  fetchurl,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "pnpm";
  version = "12.11.1";
  src = fetchurl {
    url = "https://registry.npmjs.org/@pnpm/exe.linux-x64-musl/-/exe.linux-x64-musl-${finalAttrs.version}.tgz";
    hash = "sha256-x1Y1jBvAEfOJHUjY82TWOS/GjrDd/ooAOKJArcrVPyU=";
  };
  installPhase = ''
    runHook preInstall
    install -Dm755 pnpm $out/bin/pnpm
    runHook postInstall
  '';
  meta = {
    mainProgram = "pnpm";
    platforms = [ "x86_64-linux" ];
  };
})
