import React from 'react'
import type { EnvironmentSpec, Instance } from '../api'

type Props = {
  value: EnvironmentSpec
  onChange: (next: EnvironmentSpec) => void
  sections?: Array<'environment' | 'tenant' | 'network' | 'instances' | 'security'>
  errors?: Record<string, string>
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

export default function EnvironmentSpecForm({ value, onChange, sections, errors = {} }: Props) {
  const setField = (patch: Partial<EnvironmentSpec>) => onChange({ ...value, ...patch })
  const enabled = new Set(sections || ['environment', 'tenant', 'network', 'instances', 'security'])

  const setNetwork = (patch: Partial<EnvironmentSpec['network']>) =>
    setField({ network: { ...value.network, ...patch } })

  const setSubnet = (patch: Partial<EnvironmentSpec['subnet']>) =>
    setField({ subnet: { ...value.subnet, ...patch } })

  const setInstance = (index: number, patch: Partial<Instance>) =>
    setField({ instances: updateInstance(value.instances, index, patch) })

  const fieldClass = (key: string) => `field ${errors[key] ? 'field-invalid' : ''}`

  return (
    <div className="form-grid">
      {enabled.has('environment') ? (
          <label className={fieldClass('environment_name')}>
            <span>Environment name</span>
            <input value={value.environment_name} onChange={(e) => setField({ environment_name: e.target.value })} />
            {errors.environment_name ? <small className="field-error">{errors.environment_name}</small> : null}
          </label>
      ) : null}

      {enabled.has('tenant') ? (
        <>
          <label className={fieldClass('tenant_name')}>
            <span>Tenant name</span>
            <input value={value.tenant_name} onChange={(e) => setField({ tenant_name: e.target.value })} />
            {errors.tenant_name ? <small className="field-error">{errors.tenant_name}</small> : null}
          </label>
        </>
      ) : null}

      {enabled.has('network') ? (
        <>
          <div className="field-group">
            <div className="field-title">Network</div>
            <div className="grid-two">
              <label className={fieldClass('network.name')}>
                <span>Name</span>
                <input value={value.network.name} onChange={(e) => setNetwork({ name: e.target.value })} />
                {errors['network.name'] ? <small className="field-error">{errors['network.name']}</small> : null}
              </label>
              <label className={fieldClass('network.cidr')}>
                <span>CIDR</span>
                <input value={value.network.cidr} onChange={(e) => setNetwork({ cidr: e.target.value })} />
                {errors['network.cidr'] ? <small className="field-error">{errors['network.cidr']}</small> : null}
              </label>
            </div>
          </div>

          <div className="field-group">
            <div className="field-title">Subnet</div>
            <div className="grid-three">
              <label className={fieldClass('subnet.name')}>
                <span>Name</span>
                <input value={value.subnet.name} onChange={(e) => setSubnet({ name: e.target.value })} />
                {errors['subnet.name'] ? <small className="field-error">{errors['subnet.name']}</small> : null}
              </label>
              <label className={fieldClass('subnet.cidr')}>
                <span>CIDR</span>
                <input value={value.subnet.cidr} onChange={(e) => setSubnet({ cidr: e.target.value })} />
                {errors['subnet.cidr'] ? <small className="field-error">{errors['subnet.cidr']}</small> : null}
              </label>
              <label className="field">
                <span>Gateway IP</span>
                <input value={value.subnet.gateway_ip || ''} onChange={(e) => setSubnet({ gateway_ip: e.target.value })} />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={value.subnet.enable_dhcp}
                onChange={(e) => setSubnet({ enable_dhcp: e.target.checked })}
              />
              <span>Enable DHCP</span>
            </label>
          </div>
        </>
      ) : null}

      {enabled.has('instances') ? (
        <div className="field-group">
          <div className="field-title">Instances</div>
          <div className="stack">
            {errors.instances ? <small className="field-error">{errors.instances}</small> : null}
            {value.instances.map((item, index) => (
              <div className="instance-card" key={`${item.name}-${index}`}>
                <div className="instance-head">
                  <strong>Instance {index + 1}</strong>
                  {value.instances.length > 1 ? (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => setField({ instances: value.instances.filter((_, i) => i !== index) })}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid-three">
                  <label className={fieldClass(`instances[${index}].name`)}>
                    <span>Name</span>
                    <input value={item.name} onChange={(e) => setInstance(index, { name: e.target.value })} />
                    {errors[`instances[${index}].name`] ? <small className="field-error">{errors[`instances[${index}].name`]}</small> : null}
                  </label>
                  <label className={fieldClass(`instances[${index}].image`)}>
                    <span>Image</span>
                    <input value={item.image} onChange={(e) => setInstance(index, { image: e.target.value })} />
                    {errors[`instances[${index}].image`] ? <small className="field-error">{errors[`instances[${index}].image`]}</small> : null}
                  </label>
                  <label className={fieldClass(`instances[${index}].flavor`)}>
                    <span>Flavor</span>
                    <input value={item.flavor} onChange={(e) => setInstance(index, { flavor: e.target.value })} />
                    {errors[`instances[${index}].flavor`] ? <small className="field-error">{errors[`instances[${index}].flavor`]}</small> : null}
                  </label>
                </div>
                <div className="grid-two">
                  <label className="field">
                    <span>SSH key name</span>
                    <input
                      value={item.ssh_key_name || ''}
                      onChange={(e) => setInstance(index, { ssh_key_name: e.target.value })}
                    />
                  </label>
                  <label className={fieldClass(`instances[${index}].count`)}>
                    <span>Count</span>
                    <input
                      type="number"
                      min={1}
                      max={2}
                      value={item.count}
                      onChange={(e) => setInstance(index, { count: Number(e.target.value) })}
                    />
                    {errors[`instances[${index}].count`] ? <small className="field-error">{errors[`instances[${index}].count`]}</small> : null}
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
                Add instance
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {enabled.has('security') ? (
        <div className="field-group">
          <div className="field-title">Security references</div>
          <label className={fieldClass('security_groups')}>
            <span>Security groups</span>
            <textarea
              rows={4}
              value={joinSecurityGroups(value.security_groups)}
              onChange={(e) => setField({ security_groups: splitSecurityGroups(e.target.value) })}
              placeholder="sg-web, sg-data"
            />
            {errors.security_groups ? <small className="field-error">{errors.security_groups}</small> : null}
          </label>
        </div>
      ) : null}
    </div>
  )
}
