#!/usr/bin/env bash
# PreToolUse guard: block the AI from reading/editing .env files (and Bash/Grep
# commands that target them). .env.example/.sample/.template/.dist are allowed
# as references. Outputs a PreToolUse "deny" decision when a .env file is touched.
set -euo pipefail

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // ""')

case "$tool" in
  Read|Edit|Write|NotebookEdit)
    target=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')
    ;;
  Bash)
    target=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')
    ;;
  Grep)
    target=$(printf '%s' "$input" | jq -r '[.tool_input.path, .tool_input.glob] | map(select(. != null)) | join(" ")')
    ;;
  *)
    target=""
    ;;
esac

# Strip allowed reference variants first so they don't trip the detector.
scrubbed=$(printf '%s' "$target" | sed -E 's/\.env\.(example|sample|template|dist)//g')

# Match a `.env` filename token (.env, .env.local, .env.production, …) but not
# substrings like ".environment".
if printf '%s' "$scrubbed" | grep -Eq '\.env(\.[A-Za-z0-9_-]+)?([^A-Za-z0-9_.-]|$)'; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Akses file .env diblokir oleh hook keamanan project. Gunakan .env.example untuk referensi, atau minta user yang menjalankannya."}}'
fi

exit 0
