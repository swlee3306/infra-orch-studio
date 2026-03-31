output "instance_ids" {
  value = [for k, v in openstack_compute_instance_v2.this : v.id]
}

output "instance_fixed_ips" {
  value = {
    for k, p in openstack_networking_port_v2.this :
    k => p.all_fixed_ips
  }
}
