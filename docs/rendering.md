# Rendering (Phase 5)

## Goal
Convert the provider-agnostic domain model into:
- a selected OpenTofu template directory
- a JSON variables file (`terraform.tfvars.json`)

## Strategy
- Templates are fixed, committed in git under `templates/opentofu/environments/*`.
- Runner creates a per-job working directory under `workdirs/`.
- It copies the selected template into that directory.
- It generates `terraform.tfvars.json` from the rendering layer.

## Example output layout
```
workdirs/
  job-<id>/
    main.tf
    variables.tf
    ... (template files)
    terraform.tfvars.json   # generated
```

## Safety rules
- Template name is a single path segment (no slashes).
- Template path must stay under TemplatesRoot.
- Symlinks inside templates are rejected.
