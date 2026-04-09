import React from 'react'
import type { EnvironmentSpec, Instance } from '../api'
import { useI18n } from '../i18n'

type Props = {
  value: EnvironmentSpec
  onChange: (next: EnvironmentSpec) => void
  sections?: Array<'environment' | 'tenant' | 'network' | 'instances' | 'security'>
  errors?: Record<string, string>
  resourceHints?: {
    images?: string[]
    flavors?: string[]
    networks?: string[]
    securityGroups?: string[]
    keyPairs?: string[]
    instances?: string[]
  }
}

function updateInstance(items: Instance[], index: number, patch: Partial<Instance>): Instance[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item))
}

function joinSecurityGroups(items?: string[]) {
  return (items || []).join(', ')
}

function splitSecurityGroups(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function toggleSecurityGroup(current: string[] | undefined, group: string, checked: boolean): string[] {
  const items = (current || []).filter(Boolean)
  if (checked) {
    if (items.includes(group)) return items
    return items.concat(group)
  }
  return items.filter((item) => item !== group)
}

export default function EnvironmentSpecForm({ value, onChange, sections, errors = {}, resourceHints }: Props) {
  const { locale } = useI18n()
  const ko = locale === 'ko'
  const setField = (patch: Partial<EnvironmentSpec>) => onChange({ ...value, ...patch })
  const enabled = new Set(sections || ['environment', 'tenant', 'network', 'instances', 'security'])

  const setNetwork = (patch: Partial<EnvironmentSpec['network']>) =>
    setField({ network: { ...value.network, ...patch } })

  const setSubnet = (patch: Partial<EnvironmentSpec['subnet']>) =>
    setField({ subnet: { ...value.subnet, ...patch } })

  const setInstance = (index: number, patch: Partial<Instance>) =>
    setField({ instances: updateInstance(value.instances, index, patch) })

  const localizeError = (message?: string) => {
    if (!message || !ko) return message
    return message
      .replace('Tenant name is required.', '테넌트 이름은 필수입니다.')
      .replace('Environment name is required.', '환경 이름은 필수입니다.')
      .replace('Network name is required.', '네트워크 이름은 필수입니다.')
      .replace('Network CIDR is required.', '네트워크 CIDR은 필수입니다.')
      .replace('Subnet name is required.', '서브넷 이름은 필수입니다.')
      .replace('Subnet CIDR is required.', '서브넷 CIDR은 필수입니다.')
      .replace('At least one instance definition is required.', '인스턴스 정의가 최소 하나는 필요합니다.')
      .replace('The current product scope supports up to two instance groups.', '현재 제품 범위에서는 인스턴스 그룹을 최대 두 개까지 지원합니다.')
      .replace('Instance name is required.', '인스턴스 이름은 필수입니다.')
      .replace('Image is required.', '이미지는 필수입니다.')
      .replace('Flavor is required.', '플레이버는 필수입니다.')
      .replace('Count must be at least 1.', '수량은 최소 1 이상이어야 합니다.')
      .replace('Remove empty security group values before review.', '검토 전에 비어 있는 보안 그룹 값을 제거하세요.')
  }

  const fieldClass = (key: string) => `field ${errors[key] ? 'field-invalid' : ''}`
  const imageOptions = resourceHints?.images || []
  const flavorOptions = resourceHints?.flavors || []
  const networkOptions = resourceHints?.networks || []
  const securityGroupOptions = resourceHints?.securityGroups || []
  const keyPairOptions = resourceHints?.keyPairs || []

  return (
    <div className="form-grid">
      {enabled.has('environment') ? (
          <label className={fieldClass('environment_name')}>
            <span>{ko ? '환경 이름' : 'Environment name'}</span>
            <input value={value.environment_name} onChange={(e) => setField({ environment_name: e.target.value })} />
            {errors.environment_name ? <small className="field-error">{localizeError(errors.environment_name)}</small> : null}
          </label>
      ) : null}

      {enabled.has('tenant') ? (
        <>
          <label className={fieldClass('tenant_name')}>
            <span>{ko ? '테넌트 이름' : 'Tenant name'}</span>
            <input value={value.tenant_name} onChange={(e) => setField({ tenant_name: e.target.value })} />
            {errors.tenant_name ? <small className="field-error">{localizeError(errors.tenant_name)}</small> : null}
          </label>
        </>
      ) : null}

      {enabled.has('network') ? (
        <>
          <div className="field-group">
            <div className="field-title">{ko ? '네트워크' : 'Network'}</div>
            <div className="grid-two">
              <label className={fieldClass('network.name')}>
                <span>{ko ? '이름' : 'Name'}</span>
                <input list={networkOptions.length ? 'network-name-options' : undefined} value={value.network.name} onChange={(e) => setNetwork({ name: e.target.value })} />
                {errors['network.name'] ? <small className="field-error">{localizeError(errors['network.name'])}</small> : null}
              </label>
              <label className={fieldClass('network.cidr')}>
                <span>CIDR</span>
                <input value={value.network.cidr} onChange={(e) => setNetwork({ cidr: e.target.value })} />
                {errors['network.cidr'] ? <small className="field-error">{localizeError(errors['network.cidr'])}</small> : null}
              </label>
            </div>
          </div>

          <div className="field-group">
            <div className="field-title">{ko ? '서브넷' : 'Subnet'}</div>
            <div className="grid-three">
              <label className={fieldClass('subnet.name')}>
                <span>{ko ? '이름' : 'Name'}</span>
                <input value={value.subnet.name} onChange={(e) => setSubnet({ name: e.target.value })} />
                {errors['subnet.name'] ? <small className="field-error">{localizeError(errors['subnet.name'])}</small> : null}
              </label>
              <label className={fieldClass('subnet.cidr')}>
                <span>CIDR</span>
                <input value={value.subnet.cidr} onChange={(e) => setSubnet({ cidr: e.target.value })} />
                {errors['subnet.cidr'] ? <small className="field-error">{localizeError(errors['subnet.cidr'])}</small> : null}
              </label>
              <label className="field">
                <span>{ko ? '게이트웨이 IP' : 'Gateway IP'}</span>
                <input value={value.subnet.gateway_ip || ''} onChange={(e) => setSubnet({ gateway_ip: e.target.value })} />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={value.subnet.enable_dhcp}
                onChange={(e) => setSubnet({ enable_dhcp: e.target.checked })}
              />
              <span>{ko ? 'DHCP 활성화' : 'Enable DHCP'}</span>
            </label>
          </div>
        </>
      ) : null}

      {enabled.has('instances') ? (
        <div className="field-group">
          <div className="field-title">{ko ? '인스턴스' : 'Instances'}</div>
          <div className="stack">
            {errors.instances ? <small className="field-error">{localizeError(errors.instances)}</small> : null}
            {value.instances.map((item, index) => (
              <div className="instance-card" key={`${item.name}-${index}`}>
                <div className="instance-head">
                  <strong>{ko ? `인스턴스 ${index + 1}` : `Instance ${index + 1}`}</strong>
                  {value.instances.length > 1 ? (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => setField({ instances: value.instances.filter((_, i) => i !== index) })}
                    >
                      {ko ? '제거' : 'Remove'}
                    </button>
                  ) : null}
                </div>
                <div className="grid-three">
                  <label className={fieldClass(`instances[${index}].name`)}>
                    <span>{ko ? '이름' : 'Name'}</span>
                    <input value={item.name} onChange={(e) => setInstance(index, { name: e.target.value })} />
                    {errors[`instances[${index}].name`] ? <small className="field-error">{localizeError(errors[`instances[${index}].name`])}</small> : null}
                  </label>
                  <label className={fieldClass(`instances[${index}].image`)}>
                    <span>{ko ? '이미지' : 'Image'}</span>
                    {imageOptions.length ? (
                      <select value={item.image} onChange={(e) => setInstance(index, { image: e.target.value })}>
                        {imageOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={item.image} onChange={(e) => setInstance(index, { image: e.target.value })} />
                    )}
                    {errors[`instances[${index}].image`] ? <small className="field-error">{localizeError(errors[`instances[${index}].image`])}</small> : null}
                  </label>
                  <label className={fieldClass(`instances[${index}].flavor`)}>
                    <span>{ko ? '플레이버' : 'Flavor'}</span>
                    {flavorOptions.length ? (
                      <select value={item.flavor} onChange={(e) => setInstance(index, { flavor: e.target.value })}>
                        {flavorOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={item.flavor} onChange={(e) => setInstance(index, { flavor: e.target.value })} />
                    )}
                    {errors[`instances[${index}].flavor`] ? <small className="field-error">{localizeError(errors[`instances[${index}].flavor`])}</small> : null}
                  </label>
                </div>
                <div className="grid-two">
                  <label className="field">
                    <span>{ko ? 'SSH 키 이름' : 'SSH key name'}</span>
                    {keyPairOptions.length ? (
                      <select value={item.ssh_key_name || ''} onChange={(e) => setInstance(index, { ssh_key_name: e.target.value || undefined })}>
                        <option value="">{ko ? '없음' : 'None'}</option>
                        {keyPairOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={item.ssh_key_name || ''}
                        onChange={(e) => setInstance(index, { ssh_key_name: e.target.value })}
                      />
                    )}
                  </label>
                  <label className={fieldClass(`instances[${index}].count`)}>
                    <span>{ko ? '수량' : 'Count'}</span>
                    <input
                      type="number"
                      min={1}
                      max={2}
                      value={item.count}
                      onChange={(e) => setInstance(index, { count: Number(e.target.value) })}
                    />
                    {errors[`instances[${index}].count`] ? <small className="field-error">{localizeError(errors[`instances[${index}].count`])}</small> : null}
                  </label>
                </div>
              </div>
            ))}
            {value.instances.length < 2 ? (
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setField({
                    instances: value.instances.concat({
                      name: `worker-${value.instances.length + 1}`,
                      image: 'ubuntu-22.04',
                      flavor: 'm1.small',
                      ssh_key_name: '',
                      count: 1,
                    }),
                  })
                }
              >
                {ko ? '인스턴스 추가' : 'Add instance'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {enabled.has('security') ? (
        <div className="field-group">
          <div className="field-title">{ko ? '보안 참조' : 'Security references'}</div>
          {securityGroupOptions.length ? (
            <div className={fieldClass('security_groups')}>
              <span>{ko ? '보안 그룹 (공급자 목록)' : 'Security groups (provider list)'}</span>
              <div className="stack-list" style={{ marginTop: 10 }}>
                {securityGroupOptions.map((name) => {
                  const checked = (value.security_groups || []).includes(name)
                  return (
                    <label key={name} className="checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setField({
                            security_groups: toggleSecurityGroup(value.security_groups, name, e.target.checked),
                          })
                        }
                      />
                      <span>{name}</span>
                    </label>
                  )
                })}
              </div>
              {errors.security_groups ? <small className="field-error">{localizeError(errors.security_groups)}</small> : null}
            </div>
          ) : (
            <label className={fieldClass('security_groups')}>
              <span>{ko ? '보안 그룹' : 'Security groups'}</span>
              <textarea
                rows={4}
                value={joinSecurityGroups(value.security_groups)}
                onChange={(e) => setField({ security_groups: splitSecurityGroups(e.target.value) })}
                placeholder={ko ? 'sg-web, sg-data' : 'sg-web, sg-data'}
              />
              {errors.security_groups ? <small className="field-error">{localizeError(errors.security_groups)}</small> : null}
            </label>
          )}
        </div>
      ) : null}
      {networkOptions.length ? (
        <datalist id="network-name-options">
          {networkOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}
    </div>
  )
}
