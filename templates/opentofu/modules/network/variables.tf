variable "name_prefix" {
  type        = string
  description = "Prefix for resource names"
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
