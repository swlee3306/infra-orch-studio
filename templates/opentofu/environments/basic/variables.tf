variable "openstack_auth_url" {
  type        = string
  description = "OpenStack Keystone auth URL (e.g. https://keystone:5000/v3)"
}

variable "openstack_region" {
  type        = string
  description = "OpenStack region name"
}

variable "openstack_tenant_name" {
  type        = string
  description = "Project/Tenant name"
}

variable "openstack_username" {
  type        = string
  description = "OpenStack username"
}

variable "openstack_password" {
  type        = string
  sensitive   = true
  description = "OpenStack password"
}

variable "openstack_user_domain_name" {
  type        = string
  default     = ""
  description = "User domain name (optional)"
}

variable "openstack_project_domain_name" {
  type        = string
  default     = ""
  description = "Project domain name (optional)"
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
