import type { Environment } from '../api'

function currentLocale(): 'en' | 'ko' {
  if (typeof window === 'undefined') return 'en'
  return window.localStorage.getItem('infra-orch:locale') === 'ko' ? 'ko' : 'en'
}

export function isRevisionConflictError(message?: string | null): boolean {
  if (!message) return false
  const normalized = message.toLowerCase()
  return normalized.includes('environment changed concurrently') || normalized.includes('revision precondition failed')
}

function shortJob(id?: string): string {
  if (!id) return '-'
  return id.slice(0, 8)
}

export function summarizeEnvironmentConflictDelta(
  previous: Environment | null,
  current: Environment | null,
  ko: boolean,
): string {
  if (!previous || !current) {
    return ko
      ? '최신 환경 상태를 다시 불러왔습니다. 화면 값을 확인한 뒤 다시 시도하세요.'
      : 'The latest environment state was reloaded. Review the updated values and retry.'
  }

  const changes: string[] = []
  if (previous.revision !== current.revision) {
    changes.push(
      ko
        ? `리비전 ${previous.revision ?? 0} -> ${current.revision ?? 0}`
        : `revision ${previous.revision ?? 0} -> ${current.revision ?? 0}`,
    )
  }
  if (previous.status !== current.status) {
    changes.push(ko ? `상태 ${previous.status} -> ${current.status}` : `status ${previous.status} -> ${current.status}`)
  }
  if (previous.approval_status !== current.approval_status) {
    changes.push(
      ko
        ? `승인 ${previous.approval_status} -> ${current.approval_status}`
        : `approval ${previous.approval_status} -> ${current.approval_status}`,
    )
  }
  if (previous.last_job_id !== current.last_job_id) {
    changes.push(
      ko
        ? `마지막 작업 ${shortJob(previous.last_job_id)} -> ${shortJob(current.last_job_id)}`
        : `last job ${shortJob(previous.last_job_id)} -> ${shortJob(current.last_job_id)}`,
    )
  }

  if (changes.length === 0) {
    return ko
      ? '최신 환경 상태를 다시 불러왔지만 주요 필드는 동일합니다. 다시 시도해 보세요.'
      : 'The latest environment state was reloaded and key fields are unchanged. Please retry.'
  }
  return ko ? `동시 변경이 감지되어 상태를 갱신했습니다: ${changes.join(', ')}` : `Concurrent changes detected; state refreshed: ${changes.join(', ')}`
}

export function summarizeOperatorError(message?: string | null): string {
  const ko = currentLocale() === 'ko'
  if (!message) return ko ? '예상하지 못한 플랫폼 오류가 발생했습니다.' : 'An unexpected platform error occurred.'

  const normalized = message.toLowerCase()
  if (normalized.includes('no such file or directory') && normalized.includes('/templates/')) {
    return ko
      ? '선택한 템플릿 경로를 서버에서 찾을 수 없습니다. 템플릿 카탈로그를 동기화한 뒤 다시 시도하세요.'
      : 'The selected template path is not available on the server. Sync the template catalog before retrying.'
  }
  if (normalized.includes('template') && normalized.includes('not found')) {
    return ko
      ? '참조한 템플릿을 찾지 못했습니다. 템플릿 카탈로그를 확인한 뒤 계획을 다시 시도하세요.'
      : 'The referenced template could not be found. Check the template catalog and retry the plan.'
  }
  if (normalized.includes('list environment jobs failed')) {
    return ko
      ? '이 환경에 연결된 실행 기록을 콘솔에서 불러오지 못했습니다.'
      : 'The console could not load linked execution records for this environment.'
  }
  if (normalized.includes('list jobs failed')) {
    return ko ? '실행 ledger를 불러오지 못했습니다.' : 'The execution ledger could not be loaded.'
  }
  if (normalized.includes('failed to load templates') || normalized.includes('list templates failed')) {
    return ko
      ? '설정된 서버 경로에서 템플릿 카탈로그를 불러오지 못했습니다.'
      : 'The template catalog could not be loaded from the configured server paths.'
  }
  if (normalized.includes('failed to load dashboard')) {
    return ko ? '대시보드를 불러오지 못했습니다.' : 'The dashboard could not be loaded.'
  }
  if (normalized.includes('failed to load audit records')) {
    return ko ? '감사 기록을 불러오지 못했습니다.' : 'The audit records could not be loaded.'
  }
  if (normalized.includes('failed to load review preview')) {
    return ko ? '검토 미리보기를 불러오지 못했습니다.' : 'The review preview could not be loaded.'
  }
  if (normalized.includes('failed to save local draft')) {
    return ko ? '로컬 초안을 저장하지 못했습니다.' : 'The local draft could not be saved.'
  }
  if (normalized.includes('failed to create environment')) {
    return ko ? '환경을 생성하지 못했습니다.' : 'The environment could not be created.'
  }
  if (normalized.includes('failed to generate request draft')) {
    return ko ? '요청 초안을 생성하지 못했습니다.' : 'The request draft could not be generated.'
  }
  if (normalized.includes('failed to create apply job')) {
    return ko ? 'apply 작업을 생성하지 못했습니다.' : 'The apply job could not be created.'
  }
  if (normalized.includes('failed to create plan')) {
    return ko ? '계획 작업을 생성하지 못했습니다.' : 'The plan job could not be created.'
  }
  if (
    normalized.includes('environment changed concurrently') ||
    normalized.includes('revision precondition failed')
  ) {
    return ko
      ? '다른 작업이 먼저 반영되어 현재 화면 정보가 오래되었습니다. 새로고침 후 다시 시도하세요.'
      : 'Another change was applied first, so this view is stale. Refresh and retry.'
  }
  return message
}

