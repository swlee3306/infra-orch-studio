# OpenTofu templates

## MVP strategy
- **Fixed** template/module layout committed in git
- Runner renders a working directory by copying the selected environment template and injecting a vars file
- We avoid generating arbitrary `.tf` files dynamically in early versions

## Layout
- `templates/opentofu/environments/basic` : root environment template
- `templates/opentofu/modules/network` : network + subnet
- `templates/opentofu/modules/instance` : ports + instances

## How to try manually (local)
> This is optional; Phase 4 does not require running tofu yet.

```bash
cd templates/opentofu/environments/basic
cp terraform.tfvars.json.example terraform.tfvars.json
# edit credentials + names

tofu init

tofu plan -var-file=terraform.tfvars.json
# tofu apply -var-file=terraform.tfvars.json
```

## Notes
- We currently configure OpenStack provider via variables. Later we can support `clouds.yaml` and/or environment variables.
- Floating IP and router/external network wiring are intentionally left out of MVP Phase 4.
