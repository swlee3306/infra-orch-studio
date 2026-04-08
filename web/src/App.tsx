import React from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { auth } from './api'
import GuidePanel from './components/GuidePanel'
import { RouteGuideKey, useI18n } from './i18n'
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
import UsersPage from './pages/Users'

export default function App() {
  const nav = useNavigate()
  const location = useLocation()
  const { locale, setLocale, copy } = useI18n()
  const isAuthRoute = location.pathname === '/login'
  const routeKey = (() => {
    if (location.pathname.startsWith('/create-environment')) return 'create'
    if (location.pathname.startsWith('/audit')) return 'audit'
    if (location.pathname.startsWith('/templates')) return 'templates'
    if (location.pathname.startsWith('/users')) return 'users'
    if (location.pathname.includes('/review')) return 'review'
    if (location.pathname.includes('/approval')) return 'approval'
    if (location.pathname.startsWith('/environments/')) return 'environmentDetail'
    if (location.pathname.startsWith('/environments')) return 'environments'
    if (location.pathname.startsWith('/jobs/')) return 'jobDetail'
    if (location.pathname.startsWith('/jobs')) return 'jobs'
    return 'dashboard'
  })()
  const title = copy.shell.routeTitles[routeKey as RouteGuideKey]

  return (
    <>
      {isAuthRoute ? null : (
        <div className="app-shell">
          <aside className="app-sidebar">
            <div className="app-sidebar-head">
              <Link to="/dashboard" className="brand brand-link">
                <div className="brand-mark" />
                <div className="brand-copy">
                  <h1>{copy.shell.brandTitle}</h1>
                  <p>{copy.shell.brandSubtitle}</p>
                </div>
              </Link>
              <nav className="sidebar-nav">
                <Link to="/dashboard" className={`nav-item nav-item-compact ${location.pathname === '/dashboard' || location.pathname === '/' ? 'nav-item-active' : ''}`}>
                  <span className="nav-index">01</span>
                  <span>{copy.shell.nav.dashboard}</span>
                </Link>
                <Link to="/environments" className={`nav-item nav-item-compact ${location.pathname.startsWith('/environments') ? 'nav-item-active' : ''}`}>
                  <span className="nav-index">02</span>
                  <span>{copy.shell.nav.environments}</span>
                </Link>
                <Link to="/create-environment" className={`nav-item nav-item-compact ${location.pathname.startsWith('/create-environment') ? 'nav-item-active' : ''}`}>
                  <span className="nav-index">03</span>
                  <span>{copy.shell.nav.create}</span>
                </Link>
                <Link to="/jobs" className={`nav-item nav-item-compact ${location.pathname.startsWith('/jobs') ? 'nav-item-active' : ''}`}>
                  <span className="nav-index">04</span>
                  <span>{copy.shell.nav.jobs}</span>
                </Link>
                <Link to="/templates" className={`nav-item nav-item-compact ${location.pathname.startsWith('/templates') ? 'nav-item-active' : ''}`}>
                  <span className="nav-index">05</span>
                  <span>{copy.shell.nav.templates}</span>
                </Link>
                <Link to="/audit" className={`nav-item nav-item-compact ${location.pathname.startsWith('/audit') ? 'nav-item-active' : ''}`}>
                  <span className="nav-index">06</span>
                  <span>{copy.shell.nav.audit}</span>
                </Link>
                <Link to="/users" className={`nav-item nav-item-compact ${location.pathname.startsWith('/users') ? 'nav-item-active' : ''}`}>
                  <span className="nav-index">07</span>
                  <span>{copy.shell.nav.users}</span>
                </Link>
              </nav>
            </div>
            <div className="sidebar-foot">
            <div className="sidebar-foot-copy">
                <strong>{copy.shell.workflowTitle}</strong>
                <p>{copy.shell.workflowHint}</p>
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
                {copy.shell.logout}
              </button>
            </div>
          </aside>

          <main className="app-main">
            <header className="app-topbar">
              <div className="topbar-head">
                <div>
                <div className="page-kicker">{copy.shell.topbarKicker}</div>
                <h2>{title}</h2>
                </div>
                <div className="locale-toggle" aria-label="Language toggle">
                  <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>
                    EN
                  </button>
                  <button type="button" className={locale === 'ko' ? 'active' : ''} onClick={() => setLocale('ko')}>
                    KR
                  </button>
                </div>
              </div>
            </header>

            <div className="app-content">
              <GuidePanel routeKey={routeKey as RouteGuideKey} />
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
                <Route path="/users" element={<UsersPage />} />
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
