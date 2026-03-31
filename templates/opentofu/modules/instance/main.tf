locals {
  flat_instances = flatten([
    for spec in var.instances : [
      for idx in range(spec.count) : {
        name            = spec.name
        image           = spec.image
        flavor          = spec.flavor
        ssh_key_name    = try(spec.ssh_key_name, null)
        security_groups = try(spec.security_groups, [])
        ordinal         = idx
      }
    ]
  ])

  inst_map = {
    for inst in local.flat_instances :
    "${inst.name}-${inst.ordinal}" => inst
  }
}

resource "openstack_networking_port_v2" "this" {
  for_each = local.inst_map

  name       = "${var.name_prefix}-${each.key}"
  network_id = var.network_id

  fixed_ip {
    subnet_id = var.subnet_id
  }

  security_group_ids = []
}

resource "openstack_compute_instance_v2" "this" {
  for_each = local.inst_map

  name      = "${var.name_prefix}-${each.key}"
  image_name  = each.value.image
  flavor_name = each.value.flavor
  key_pair    = each.value.ssh_key_name

  security_groups = length(each.value.security_groups) > 0 ? each.value.security_groups : null

  network {
    port = openstack_networking_port_v2.this[each.key].id
  }
}
