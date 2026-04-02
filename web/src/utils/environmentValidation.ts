import type { EnvironmentSpec } from '../api'

export type ValidationResult = {
  fieldErrors: Record<string, string>
  stepErrors: Record<number, string[]>
}

function required(value: string, message: string) {
  return value.trim() ? null : message
}

export function validateEnvironmentSpecForWizard(spec: EnvironmentSpec): ValidationResult {
  const fieldErrors: Record<string, string> = {}

  const push = (key: string, message: string | null) => {
    if (message) fieldErrors[key] = message
  }

  push('tenant_name', required(spec.tenant_name, 'Tenant name is required.'))
  push('environment_name', required(spec.environment_name, 'Environment name is required.'))
  push('network.name', required(spec.network.name, 'Network name is required.'))
  push('network.cidr', required(spec.network.cidr, 'Network CIDR is required.'))
  push('subnet.name', required(spec.subnet.name, 'Subnet name is required.'))
  push('subnet.cidr', required(spec.subnet.cidr, 'Subnet CIDR is required.'))

  if (spec.instances.length === 0) {
    fieldErrors.instances = 'At least one instance definition is required.'
  }
  if (spec.instances.length > 2) {
    fieldErrors.instances = 'The current product scope supports up to two instance groups.'
  }

  spec.instances.forEach((item, index) => {
    push(`instances[${index}].name`, required(item.name, 'Instance name is required.'))
    push(`instances[${index}].image`, required(item.image, 'Image is required.'))
    push(`instances[${index}].flavor`, required(item.flavor, 'Flavor is required.'))
    if (!Number.isFinite(item.count) || item.count < 1) {
      fieldErrors[`instances[${index}].count`] = 'Count must be at least 1.'
    }
  })

  if ((spec.security_groups || []).some((item) => item.trim() === '')) {
    fieldErrors.security_groups = 'Remove empty security group values before review.'
  }

  const stepErrors: Record<number, string[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  }

  const stepMap: Record<number, string[]> = {
    1: ['tenant_name'],
    2: ['environment_name'],
    3: ['network.name', 'network.cidr', 'subnet.name', 'subnet.cidr'],
    4: Object.keys(fieldErrors).filter((key) => key === 'instances' || key.startsWith('instances[')),
    5: ['security_groups'],
    6: Object.keys(fieldErrors),
  }

  Object.entries(stepMap).forEach(([step, keys]) => {
    stepErrors[Number(step)] = keys.map((key) => fieldErrors[key]).filter(Boolean)
  })

  return { fieldErrors, stepErrors }
}
