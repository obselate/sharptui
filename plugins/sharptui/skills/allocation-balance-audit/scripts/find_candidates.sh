#!/usr/bin/env bash
set -euo pipefail

audit_root="${1:-.}"
scan_root="$audit_root"

if [[ ! -d "$audit_root" ]]
then
  printf 'repository does not exist: %s\n' "$audit_root" >&2
  exit 2
fi

if [[ -d "$audit_root/src" ]]
then
  scan_root="$audit_root/src"
fi

if ! command -v rg >/dev/null 2>&1
then
  printf 'allocation-balance-audit requires rg\n' >&2
  exit 1
fi

scan() {
  local title="$1"
  local pattern="$2"
  printf '\n%s\n' "$title"
  rg -n --hidden \
    --glob '*.gs' --glob '*.cs' \
    --glob '!bin/**' --glob '!obj/**' --glob '!vendor/**' --glob '!.git/**' \
    --glob '!**/Checks/**' --glob '!**/Tests/**' \
    "$pattern" "$scan_root" || true
}

scan 'Retained capacity, caches, pools, and scratch state' '\.Clear\(\)|\.Capacity\b|TrimExcess|EnsureCapacity|ArrayPool|MemoryPool|ObjectPool|private var .*[Cc]ache|private var .*[Pp]ool|private var .*[Ss]cratch|private var .*[Bb]uffer'
scan 'High-frequency path entry points' 'func (Render|Measure|MeasureIntrinsic|Draw|Emit|Present|Handle|Accept|Write|Flush|Refresh|Rebuild|rebuild)\b'
scan 'Repeated collection traversal' 'for .+ in .+|while .+\.Count|while .+ < .+Count|IndexOf|Find|Maximum|Minimum'
scan 'Mutable collection surfaces and manual invalidation' 'public prop .*(List|Dictionary|Queue)|Refresh\(\)|Invalidate\(\)|dirty|Dirty'
