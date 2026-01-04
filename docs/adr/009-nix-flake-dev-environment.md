# ADR 009: Nix Flake for Development Environment

## Status

Accepted

## Context

Etude development requires several tools:

- Bun (JavaScript runtime)
- Node.js (for some tooling compatibility)
- TypeScript
- Lefthook (git hooks)
- Playwright (browser testing)

New developers need to install these tools with correct versions. The question: how to ensure consistent development environments?

### Alternatives Considered

**1. Docker / Docker Compose**

Containerized development environment.

Problems:
- Adds latency to every command (container startup)
- File watching across container boundary is problematic
- IDE integration more complex (need remote development setup)
- Heavy resource usage for simple dev tasks
- Overkill when not deploying containers

**2. Manual Installation + Version Documentation**

Document required tools in README; developers install manually.

Problems:
- Version drift between developers
- "Works on my machine" issues
- New developer onboarding friction
- No enforcement of tool versions

**3. asdf / mise**

Version manager supporting multiple tools.

Problems:
- Another tool to install first
- Plugin ecosystem varies in quality
- Some tools (like Playwright dependencies) not well supported
- Less declarative than Nix

**4. Volta (Node version manager)**

JavaScript-focused version management.

Problems:
- Only manages Node/npm/yarn versions
- Doesn't help with non-JS tools
- Would need additional solution for other dependencies

## Decision

Use Nix flake with a development shell:

```nix
# flake.nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.bun
            pkgs.nodejs_22
            pkgs.typescript
            pkgs.lefthook
            pkgs.playwright-driver.browsers
          ];

          shellHook = ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
          '';
        };
      });
}
```

Developers enter the environment with:

```bash
nix develop
# or with direnv: automatic on cd
```

## Consequences

### Positive

- **Reproducible**: Exact same tool versions for all developers
- **Declarative**: Environment defined in code, version controlled
- **No containers**: Native performance, normal file access
- **Comprehensive**: Can include any dependency (not just Node tools)
- **direnv integration**: Automatic environment activation on directory entry
- **NixOS alignment**: Primary developer uses NixOS; natural fit

### Negative

- **Nix learning curve**: Nix language and concepts are unfamiliar to most developers
- **Installation barrier**: Nix must be installed first (though single command)
- **macOS friction**: Some packages require extra configuration on macOS
- **Cache misses**: First build downloads/compiles dependencies (can be slow)
- **Debugging complexity**: Nix errors can be cryptic

### Neutral

- Non-Nix developers can still install tools manually if preferred
- CI can use Nix or install tools directly
- flake.lock pins exact versions; updates are explicit via `nix flake update`
