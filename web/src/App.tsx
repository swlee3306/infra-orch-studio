import React from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { auth } from './api'
import AuditPage from './pages/Audit'
import DashboardPage from './pages/Dashboard'
import ApprovalControlPage from './pages/ApprovalControl'
import CreateEnvironmentPage from './pages/CreateEnvironment'
import EnvironmentDetailPage from './pages/EnvironmentDetail'
import EnvironmentsPage from './pages/Environments'
import JobDetailPage from './pages/JobDetail'
import JobsPage from './pages/Jobs'
import LoginPage from './pages/Login'
import PlanReviewPage from './pages/PlanReview'
import TemplatesPage from './pages/Templates'

export default function App() {
  const nav = useNavigate()
  const location = useLocation()
  const isAuthRoute = location.pathname === '/login'
  const title = (() => {
    if (location.pathname.startsWith('/create-environment')) return 'Create Environment'
    if (location.pathname.startsWith('/audit')) return 'Audit'
    if (location.pathname.startsWith('/templates')) return 'Templates'
    if (location.pathname.includes('/review')) return 'Plan Review'
    if (location.pathname.includes('/approval')) return 'Approval Control'
    if (location.pathname.startsWith('/environments/')) return 'Environment Detail'
    if (location.pathname.startsWith('/environments')) return 'Environments'
    if (location.pathname.startsWith('/jobs/')) return 'Execution Detail'
    if (location.pathname.startsWith('/jobs')) return 'Executions'
    return 'Dashboard'
  })()

  return (
    <>
      {isAuthRoute ? null : (
        <div className="app-shell">
          <aside className="app-sidebar">
            <Link to="/dashboard" className="brand brand-link">
              <div className="brand-mark" />
              <div className="brand-copy">
                <h1>Ops//Core</h1>
                <p>Environment orchestration control plane</p>
              </div>
            </Link>
            <nav className="sidebar-nav">
              <Link to="/dashboard" className={`nav-item ${location.pathname === '/dashboard' || location.pathname === '/' ? 'nav-item-active' : ''}`}>
                <span className="nav-index">01</span>
                <span>Dashboard</span>
              </Link>
              <Link to="/environments" className={`nav-item ${location.pathname.startsWith('/environments') ? 'nav-item-active' : ''}`}>
                <span className="nav-index">02</span>
                <span>Environments</span>
              </Link>
              <Link to="/create-environment" className={`nav-item ${location.pathname.startsWith('/create-environment') ? 'nav-item-active' : ''}`}>
                <span className="nav-index">03</span>
                <span>Create Flow</span>
              </Link>
              <Link to="/jobs" className={`nav-item ${location.pathname.startsWith('/jobs') ? 'nav-item-active' : ''}`}>
                <span className="nav-index">04</span>
                <span>Executions</span>
              </Link>
              <Link to="/templates" className={`nav-item ${location.pathname.startsWith('/templates') ? 'nav-item-active' : ''}`}>
                <span className="nav-index">05</span>
                <span>Templates</span>
              </Link>
              <Link to="/audit" className={`nav-item ${location.pathname.startsWith('/audit') ? 'nav-item-active' : ''}`}>
                <span className="nav-index">06</span>
                <span>Audit</span>
              </Link>
            </nav>
            <div className="sidebar-foot">
              <div className="sidebar-foot-copy">
                <strong>Plan {'->'} Approval {'->'} Apply {'->'} Result</strong>
                <p>Use environment detail as the primary operating surface.</p>
              </div>
              <button
                className="ghost sidebar-logout"
                onClick={async () => {
                  try {
                    await auth.logout()
                  } finally {
                    nav('/login')
                  }
                }}
              >
                Logout
              </button>
            </div>
          </aside>

          <main className="app-main">
            <header className="app-topbar">
              <div>
                <div className="page-kicker">Infra Orchestration SaaS v2</div>
                <h2>{title}</h2>
              </div>
            </header>

            <div className="app-content">
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/create-environment" element={<CreateEnvironmentPage />} />
                <Route path="/environments" element={<EnvironmentsPage />} />
                <Route path="/environments/:id" element={<EnvironmentDetailPage />} />
                <Route path="/environments/:id/review" element={<PlanReviewPage />} />
                <Route path="/environments/:id/approval" element={<ApprovalControlPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/jobs/:id" element={<JobDetailPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/audit" element={<AuditPage />} />
                <Route path="*" element={<DashboardPage />} />
              </Routes>
            </div>
          </main>
        </div>
      )}
      {isAuthRoute ? (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      ) : null}
    </>
  )
}
