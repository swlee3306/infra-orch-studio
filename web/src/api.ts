export type User = {
  id: string
  email: string
  is_admin?: boolean
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
  template_name?: string
  workdir?: string
  plan_path?: string
  source_job_id?: string
  error?: string
  environment?: any
}

export type JobListResponse = {
  items: Job[]
  viewer: User
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
  signup: (email: string, password: string) =>
    req<User>('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    req<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req<void>('/auth/logout', { method: 'POST' }),
  me: () => req<User>('/auth/me'),
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
