terraform {
  required_version = ">= 1.7.0"

  required_providers {
    openstack = {
      source  = "hashicorp/openstack"
      version = ">= 1.54.0"
    }
  }
}
