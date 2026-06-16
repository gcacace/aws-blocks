#!/usr/bin/env bash
# Parses a unified diff from stdin and outputs a line-number map for the RIGHT side.
# Each output line: <file>:<line_number>: <content>
# Only shows added (+) and context ( ) lines — these are the lines visible in
# GitHub's "Files changed" view and valid targets for review comments.
#
# Usage:
#   gh pr diff <number> --repo owner/repo | ./diff-line-map.sh
#   gh pr diff <number> --repo owner/repo | ./diff-line-map.sh --file path/to/file.ts
#   cat patch.txt | ./diff-line-map.sh
set -euo pipefail

FILE_FILTER=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --file) FILE_FILTER="$2"; shift 2 ;;
    *) shift ;;
  esac
done

awk -v filter="$FILE_FILTER" '
/^diff --git / {
  n = split($0, parts, " ")
  current_file = substr(parts[n], 3)  # strip "b/" prefix
  in_header = 1
  next
}
in_header && /^@@/ {
  in_header = 0
}
in_header { next }
/^@@/ {
  for (i = 1; i <= NF; i++) {
    if (substr($i, 1, 1) == "+") {
      split(substr($i, 2), parts, ",")
      line = parts[1] + 0
      break
    }
  }
  next
}
/^\+\+\+/ || /^---/ { next }
/^\+/ {
  if (filter == "" || current_file == filter) {
    printf "%s:%d: %s\n", current_file, line, substr($0, 2)
  }
  line++
  next
}
/^-/ { next }
/^ / {
  if (filter == "" || current_file == filter) {
    printf "%s:%d: %s\n", current_file, line, substr($0, 2)
  }
  line++
}
'
