output "network_id" {
  value = module.network.network_id
}

output "subnet_id" {
  value = module.network.subnet_id
}

output "instance_ids" {
  value = module.instances.instance_ids
}

output "instance_fixed_ips" {
  value = module.instances.instance_fixed_ips
}
