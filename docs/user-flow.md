# User Flow

> Historical snapshot: 이 문서는 job-led UI에서 environment-led UX로 옮겨 가기 전 사용 흐름을 기록한다. 현재 실제 흐름은 login -> dashboard -> environments/create -> review -> approval -> detail -> audit 에 더 가깝다.

이 문서는 현재 코드 현실을 기준으로 작성한 사용자 및 운영자 흐름이다. 핵심은 환경 생성, plan 검토, apply 승인, 실행 결과 확인이 하나의 연속된 여정으로 보이게 하는 것이다.

## 1. Persona

### 일반 사용자

- 환경 요청을 작성한다.
- plan 결과를 확인한다.
- 실행 상태와 로그를 본다.

### 운영자 / Admin

- plan이 승인 가능한 상태인지 판단한다.
- apply를 실행한다.
- 실패 시 복구와 재시도를 결정한다.

## 2. 기본 흐름

### A. 로그인

1. 사용자는 이메일/비밀번호로 로그인한다.
2. 세션은 httpOnly cookie로 유지된다.
3. 로그인 성공 후 job 목록으로 이동한다.

### B. 환경 생성 요청

1. 사용자는 환경 이름, 테넌트, 네트워크, 서브넷, 인스턴스 정보를 입력한다.
2. 시스템은 입력값을 검증한다.
3. 생성 요청은 job으로 저장된다.
4. job은 queued 상태로 runner를 기다린다.

### C. Plan 실행

1. runner가 queued job을 claim한다.
2. 템플릿과 변수 파일을 생성한다.
3. OpenTofu init을 실행한다.
4. OpenTofu plan을 실행하고 artifact 경로를 남긴다.
5. 사용자는 job 상세에서 상태와 로그를 확인한다.

### D. Apply 승인 및 실행

1. 운영자는 plan이 완료된 job을 확인한다.
2. source job이 plan인지, done인지, plan artifact가 있는지 확인한다.
3. 운영자는 apply를 요청한다.
4. 시스템은 apply job을 생성하고 plan job을 source로 연결한다.
5. runner가 apply를 수행한다.

## 3. 승인 흐름

승인 흐름은 다음 기준을 만족해야 한다.

- source job이 `tofu.plan` 이어야 한다.
- source job 상태가 `done` 이어야 한다.
- plan artifact와 workdir가 존재해야 한다.
- 승인자는 admin이어야 한다.

운영 화면에서는 최소한 다음이 보여야 한다.

- 승인 가능 여부
- 승인 대상 job ID
- source job ID
- plan artifact 여부
- 마지막 오류 메시지

## 4. 예외 흐름

### 잘못된 입력

- 필수 필드가 비어 있으면 생성이 실패한다.
- 인스턴스 수가 범위를 벗어나면 요청이 거절된다.

### plan 실패

- template path 또는 변수 생성이 실패할 수 있다.
- tofu init/plan 실패 시 job은 failed가 된다.
- 사용자는 로그와 error를 확인해야 한다.

### apply 실패

- source job이 plan이 아니거나 done이 아니면 apply가 거절된다.
- plan artifact가 없으면 apply가 중단된다.
- apply 중 실행 실패 시 failed 상태와 stderr 요약이 남아야 한다.

### 운영 복구

- 실패한 job은 원인 확인 후 재시도하거나 새 job을 생성한다.
- artifact나 workdir가 유실되면 재실행 기준을 명확히 해야 한다.

## 5. 운영 시나리오

### 시나리오 1: 정상 생성

1. 사용자가 환경을 등록한다.
2. plan이 실행된다.
3. 운영자가 결과를 확인한다.
4. 필요한 경우 apply를 승인한다.

### 시나리오 2: plan 실패

1. runner가 init 또는 plan에서 실패한다.
2. job은 failed가 된다.
3. 사용자는 로그를 보고 입력값을 수정한다.
4. 새 job을 만든다.

### 시나리오 3: apply 보류

1. plan은 성공했지만 운영자가 아직 승인하지 않는다.
2. job은 done 상태로 남고, apply는 별도 job으로 생성되지 않는다.
3. 승인 후에만 apply가 실행된다.

### 시나리오 4: artifact 유실

1. source plan job은 done이지만 plan 파일이 없다.
2. apply는 생성되더라도 runner에서 중단되어야 한다.
3. 운영자는 재plan 또는 복구 절차를 선택한다.

## 6. 화면에서 필요한 정보

- job ID
- job type
- job status
- environment 요약
- source job ID
- template name
- workdir
- plan path
- error
- 로그 스트림

## 7. 결론

현재 흐름은 기술적으로는 연결되어 있지만, 사용자 입장에서는 “무엇이 생성되고, 무엇이 승인되고, 무엇이 실행되는지”가 분리되어 보이지 않는다. 제품 완성도를 높이려면 이 흐름을 화면과 문서에서 먼저 명시해야 한다.
