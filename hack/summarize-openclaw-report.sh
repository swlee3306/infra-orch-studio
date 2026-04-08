#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  hack/summarize-openclaw-report.sh <artifact-dir> [--out <summary-file>]

Example:
  hack/summarize-openclaw-report.sh \
    /home/sulee/infra-orch-studio-E2E-snapshot/2026-04-07T06-28-58-941Z__main-7a0d662__ui-46e2862__i18n-ux-final \
    --out /tmp/openclaw-summary.md
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
screenshot_list_file="${artifact_dir}/screenshot-files.txt"

if [[ ! -f "${report_file}" ]]; then
  echo "error: REPORT.md not found: ${report_file}" >&2
  exit 1
fi

extract_first_match() {
  local pattern="$1"
  local value
  value="$(grep -Eim1 "${pattern}" "${report_file}" || true)"
  if [[ -n "${value}" ]]; then
    printf "%s" "${value}"
  else
    printf "n/a"
  fi
}

base_commit_line="$(extract_first_match '기준 main|commit SHA|origin/main|tip')"
ui_commit_line="$(extract_first_match '반영 UI 커밋|ui 커밋|web 반영 커밋')"
quality_line="$(extract_first_match '현재 품질 수준|현재 완성도|총평|출시 가능 여부')"

improved_count="$(grep -Eic '결과:[[:space:]]*`?(개선됨|해결됨|노이즈 없음|Pass)' "${report_file}" || true)"
unchanged_count="$(grep -Eic '결과:[[:space:]]*`?(그대로|미해결|Fail)' "${report_file}" || true)"
high_count="$(grep -Eic '심각도:[[:space:]]*`?High' "${report_file}" || true)"
medium_count="$(grep -Eic '심각도:[[:space:]]*`?Medium' "${report_file}" || true)"
critical_count="$(grep -Eic '심각도:[[:space:]]*`?Critical' "${report_file}" || true)"

blocker_hits="$(grep -Eic 'blocker|핵심 문제|남은 문제|미해결' "${report_file}" || true)"
english_leftover_hits="$(grep -Eic '남은 영어 문구|mixed-language' "${report_file}" || true)"

screenshot_count="0"
if [[ -f "${screenshot_list_file}" ]]; then
  screenshot_count="$(grep -Eic '\.(png|jpg|jpeg|webp)$' "${screenshot_list_file}" || true)"
fi

summary_text="$(cat <<EOF
# OpenClaw Artifact Summary

- Artifact path: \`${artifact_dir}\`
- Report file: \`${report_file}\`
- Screenshot list: \`${screenshot_list_file}\`

## Headline

- ${quality_line}
- ${base_commit_line}
- ${ui_commit_line}

## Metrics

- Improved/Pass-like findings: ${improved_count}
- Unchanged/Fail-like findings: ${unchanged_count}
- Severity counts: Critical=${critical_count}, High=${high_count}, Medium=${medium_count}
- Blocker-like keyword hits: ${blocker_hits}
- Mixed-language keyword hits: ${english_leftover_hits}
- Screenshot count: ${screenshot_count}

## Quick Triage

- If \`Unchanged/Fail-like\` > 0 or \`Blocker-like\` is high, run targeted UI fixes first.
- If \`Mixed-language\` > 0, prioritize i18n polish on decision screens.
- Use REPORT.md screen sections as source of truth for exact routes and evidence.
EOF
)"

if [[ -n "${out_file}" ]]; then
  printf "%s\n" "${summary_text}" > "${out_file}"
  echo "wrote summary: ${out_file}"
else
  printf "%s\n" "${summary_text}"
fi
