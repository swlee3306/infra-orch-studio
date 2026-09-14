# Public deployment boundary

Prepared on 2026-09-14 on the local `security/public-example-2026-09-14` branch.
This change must not be merged into a branch followed by an operating GitOps
controller until that controller's source and sync policy are checked.

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

No operating cluster was contacted, no sync policy was changed, and no Kubernetes
resources were applied or deleted while preparing this branch. Source/manifests
on remote main remain unchanged until the external dependency is resolved.

## Local validation

`make verify` checks Go formatting, selected Go packages and local Kustomize
rendering. `npm ci --ignore-scripts` followed by `npm run build` in `web/` checks
the frontend. Rendering/building is not a deployment or proof of runtime behavior.
Prior internal endpoints may remain in Git history; that is a separate audit.
