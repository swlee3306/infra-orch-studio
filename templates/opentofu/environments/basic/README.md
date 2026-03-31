# basic environment template (OpenStack)

This template provisions:
- 1 network
- 1 subnet
- 1..N instances

It is designed to be used as **fixed template + variable injection**.

## Inputs
See `variables.tf` and the example `terraform.tfvars.json`.

## Assumptions (MVP)
- OpenStack credentials are provided via variables (later we may support clouds.yaml or env-based auth).
- Network is created by this template.
- Floating IP is **not** managed yet (can be added later).
