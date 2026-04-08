# Release Readiness Snapshot (2026-04-08)

이 문서는 2026-04-08 기준 릴리즈 준비 상태를 빠르게 확인하기 위한 스냅샷이다.

## Verified Now (local)

- `go test ./...` ✅
- `npm --prefix web run build` ✅
- `kustomize build k8s/app/overlays/prod` ✅
- 최근 UI 재검증 blocker: `none`
  - Evidence: `docs/ui-revalidation-log.md`

## Pending (environment / cluster required)

- 배포 대상 클러스터에서 MySQL migration 로그 clean 여부
- API/runner startup 로그의 template runtime validation 성공 여부
- `/healthz` 200 확인
- runner job claim 확인
- `/app/templates/opentofu/environments/basic` 필수 파일 존재 확인
- ingress/controller health 정책 확인(운영 환경 모델 일치 여부)
- rollback 경로 및 이전 이미지 태그 보존 확인

## Recommended Next Action Order

1. prod overlay 기준 이미지 태그/커밋 일치성 확인
2. 클러스터 반영 후 startup/health 체크
3. create -> review -> approve -> apply 스모크 1회
4. 결과를 `docs/release-checklist.md`와 함께 기록
