#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  hack/extract-openclaw-ui-todos.sh <artifact-dir> [--out <todo-file>]

Reads <artifact-dir>/REPORT.md and generates a route-by-route TODO list
focused on remaining UI issues.
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

artifact_dir="$1"
shift || true

out_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      if [[ $# -lt 2 ]]; then
        echo "error: --out requires a file path" >&2
        exit 1
      fi
      out_file="$2"
      shift 2
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

report_file="${artifact_dir}/REPORT.md"
if [[ ! -f "${report_file}" ]]; then
  echo "error: REPORT.md not found: ${report_file}" >&2
  exit 1
fi

tmp_out="$(mktemp)"

awk '
function flush_section() {
  if (section != "" && severity != "") {
    print "### " section >> tmp
    print "" >> tmp
    print "- Severity: " severity >> tmp
    if (problem != "") print "- Problem: " problem >> tmp
    if (english != "") print "- English leftovers: " english >> tmp
    if (layout != "") print "- Layout/Button issues: " layout >> tmp
    print "" >> tmp
  }
  section = ""
  severity = ""
  problem = ""
  english = ""
  layout = ""
}
BEGIN {
  section=""
  severity=""
  problem=""
  english=""
  layout=""
  in_findings=0
}
/^## 2\. Findings by Screen/ { in_findings=1; next }
/^## 3\./ { if (in_findings) { flush_section(); in_findings=0 } }
{
  if (!in_findings) next
  if ($0 ~ /^### /) {
    flush_section()
    section = substr($0, 5)
    next
  }
  if ($0 ~ /^- 심각도:/) {
    severity = $0
    sub(/^- 심각도:[[:space:]]*/, "", severity)
    gsub(/`/, "", severity)
    next
  }
  if ($0 ~ /^- 문제점:/) {
    problem = $0
    sub(/^- 문제점:[[:space:]]*/, "", problem)
    next
  }
  if ($0 ~ /^- 남은 영어 문구:/) {
    english = $0
    sub(/^- 남은 영어 문구:[[:space:]]*/, "", english)
    next
  }
  if ($0 ~ /^- 버튼\/레이아웃 문제:/) {
    layout = $0
    sub(/^- 버튼\/레이아웃 문제:[[:space:]]*/, "", layout)
    next
  }
}
END {
  flush_section()
}
' tmp="${tmp_out}" "${report_file}"

high_count="$(grep -Eic '^- Severity: High$' "${tmp_out}" || true)"
medium_count="$(grep -Eic '^- Severity: Medium$' "${tmp_out}" || true)"
critical_count="$(grep -Eic '^- Severity: Critical$' "${tmp_out}" || true)"

header="$(cat <<EOF
# OpenClaw UI TODO Extract

- Artifact path: \`${artifact_dir}\`
- Source report: \`${report_file}\`
- Severity counts: Critical=${critical_count}, High=${high_count}, Medium=${medium_count}

## Priority Order

1. Fix all \`High\` sections first (i18n + decision screens).
2. Then resolve \`Medium\` sections (density/copy polish).
3. Re-run OpenClaw batch and regenerate this TODO file.

## Route TODOs

EOF
)"

if [[ -n "${out_file}" ]]; then
  {
    printf "%s\n" "${header}"
    cat "${tmp_out}"
  } > "${out_file}"
  echo "wrote todo extract: ${out_file}"
else
  printf "%s\n" "${header}"
  cat "${tmp_out}"
fi

rm -f "${tmp_out}"
