{
  lib,
  stdenvNoCC,
  patchelf,
  vulkan-loader,
  dodo,
  mainProgram,
}:
stdenvNoCC.mkDerivation {
  pname = "dodo-${mainProgram}";
  inherit (dodo) version;

  dontUnpack = true;
  dontStrip = true;
  dontPatchELF = true;

  nativeBuildInputs = [ patchelf ];

  installPhase = ''
    runHook preInstall
    install -Dm755 ${dodo}/bin/${mainProgram} $out/bin/${mainProgram}
    runHook postInstall
  '';

  postFixup = lib.optionalString stdenvNoCC.hostPlatform.isLinux ''
    patchelf --add-rpath ${lib.makeLibraryPath [ vulkan-loader ]} $out/bin/${mainProgram}
  '';

  meta = {
    inherit mainProgram;
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
