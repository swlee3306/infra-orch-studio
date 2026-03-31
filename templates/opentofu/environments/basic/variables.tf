variable "openstack_cloud" {
  type        = string
  description = "Cloud name in clouds.yaml (OS_CLOUD)"
}

variable "openstack_config_path" {
  type        = string
  description = "Absolute path to clouds.yaml (OS_CLIENT_CONFIG_FILE)"
}

variable "environment_name" {
  type        = string
  description = "Environment name (used for naming resources)"
}

variable "network" {
  type = object({
    name = string
    cidr = string
  })
}

variable "subnet" {
  type = object({
    name        = string
    cidr        = string
    gateway_ip  = optional(string)
    enable_dhcp = bool
  })
}

variable "instances" {
  type = list(object({
    name          = string
    image         = string
    flavor        = string
    count         = number
    ssh_key_name  = optional(string)
    security_groups = optional(list(string))
  }))
}
