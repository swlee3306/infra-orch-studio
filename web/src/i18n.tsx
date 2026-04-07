import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Locale = 'en' | 'ko'
type RouteGuideKey = 'dashboard' | 'environments' | 'create' | 'environmentDetail' | 'review' | 'approval' | 'jobs' | 'jobDetail' | 'templates' | 'audit'

type CopyShape = {
  shell: {
    brandTitle: string
    brandSubtitle: string
    nav: Record<'dashboard' | 'environments' | 'create' | 'jobs' | 'templates' | 'audit', string>
    logout: string
    topbarKicker: string
    routeTitles: Record<RouteGuideKey, string>
  }
  login: {
    title: string
    subtitle: string
    helper: string
    login: string
    signup: string
    createAccount: string
    email: string
    password: string
    apiBase: string
  }
  dashboard: {
    kicker: string
    title: string
    copy: string
    viewer: string
    refresh: string
  }
  environments: {
    kicker: string
    title: string
    copy: string
    viewer: string
    refresh: string
    openWizard: string
    quickCreate: string
    hideQuickCreate: string
  }
  create: {
    kicker: string
    title: string
    copy: string
    saveDraft: string
    savingDraft: string
    exitWizard: string
    stepsTitle: string
    currentStep: string
    resolveBeforeContinue: string
    back: string
    continue: string
    queueInitialPlan: string
    queueingInitialPlan: string
    refreshReview: string
    fixReviewErrors: string
    stepLabels: string[]
    requestChat: {
      kicker: string
      title: string
      draftOnly: string
      copy: string
      promptLabel: string
      promptPlaceholder: string
      generate: string
      generating: string
      useDraft: string
      assumptions: string
      warnings: string
      nextStep: string
      noWarnings: string
    }
  }
  review: {
    kicker: string
    title: string
    copy: string
    refresh: string
    approvalControl: string
    environmentDetail: string
    approve: string
    approving: string
    apply: string
    applying: string
    openGuardedControl: string
    ack: string
    approvalComment: string
    approvalPlaceholder: string
  }
  approval: {
    kicker: string
    title: string
    copy: string
    refresh: string
    planReview: string
    environmentDetail: string
    approvalComment: string
    approvalPlaceholder: string
    approveRequest: string
    approving: string
    queueUpdate: string
    applying: string
    typedConfirmation: string
    destroyComment: string
    destroyPlaceholder: string
    queueDestroy: string
    queueingDestroy: string
    destroyDisabled: string
  }
  detail: {
    kicker: string
    copy: string
    refresh: string
    openReview: string
    approvalControl: string
    queueUpdate: string
    queueing: string
    approve: string
    approving: string
    applyApproved: string
    applying: string
    openDestroyControl: string
    retry: string
    retrying: string
  }
  jobDetail: {
    kicker: string
    title: string
    copy: string
    viewer: string
    refresh: string
    environment: string
    approvalControl: string
    applyPlan: string
    applying: string
    wsConnected: string
    wsOffline: string
  }
  templates: {
    kicker: string
    title: string
    copy: string
    refresh: string
    validateSelected: string
    validating: string
  }
  audit: {
    kicker: string
    title: string
    copy: string
    viewer: string
    refresh: string
  }
  guide: {
    title: string
    cycleTitle: string
    cycleSteps: string[]
    pageTitle: string
    pages: Record<RouteGuideKey, { summary: string; items: string[] }>
  }
}

const STORAGE_KEY = 'infra-orch:locale'

