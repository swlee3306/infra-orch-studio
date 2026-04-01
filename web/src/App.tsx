import React from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { auth } from './api'
import JobDetailPage from './pages/JobDetail'
import JobsPage from './pages/Jobs'
import LoginPage from './pages/Login'

export default function App() {
  const nav = useNavigate()
  const location = useLocation()
  const isAuthRoute = location.pathname === '/login'

  return (
    <>
      {isAuthRoute ? null : (
        <div className="shell">
          <header className="shell-header">
            <Link to="/jobs" style={{ textDecoration: 'none' }}>
              <div className="brand">
                <h1>Infra Orch Studio</h1>
                <p>Operator console for plan, apply, and runtime visibility</p>
              </div>
            </Link>
            <div className="nav">
              <Link to="/jobs" className="ghost" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                Jobs
              </Link>
              <button
                className="ghost"
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
          </header>
        </div>
      )}

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </>
  )
}
