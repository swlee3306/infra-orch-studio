# infra-orch-studio

템플릿, API, (향후) 채팅 기반 입력을 통해 OpenTofu를 활용하여 **OpenStack 인프라 환경(Environment)** 을 선언형으로 생성·관리하는 환경 단위 오케스트레이션 플랫폼.

## MVP scope
- Environment 생성 요청
- plan 생성
- apply 실행(명시적 요청에서만)
- job 상태/로그/output 조회

Environment 필드(초기):
- `environment_name`
- `tenant_name`
- network 1개
- subnet 1개
- instance 1~2개
- optional security group references

## Architecture
- API 서비스와 runner(OpenTofu 실행)는 분리
- API는 job을 생성/조회만 하고, **tofu 실행은 runner가 수행**
- 도메인 모델은 OpenTofu 문법에 종속되지 않도록 유지
- OpenTofu 레이어는 "고정 템플릿 + 변수 주입" 중심

문서:
- `docs/architecture.md`
- `docs/roadmap.md`

## Local dev (Phase 1)

Requirements: Go 1.23+

```bash
make fmt
make test

# API (sqlite DB default: ./var/infra-orch.db)
make api

# in another shell
make runner
```

Health check:
```bash
curl -s localhost:8080/healthz
```

Create a job:
```bash
curl -s -X POST localhost:8080/jobs \
  -H 'content-type: application/json' \
  -d '{"environment":{"environment_name":"dev","tenant_name":"t1","network":{"name":"net1","cidr":"10.0.0.0/24"},"subnet":{"name":"sub1","cidr":"10.0.0.0/24","enable_dhcp":true},"instances":[{"name":"vm1","image":"ubuntu","flavor":"m1.small","count":1}]}}'
```

Run runner (Phase 3 placeholder):
```bash
STORE_SQLITE_PATH=./var/infra-orch.db RUNNER_POLL_INTERVAL=2s make runner
```
