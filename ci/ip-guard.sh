#!/usr/bin/env bash
# IP boundary guard: fail if forbidden (domain-specific / proprietary) terms
# appear in the public tree. Run in CI on every push/PR, and pre-push locally.
#
# Profiles are private and contain domain IP. Core (this repo) must stay clean.
# See note-vault/kit/11-ip-boundary.md for the full rule.

set -euo pipefail

# Forbidden term regex (case-insensitive via rg -i).
# Add new patterns here when profile work surfaces more company-specific terms.
FORBIDDEN='vizio|thloki|buddytv|buddy[- ]tv|tvdev|theseus|\bloki\b|lokils|oobe|mtk5[0-9]{3}|nvt72[0-9]{3}'

# Search scope: only files WE author. Upstream-inherited files (AGENTS.md,
# CONTRIBUTING.md, README.md, LICENSE) are out of scope; if VIZIO IP ever
# lands in those, the profile/overlay process has already failed elsewhere.
SCOPE=(packages ci scripts CLAUDE.md)

MATCHES=$(rg -i --hidden \
  --glob '!node_modules' \
  --glob '!dist' \
  --glob '!dist-chrome' \
  --glob '!dist-firefox' \
  --glob '!.git' \
  --glob '!ci/ip-guard.sh' \
  --glob '!.github/workflows/ip-guard.yml' \
  "$FORBIDDEN" \
  "${SCOPE[@]}" 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "ip-guard: FAIL — forbidden terms found:"
  echo ""
  echo "$MATCHES"
  echo ""
  echo "These terms must not appear in the public tree. See note-vault/kit/11-ip-boundary.md."
  exit 1
fi

echo "ip-guard: clean"
