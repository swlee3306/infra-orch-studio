locals {
  name_prefix = var.environment_name
}

module "network" {
  source = "../../modules/network"

  name_prefix = local.name_prefix
  network     = var.network
  subnet      = var.subnet
}

module "instances" {
  source = "../../modules/instance"

  name_prefix     = local.name_prefix
  network_id      = module.network.network_id
  subnet_id       = module.network.subnet_id
  instances       = var.instances
}
