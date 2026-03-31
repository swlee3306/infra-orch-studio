
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
