import type { EnvironmentSpec } from '../api'

export type ValidationResult = {
  fieldErrors: Record<string, string>
  stepErrors: Record<number, string[]>
}

function required(value: string, message: string) {
  return value.trim() ? null : message
}

function parseIPv4Cidr(value: string): { address: number; bits: number } | null {
  const [addressRaw, bitsRaw] = value.trim().split('/')
  if (!addressRaw || bitsRaw === undefined) return null
  const bits = Number(bitsRaw)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const octets = addressRaw.split('.').map((item) => Number(item))
  if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return null
  const address = ((octets[0] * 256 ** 3 + octets[1] * 256 ** 2 + octets[2] * 256 + octets[3]) >>> 0)
  return { address, bits }
}

function cidrContains(parent: { address: number; bits: number }, child: { address: number; bits: number }) {
  if (child.bits < parent.bits) return false
  const mask = parent.bits === 0 ? 0 : (0xffffffff << (32 - parent.bits)) >>> 0
  return (parent.address & mask) === (child.address & mask)
}

function parseIPv4Address(value: string): number | null {
  const octets = value.trim().split('.').map((item) => Number(item))
  if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return null
  return ((octets[0] * 256 ** 3 + octets[1] * 256 ** 2 + octets[2] * 256 + octets[3]) >>> 0)
}

function cidrContainsAddress(prefix: { address: number; bits: number }, address: number) {
  const mask = prefix.bits === 0 ? 0 : (0xffffffff << (32 - prefix.bits)) >>> 0
  return (prefix.address & mask) === (address & mask)
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
  const networkCidr = spec.network.cidr.trim() ? parseIPv4Cidr(spec.network.cidr) : null
  const subnetCidr = spec.subnet.cidr.trim() ? parseIPv4Cidr(spec.subnet.cidr) : null
  if (spec.network.cidr.trim() && !networkCidr) {
    fieldErrors['network.cidr'] = 'Network CIDR must be a valid IPv4 CIDR.'
  }
  if (spec.subnet.cidr.trim() && !subnetCidr) {
    fieldErrors['subnet.cidr'] = 'Subnet CIDR must be a valid IPv4 CIDR.'
  }
  if (networkCidr && subnetCidr && !cidrContains(networkCidr, subnetCidr)) {
    fieldErrors['subnet.cidr'] = 'Subnet CIDR must be within network CIDR.'
  }
  const gateway = spec.subnet.gateway_ip?.trim() ? parseIPv4Address(spec.subnet.gateway_ip) : null
  if (spec.subnet.gateway_ip?.trim() && gateway === null) {
    fieldErrors['subnet.gateway_ip'] = 'Gateway IP must be a valid IPv4 address.'
  } else if (subnetCidr && gateway !== null && !cidrContainsAddress(subnetCidr, gateway)) {
    fieldErrors['subnet.gateway_ip'] = 'Gateway IP must be within subnet CIDR.'
  }

  if (spec.instances.length === 0) {
    fieldErrors.instances = 'At least one instance definition is required.'
  }
  if (spec.instances.length > 2) {
    fieldErrors.instances = 'The current product scope supports up to two instance groups.'
  }
  const totalInstanceCount = spec.instances.reduce((acc, item) => acc + (Number.isFinite(item.count) ? item.count : 0), 0)

  spec.instances.forEach((item, index) => {
    push(`instances[${index}].name`, required(item.name, 'Instance name is required.'))
    push(`instances[${index}].image`, required(item.image, 'Image is required.'))
    push(`instances[${index}].flavor`, required(item.flavor, 'Flavor is required.'))
    if (!Number.isFinite(item.count) || item.count < 1) {
      fieldErrors[`instances[${index}].count`] = 'Count must be at least 1.'
    } else if (item.count > 2) {
      fieldErrors[`instances[${index}].count`] = 'Count must be at most 2.'
    }
    if (item.ssh_key_name !== undefined && item.ssh_key_name !== '' && item.ssh_key_name.trim() === '') {
      fieldErrors[`instances[${index}].ssh_key_name`] = 'SSH key name must not be blank.'
    }
  })
  if (totalInstanceCount > 2) {
    fieldErrors.instances = 'The current product scope supports up to two total instances.'
  }

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