const COPY: Record<Locale, CopyShape> = {
  en: {
    shell: {
      brandTitle: 'Infra Orch Studio',
      brandSubtitle: 'Environment operations workspace',
      nav: {
        dashboard: 'Dashboard',
        environments: 'Environments',
        create: 'Create Flow',
        jobs: 'Executions',
        templates: 'Templates',
        audit: 'Audit',
      },
      logout: 'Logout',
      topbarKicker: 'Environment operations',
      routeTitles: {
        dashboard: 'Dashboard',
        environments: 'Environments',
        create: 'Create Environment',
        environmentDetail: 'Environment Detail',
        review: 'Plan Review',
        approval: 'Approval Control',
        jobs: 'Executions',
        jobDetail: 'Execution Detail',
        templates: 'Templates',
        audit: 'Audit',
      },
    },
    login: {
      title: 'Infra Orch Studio',
      subtitle: 'Operate plans, approvals, and environment changes from one console.',
      helper: 'Session auth uses an httpOnly cookie. Passwords must be at least 8 characters.',
      login: 'Login',
      signup: 'Sign up',
      createAccount: 'Create account',
      email: 'Email',
      password: 'Password',
      apiBase: 'API base',
    },
    dashboard: {
      kicker: 'Environment overview',
      title: 'Environment operations dashboard',
      copy: 'Start from environment posture, then drill into approvals, failures, and recent lifecycle changes.',
      viewer: 'Viewer',
      refresh: 'Refresh',
    },
    environments: {
      kicker: 'Environment list',
      title: 'Environment posture',
      copy: 'Filter lifecycle posture, review approvals, and open environment detail for guarded actions.',
      viewer: 'Viewer',
      refresh: 'Refresh',
      openWizard: 'Open wizard',
      quickCreate: 'Quick create',
      hideQuickCreate: 'Hide quick create',
    },
    create: {
      kicker: 'Environment setup / 07 steps',
      title: 'Create environment flow',
      copy: 'Work through the desired-state inputs, persist a local draft when needed, then queue the initial plan and continue into review.',
      saveDraft: 'Save draft',
      savingDraft: 'Saving draft...',
      exitWizard: 'Exit wizard',
      stepsTitle: 'Wizard progress',
      currentStep: 'Current step',
      resolveBeforeContinue: 'Resolve before continuing',
      back: 'Back',
      continue: 'Continue',
      queueInitialPlan: 'Review plan',
      queueingInitialPlan: 'Queueing initial plan...',
      refreshReview: 'Refreshing review...',
      fixReviewErrors: 'Fix review errors',
      stepLabels: ['Template / Custom', 'Tenant', 'Name', 'Network / Subnet', 'Instances', 'Security Refs', 'Validate + Review'],
      requestChat: {
        kicker: 'Request chat (beta)',
        title: 'Generate a structured request draft',
        draftOnly: 'Draft only',
        copy: 'Describe the environment you want in natural language. The assistant only fills a draft and still sends you through plan review and approval.',
        promptLabel: 'Request prompt',
        promptPlaceholder:
          'Example: Create a staging environment named payments-api for tenant finops with 2 ubuntu instances, medium flavor, web and db security groups, network 10.44.0.0/24 and subnet 10.44.0.0/26.',
        generate: 'Generate request draft',
        generating: 'Generating draft...',
        useDraft: 'Use draft in wizard',
        assumptions: 'Assumptions',
        warnings: 'Warnings',
        nextStep: 'Next step',
        noWarnings: 'No extra warnings were generated for this prompt.',
      },
    },
    review: {
      kicker: 'Plan review',
      title: 'Change evaluation / pre-apply',
      copy: 'Review the latest environment plan, inspect inferred risk signals, and clear the approval gate only when the plan and impact look acceptable.',
      refresh: 'Refresh',
      approvalControl: 'Approval control',
      environmentDetail: 'Environment detail',
      approve: 'Approve',
      approving: 'Approving...',
      apply: 'Apply',
      applying: 'Applying...',
      openGuardedControl: 'Open guarded control',
      ack: 'I reviewed all high-risk changes and warnings before approval.',
      approvalComment: 'Approval comment',
      approvalPlaceholder: 'Approval rationale, CAB reference, or operational note',
    },
    approval: {
      kicker: 'Approval control',
      title: 'Guarded production workflow',
      copy: 'Use hard checkpoints before approval, apply, update, and destroy. This page adds explicit operator safety over the existing environment lifecycle APIs.',
      refresh: 'Refresh',
      planReview: 'Plan review',
      environmentDetail: 'Environment detail',
      approvalComment: 'Approval comment',
      approvalPlaceholder: 'Why this plan is safe to approve',
      approveRequest: 'Approve request',
      approving: 'Approving...',
      queueUpdate: 'Queue guarded update',
      applying: 'Applying...',
      typedConfirmation: 'Typed confirmation',
      destroyComment: 'Destroy comment',
      destroyPlaceholder: 'Reason for destroy, incident, or change request reference',
      queueDestroy: 'Queue destroy plan',
      queueingDestroy: 'Queueing destroy...',
      destroyDisabled: 'Destroy disabled',
    },
    detail: {
      kicker: 'Detail',
      copy: 'Track lifecycle state, queue guarded changes, and inspect plan, result, and audit evidence from one surface.',
      refresh: 'Refresh',
      openReview: 'Open review',
      approvalControl: 'Approval control',
      queueUpdate: 'Queue update plan',
      queueing: 'Queueing...',
      approve: 'Approve',
      approving: 'Approving...',
      applyApproved: 'Apply approved plan',
      applying: 'Applying...',
      openDestroyControl: 'Open destroy control',
      retry: 'Retry failed step',
      retrying: 'Retrying...',
    },
    jobDetail: {
      kicker: 'Job detail',
      title: 'Execution chain',
      copy: 'Inspect the execution record in environment context: source lineage, artifact pointers, live logs, and the next guarded action.',
      viewer: 'Viewer',
      refresh: 'Refresh',
      environment: 'Environment',
      approvalControl: 'Approval control',
      applyPlan: 'Apply plan',
      applying: 'Applying...',
      wsConnected: 'connected',
      wsOffline: 'offline',
    },
    templates: {
      kicker: 'Template management / renderer contract',
      title: 'OpenTofu template catalog',
      copy: 'Check which environment sets and shared modules are currently usable before queueing a plan.',
      refresh: 'Refresh',
      validateSelected: 'Validate selected',
      validating: 'Validating...',
    },
    audit: {
      kicker: 'Audit console / environment history',
      title: 'Environment audit timeline',
      copy: 'Review approval, apply, retry, and destroy history from a dedicated environment audit feed.',
      viewer: 'Viewer',
      refresh: 'Refresh',
    },
    guide: {
      title: 'Operator guide',
      cycleTitle: 'One-cycle guide',
      cycleSteps: [
        'Create or update the desired state from an environment-first screen.',
        'Review the generated plan and confirm impact before approval.',
        'Record approval, then queue apply or destroy from the guarded control page.',
        'Inspect artifacts, outputs, and audit events after execution finishes.',
      ],
      pageTitle: 'Current page',
      pages: {
        dashboard: {
          summary: 'Use this page to spot approvals, failures, and recent lifecycle changes first.',
          items: ['Open blocked approvals from the approval panel.', 'Open failed environments from the incident panel.', 'Use recent lifecycle rows to jump into detail.'],
        },
        environments: {
          summary: 'Use filters to narrow lifecycle state, then open detail, review, or approval control.',
          items: ['Search by environment, tenant, owner, or lifecycle.', 'Use quick create only for fast operator-driven plan requests.', 'Use row-level next steps to jump into the right surface.'],
        },
        create: {
          summary: 'Work through the wizard in order, then confirm review signals before creating the environment.',
          items: ['Validate tenant, name, network, instance, and security inputs step by step.', 'Save draft if you need to pause the request.', 'Use the final review to confirm blast radius before queueing the first plan.'],
        },
        environmentDetail: {
          summary: 'Track one environment as the primary operating object and open deeper controls only when needed.',
          items: ['Use the summary and workflow sections to understand current state.', 'Open the desired-state editor only when preparing a new plan.', 'Use recent jobs, outputs, and audit entries as supporting evidence.'],
        },
        review: {
          summary: 'Use plan review to check risk, impact, and approval readiness before any apply action.',
          items: ['Read review signals first.', 'Add approval context if the change should proceed.', 'Escalate to approval control only after the plan is understood.'],
        },
        approval: {
          summary: 'Use this page for guarded approval, apply, retry, and destroy actions.',
          items: ['Confirm approval before apply.', 'Use typed confirmation for destructive actions.', 'Keep comments specific enough for later audit review.'],
        },
        jobs: {
          summary: 'Use executions when you need raw job history or direct access to a specific runner record.',
          items: ['Prefer environment pages for lifecycle work.', 'Use the legacy form only for low-level operator testing.', 'Open job detail for logs, paths, and execution chains.'],
        },
        jobDetail: {
          summary: 'Use job detail to inspect one execution record, linked paths, and structured outputs.',
          items: ['Check linked environment and source job first.', 'Inspect logs and artifacts before retry decisions.', 'Jump back to review or approval when the job is environment-scoped.'],
        },
        templates: {
          summary: 'Use the catalog to confirm which templates and modules are actually visible to the server.',
          items: ['Inspect environment sets before create or update plans.', 'Run validation after template changes.', 'Treat paths as runtime evidence, not as the primary UI.'],
        },
        audit: {
          summary: 'Use the audit feed to reconstruct approval, apply, retry, and destroy activity across environments.',
          items: ['Filter by approvals, mutations, destroy, or failures.', 'Open linked environments from the feed when deeper context is needed.', 'Use metadata only as supporting detail after the human-readable event summary.'],
        },
      },
    },
  },
  ko: {
    shell: {
      brandTitle: '인프라 오케스트레이션',
      brandSubtitle: '환경 운영 콘솔',
      nav: {
        dashboard: '대시보드',
        environments: '환경',
        create: '생성 흐름',
        jobs: '실행 이력',
        templates: '템플릿',
        audit: '감사 로그',
      },
      logout: '로그아웃',
      topbarKicker: '환경 운영',
      routeTitles: {
        dashboard: '대시보드',
        environments: '환경',
        create: '환경 생성',
        environmentDetail: '환경 상세',
        review: '플랜 검토',
        approval: '승인 제어',
        jobs: '실행 이력',
        jobDetail: '실행 상세',
        templates: '템플릿',
        audit: '감사 로그',
      },
    },
    login: {
      title: '인프라 오케스트레이션 스튜디오',
      subtitle: '하나의 콘솔에서 플랜, 승인, 환경 변경을 운영합니다.',
      helper: '세션 인증은 httpOnly 쿠키를 사용합니다. 비밀번호는 최소 8자 이상이어야 합니다.',
      login: '로그인',
      signup: '가입',
      createAccount: '계정 만들기',
      email: '이메일',
      password: '비밀번호',
      apiBase: 'API 주소',
    },
    dashboard: {
      kicker: '환경 개요',
      title: '환경 운영 대시보드',
      copy: '환경 상태를 먼저 보고, 필요한 경우 승인, 장애, 최근 변경으로 내려가세요.',
      viewer: '사용자',
      refresh: '새로고침',
    },
    environments: {
      kicker: '환경 목록',
      title: '환경 상태',
      copy: '생명주기 상태를 필터링하고, 승인 대기와 상세 제어 화면으로 이동합니다.',
      viewer: '사용자',
      refresh: '새로고침',
      openWizard: '생성 마법사',
      quickCreate: '빠른 생성',
      hideQuickCreate: '빠른 생성 닫기',
    },
    create: {
      kicker: '환경 설정 / 07단계',
      title: '환경 생성 흐름',
      copy: '원하는 상태를 단계별로 입력하고, 필요하면 초안을 저장한 뒤 첫 플랜을 큐잉하고 검토 단계로 이동합니다.',
      saveDraft: '초안 저장',
      savingDraft: '초안 저장 중...',
      exitWizard: '마법사 나가기',
      stepsTitle: '진행 단계',
      currentStep: '현재 단계',
      resolveBeforeContinue: '다음 단계로 가기 전에 해결하세요',
      back: '이전',
      continue: '계속',
      queueInitialPlan: '플랜 검토로 이동',
      queueingInitialPlan: '초기 플랜 큐잉 중...',
      refreshReview: '검토 갱신 중...',
      fixReviewErrors: '검토 오류 해결 필요',
      stepLabels: ['템플릿 / 직접 입력', '테넌트', '이름', '네트워크 / 서브넷', '인스턴스', '보안 참조', '검증 + 검토'],
      requestChat: {
        kicker: '요청 채팅 (베타)',
        title: '구조화된 요청 초안 생성',
        draftOnly: '초안 전용',
        copy: '자연어로 원하는 환경을 설명하면 초안만 생성합니다. 이후에도 반드시 플랜 검토와 승인을 거칩니다.',
        promptLabel: '요청 프롬프트',
        promptPlaceholder:
          '예시: finops 테넌트용 payments-api 스테이징 환경을 만들고, ubuntu 인스턴스 2대와 medium flavor, web/db 보안 그룹, 네트워크 10.44.0.0/24, 서브넷 10.44.0.0/26을 사용해줘.',
        generate: '요청 초안 생성',
        generating: '초안 생성 중...',
        useDraft: '초안을 마법사에 적용',
        assumptions: '가정 사항',
        warnings: '주의 사항',
        nextStep: '다음 단계',
        noWarnings: '이 프롬프트에서는 추가 주의 사항이 생성되지 않았습니다.',
      },
    },
    review: {
      kicker: '플랜 검토',
      title: '변경 영향 검토',
      copy: '최신 환경 플랜과 리스크 신호를 확인하고, 영향도가 수용 가능한 경우에만 승인 게이트를 해제합니다.',
      refresh: '새로고침',
      approvalControl: '승인 제어',
      environmentDetail: '환경 상세',
      approve: '승인',
      approving: '승인 중...',
      apply: '적용',
      applying: '적용 중...',
      openGuardedControl: '보호된 제어 열기',
      ack: '승인 전에 모든 고위험 변경과 경고를 확인했습니다.',
      approvalComment: '승인 코멘트',
      approvalPlaceholder: '승인 근거, CAB 참조, 운영 메모',
    },
    approval: {
      kicker: '승인 제어',
      title: '보호된 운영 워크플로',
      copy: '승인, 적용, 수정, 삭제 전에 명시적 체크포인트를 거칩니다. 기존 환경 생명주기 API 위에 운영자 안전 장치를 추가한 화면입니다.',
      refresh: '새로고침',
      planReview: '플랜 검토',
      environmentDetail: '환경 상세',
      approvalComment: '승인 코멘트',
      approvalPlaceholder: '이 플랜을 안전하게 승인할 수 있는 이유',
      approveRequest: '요청 승인',
      approving: '승인 중...',
      queueUpdate: '보호된 업데이트 큐잉',
      applying: '적용 중...',
      typedConfirmation: '이름 확인 입력',
      destroyComment: '삭제 코멘트',
      destroyPlaceholder: '삭제 사유, 장애 번호, 변경 요청 번호',
      queueDestroy: '삭제 플랜 큐잉',
      queueingDestroy: '삭제 큐잉 중...',
      destroyDisabled: '삭제 비활성',
    },
    detail: {
      kicker: '상세',
      copy: '생명주기 상태를 추적하고, 보호된 변경을 큐잉하며, 플랜과 결과, 감사 근거를 한 화면에서 확인합니다.',
      refresh: '새로고침',
      openReview: '검토 열기',
      approvalControl: '승인 제어',
      queueUpdate: '업데이트 플랜 큐잉',
      queueing: '큐잉 중...',
      approve: '승인',
      approving: '승인 중...',
      applyApproved: '승인된 플랜 적용',
      applying: '적용 중...',
      openDestroyControl: '삭제 제어 열기',
      retry: '실패 단계 재시도',
      retrying: '재시도 중...',
    },
    jobDetail: {
      kicker: '실행 상세',
      title: '실행 체인',
      copy: '환경 맥락에서 실행 기록을 확인합니다. 소스 계보, 산출물 경로, 실시간 로그, 다음 보호된 액션까지 한 화면에서 봅니다.',
      viewer: '사용자',
      refresh: '새로고침',
      environment: '환경',
      approvalControl: '승인 제어',
      applyPlan: '플랜 적용',
      applying: '적용 중...',
      wsConnected: '연결됨',
      wsOffline: '오프라인',
    },
    templates: {
      kicker: '템플릿 관리 / 렌더러 계약',
      title: 'OpenTofu 템플릿 카탈로그',
      copy: '플랜을 큐잉하기 전에 현재 서버에서 실제로 보이는 환경 세트와 모듈을 확인합니다.',
      refresh: '새로고침',
      validateSelected: '선택 항목 검증',
      validating: '검증 중...',
    },
    audit: {
      kicker: '감사 콘솔 / 환경 이력',
      title: '환경 감사 타임라인',
      copy: '전용 환경 감사 피드에서 승인, 적용, 재시도, 삭제 이력을 검토합니다.',
      viewer: '사용자',
      refresh: '새로고침',
    },
    guide: {
      title: '운영 가이드',
      cycleTitle: '한 사이클 가이드',
      cycleSteps: [
        '환경 중심 화면에서 원하는 상태를 생성하거나 수정합니다.',
        '플랜 검토 화면에서 영향도와 리스크를 확인한 뒤 승인 여부를 결정합니다.',
        '승인을 기록한 뒤 보호된 제어 화면에서 적용 또는 삭제를 실행합니다.',
        '실행이 끝나면 산출물, 출력값, 감사 로그로 결과를 검토합니다.',
      ],
      pageTitle: '현재 페이지',
      pages: {
        dashboard: {
          summary: '승인 대기, 장애, 최근 변경을 가장 먼저 확인하는 시작 화면입니다.',
          items: ['승인 대기 패널에서 막힌 변경을 엽니다.', '장애 패널에서 실패한 환경으로 이동합니다.', '최근 이력 표에서 상세 화면으로 진입합니다.'],
        },
        environments: {
          summary: '생명주기 상태를 좁히고 적절한 상세, 검토, 승인 화면으로 이동합니다.',
          items: ['환경명, 테넌트, 소유자, 상태로 검색합니다.', '빠른 생성은 운영자가 바로 플랜을 요청할 때만 사용합니다.', '행의 다음 단계 링크로 알맞은 화면으로 바로 이동합니다.'],
        },
        create: {
          summary: '단계별 입력을 마치고 마지막 검토에서 영향도를 확인한 뒤 환경을 생성합니다.',
          items: ['테넌트, 이름, 네트워크, 인스턴스, 보안 그룹을 순서대로 검증합니다.', '잠시 멈출 경우 초안을 저장합니다.', '마지막 검토에서 blast radius를 확인한 뒤 첫 플랜을 큐잉합니다.'],
        },
        environmentDetail: {
          summary: '환경을 1급 운영 객체로 보고, 필요한 때만 더 깊은 편집과 제어를 엽니다.',
          items: ['상단 요약과 워크플로로 현재 상태를 파악합니다.', '새 플랜이 필요할 때만 원하는 상태 편집기를 엽니다.', '최근 작업, 출력값, 감사 이력을 근거로 판단합니다.'],
        },
        review: {
          summary: '적용 전에 리스크와 영향도를 확인하는 화면입니다.',
          items: ['리뷰 신호를 먼저 읽습니다.', '승인 사유를 남깁니다.', '플랜을 이해한 뒤에만 승인 제어 화면으로 이동합니다.'],
        },
        approval: {
          summary: '승인, 적용, 재시도, 삭제 같은 위험 작업을 안전하게 실행하는 화면입니다.',
          items: ['적용 전에 승인을 확인합니다.', '삭제는 이름 확인을 반드시 거칩니다.', '감사 로그에 남을 코멘트는 구체적으로 작성합니다.'],
        },
        jobs: {
          summary: '로우 레벨 실행 기록이나 특정 러너 작업을 직접 볼 때 사용하는 화면입니다.',
          items: ['생명주기 작업은 환경 화면을 우선 사용합니다.', '레거시 폼은 운영자 테스트 용도로만 사용합니다.', '로그와 경로가 필요하면 실행 상세를 엽니다.'],
        },
        jobDetail: {
          summary: '하나의 실행 기록, 연결된 경로, 구조화된 출력값을 점검하는 화면입니다.',
          items: ['연결된 환경과 원본 작업을 먼저 확인합니다.', '재시도 전 로그와 산출물을 검토합니다.', '환경 단위 작업이면 다시 검토/승인 화면으로 돌아갑니다.'],
        },
        templates: {
          summary: '서버가 실제로 읽고 있는 템플릿과 모듈을 확인하는 화면입니다.',
          items: ['생성 또는 수정 플랜 전에 환경 세트를 확인합니다.', '템플릿 변경 후 검증을 실행합니다.', '경로는 보조 증거로 보고, 주된 정보는 설명과 검증 상태로 봅니다.'],
        },
        audit: {
          summary: '여러 환경에 걸친 승인, 적용, 재시도, 삭제 이력을 복원하는 화면입니다.',
          items: ['승인, 변경, 삭제, 실패 필터를 사용합니다.', '더 깊은 맥락이 필요하면 연결된 환경 상세로 이동합니다.', '메타데이터는 사람이 읽는 이벤트 설명 다음에 확인합니다.'],
        },
      },
    },
  },
}

const I18nContext = createContext<{
  locale: Locale
  setLocale: (locale: Locale) => void
  copy: CopyShape
} | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'ko') {
      setLocaleState(stored)
    }
  }, [])

  const setLocale = (next: Locale) => {
    setLocaleState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  const value = useMemo(() => ({ locale, setLocale, copy: COPY[locale] }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('I18nProvider missing')
  return value
}

export type { RouteGuideKey }
