# G&T Webfleet Work-order Demo

An interactive route-playback demo for G&T Intern Transport. The application combines vehicle positions, Webfleet customer-visit events, customer locations, and open work orders in one map-based operational view.

The goal is to demonstrate how dispatchers and service managers can connect vehicle movement with outstanding service work, distinguish confirmed customer visits from likely destinations, and identify gaps in the available operational data.

## What the demo shows

- Playback of vehicle positions for 1 September 2026
- Vehicle and driver selection
- Route history for the selected vehicle
- Mapped customers with and without open work orders
- Work orders filtered to `state = 1`, which is treated as open
- Confirmed customer visits based on Webfleet customer-presence events
- Likely work-order destinations based on proximity when no confirmed visit is available
- Dataset coverage and matching limitations

## Matching logic

The interface distinguishes between confirmed data and suggestions:

1. **Verified visit** — Webfleet reports that the vehicle is at a customer. If that customer has an open work order, the visit and work order are shown as verified.
2. **Likely destination** — When there is no confirmed customer visit, the nearest mapped customer with an open work order is suggested if it is within 25 km.
3. **Unmatched visit** — Webfleet confirms a customer visit, but that customer has no open `state = 1` work order.
4. **No nearby match** — No mapped open-work-order customer is within the configured candidate distance.

Likely destinations are decision-support suggestions, not confirmed technician assignments.

## Operational data is not included

Vehicle positions, employee names, customer details, work orders, and the generated browser dataset are intentionally excluded from Git. Cloning the repository gives you the application code but not G&T operational data.

To make the demo operational, either generate `public/demo-data.json` from the private source files described below or provide a compatible preprocessed `public/demo-data.json` directly. Both the raw input directory and the generated file are ignored by Git.

## Required data folder

Create the following structure inside the repository:

```text
data/
└── input/
    ├── workorders.csv
    ├── workorder_hour_lines.csv
    ├── silver_positions.parquet
    ├── customer_locations.json
    └── webfleet/
        ├── webfleet_YYYYMMDD_HHMMSS.csv
        └── ...
```

Do not commit these files. The entire `data/input` directory is ignored except for its placeholder file.

### `workorders.csv`

Comma-separated CSV. The generator uses these columns:

| Column | Purpose |
| --- | --- |
| `workorder_id` | Unique work-order identifier |
| `customer_id` | Customer identifier used to join to locations and visits |
| `customer_name` | Customer display name |
| `description` | Work-order description |
| `state` | Status; only value `1` is treated as open |
| `kind_description` | Type of work |
| `product_description` | Machine or product description |
| `fleet_number` | Optional fleet identifier |
| `date` | Work-order date used for ordering |
| `priority` | Optional priority |

### `workorder_hour_lines.csv`

Comma-separated CSV. The current generator requires `workorder_id` to count hour lines associated with open work orders. Additional fields such as employee, booked amount, rate, start time, and end time can remain in the export for future planned-versus-actual analysis.

### `silver_positions.parquet`

The Parquet file contains regular vehicle positions. Required fields are:

| Field | Type or example |
| --- | --- |
| `pos_time` | Timestamp/date value |
| `vehicle_name` | Vehicle registration or display name |
| `vehicle_objectno` | Fallback vehicle identifier |
| `driver_name` | Driver display name |
| `latitude_deg`, `longitude_deg` | Decimal coordinates |
| `speed_kmh` | Numeric speed |
| `moving`, `ignition_on` | Boolean values |
| `course_deg` | Numeric direction in degrees |

Only positions whose `pos_time` date matches `PLAYBACK_DATE` are included.

### `customer_locations.json`

A JSON array of customer-location objects with this structure:

```json
[
  {
    "location_key": "unique-location-id",
    "address_no": "customer-id",
    "address_name": "Customer name",
    "street": "Street and number",
    "postal_code": "1234 AB",
    "city": "City",
    "country": "NL",
    "latitude_deg": 51.6000,
    "longitude_deg": 5.5000,
    "radius_m": 250
  }
]
```

`address_no` must match `customer_id` in `workorders.csv` and `Customer_number` in the Webfleet files.

### `data/input/webfleet/*.csv`

Semicolon-separated customer-presence exports. Each file must have this header:

```text
Employee_number;Employee_name;Trip_ID;Starttime;Endtime;Customer_number;Customer_name;Object_name;Start_longitude;Start_latitude;End_longitude;End_latitude
```

`Starttime` and `Endtime` are expected in `DD-MM-YYYY HH:mm` format. `Object_name` must match the vehicle name used by the position data.

## Generate the browser dataset

After placing the private input files in `data/input`, run:

```bash
npm run generate:data
```

The default playback date is `2026-09-01`. To select another date:

```powershell
$env:PLAYBACK_DATE = "2026-09-02"
npm run generate:data
```

On macOS or Linux:

```bash
PLAYBACK_DATE=2026-09-02 npm run generate:data
```

The generator creates `public/demo-data.json`, which the application loads in the browser. That output is also ignored by Git because it contains derived operational data.

## Technology

- React 19
- Vinext and Vite
- TypeScript
- MapLibre GL
- OpenStreetMap raster tiles
- Tailwind CSS and Shadcn UI components

An internet connection is required for the OpenStreetMap background tiles to load.

## Run locally

### Requirements

- Node.js 22.13 or newer
- npm

### Installation

Clone the repository and enter the project folder:

```bash
git clone https://github.com/provenant-med/gnt-webfleet-workorder-demo.git
cd gnt-webfleet-workorder-demo
```

Install the dependencies:

```bash
npm install
```

Add the private input files and generate the browser dataset as described in [Required data folder](#required-data-folder). The application cannot display the operational playback without `public/demo-data.json`.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## Production build

Create and test a production build with:

```bash
npm run build
npm run start
```

## Other commands

```bash
npm run lint
npm run format
```

## Current limitations

- Only work orders with `state = 1` are considered open.
- Not every open work order has a mapped customer location.
- Suggested destinations use a simple nearest-customer rule with a 25 km limit.
- The application is a historical playback demo, not a live dispatch system.
- Work-order hour lines are available to the data preparation step but are not yet visualized in the interface.

Useful next steps include technician-assignment matching, planned-versus-actual visit analysis, geofence dwell time, booked-hours reconciliation, and live data ingestion.
