---
name: milemarker-receipts
description: Turn photos of car receipts (gas, service, repairs, parts) into a CSV ready to import into MileMarker. Use when the user shares vehicle receipts, fuel slips, or maintenance invoices and wants them logged, digitized, or converted for MileMarker import.
---

# MileMarker receipt → CSV converter

The user will share photos (or PDFs) of vehicle receipts. Read them and produce **one CSV file** in MileMarker's import format. The user then imports it in MileMarker under **Settings → Import records from CSV**. Do not summarize receipts in prose instead of the CSV — the CSV file is the deliverable.

## CSV format (exact)

Header row, then one row per record:

```csv
type,date,odometer,description,quantity,cost,is_fill_to_full,missed_fuelup,notes
```

| Column | Rules |
|---|---|
| `type` | `fuel`, `service`, `repair`, `upgrade`, or `odometer` |
| `date` | `YYYY-MM-DD` |
| `odometer` | Plain integer, no commas. **Required for `fuel` and `odometer` rows**; include for others when known |
| `description` | For service/repair/upgrade: the work done. Multiple items on one invoice separated by `;` (e.g. `Oil change; Tire rotation`). Leave empty for fuel/odometer rows |
| `quantity` | Fuel only: volume (gallons or litres, matching the user's unit). For electric vehicles, kWh from the charging receipt. Decimal ok |
| `cost` | Total amount paid, plain number, no `$` or thousands separators |
| `is_fill_to_full` | Fuel only: `true`/`false`, default true. False only if the receipt/user indicates a partial fill |
| `missed_fuelup` | Fuel only: `true` if the user says they skipped logging a fill-up since the last one, else empty |
| `notes` | Vendor name, invoice number, part numbers, anything uncertain — flag guesses here |

An optional `vehicle` column may be added (value: the vehicle's nickname, license plate, or `year make model` exactly as in MileMarker) when the receipts span multiple vehicles; otherwise omit it — the user picks the vehicle at import time.

## Extraction rules

1. **One row per receipt** (per category). A gas receipt → one `fuel` row. A shop invoice with several line items of the same kind → one row with `;`-separated items and the invoice total as cost. If one invoice mixes categories (e.g. oil change + aftermarket lift kit), split into one row per category and apportion costs from the line items.
2. **Classify carefully:** routine maintenance → `service` (oil changes, filters, rotations, fluids, brakes-as-maintenance, inspections, wipers, batteries). Fixing something broken → `repair`. Aftermarket additions/accessories → `upgrade`.
3. **Match MileMarker's service names** when an item clearly corresponds — e.g. prefer `Oil change`, `Tire rotation`, `Engine air filter`, `Cabin air filter`, `Brake pads`, `Brake fluid flush`, `Transmission fluid`, `Coolant flush`, `Spark plugs`, `Battery replacement`, `Wiper blades`, `Wheel alignment`, `Safety inspection`, `Emissions test`, `Tire replacement`. This lets MileMarker's reminders auto-advance. Use the receipt's own wording when nothing matches.
4. **Fuel rows need an odometer.** Gas receipts rarely show one — ask the user for the odometer reading at each fill-up (or whether to estimate). Never invent one silently.
5. **Dates:** if a receipt is undated or unreadable, ask. Don't guess a date.
6. **Read totals, not subtotals** — cost is what was actually paid, tax included.
7. **Uncertainty:** if a value is hard to read, use your best reading, note the doubt in `notes` (e.g. `total unclear — could be 45.87`), and list all uncertain rows for the user before finishing.

## Deliverable

1. Save the CSV as `milemarker-import-<today>.csv`.
2. Show the user a short table of what was extracted (date, type, description, cost) plus any rows flagged as uncertain, and where anything was ambiguous, ask before finalizing.
3. Remind them: MileMarker skips exact duplicates on re-import, so re-importing a corrected file is safe.
