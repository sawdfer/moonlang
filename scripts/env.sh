# Moonlang local toolchain.
# Activate with: source scripts/env.sh
# Everything (Node, npm/pnpm caches, global installs) lives in .tooling/,
# so nothing is installed on the operating system.

if [ -n "${BASH_SOURCE[0]:-}" ]; then
  _moonlang_script="${BASH_SOURCE[0]}"
else
  _moonlang_script="${(%):-%N}"
fi
MOONLANG_ROOT="$(cd "$(dirname "$_moonlang_script")/.." && pwd)"
unset _moonlang_script
export MOONLANG_ROOT

_tooling="$MOONLANG_ROOT/.tooling"

if [ ! -x "$_tooling/node/bin/node" ]; then
  echo "Node not found in $_tooling/node. See scripts/README.md." >&2
  return 1 2>/dev/null || exit 1
fi

export PATH="$_tooling/bin:$_tooling/node/bin:$PATH"
export COREPACK_HOME="$_tooling/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export npm_config_cache="$_tooling/npm-cache"
export npm_config_prefix="$_tooling/npm-global"
export PNPM_HOME="$_tooling/pnpm-home"
export npm_config_store_dir="$_tooling/pnpm-store"
export XDG_CACHE_HOME="$_tooling/cache"
export NEXT_TELEMETRY_DISABLED=1
export PATH="$PNPM_HOME:$npm_config_prefix/bin:$PATH"

unset _tooling
