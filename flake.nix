{
  inputs = {
    vine.url = "github:VineLang/vine/enricozb/playground";
    nixpkgs.follows = "vine/nixpkgs";
    flake-utils.follows = "vine/flake-utils";
    rust-overlay.follows = "vine/rust-overlay";
    crane.follows = "vine/crane";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      rust-overlay,
      crane,
      vine,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ rust-overlay.overlays.default ];
        };
        rustToolchain = (pkgs.rust-bin.fromRustupToolchainFile ./rust/rust-toolchain.toml).override {
          targets = [ "wasm32-unknown-unknown" ];
        };
        craneLib = (crane.mkLib pkgs).overrideToolchain (_: rustToolchain);
        serve = pkgs.writeShellScriptBin "serve" ''
          test -f flake.nix || { echo "serve must run at the repository root"; exit 1; }
          export VINE_ROOT_DIR=${"$"}{VINE_ROOT_DIR:-"${vine}/root/"}
          ${pkgs.cargo-watch}/bin/cargo-watch \
            --workdir rust/playground/ \
            --shell '${pkgs.wasm-pack}/bin/wasm-pack build --no-opt && cd ../../ts/playground && npx vite serve'
        '';
      in
      {
        apps.serve = {
          type = "app";
          program = "${serve}/bin/serve";
        };

        devShells.default = craneLib.devShell {
          name = "vine-playground";
          packages = [
            pkgs.nodejs_24
            pkgs.pnpm
            pkgs.wasm-pack
          ];
        };

        formatter = vine.formatter.${system};
      }
    );
}
