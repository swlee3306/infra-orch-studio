export type User = {
  id: string
  email: string
  is_admin?: boolean
  is_disabled?: boolean
  created_at?: string
  updated_at?: string
}

export type Network = {
  name: string
  cidr: string
}

export type Subnet = {
  name: string
  cidr: string
  gateway_ip?: string
  enable_dhcp: boolean
}

export type Instance = {
  name: string
  image: string
  flavor: string
  ssh_key_name?: string
  count: number
}

export type EnvironmentSpec = {
  environment_name: string
  tenant_name: string
  network: Network
  subnet: Subnet
  instances: Instance[]
  security_groups?: string[]
}

export type Job = {
  id: string
  type: string
  status: string
  created_at: string
  updated_at: string
  environment_id?: string
  operation?: string
  template_name?: string
  workdir?: string
  log_dir?: string
  plan_path?: string
  source_job_id?: string
  outputs_json?: string
  retry_count?: number
  max_retries?: number
  requested_by?: string
  error?: string
  environment?: any
}

export type JobListResponse = {
  items: Job[]
  viewer: User
}

export type Environment = {
  id: string
  name: string
  status: string
  operation: string
  approval_status: string
  spec: EnvironmentSpec
  created_by_user_id?: string
  created_by_email?: string
  approved_by_user_id?: string
  approved_by_email?: string
  approved_at?: string
  last_plan_job_id?: string
  last_apply_job_id?: string
  last_job_id?: string
  last_error?: string
  retry_count?: number
  max_retries?: number
  workdir?: string
  plan_path?: string
  outputs_json?: string
  revision?: number
  created_at: string
  updated_at: string
}

export type AuditEvent = {
  id: string
  resource_type: string
  resource_id: string
  action: string
  actor_user_id?: string
  actor_email?: string
  message?: string
  metadata_json?: string
  created_at: string
}

export type EnvironmentListResponse = {
  items: Environment[]
  viewer: User
}

export type EnvironmentMutationResponse = {
  environment: Environment
  job?: Job
}

export type EnvironmentAuditResponse = {
  items: AuditEvent[]
}

export type EnvironmentJobsResponse = {
  items: Job[]
}

export type EnvironmentArtifactsResponse = {
  environment_id: string
  workdir?: string
  plan_path?: string
  outputs_json?: string
  last_plan_job?: Job | null
  last_apply_job?: Job | null
}

export type AuditFeedResponse = {
  items: AuditEvent[]
  viewer: User
  resource_type?: string
  resource_id?: string
  limit: number
}

export type TemplateDescriptor = {
  name: string
  path: string
  files: string[]
  description?: string
}

export type TemplateCatalogResponse = {
  viewer: User
  templates_root: string
  modules_root: string
  environment_sets: TemplateDescriptor[]
  modules: TemplateDescriptor[]
}

export type ProviderConnection = {
  name: string
  region?: string
  auth_url: string
  interface?: string
  identity_interface?: string
  endpoint_override?: Record<string, string>
}

export type ProviderListResponse = {
  items: ProviderConnection[]
  default_cloud?: string
}

export type ProviderUpsertRequest = {
  name: string
  auth_url: string
  region_name?: string
  interface?: string
  identity_interface?: string
  username: string
  password: string
  project_name: string
  user_domain_name?: string
  project_domain_name?: string
  endpoint_override?: Record<string, string>
}

export type ProviderCatalog = {
  provider: string
  fetched_at: string
  images: string[]
  flavors: string[]
  networks: string[]
  instances: string[]
  image_details?: ProviderResourceDetail[]
  flavor_details?: ProviderResourceDetail[]
  network_details?: ProviderResourceDetail[]
  instance_details?: ProviderResourceDetail[]
  errors?: string[]
}

export type ProviderResourceDetail = {
  id: string
  name: string
  attributes?: Record<string, string>
}

export type TemplateValidation = {
  kind: 'environment' | 'module'
  name: string
  path: string
  files: string[]
  required_files: string[]
  missing_files: string[]
  warnings: string[]
  valid: boolean
  description?: string
  readme_exists: boolean
}

export type TemplateDetailResponse = {
  descriptor: TemplateDescriptor
  validation: TemplateValidation
}

export type ReviewSignal = {
  label: string
  detail: string
  severity: 'high' | 'medium' | 'low'
}

export type ImpactSummary = {
  downtime: string
  blast_radius: string
  cost_delta: string
}

export type EnvironmentPlanReviewResponse = {
  review_signals: ReviewSignal[]
  impact_summary: ImpactSummary
  plan_job?: Job | null
}

export type RequestDraftResponse = {
  prompt: string
  template_name: string
  spec: EnvironmentSpec
  assumptions: string[]
  warnings: string[]
  next_step: string
  requires_review: boolean
}

export type PublicConfig = {
  allow_public_signup: boolean
}

export type AdminProvisionUserRequest = {
  email: string
  password: string
  is_admin?: boolean
}

export type AdminUserStatusRequest = {
  disabled: boolean
}

export type AdminUserPasswordRequest = {
  password: string
}

export type AdminUserRoleRequest = {
  is_admin: boolean
}

export type AdminUserListResponse = {
  items: User[]
}

