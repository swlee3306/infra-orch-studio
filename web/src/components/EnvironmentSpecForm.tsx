import React from 'react'
import type { EnvironmentSpec, Instance } from '../api'

type Props = {
  value: EnvironmentSpec
  onChange: (next: EnvironmentSpec) => void
}

function updateInstance(items: Instance[], index: number, patch: Partial<Instance>): Instance[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item))
}

export default function EnvironmentSpecForm({ value, onChange }: Props) {
  const setField = (patch: Partial<EnvironmentSpec>) => onChange({ ...value, ...patch })

  const setNetwork = (patch: Partial<EnvironmentSpec['network']>) =>
    setField({ network: { ...value.network, ...patch } })

  const setSubnet = (patch: Partial<EnvironmentSpec['subnet']>) =>
    setField({ subnet: { ...value.subnet, ...patch } })

  const setInstance = (index: number, patch: Partial<Instance>) =>
    setField({ instances: updateInstance(value.instances, index, patch) })

  return (
    <div className="form-grid">
      <label className="field">
        <span>Environment name</span>
        <input value={value.environment_name} onChange={(e) => setField({ environment_name: e.target.value })} />
      </label>

      <label className="field">
        <span>Tenant name</span>
        <input value={value.tenant_name} onChange={(e) => setField({ tenant_name: e.target.value })} />
      </label>

      <div className="field-group">
        <div className="field-title">Network</div>
        <div className="grid-two">
          <label className="field">
            <span>Name</span>
            <input value={value.network.name} onChange={(e) => setNetwork({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>CIDR</span>
            <input value={value.network.cidr} onChange={(e) => setNetwork({ cidr: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="field-group">
        <div className="field-title">Subnet</div>
        <div className="grid-three">
          <label className="field">
            <span>Name</span>
            <input value={value.subnet.name} onChange={(e) => setSubnet({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>CIDR</span>
            <input value={value.subnet.cidr} onChange={(e) => setSubnet({ cidr: e.target.value })} />
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

      <div className="field-group">
        <div className="field-title">Instances</div>
        <div className="stack">
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
                <label className="field">
                  <span>Name</span>
                  <input value={item.name} onChange={(e) => setInstance(index, { name: e.target.value })} />
                </label>
                <label className="field">
                  <span>Image</span>
                  <input value={item.image} onChange={(e) => setInstance(index, { image: e.target.value })} />
                </label>
                <label className="field">
                  <span>Flavor</span>
                  <input value={item.flavor} onChange={(e) => setInstance(index, { flavor: e.target.value })} />
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
                <label className="field">
                  <span>Count</span>
                  <input
                    type="number"
                    min={1}
                    max={2}
                    value={item.count}
                    onChange={(e) => setInstance(index, { count: Number(e.target.value) })}
                  />
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
    </div>
  )
}

