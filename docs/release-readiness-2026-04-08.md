# Release Readiness Snapshot (2026-04-08)

이 문서는 2026-04-08 기준 릴리즈 준비 상태를 빠르게 확인하기 위한 스냅샷이다.

## Verified Now (local)

- `go test ./...` ✅
- `npm --prefix web run build` ✅
- `kustomize build k8s/app/overlays/prod` ✅
- 최근 UI 재검증 blocker: `none`
  - Evidence: `docs/ui-revalidation-log.md`

## Verified Now (cluster: `infra`)

- Namespace and workloads
  - `kubectl -n infra get pods -o wide` 결과 API/runner/web/mysql 모두 `Running`
  - `kubectl -n infra get pvc` 결과 mysql/workdirs PVC 모두 `Bound`
  - `kubectl -n infra get ingress` 결과 ingress rule 정상 노출
- Service and endpoints
  - `kubectl -n infra get svc` 결과 API/Web 서비스 정상
  - `kubectl -n infra get endpoints infra-orch-api infra-orch-web` 결과 endpoint 할당 정상
- Health and startup logs
  - API pod 내부 `/healthz` 응답: `{"status":"ok"}`
  - API 로그: mysql store 연결, admin seed, template root 확인, listen 확인
  - runner 로그: startup 및 polling 시작 확인
- Template assets
  - API/runner 컨테이너 모두 `/app/templates/opentofu/environments/basic` 필수 파일 확인
  - 확인 파일: `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf` (추가 파일 포함)

## Open Risks / Pending

- **이미지 태그 정합성 불일치**
  - 현재 배포 상태:
    - `infra-orch-api`: `.../infra-orch-studio:42cb5db`
    - `infra-orch-runner`: `.../infra-orch-studio:42cb5db`
    - `infra-orch-web`: `.../infra-orch-web:0471383`
  - UI는 최신 반영됐지만 API/runner는 구 태그를 사용 중이므로, 릴리즈 기준 커밋 정합성 확인이 필요
- MySQL migration “clean” 여부는 API 부팅 로그에서 오류는 없지만, 업그레이드 시나리오까지 포함한 별도 검증 로그가 필요
- ingress/controller health 정책(Argo CD health gating 포함) 최종 확인 필요
- rollback 경로 및 이전 이미지 태그 보존 정책 최종 확인 필요

## Recommended Next Action Order

1. API/runner 이미지를 최신 기준 태그로 재배포해 web/API/runner 커밋 정합성 맞추기
2. 재배포 직후 startup log + `/healthz` + template path 재확인
3. create -> review -> approve -> apply 스모크 1회
4. 결과를 `docs/release-checklist.md`와 함께 기록
