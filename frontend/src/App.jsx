import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Garage from './pages/Garage.jsx'
import VehicleDetail from './pages/VehicleDetail.jsx'
import Settings from './pages/Settings.jsx'
import QuickFuel from './pages/QuickFuel.jsx'
import Login from './pages/Login.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'

// Holds the app back until we know whether a login is needed, so nothing
// fires API calls that would only 401.
function AuthGate({ children }) {
  const { status } = useAuth()
  if (!status) return null
  if (status.enabled && !status.authenticated) return <Login />
  return children
}

export default function App() {
  return (
    <AuthProvider>
    <AuthGate>
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/garage" replace />} />
            <Route path="garage" element={<Garage />} />
            <Route path="vehicle/:id" element={<VehicleDetail />} />
            <Route path="quick/fuel" element={<QuickFuel />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
    </AuthGate>
    </AuthProvider>
  )
}
