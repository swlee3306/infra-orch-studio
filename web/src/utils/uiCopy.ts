function currentLocale(): 'en' | 'ko' {
  if (typeof window === 'undefined') return 'en'
  return window.localStorage.getItem('infra-orch:locale') === 'ko' ? 'ko' : 'en'
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
  return message
}

export function errorLooksRaw(message?: string | null): boolean {
  if (!message) return false
  return message.includes('/') || message.includes('{') || message.includes('no such file or directory')
}
