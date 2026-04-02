import type { AuditEvent, Environment, EnvironmentSpec, Job, ReviewSignal } from '../api'

export type Checkpoint = {
  label: string
  state: 'ok' | 'wait'
}

export function emptyEnvironmentSpec(): EnvironmentSpec {
  return {
    environment_name: 'edge-payments-staging',
    tenant_name: 'tenant-prod-us-03',
    network: { name: 'vnet-core-a', cidr: '10.24.0.0/24' },
    subnet: { name: 'snet-app-03', cidr: '10.24.0.0/25', gateway_ip: '10.24.0.1', enable_dhcp: true },
    instances: [
      {
        name: 'app-01',
        image: 'ubuntu-22.04',
        flavor: 'm1.medium',
        ssh_key_name: 'default',
        count: 2,
      },
    ],
    security_groups: ['sg-web', 'sg-data'],
  }
}

export function summarizeSpec(spec: EnvironmentSpec) {
  const instanceTotal = spec.instances.reduce((acc, item) => acc + (item.count || 0), 0)
  return {
    instanceTotal,
    securityGroupTotal: spec.security_groups?.length || 0,
    subnetCapacityWarning: spec.subnet.cidr.endsWith('/26') || spec.subnet.cidr.endsWith('/27') || spec.subnet.cidr.endsWith('/28'),
  }
}

export function buildReviewSignals(spec: EnvironmentSpec, operation: string): ReviewSignal[] {
  const summary = summarizeSpec(spec)
  const items: ReviewSignal[] = []

  if (operation === 'destroy') {
    items.push({
      label: 'Destroy operation',
      detail: 'This plan is destructive and will require an explicit confirmation before it should be approved.',
      severity: 'high',
    })
  }
  if (summary.instanceTotal >= 4) {
    items.push({
      label: 'Large instance footprint',
      detail: `${summary.instanceTotal} instances are requested, which increases rollout time and blast radius.`,
      severity: 'medium',
    })
  }
  if (summary.subnetCapacityWarning) {
    items.push({
      label: 'Subnet capacity pressure',
      detail: `Subnet ${spec.subnet.cidr} suggests limited remaining address space for future changes.`,
      severity: 'high',
    })
  }
  if ((spec.security_groups?.length || 0) === 0) {
    items.push({
      label: 'Security references missing',
      detail: 'No security groups are attached. Validate tenant baseline inheritance before apply.',
      severity: 'high',
    })
  } else {
    items.push({
      label: 'Security references inherited',
      detail: `${spec.security_groups?.join(', ')} will be included in the resulting environment state.`,
      severity: 'low',
    })
  }
  items.push({
    label: 'Template-backed plan',
    detail: `Network ${spec.network.name} and subnet ${spec.subnet.name} will be rendered through the fixed template path.`,
    severity: 'low',
  })

  return items
}

export function buildImpactSummary(spec: EnvironmentSpec, operation: string) {
  const summary = summarizeSpec(spec)
  const downtime = operation === 'destroy' ? 'High' : summary.instanceTotal >= 4 ? 'Medium' : 'Low'
  const blastRadius = `${spec.tenant_name || '-'} / ${spec.network.name || '-'} / ${spec.subnet.name || '-'}`
  const costDelta =
    operation === 'destroy'
      ? 'Negative spend delta expected after destroy is applied.'
      : `Estimated footprint includes ${summary.instanceTotal} instances and ${summary.securityGroupTotal} security references.`

  return { downtime, blastRadius, costDelta }
}

export function buildApprovalCheckpoints(environment: Environment | null, planJob: Job | null, typedConfirmationReady: boolean): Checkpoint[] {
  return [
    {
      label: 'Plan job completed',
      state: planJob?.status === 'done' ? 'ok' : 'wait',
    },
    {
      label: 'Plan artifact available',
      state: planJob?.plan_path && planJob?.workdir ? 'ok' : 'wait',
    },
    {
      label: 'Approval gate cleared',
      state: environment?.approval_status === 'approved' ? 'ok' : 'wait',
    },
    {
      label: 'Typed destroy confirmation',
      state: typedConfirmationReady ? 'ok' : 'wait',
    },
  ]
}

export function findLatestPlanJob(environment: Environment | null, jobs: Job[]): Job | null {
  if (!environment?.last_plan_job_id) return null
  return jobs.find((item) => item.id === environment.last_plan_job_id) || null
}

export function latestApprovalEvent(events: AuditEvent[]): AuditEvent | null {
  return events.find((item) => item.action === 'environment.approved') || null
}
