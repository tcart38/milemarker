// Common descriptions offered in the record combobox. Users can still type custom.
export const PRESETS = {
  service: [
    'Oil change', 'Tire rotation', 'Engine air filter', 'Cabin air filter',
    'Brake pads', 'Brake fluid flush', 'Transmission fluid', 'Coolant flush',
    'Spark plugs', 'Battery replacement', 'Wiper blades', 'Wheel alignment',
    'Fuel filter', 'Serpentine belt', 'Timing belt', 'Differential fluid',
    'Power steering fluid', 'A/C service', 'Safety inspection', 'Emissions test',
    'Registration renewal', 'Tire replacement', 'Wash / detail',
  ],
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

// The reminder description should match a maintenance item, so it can auto-advance
// off the matching record. Offer the service list (the most reminder-worthy items).
export const REMINDER_PRESETS = PRESETS.service
