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
        tree-sitter-vine-wasm = pkgs.stdenv.mkDerivation {
          name = "tree-sitter-vine-wasm";
          src = vine.packages.${system}.tree-sitter-vine;
          nativeBuildInputs = [
            pkgs.emscripten
            pkgs.nodejs_24
            pkgs.tree-sitter
          ];
          buildPhase = ''
            tree-sitter build --wasm
            cp -r . $out
          '';
        };

        setup = pkgs.writeShellScriptBin "setup" ''
          test -f flake.nix || { echo "$(basename $0) must run at the repository root"; exit 1; }

          (
            cd ts/playground
            ${pkgs.pnpm}/bin/pnpm install
            mkdir -p public tree-sitter-vine
            cp node_modules/web-tree-sitter/web-tree-sitter.wasm public
            cp -r $TREE_SITTER_VINE_WASM/{tree-sitter-vine.wasm,queries} tree-sitter-vine
            chmod -R +w tree-sitter-vine
            cp ${vine.packages.${system}.docs}/{theme,typsitter}.css src/
            chmod +w src/{theme,typsitter}.css
          )
          (
            cd rust/playground
            ${pkgs.wasm-pack}/bin/wasm-pack build --no-opt
            rm -rf ../../ts/playground/playground-rs-pkg
            mv pkg ../../ts/playground/playground-rs-pkg
          )
        '';

        serve = pkgs.writeShellScriptBin "serve" ''
          test -f flake.nix || { echo "$(basename $0) must run at the repository root"; exit 1; }

          export VINE_ROOT_DIR=${"$"}{VINE_ROOT_DIR:-"${vine}/root/"}
          ${pkgs.cargo-watch}/bin/cargo-watch \
            --ignore pkg/ \
            --workdir rust/playground/ \
            --shell 'cd ../.. && ${setup}/bin/setup && cd ts/playground && npx vite serve'
        '';
      in
      {
        devShells.default = craneLib.devShell {
          TREE_SITTER_VINE_WASM = "${tree-sitter-vine-wasm}";

          name = "vine-playground";
          packages = [
            setup
            serve
            pkgs.nodejs_24
            pkgs.pnpm
            pkgs.wasm-pack
          ];
        };

        formatter = vine.formatter.${system};
      }
    );
}
