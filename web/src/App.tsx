import React from 'react'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import LoginPage from './pages/Login'
import JobsPage from './pages/Jobs'
import JobDetailPage from './pages/JobDetail'
import { auth } from './api'

export default function App() {
  const nav = useNavigate()

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <Link to="/jobs" style={{ textDecoration: 'none' }}>
          <h2 style={{ margin: 0 }}>Infra Orch Studio</h2>
        </Link>
        <div style={{ marginLeft: 'auto' }}>
          <button
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

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </div>
  )
}
