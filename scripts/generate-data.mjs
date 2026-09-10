import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const inputDir = join(process.cwd(), 'data', 'input');
const workorderPath = join(inputDir, 'workorders.csv');
const hourLinePath = join(inputDir, 'workorder_hour_lines.csv');
const positionsPath = join(inputDir, 'silver_positions.parquet');
const webfleetDir = join(inputDir, 'webfleet');
const locationsPath = join(inputDir, 'customer_locations.json');
const playbackDate = process.env.PLAYBACK_DATE || '2026-09-01';

function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const [headers, ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
}

function localVisitTime(value) {
  const match = value?.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00+02:00`;
}

const clean = (value) => (value == null ? '' : String(value).trim());
const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const locations = JSON.parse(await readFile(locationsPath, 'utf8'));
const workorders = parseCsv(await readFile(workorderPath, 'utf8'));
const openWorkorders = workorders.filter((row) => clean(row.state) === '1');
const hourLines = parseCsv(await readFile(hourLinePath, 'utf8'));

const openByCustomer = new Map();
for (const row of openWorkorders) {
  const customer = clean(row.customer_id);
  if (!openByCustomer.has(customer)) openByCustomer.set(customer, []);
  openByCustomer.get(customer).push({
    id: clean(row.workorder_id),
    customerId: customer,
    customerName: clean(row.customer_name),
    description: clean(row.description),
    date: clean(row.date),
    priority: clean(row.priority),
    kind: clean(row.kind_description),
    product: clean(row.product_description),
    fleetNumber: clean(row.fleet_number),
  });
}

for (const list of openByCustomer.values()) {
  list.sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));
}

const locationData = locations
  .map((row) => {
    const customerId = clean(row.address_no);
    return {
      id: clean(row.location_key) || customerId,
      customerId,
      name: clean(row.address_name),
      address: [clean(row.street), clean(row.postal_code), clean(row.city)]
        .filter(Boolean)
        .join(', '),
      country: clean(row.country),
      lat: numberOrNull(row.latitude_deg),
      lng: numberOrNull(row.longitude_deg),
      radiusM: numberOrNull(row.radius_m) || 150,
      openWorkorders: openByCustomer.get(customerId) ?? [],
    };
  })
  .filter((row) => row.lat != null && row.lng != null);

const parquetFile = await asyncBufferFromFile(positionsPath);
const parquetRows = await parquetReadObjects({ file: parquetFile, compressors });
const positions = parquetRows
  .filter((row) => row.pos_time instanceof Date && row.pos_time.toISOString().startsWith(playbackDate))
  .map((row) => ({
    vehicle: clean(row.vehicle_name || row.vehicle_objectno),
    objectNo: clean(row.vehicle_objectno),
    driver: clean(row.driver_name),
    time: row.pos_time.toISOString(),
    lat: numberOrNull(row.latitude_deg),
    lng: numberOrNull(row.longitude_deg),
    speedKmh: numberOrNull(row.speed_kmh),
    moving: Boolean(row.moving),
    ignitionOn: Boolean(row.ignition_on),
    courseDeg: numberOrNull(row.course_deg),
  }))
  .filter((row) => row.vehicle && row.lat != null && row.lng != null)
  .sort((a, b) => a.time.localeCompare(b.time));

const webfleetFiles = (await readdir(webfleetDir))
  .filter((name) => name.startsWith('webfleet_') && name.endsWith('.csv'))
  .sort();
const eventMap = new Map();
for (const name of webfleetFiles) {
  const rows = parseCsv(await readFile(join(webfleetDir, name), 'utf8'), ';');
  for (const row of rows) {
    const event = {
      employeeNumber: clean(row.Employee_number),
      employeeName: clean(row.Employee_name),
      vehicle: clean(row.Object_name),
      customerId: clean(row.Customer_number),
      customerName: clean(row.Customer_name),
      start: localVisitTime(clean(row.Starttime)),
      end: localVisitTime(clean(row.Endtime)),
      startLng: numberOrNull(row.Start_longitude),
      startLat: numberOrNull(row.Start_latitude),
      endLng: numberOrNull(row.End_longitude),
      endLat: numberOrNull(row.End_latitude),
    };
    const key = [event.vehicle, event.customerId, event.start, event.end].join('|');
    eventMap.set(key, event);
  }
}
const events = [...eventMap.values()].filter((event) => event.start && event.end);

const positionGroups = new Map();
for (const row of positions) {
  if (!positionGroups.has(row.vehicle)) positionGroups.set(row.vehicle, []);
  positionGroups.get(row.vehicle).push(row);
}

const vehicles = [...positionGroups.entries()]
  .map(([vehicle, rows]) => ({
    vehicle,
    driver: [...rows].reverse().find((row) => row.driver)?.driver ?? '',
    points: rows.length,
    start: rows[0].time,
    end: rows.at(-1).time,
    verifiedVisits: events.filter((event) => event.vehicle === vehicle).length,
  }))
  .sort((a, b) => b.points - a.points || a.vehicle.localeCompare(b.vehicle));

const mappedOpenWorkorders = locationData.reduce(
  (sum, location) => sum + location.openWorkorders.length,
  0,
);
const openHourLines = hourLines.filter((line) =>
  openWorkorders.some((workorder) => workorder.workorder_id === line.workorder_id),
).length;

const payload = {
  metadata: {
    playbackDate,
    generatedAt: new Date().toISOString(),
    positionCount: positions.length,
    vehicleCount: vehicles.length,
    locationCount: locationData.length,
    openWorkorderCount: openWorkorders.length,
    mappedOpenWorkorderCount: mappedOpenWorkorders,
    mappedOpenCustomerCount: locationData.filter((location) => location.openWorkorders.length).length,
    verifiedVisitCount: events.length,
    openHourLineCount: openHourLines,
    candidateMaxDistanceKm: 25,
    openState: 1,
  },
  vehicles,
  positions,
  locations: locationData,
  events,
};

await mkdir('public', { recursive: true });
await writeFile('public/demo-data.json', JSON.stringify(payload));
console.log(JSON.stringify(payload.metadata, null, 2));
