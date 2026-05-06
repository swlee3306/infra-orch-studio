locals {
  flat_instances = flatten([
    for spec in var.instances : [
      for idx in range(spec.count) : {
        name            = spec.name
        image           = spec.image
        flavor          = spec.flavor
        ssh_key_name    = try(spec.ssh_key_name, null)
        security_groups = coalesce(try(spec.security_groups, null), [])
        ordinal         = idx
      }
    ]
  ])

  inst_map = {
    for inst in local.flat_instances :
    "${inst.name}-${inst.ordinal}" => inst
  }

  security_group_names = toset(flatten([
    for inst in local.flat_instances : inst.security_groups
  ]))

  uuid_pattern = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
}

data "openstack_networking_secgroup_v2" "selected" {
  for_each = local.security_group_names

  name = each.value
}

resource "openstack_networking_port_v2" "this" {
  for_each = local.inst_map

  name       = "${var.name_prefix}-${each.key}"
  network_id = var.network_id

  fixed_ip {
    subnet_id = var.subnet_id
  }

  security_group_ids = [
    for name in each.value.security_groups :
    data.openstack_networking_secgroup_v2.selected[name].id
  ]
}

resource "openstack_compute_instance_v2" "this" {
  for_each = local.inst_map

  name        = "${var.name_prefix}-${each.key}"
  image_id    = startswith(each.value.image, "id:") ? trimprefix(each.value.image, "id:") : (can(regex(local.uuid_pattern, each.value.image)) ? each.value.image : null)
  image_name  = startswith(each.value.image, "id:") || can(regex(local.uuid_pattern, each.value.image)) ? null : each.value.image
  flavor_id   = startswith(each.value.flavor, "id:") ? trimprefix(each.value.flavor, "id:") : (can(regex(local.uuid_pattern, each.value.flavor)) ? each.value.flavor : null)
  flavor_name = startswith(each.value.flavor, "id:") || can(regex(local.uuid_pattern, each.value.flavor)) ? null : each.value.flavor
  key_pair    = each.value.ssh_key_name

  network {
    port = openstack_networking_port_v2.this[each.key].id
  }
}
