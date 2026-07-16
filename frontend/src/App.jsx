import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Garage from './pages/Garage.jsx'
import VehicleDetail from './pages/VehicleDetail.jsx'
import Settings from './pages/Settings.jsx'
import QuickFuel from './pages/QuickFuel.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'

export default function App() {
  return (
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
  )
}
