variable "name_prefix" {
  type        = string
  description = "Prefix for resource names"
}

variable "network_id" {
  type        = string
  description = "OpenStack network id"
}

variable "subnet_id" {
  type        = string
  description = "OpenStack subnet id"
}

variable "instances" {
  type = list(object({
    name            = string
    image           = string
    flavor          = string
    count           = number
    ssh_key_name    = optional(string)
    security_groups = optional(list(string))
  }))
}