export function summarizeAuditMessage(message?: string | null, ko = false): string | undefined {
  if (!message) return undefined
  if (!ko) return message
  return message
    .replace('Plan approved for environment ', '환경 계획 승인: ')
    .replace('Plan requested for environment ', '환경 계획 요청: ')
    .replace('environment plan queued', '환경 계획이 큐에 등록되었습니다')
    .replace('Apply requested for environment ', '환경 적용 요청: ')
    .replace('Destroy requested for environment ', '환경 삭제 요청: ')
    .replace('Retry requested for environment ', '환경 재시도 요청: ')
    .replace('Plan failed for environment ', '환경 계획 실패: ')
    .replace('Apply failed for environment ', '환경 적용 실패: ')
    .replace('Apply succeeded for environment ', '환경 적용 성공: ')
    .replace('Destroy succeeded for environment ', '환경 삭제 성공: ')
    .replace('environment created and initial plan queued', '환경이 생성되었고 초기 계획이 큐에 등록되었습니다')
    .replace('runner updated environment state from job', '러너가 작업 결과로 환경 상태를 갱신했습니다')
    .replace('runner marked environment failed', '러너가 환경을 실패 상태로 기록했습니다')
}

export function displayAuditAction(action: string, ko = false): string {
  const map: Record<string, string> = {
    'user.provisioned': ko ? '사용자 계정 생성' : 'User account provisioned',
    'user.disabled': ko ? '사용자 비활성화' : 'User account disabled',
    'user.enabled': ko ? '사용자 재활성화' : 'User account re-enabled',
    'user.password_reset': ko ? '사용자 비밀번호 재설정' : 'User password reset',
    'user.role_granted': ko ? '관리자 권한 부여' : 'Admin role granted',
    'user.role_revoked': ko ? '관리자 권한 해제' : 'Admin role revoked',
    'environment.created': ko ? '환경 생성' : 'Environment created',
    'environment.plan_requested': ko ? '환경 계획 요청' : 'Environment plan requested',
    'environment.approved': ko ? '환경 승인' : 'Environment approved',
    'environment.apply_requested': ko ? '환경 적용 요청' : 'Environment apply requested',
    'environment.destroy_requested': ko ? '환경 삭제 요청' : 'Environment destroy requested',
    'environment.retry_requested': ko ? '환경 재시도 요청' : 'Environment retry requested',
    'environment.plan_failed': ko ? '환경 계획 실패' : 'Environment plan failed',
    'environment.apply_failed': ko ? '환경 적용 실패' : 'Environment apply failed',
    'environment.apply_succeeded': ko ? '환경 적용 성공' : 'Environment apply succeeded',
    'environment.destroy_succeeded': ko ? '환경 삭제 성공' : 'Environment destroy succeeded',
    'job.failed': ko ? '실행 실패' : 'Execution failed',
    'job.succeeded': ko ? '실행 성공' : 'Execution succeeded',
    'job.failed_conflict': ko ? '실행 실패(충돌 반영)' : 'Execution failed (conflict)',
    'job.succeeded_conflict': ko ? '실행 성공(충돌 반영)' : 'Execution succeeded (conflict)',
    'job.failed_ignored': ko ? '실행 실패(구버전 무시)' : 'Execution failed (stale ignored)',
    'job.succeeded_ignored': ko ? '실행 성공(구버전 무시)' : 'Execution succeeded (stale ignored)',
  }
  return map[action] || action
}

export function errorLooksRaw(message?: string | null): boolean {
  if (!message) return false
  return message.includes('/') || message.includes('{') || message.includes('no such file or directory')
}
