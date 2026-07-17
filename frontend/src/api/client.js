const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}

// Vehicles
export const getVehicles = (includeSold = false) => request(includeSold ? '/vehicles?all=1' : '/vehicles')
export const getVehicle = (id) => request(`/vehicles/${id}`)
export const createVehicle = (body) => request('/vehicles', { method: 'POST', body })
export const updateVehicle = (id, body) => request(`/vehicles/${id}`, { method: 'PATCH', body })
export const deleteVehicle = (id) => request(`/vehicles/${id}`, { method: 'DELETE' })

// Dashboard
export const getDashboard = (vehicleId) => request(`/vehicles/${vehicleId}/dashboard`)

// Fuel
export const getFuel = (vehicleId) => request(`/vehicles/${vehicleId}/fuel`)
export const createFuel = (vehicleId, body) => request(`/vehicles/${vehicleId}/fuel`, { method: 'POST', body })
export const updateFuel = (vehicleId, id, body) => request(`/vehicles/${vehicleId}/fuel/${id}`, { method: 'PATCH', body })
export const deleteFuel = (vehicleId, id) => request(`/vehicles/${vehicleId}/fuel/${id}`, { method: 'DELETE' })

// Generic records: type = service | repair | upgrade | odometer
export const getRecords = (vehicleId, type) => request(`/vehicles/${vehicleId}/records/${type}`)
export const createRecord = (vehicleId, type, body) => request(`/vehicles/${vehicleId}/records/${type}`, { method: 'POST', body })
export const updateRecord = (vehicleId, type, id, body) => request(`/vehicles/${vehicleId}/records/${type}/${id}`, { method: 'PATCH', body })
export const deleteRecord = (vehicleId, type, id) => request(`/vehicles/${vehicleId}/records/${type}/${id}`, { method: 'DELETE' })

// Reminders
export const getReminders = (vehicleId) => request(`/vehicles/${vehicleId}/reminders`)
export const createReminder = (vehicleId, body) => request(`/vehicles/${vehicleId}/reminders`, { method: 'POST', body })
export const updateReminder = (vehicleId, id, body) => request(`/vehicles/${vehicleId}/reminders/${id}`, { method: 'PATCH', body })
export const deleteReminder = (vehicleId, id) => request(`/vehicles/${vehicleId}/reminders/${id}`, { method: 'DELETE' })

// Attachments (receipts / documents on a record)
export const getAttachments = (vId, type, rid) => request(`/attachments/${vId}/${type}/${rid}`)
export const uploadAttachment = async (vId, type, rid, file) => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/attachments/${vId}/${type}/${rid}`, { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
  return res.json()
}
export const deleteAttachment = (id) => request(`/attachments/${id}`, { method: 'DELETE' })
export const attachmentUrl = (id) => `/api/attachments/${id}/file`

// Settings
export const getSettings = () => request('/settings')
export const updateSettings = (body) => request('/settings', { method: 'PUT', body })

// Service types
export const getServiceTypeUsage = () => request('/service-types')
export const renameServiceType = (from, to) => request('/service-types/rename', { method: 'POST', body: { from, to } })

// Import records from a CSV file into a vehicle
export const importCsv = async (vehicleId, file) => {
  const form = new FormData()
  form.append('vehicle_id', vehicleId)
  form.append('file', file)
  const res = await fetch('/api/import/csv', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data.errors ? ' ' + data.errors.map((e) => `Row ${e.row}: ${e.error}`).join(' · ') : ''
    throw new Error((data.error || `HTTP ${res.status}`) + detail)
  }
  return data
}

// Import a LubeLogger appdata folder (FileList / File[] from a directory input)
export const importLubeLogger = async (files) => {
  const form = new FormData()
  for (const f of files) form.append('files', f, f.webkitRelativePath || f.name)
  const res = await fetch('/api/import/lubelogger', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
