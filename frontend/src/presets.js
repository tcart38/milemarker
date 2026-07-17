// Common descriptions offered in the record combobox. Users can still type custom.
// Service types are no longer presets — they're rows in the database, seeded by
// the backend (schema.js) and served via /api/service-types.
export const PRESETS = {
  repair: [
    'Brake repair', 'Suspension repair', 'Engine repair', 'Transmission repair',
    'Electrical repair', 'Exhaust repair', 'Cooling system repair',
    'Tire repair', 'A/C repair', 'Body / collision repair', 'Windshield / glass',
    'Alternator', 'Starter', 'Water pump', 'Wheel bearing',
  ],
  upgrade: [
    'Window tint', 'Wheels', 'Tires', 'Lift kit', 'Leveling kit',
    'Cold air intake', 'Exhaust system', 'Stereo / audio', 'Lighting',
    'Suspension', 'ECU tune', 'Roof rack', 'Tonneau cover', 'Floor mats',
    'Bull bar / bumper', 'Winch',
  ],
}
