# Public deployment boundary

Public-example transition verified on 2026-09-14.
Do not point an operating GitOps controller at this branch without replacing
the example configuration and reviewing its source and sync policy.

## GitHub Actions

The former `api-ci` and `web-ci` deployment workflows are disabled in GitHub.
Their replacement definitions have no push trigger, no self-hosted runner,
read-only repository permissions, and only print a notice if manually enabled
and dispatched. They do not build/push images, change image tags or push commits.
The separate `CI` workflow remains enabled for Go validation and frontend builds.

## Example-only endpoints

Internal image registries and endpoint examples have been replaced with
`registry.example.invalid`, `ingress.example.invalid` and
`openstack.example.invalid`. These do not provide working images or services.
Existing historical image tags are not a claim that those images exist at the
example registry. Do not apply these manifests to an operating cluster.

## Separate GitOps control

Disabling GitHub Actions does not disable Argo CD or Jenkins. Historical operation
notes refer to those systems, but the current external Application configuration
is not recorded here. Before publishing these manifest changes to the tracked
branch, the deployment owner must verify the repository, revision, source path
and sync policy and detach/pin the operating deployment as appropriate.

Before publication, the owner authorized disabling the existing Argo CD
Application's automated sync and pinning its source to the previously Synced
commit. The Application remained Healthy/Synced after that configuration change;
no manual sync, workload restart or resource deletion was requested. Deployment
coordinates and operational configuration are intentionally not published here.
Future operational updates should use separately maintained private manifests,
not restore tracking of this public example branch.

## Local validation

`make verify` checks Go formatting, selected Go packages and local Kustomize
rendering. `npm ci --ignore-scripts` followed by `npm run build` in `web/` checks
the frontend. Rendering/building is not a deployment or proof of runtime behavior.
Prior internal endpoints may remain in Git history; that is a separate audit.
