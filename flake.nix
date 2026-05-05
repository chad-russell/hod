{
  description = "Hod — a deterministic, content-addressed build system";

  nixConfig = {
    extra-substituters = [
      "https://nix-community.cachix.org"
    ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, rust-overlay, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        rustToolchain = pkgs.rust-bin.stable.latest.default;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            rustToolchain
            rust-analyzer
            cargo-watch

            # Native/build tooling used by dependencies and tests.
            pkg-config
            gcc
            binutils
            git
            curl

            # TypeScript recipe SDK.
            bun
          ];

          env = {
            # Useful for crates that discover libclang through the environment.
            LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
          };

          shellHook = ''
            echo "hod dev shell — $(rustc --version)"
          '';
        };
      });
}
