// How a vehicle is named everywhere: its nickname if it has one, else the
// year/make/model it was entered with.
export function vehicleTitle(v) {
  const ymm = [v.year, v.make, v.model].filter(Boolean).join(' ')
  return v.name || ymm || 'Unnamed vehicle'
}
