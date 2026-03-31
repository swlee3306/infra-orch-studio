provider "openstack" {
  # Use clouds.yaml based auth to avoid handling passwords in tfvars.
  # The cloud definition should be present in the given config file.
  cloud       = var.openstack_cloud
  config_path = var.openstack_config_path
}
