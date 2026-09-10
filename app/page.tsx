'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Gauge, MapPin, Pause, Play, RotateCcw, Route, Truck } from 'lucide-react';
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoExplainer } from '@/components/demo-explainer';
import { ThemeSwitch } from '@/components/theme-switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

setWorkerUrl(workerUrl);

type Workorder = { id: string; customerId: string; customerName: string; description: string; date: string; priority: string; kind: string; product: string; fleetNumber: string };
type Location = { id: string; customerId: string; name: string; address: string; country: string; lat: number; lng: number; radiusM: number; openWorkorders: Workorder[] };
type Position = { vehicle: string; objectNo: string; driver: string; time: string; lat: number; lng: number; speedKmh: number | null; moving: boolean; ignitionOn: boolean; courseDeg: number | null };
type Visit = { employeeNumber: string; employeeName: string; vehicle: string; customerId: string; customerName: string; start: string; end: string };
type Vehicle = { vehicle: string; driver: string; points: number; start: string; end: string; verifiedVisits: number };
type DemoData = {
  metadata: { playbackDate: string; positionCount: number; vehicleCount: number; locationCount: number; openWorkorderCount: number; mappedOpenWorkorderCount: number; mappedOpenCustomerCount: number; verifiedVisitCount: number; candidateMaxDistanceKm: number; openState: number };
  vehicles: Vehicle[];
  positions: Position[];
  locations: Location[];
  events: Visit[];
};
type Match = { status: 'locked' | 'candidate' | 'unmatched-visit' | 'none'; location: Location | null; workorder: Workorder | null; distanceKm: number | null; visit: Visit | null };
type WebModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void> };

const amsterdamTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' });

function haversineKm(a: Position, b: Location) {
  const radius = 6371;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function latestAt(rows: Position[], time: number) {
  let low = 0;
  let high = rows.length - 1;
  let answer: Position | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(rows[middle].time) <= time) { answer = rows[middle]; low = middle + 1; } else { high = middle - 1; }
  }
  if (!answer || time - Date.parse(answer.time) > 30 * 60_000) return null;
  return answer;
}

function getMatch(position: Position | null, vehicle: string, time: number, locations: Location[], events: Visit[], maxDistance: number): Match {
  if (!position) return { status: 'none', location: null, workorder: null, distanceKm: null, visit: null };
  const visit = events.find((event) => event.vehicle === vehicle && Date.parse(event.start) <= time && Date.parse(event.end) >= time);
  if (visit) {
    const location = locations.find((item) => item.customerId === visit.customerId) ?? null;
    const workorder = location?.openWorkorders[0] ?? null;
    return { status: workorder ? 'locked' : 'unmatched-visit', location, workorder, distanceKm: location ? haversineKm(position, location) : null, visit };
  }
  let nearest: Location | null = null;
  let nearestDistance = Infinity;
  for (const location of locations) {
    if (!location.openWorkorders.length) continue;
    const distance = haversineKm(position, location);
    if (distance < nearestDistance) { nearest = location; nearestDistance = distance; }
  }
  if (!nearest || nearestDistance > maxDistance) return { status: 'none', location: null, workorder: null, distanceKm: nearestDistance, visit: null };
  return { status: 'candidate', location: nearest, workorder: nearest.openWorkorders[0] ?? null, distanceKm: nearestDistance, visit: null };
}