// VITE_API_URL should point to the API base.
// - prod (nginx proxy): "/api"
// - dev: "http://localhost:8080/api"
const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${baseUrl}${path}`
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
    credentials: 'include',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const auth = {
  publicConfig: () => req<PublicConfig>('/public-config'),
  signup: (email: string, password: string) =>
    req<User>('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    req<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req<void>('/auth/logout', { method: 'POST' }),
  me: () => req<User>('/auth/me'),
  listUsers: () => req<AdminUserListResponse>('/admin/users'),
  createUser: (payload: AdminProvisionUserRequest) =>
    req<User>('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  setUserDisabled: (id: string, payload: AdminUserStatusRequest) =>
    req<User>('/admin/users/' + id + '/disable', { method: 'POST', body: JSON.stringify(payload) }),
  setUserRole: (id: string, payload: AdminUserRoleRequest) =>
    req<User>('/admin/users/' + id + '/role', { method: 'POST', body: JSON.stringify(payload) }),
  resetUserPassword: (id: string, payload: AdminUserPasswordRequest) =>
    req<User>('/admin/users/' + id + '/password', { method: 'POST', body: JSON.stringify(payload) }),
}

export const jobs = {
  list: (limit = 50) => req<JobListResponse>('/jobs?limit=' + limit),
  get: (id: string) => req<Job>('/jobs/' + id),
  create: (environment: EnvironmentSpec, type?: string) =>
    req<Job>('/jobs', { method: 'POST', body: JSON.stringify({ type, environment }) }),
  plan: (environment: EnvironmentSpec) =>
    req<Job>('/jobs', { method: 'POST', body: JSON.stringify({ type: 'tofu.plan', environment }) }),
  apply: (id: string) => req<Job>('/jobs/' + id + '/apply', { method: 'POST' }),
}

export const environments = {
  list: (limit = 50) => req<EnvironmentListResponse>('/environments?limit=' + limit),
  get: (id: string) => req<Environment>('/environments/' + id),
  create: (spec: EnvironmentSpec, templateName?: string) =>
    req<EnvironmentMutationResponse>('/environments', {
      method: 'POST',
      body: JSON.stringify({ spec, template_name: templateName }),
    }),
  plan: (id: string, spec?: EnvironmentSpec, operation?: string, templateName?: string, expectedRevision?: number) =>
    req<EnvironmentMutationResponse>('/environments/' + id + '/plan', {
      method: 'POST',
      body: JSON.stringify({ spec, operation, template_name: templateName, expected_revision: expectedRevision }),
    }),
  approve: (id: string, payload?: { comment?: string; expected_revision?: number }) =>
    req<Environment>('/environments/' + id + '/approve', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  apply: (id: string, expectedRevision?: number) =>
    req<EnvironmentMutationResponse>('/environments/' + id + '/apply', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: expectedRevision }),
    }),
  retry: (id: string, expectedRevision?: number) =>
    req<EnvironmentMutationResponse>('/environments/' + id + '/retry', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: expectedRevision }),
    }),
  destroy: (id: string, payload: { confirmation_name: string; comment?: string; expected_revision?: number }) =>
    req<EnvironmentMutationResponse>('/environments/' + id + '/destroy', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  audit: (id: string) => req<EnvironmentAuditResponse>('/environments/' + id + '/audit'),
  jobs: (id: string) => req<EnvironmentJobsResponse>('/environments/' + id + '/jobs'),
  artifacts: (id: string) => req<EnvironmentArtifactsResponse>('/environments/' + id + '/artifacts'),
  planReview: (id: string) => req<EnvironmentPlanReviewResponse>('/environments/' + id + '/plan-review'),
  previewPlanReview: (payload: {
    spec: EnvironmentSpec
    operation?: 'create' | 'update' | 'destroy'
    template_name?: string
  }) =>
    req<EnvironmentPlanReviewResponse>('/environments/plan-review-preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}

export const templates = {
  list: () => req<TemplateCatalogResponse>('/templates'),
  get: (kind: 'environment' | 'module', name: string) => req<TemplateDetailResponse>(`/templates/${kind}/${name}`),
  validate: (kind: 'environment' | 'module', name: string) => req<TemplateValidation>(`/templates/${kind}/${name}/validate`, { method: 'POST' }),
}

export const providers = {
  list: () => req<ProviderListResponse>('/providers'),
  upsert: (payload: ProviderUpsertRequest) =>
    req<ProviderConnection>('/providers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resources: (name: string) => req<ProviderCatalog>(`/providers/${encodeURIComponent(name)}/resources`),
}

export const audit = {
  list: (params?: { limit?: number; resource_type?: string; resource_id?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.resource_type) query.set('resource_type', params.resource_type)
    if (params?.resource_id) query.set('resource_id', params.resource_id)
    const suffix = query.toString()
    return req<AuditFeedResponse>(`/audit${suffix ? `?${suffix}` : ''}`)
  },
}

export const requestDrafts = {
  generate: (prompt: string) =>
    req<RequestDraftResponse>('/request-drafts', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
}

export function wsUrl(): string {
  // WebSocket is served at /ws (not under /api). For relative baseUrl ("/api"),
  // use the current page host.
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  if (baseUrl.startsWith('http')) {
    const u = new URL(baseUrl)
    return `${wsProto}//${u.host}/ws`
  }
  return `${wsProto}//${window.location.host}/ws`
}
