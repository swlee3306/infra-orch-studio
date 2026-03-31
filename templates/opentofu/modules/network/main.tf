resource "openstack_networking_network_v2" "this" {
  name           = "${var.name_prefix}-${var.network.name}"
  admin_state_up = true
}

resource "openstack_networking_subnet_v2" "this" {
  name            = "${var.name_prefix}-${var.subnet.name}"
  network_id      = openstack_networking_network_v2.this.id
  cidr            = var.subnet.cidr
  ip_version      = 4
  enable_dhcp     = var.subnet.enable_dhcp
  gateway_ip      = try(var.subnet.gateway_ip, null)
}