function geoCollection(features: Record<string, unknown>[]) { return { type: 'FeatureCollection' as const, features }; }

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [data, setData] = useState<DemoData | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('1');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    fetch('/demo-data.json').then((response) => response.json()).then((payload: DemoData) => {
      setData(payload);
      setSelectedVehicle(payload.vehicles[0]?.vehicle ?? '');
      setCurrentTime(Date.parse(payload.positions[0]?.time ?? new Date().toISOString()));
    });
  }, []);

  const groupedPositions = useMemo(() => {
    const groups = new Map<string, Position[]>();
    for (const position of data?.positions ?? []) {
      if (!groups.has(position.vehicle)) groups.set(position.vehicle, []);
      groups.get(position.vehicle)?.push(position);
    }
    return groups;
  }, [data]);

  const minTime = data ? Date.parse(data.positions[0].time) : 0;
  const maxTime = data ? Date.parse(data.positions.at(-1)?.time ?? data.positions[0].time) : 1;
  const selectedRows = groupedPositions.get(selectedVehicle) ?? [];
  const currentPosition = latestAt(selectedRows, currentTime);
  const currentMatch = data ? getMatch(currentPosition, selectedVehicle, currentTime, data.locations, data.events, data.metadata.candidateMaxDistanceKm) : null;

  useEffect(() => {
    if (!data) return;
    const context = (document as Document & { modelContext?: WebModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'set_playback',
      title: 'Set vehicle playback',
      description: 'Select a vehicle and move the visible timeline to a specific ISO timestamp within the September 1 playback.',
      inputSchema: {
        type: 'object',
        properties: { vehicle: { type: 'string' }, time: { type: 'string', format: 'date-time' } },
        required: ['vehicle', 'time'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const value = input as { vehicle?: unknown; time?: unknown };
        if (typeof value.vehicle !== 'string' || !data.vehicles.some((item) => item.vehicle === value.vehicle)) throw new Error('Unknown vehicle.');
        if (typeof value.time !== 'string' || !Number.isFinite(Date.parse(value.time))) throw new Error('Time must be a valid ISO timestamp.');
        const requestedTime = Date.parse(value.time);
        const boundedTime = Math.min(maxTime, Math.max(minTime, requestedTime));
        setSelectedVehicle(value.vehicle);
        setCurrentTime(boundedTime);
        setPlaying(false);
        return { vehicle: value.vehicle, time: new Date(boundedTime).toISOString(), playing: false };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [data, minTime, maxTime]);

  useEffect(() => {
    if (!playing || !data) return;
    const timer = window.setInterval(() => setCurrentTime((previous) => {
      const next = previous + 5 * 60_000 * Number(speed);
      if (next >= maxTime) { setPlaying(false); return maxTime; }
      return next;
    }), 800);
    return () => window.clearInterval(timer);
  }, [playing, speed, data, maxTime]);

  useEffect(() => {
    if (!data || !mapContainer.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          openstreetmap: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'openstreetmap', type: 'raster', source: 'openstreetmap' }],
      },
      center: [5.35, 51.55],
      zoom: 8.1,
      attributionControl: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('customers', { type: 'geojson', data: geoCollection(data.locations.map((location) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [location.lng, location.lat] }, properties: { customerId: location.customerId, name: location.name, openCount: location.openWorkorders.length, radiusM: location.radiusM, active: false } }))) });
      map.addLayer({ id: 'customer-halos', type: 'circle', source: 'customers', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 4, 12, 15], 'circle-color': ['case', ['>', ['get', 'openCount'], 0], '#15a9df', '#858b91'], 'circle-opacity': ['case', ['>', ['get', 'openCount'], 0], 0.2, 0.08], 'circle-stroke-width': ['case', ['boolean', ['get', 'active'], false], 3, 1], 'circle-stroke-color': ['case', ['boolean', ['get', 'active'], false], '#d41432', '#ffffff'] } });
      map.addLayer({ id: 'customer-points', type: 'circle', source: 'customers', paint: { 'circle-radius': ['case', ['boolean', ['get', 'active'], false], 6, 3], 'circle-color': ['case', ['>', ['get', 'openCount'], 0], '#15a9df', '#858b91'], 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
      map.addSource('vehicle-trail', { type: 'geojson', data: geoCollection([]) });
      map.addLayer({ id: 'vehicle-trail', type: 'line', source: 'vehicle-trail', paint: { 'line-color': '#242629', 'line-width': 3, 'line-opacity': 0.65 } });
      map.addSource('candidate-line', { type: 'geojson', data: geoCollection([]) });
      map.addLayer({ id: 'candidate-line', type: 'line', source: 'candidate-line', paint: { 'line-color': '#d41432', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
      map.addSource('vehicles', { type: 'geojson', data: geoCollection([]) });
      map.addLayer({ id: 'vehicle-points', type: 'circle', source: 'vehicles', paint: { 'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 9, 6], 'circle-color': ['match', ['get', 'status'], 'locked', '#1b9a59', 'unmatched-visit', '#f07d21', 'candidate', '#d41432', '#242629'], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
      map.addLayer({ id: 'vehicle-labels', type: 'symbol', source: 'vehicles', layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Open Sans Bold'], 'text-offset': [0, -1.7], 'text-anchor': 'bottom', 'text-allow-overlap': false }, paint: { 'text-color': '#242629', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } });
      map.on('click', 'customer-points', (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const root = document.createElement('div'); root.className = 'map-popup';
        const name = document.createElement('strong'); name.textContent = String(feature.properties?.name ?? 'Customer');
        const detail = document.createElement('span'); const count = Number(feature.properties?.openCount ?? 0); detail.textContent = `${feature.properties?.customerId ?? ''} · ${count} open work order${count === 1 ? '' : 's'}`;
        root.append(name, detail);
        new Popup({ closeButton: false, offset: 10 }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(root).addTo(map);
      });
      map.on('mouseenter', 'customer-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'customer-points', () => { map.getCanvas().style.cursor = ''; });
      setMapReady(true);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !data) return;
    const liveVehicles = data.vehicles.map((vehicle) => {
      const position = latestAt(groupedPositions.get(vehicle.vehicle) ?? [], currentTime);
      if (!position) return null;
      const match = getMatch(position, vehicle.vehicle, currentTime, data.locations, data.events, data.metadata.candidateMaxDistanceKm);
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [position.lng, position.lat] }, properties: { vehicle: vehicle.vehicle, selected: vehicle.vehicle === selectedVehicle, status: match.status, label: vehicle.vehicle === selectedVehicle && match.workorder ? `${vehicle.vehicle} · WO ${match.workorder.id}` : vehicle.vehicle } };
    }).filter(Boolean) as Record<string, unknown>[];
    (map.getSource('vehicles') as GeoJSONSource)?.setData(geoCollection(liveVehicles));
    const trailPoints = selectedRows.filter((position) => Date.parse(position.time) <= currentTime).map((position) => [position.lng, position.lat]);
    (map.getSource('vehicle-trail') as GeoJSONSource)?.setData(geoCollection(trailPoints.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: trailPoints }, properties: {} }] : []));
    (map.getSource('candidate-line') as GeoJSONSource)?.setData(geoCollection(currentPosition && currentMatch?.location ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[currentPosition.lng, currentPosition.lat], [currentMatch.location.lng, currentMatch.location.lat]] }, properties: {} }] : []));
    (map.getSource('customers') as GeoJSONSource)?.setData(geoCollection(data.locations.map((location) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [location.lng, location.lat] }, properties: { customerId: location.customerId, name: location.name, openCount: location.openWorkorders.length, radiusM: location.radiusM, active: currentMatch?.location?.id === location.id } }))));
  }, [data, mapReady, currentTime, selectedVehicle, selectedRows, groupedPositions, currentPosition, currentMatch]);

  useEffect(() => {
    const map = mapRef.current; const rows = groupedPositions.get(selectedVehicle) ?? [];
    if (!map || !mapReady || !rows.length) return;
    map.easeTo({ center: [rows[0].lng, rows[0].lat], zoom: 10, duration: 700 });
  }, [selectedVehicle, mapReady, groupedPositions]);

  if (!data) return <main className="loading-screen"><div><span />Loading G&amp;T route data…</div></main>;

  const selectedVehicleInfo = data.vehicles.find((vehicle) => vehicle.vehicle === selectedVehicle);
  const matchTitle = currentMatch?.status === 'locked' ? 'Verified customer visit' : currentMatch?.status === 'unmatched-visit' ? 'Visit has no open work order' : currentMatch?.status === 'candidate' ? 'Most likely destination' : 'No nearby open work order';

  return (
    <main className="app-shell">
      <aside className="control-panel">
        <header className="brand-row"><img src="/gandt-logo.webp" alt="G&T Intern Transport" className="gandt-logo" /><div className="brand-copy"><p className="eyebrow">Project Chrono</p><h1>Service route playback</h1></div><div className="brand-actions"><Badge className="state-badge">State 1 only</Badge><ThemeSwitch /></div></header>
        <section className="metric-grid" aria-label="Dataset summary"><div><strong>{data.metadata.vehicleCount}</strong><span>vehicles</span></div><div><strong>{data.metadata.positionCount}</strong><span>positions</span></div><div><strong>{data.metadata.verifiedVisitCount}</strong><span>verified visits</span></div></section>
        <DemoExplainer />
        <section className="panel-section">
          <label className="section-label" htmlFor="vehicle-select">Vehicle</label>
          <Select value={selectedVehicle} onValueChange={(value) => value && setSelectedVehicle(value)}><SelectTrigger id="vehicle-select" className="vehicle-select"><SelectValue /></SelectTrigger><SelectContent>{data.vehicles.map((vehicle) => <SelectItem key={vehicle.vehicle} value={vehicle.vehicle}>{vehicle.vehicle} · {vehicle.points} points</SelectItem>)}</SelectContent></Select>
          <div className="vehicle-meta"><span><Truck />{selectedVehicleInfo?.driver || 'Driver not reported'}</span><span><Clock3 />{selectedVehicleInfo?.verifiedVisits ?? 0} verified visits</span></div>
        </section>
        <section className={`match-card match-${currentMatch?.status ?? 'none'}`}>
          <div className="match-heading"><span className="status-icon">{currentMatch?.status === 'locked' ? <CheckCircle2 /> : currentMatch?.status === 'unmatched-visit' ? <AlertTriangle /> : <MapPin />}</span><div><p className="eyebrow">At {amsterdamTime.format(currentTime)}</p><h2>{matchTitle}</h2></div></div>
          {currentMatch?.workorder ? <><div className="workorder-number">WO {currentMatch.workorder.id}</div><h3>{currentMatch.location?.name || currentMatch.workorder.customerName}</h3><p className="description">{currentMatch.workorder.description || currentMatch.workorder.kind}</p><div className="match-facts"><span><Route />{currentMatch.distanceKm?.toFixed(1)} km away</span><span><Gauge />{currentPosition?.speedKmh ?? 0} km/h</span></div></> : currentMatch?.visit ? <><h3>{currentMatch.visit.customerName}</h3><p className="description">Customer {currentMatch.visit.customerId} is confirmed by Webfleet, but no state-1 work order is available to lock.</p></> : <p className="description">The nearest mapped open work order is beyond the {data.metadata.candidateMaxDistanceKm} km candidate limit.</p>}
        </section>
        {currentMatch?.location && currentMatch.location.openWorkorders.length > 1 && <section className="panel-section compact-list"><div className="section-label">Other open work orders here</div>{currentMatch.location.openWorkorders.slice(1, 4).map((workorder) => <div className="compact-row" key={workorder.id}><strong>WO {workorder.id}</strong><span>{workorder.description}</span></div>)}</section>}
        <footer className="coverage-note"><strong>{data.metadata.mappedOpenWorkorderCount} of {data.metadata.openWorkorderCount}</strong> open work orders have a mapped customer location in this demo.</footer>
      </aside>
      <section className="map-stage" aria-label="Interactive vehicle map">
        <div ref={mapContainer} className="map-canvas" />
        <div className="map-title-card"><p className="eyebrow">G&amp;T field service · Tuesday, 1 September 2026</p><strong>Vehicle movement & work-order selection</strong></div>
        <div className="legend-card"><span><i className="dot dot-open" />Open-work-order customer</span><span><i className="dot dot-customer" />Other customer</span><span><i className="dot dot-candidate" />Likely work order</span><span><i className="dot dot-locked" />Verified visit</span></div>
        <div className="playback-bar">
          <div className="playback-controls"><Button size="icon-lg" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause playback' : 'Play playback'}>{playing ? <Pause /> : <Play />}</Button><Button variant="outline" size="icon-lg" onClick={() => { setPlaying(false); setCurrentTime(minTime); }} aria-label="Restart playback"><RotateCcw /></Button></div>
          <div className="timeline"><div className="timeline-labels"><strong>{amsterdamTime.format(currentTime)}</strong><span>{amsterdamTime.format(minTime)} — {amsterdamTime.format(maxTime)} CEST</span></div><Slider min={minTime} max={maxTime} step={60_000} value={[currentTime]} onValueChange={(value) => setCurrentTime(Array.isArray(value) ? value[0] : value)} aria-label="Playback time" /></div>
          <Select value={speed} onValueChange={(value) => value && setSpeed(value)}><SelectTrigger className="speed-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1× speed</SelectItem><SelectItem value="2">2× speed</SelectItem><SelectItem value="4">4× speed</SelectItem></SelectContent></Select>
        </div>
      </section>
    </main>
  );
}
