import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Bus, MapPin, AlertTriangle, CheckCircle2, Activity, TrendingDown,
  TrendingUp, Wifi, WifiOff, Camera, Search, Home, Map as MapIcon,
  ListChecks, BarChart3, Clock, Navigation, X, ShieldCheck, UserCheck,
  Minus, Radio, Gauge as GaugeIcon, Bell, Wrench, ZoomIn, ZoomOut,
  Maximize2, Layers, Building2, RefreshCw, ChevronRight as ChevronR,
  Cpu, Signal, Users, FileText, Download
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// npm install leaflet react-leaflet   (peer: react-dom)

/* ------------------------------------------------------------------ */
/*  DESIGN TOKENS                                                      */
/* ------------------------------------------------------------------ */
const COLORS = {
  bgDeep: "#111219", bgPanel: "#1B1D25", bgCard: "#20232D", bgCardHover: "#262A36",
  line: "#31353F", lineFaint: "#282B34",
  textPrimary: "#F3F2EA", textMuted: "#9195A3", textFaint: "#5D6270",
  amber: "#F2B705", red: "#E5484D", orange: "#F97316", dust: "#D4A017",
  blue: "#3B82F6", violet: "#A78BFA", green: "#22C55E", teal: "#2DD4BF",
};

const TYPE_META = {
  Pothole: { color: COLORS.red, label: "Pothole" },
  Crack: { color: COLORS.orange, label: "Crack" },
  Debris: { color: COLORS.dust, label: "Debris" },
  Waterlogging: { color: COLORS.blue, label: "Waterlogging" },
  "Edge Damage": { color: COLORS.violet, label: "Road-Edge Damage" },
};
const SEVERITY_META = { High: COLORS.red, Medium: COLORS.orange, Low: COLORS.dust };
const STAGES = ["Detected", "AI Verified", "Officer Verified", "Assigned", "Repair In Progress", "Repair Completed", "AI Re-verification", "Resolved"];
const STAGE_COLOR = [COLORS.amber, COLORS.amber, COLORS.blue, COLORS.violet, COLORS.orange, COLORS.blue, COLORS.violet, COLORS.green];
const SOURCE_META = {
  "AI / Bus Detection": { icon: <Cpu size={11} />, color: COLORS.amber },
  "Citizen Complaint": { icon: <Users size={11} />, color: COLORS.blue },
  "Field Inspection": { icon: <ShieldCheck size={11} />, color: COLORS.teal },
  "IoT Sensor": { icon: <Signal size={11} />, color: COLORS.violet },
};

function healthColor(score) {
  const stops = [[0, [229, 72, 77]], [25, [249, 115, 22]], [50, [242, 183, 5]], [75, [139, 195, 74]], [100, [34, 197, 94]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (score >= stops[i][0] && score <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const t = (score - a[0]) / (b[0] - a[0] || 1);
  const rgb = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
  return `rgb(${rgb.join(",")})`;
}
function tierOf(score) {
  if (score >= 90) return { tier: "P1", label: "Immediate Action", color: COLORS.red };
  if (score >= 70) return { tier: "P2", label: "High Priority", color: COLORS.orange };
  if (score >= 45) return { tier: "P3", label: "Normal", color: COLORS.amber };
  return { tier: "P4", label: "Low Priority", color: COLORS.textMuted };
}
function headingToCompass(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}
function computePriority(issue) {
  const sevScore = { High: 90, Medium: 60, Low: 30 }[issue.severity];
  const confScore = issue.confidence;
  const repeatScore = Math.min(issue.reports * 11, 100);
  const trafficScore = { HIGH: 95, MEDIUM: 65, LOW: 35 }[issue.traffic];
  const recencyScore = Math.max(100 - issue.ageHours * 1.5, 15);
  const roadClassScore = { Arterial: 90, Collector: 65, Local: 40 }[issue.roadClass] || 50;
  const proximityScore = { "School Zone": 95, "Hospital Zone": 95, "Major Junction": 80, "None": 30 }[issue.proximity] || 30;
  const total = Math.round(
    sevScore * 0.22 + confScore * 0.18 + repeatScore * 0.15 + trafficScore * 0.12 +
    recencyScore * 0.08 + roadClassScore * 0.12 + proximityScore * 0.13
  );
  return { sevScore, confScore, repeatScore, trafficScore, recencyScore, roadClassScore, proximityScore, total };
}

/* ------------------------------------------------------------------ */
/*  MOCK DATA                                                          */
/* ------------------------------------------------------------------ */
const roads = [
  { name: "Ring Road", zone: "South", ward: 42, authority: "PWD", contractor: "Shree Infra Works", traffic: "HIGH", roadClass: "Arterial", proximity: "Major Junction", potholes: 18, cracks: 12, waterlogging: 4, debris: 7, score: 62, trend: "down", forecast: 48, recurrence: "HIGH" },
  { name: "MG Road", zone: "South", ward: 8, authority: "Municipal Corporation", contractor: "Delhi Roadways Ltd.", traffic: "HIGH", roadClass: "Arterial", proximity: "School Zone", potholes: 9, cracks: 14, waterlogging: 1, debris: 5, score: 74, trend: "up", forecast: 79, recurrence: "LOW" },
  { name: "Karol Bagh", zone: "Central", ward: 27, authority: "Municipal Corporation", contractor: "Nirman Constructions", traffic: "MEDIUM", roadClass: "Collector", proximity: "Hospital Zone", potholes: 6, cracks: 10, waterlogging: 0, debris: 8, score: 81, trend: "flat", forecast: 80, recurrence: "LOW" },
  { name: "NH-48", zone: "South", ward: 55, authority: "NHAI", contractor: "NHAI Zone-3 Maintenance", traffic: "HIGH", roadClass: "Arterial", proximity: "None", potholes: 12, cracks: 3, waterlogging: 0, debris: 2, score: 70, trend: "down", forecast: 60, recurrence: "MEDIUM" },
  { name: "CP Outer Circle", zone: "Central", ward: 5, authority: "Municipal Corporation", contractor: "Delhi Roadways Ltd.", traffic: "LOW", roadClass: "Collector", proximity: "Major Junction", potholes: 4, cracks: 5, waterlogging: 0, debris: 3, score: 88, trend: "up", forecast: 91, recurrence: "LOW" },
  { name: "Chandni Chowk", zone: "North", ward: 33, authority: "Drainage Dept.", contractor: "Jal Nirmaan Pvt Ltd", traffic: "MEDIUM", roadClass: "Local", proximity: "School Zone", potholes: 8, cracks: 6, waterlogging: 6, debris: 2, score: 66, trend: "down", forecast: 54, recurrence: "HIGH" },
];
const roadInfo = Object.fromEntries(roads.map((r) => [r.name, r]));

const rawIssues = [
  { id: "RS-1042", type: "Pothole", location: "Ring Road", x: 210, y: 120, severity: "High", confidence: 96, reports: 8, source: "AI / Bus Detection", bus: "Bus #24", date: "25 Aug 2026", time: "10:32 AM", lastSeen: "12 min ago", ageHours: 0.2, stageIndex: 1 },
  { id: "RS-1041", type: "Crack", location: "Karol Bagh", x: 470, y: 260, severity: "Medium", confidence: 89, reports: 4, source: "AI / Bus Detection", bus: "Bus #31", date: "25 Aug 2026", time: "09:58 AM", lastSeen: "41 min ago", ageHours: 0.7, stageIndex: 2 },
  { id: "RS-1039", type: "Waterlogging", location: "Chandni Chowk", x: 340, y: 360, severity: "High", confidence: 93, reports: 6, source: "Citizen Complaint", bus: "Bus #42", date: "25 Aug 2026", time: "08:15 AM", lastSeen: "2 hr ago", ageHours: 2, stageIndex: 3 },
  { id: "RS-1038", type: "Pothole", location: "MG Road", x: 560, y: 150, severity: "High", confidence: 91, reports: 5, source: "AI / Bus Detection", bus: "Bus #17", date: "24 Aug 2026", time: "06:40 PM", lastSeen: "16 hr ago", ageHours: 16, stageIndex: 1 },
  { id: "RS-1037", type: "Debris", location: "NH-48", x: 640, y: 400, severity: "Low", confidence: 78, reports: 2, source: "AI / Bus Detection", bus: "Bus #08", date: "24 Aug 2026", time: "05:22 PM", lastSeen: "17 hr ago", ageHours: 17, stageIndex: 0 },
  { id: "RS-1036", type: "Edge Damage", location: "CP Outer Circle", x: 130, y: 340, severity: "Medium", confidence: 85, reports: 3, source: "Field Inspection", bus: "Bus #24", date: "24 Aug 2026", time: "03:05 PM", lastSeen: "19 hr ago", ageHours: 19, stageIndex: 2 },
  { id: "RS-1035", type: "Crack", location: "Ring Road", x: 260, y: 90, severity: "Medium", confidence: 88, reports: 4, source: "AI / Bus Detection", bus: "Bus #31", date: "23 Aug 2026", time: "11:10 AM", lastSeen: "2 days ago", ageHours: 48, stageIndex: 7 },
  { id: "RS-1034", type: "Pothole", location: "Karol Bagh", x: 420, y: 300, severity: "High", confidence: 97, reports: 9, source: "AI / Bus Detection", bus: "Bus #42", date: "23 Aug 2026", time: "09:44 AM", lastSeen: "2 days ago", ageHours: 50, stageIndex: 4 },
  { id: "RS-1033", type: "Waterlogging", location: "Chandni Chowk", x: 300, y: 380, severity: "Medium", confidence: 82, reports: 3, source: "Citizen Complaint", bus: "Bus #17", date: "22 Aug 2026", time: "07:52 PM", lastSeen: "3 days ago", ageHours: 72, stageIndex: 2 },
  { id: "RS-1032", type: "Debris", location: "MG Road", x: 600, y: 190, severity: "Low", confidence: 74, reports: 1, source: "AI / Bus Detection", bus: "Bus #08", date: "22 Aug 2026", time: "04:18 PM", lastSeen: "3 days ago", ageHours: 76, stageIndex: 0 },
  { id: "RS-1031", type: "Pothole", location: "NH-48", x: 680, y: 430, severity: "High", confidence: 95, reports: 7, source: "AI / Bus Detection", bus: "Bus #24", date: "21 Aug 2026", time: "01:30 PM", lastSeen: "4 days ago", ageHours: 96, stageIndex: 5 },
  { id: "RS-1030", type: "Crack", location: "CP Outer Circle", x: 100, y: 300, severity: "Low", confidence: 79, reports: 2, source: "AI / Bus Detection", bus: "Bus #31", date: "20 Aug 2026", time: "10:05 AM", lastSeen: "5 days ago", ageHours: 120, stageIndex: 7 },
  { id: "RS-1029", type: "Waterlogging", location: "Chandni Chowk", x: 320, y: 400, severity: "Medium", confidence: 88, reports: 5, source: "IoT Sensor", bus: "Drain Sensor #7", date: "25 Aug 2026", time: "07:10 AM", lastSeen: "3 hr ago", ageHours: 3, stageIndex: 1 },
];
const initialIssues = rawIssues.map((iss) => ({
  ...iss,
  zone: roadInfo[iss.location].zone,
  ward: roadInfo[iss.location].ward,
  authority: roadInfo[iss.location].authority,
  contractor: roadInfo[iss.location].contractor,
  traffic: roadInfo[iss.location].traffic,
  roadClass: roadInfo[iss.location].roadClass,
  proximity: roadInfo[iss.location].proximity,
}));

const buses = [
  { id: "Bus #24", route: "Route 521", status: "ONLINE", lastSync: "10 sec ago", detections: 214, x: 235, y: 130, heading: 110, speed: 37, road: "Ring Road", sensors: { camera: true, gps: true, ai: true, network: true }, lastDetection: "14 sec ago", path: "M 90 250 Q 200 100 400 120 Q 600 140 710 260" },
  { id: "Bus #31", route: "Route 405", status: "ONLINE", lastSync: "18 sec ago", detections: 187, x: 480, y: 255, heading: 20, speed: 24, road: "Karol Bagh", sensors: { camera: true, gps: true, ai: true, network: true }, lastDetection: "51 sec ago", path: "M 380 240 L 560 240 L 560 380 L 380 380 Z" },
  { id: "Bus #42", route: "Route 723", status: "OFFLINE", lastSync: "14 min ago", detections: 96, x: 320, y: 365, heading: 260, speed: 0, road: "Chandni Chowk", sensors: { camera: false, gps: true, ai: false, network: false }, lastDetection: "14 min ago", path: "M 350 40 L 350 470" },
  { id: "Bus #17", route: "Route 118", status: "ONLINE", lastSync: "31 sec ago", detections: 152, x: 555, y: 160, heading: 300, speed: 41, road: "MG Road", sensors: { camera: true, gps: true, ai: true, network: true }, lastDetection: "2 min ago", path: "M 60 40 L 620 460" },
  { id: "Bus #08", route: "Route 902", status: "SYNCING", lastSync: "3 min ago", detections: 260, x: 655, y: 405, heading: 200, speed: 18, road: "NH-48", sensors: { camera: true, gps: true, ai: true, network: false }, lastDetection: "3 min ago", path: "M 200 460 L 780 60" },
  { id: "Bus #55", route: "Route 214", status: "OFFLINE", lastSync: "48 min ago", detections: 61, x: 140, y: 330, heading: 40, speed: 0, road: "CP Outer Circle", sensors: { camera: false, gps: false, ai: false, network: false }, lastDetection: "48 min ago", path: "M 40 200 Q 120 120 220 160 Q 300 200 260 300 Q 200 380 100 340" },
];

const dailyDetections = [
  { day: "Mon", count: 62 }, { day: "Tue", count: 74 }, { day: "Wed", count: 51 },
  { day: "Thu", count: 88 }, { day: "Fri", count: 95 }, { day: "Sat", count: 40 }, { day: "Sun", count: 33 },
];
const severityDist = [
  { name: "High", value: 183, color: COLORS.red },
  { name: "Medium", value: 402, color: COLORS.orange },
  { name: "Low", value: 699, color: COLORS.dust },
];
const busActivity = buses.map((b) => ({ name: b.id.replace("Bus ", ""), detections: b.detections }));

/* Real Delhi/Gurugram road geometry (approximate — swap for actual OSM/GeoJSON
   road-segment exports once the platform is wired to a live map data source). */
const ROAD_LATLNGS = {
  "Ring Road": [[28.5800, 77.1900], [28.6050, 77.1700], [28.6350, 77.1850], [28.6500, 77.2200], [28.6350, 77.2500], [28.6050, 77.2600], [28.5800, 77.2400], [28.5750, 77.2100], [28.5800, 77.1900]],
  "MG Road": [[28.4950, 77.0350], [28.4700, 77.0600], [28.4595, 77.0725], [28.4450, 77.0900]],
  "Karol Bagh": [[28.6450, 77.1850], [28.6550, 77.1850], [28.6550, 77.1970], [28.6450, 77.1970], [28.6450, 77.1850]],
  "NH-48": [[28.5000, 77.0100], [28.4700, 77.0500], [28.4200, 77.0850], [28.3700, 77.1200]],
  "CP Outer Circle": [[28.6280, 77.2100], [28.6350, 77.2130], [28.6350, 77.2210], [28.6280, 77.2230], [28.6260, 77.2160], [28.6280, 77.2100]],
  "Chandni Chowk": [[28.6580, 77.2280], [28.6500, 77.2300], [28.6430, 77.2320]],
};
/* Anchor point per road, used to place mock issues/buses at a real-world location. */
const ROAD_ANCHOR = {
  "Ring Road": [28.6139, 77.2090], "MG Road": [28.4595, 77.0725], "Karol Bagh": [28.6500, 77.1910],
  "NH-48": [28.4700, 77.0500], "CP Outer Circle": [28.6300, 77.2165], "Chandni Chowk": [28.6506, 77.2303],
};
/* The mock data below still carries legacy 0-800 x 0-500 y "SVG canvas" offsets per
   record. Rather than hand-rewrite every issue/bus, jitter each real road anchor by
   that offset so relative clustering in the demo data is preserved on the real map. */
function toLatLng(roadName, x, y) {
  const base = ROAD_ANCHOR[roadName] || ROAD_ANCHOR["Ring Road"];
  const dLat = ((250 - y) / 500) * 0.05;
  const dLng = ((x - 400) / 800) * 0.06;
  return [base[0] + dLat, base[1] + dLng];
}
const DELHI_NCR_CENTER = [28.58, 77.18];

/* ------------------------------------------------------------------ */
/*  SMALL PRIMITIVES                                                   */
/* ------------------------------------------------------------------ */
function SeverityChip({ severity }) {
  const c = SEVERITY_META[severity];
  return <span className="chip" style={{ color: c, borderColor: c + "55", background: c + "1A" }}><span className="chip-dot" style={{ background: c }} />{severity}</span>;
}
function StagePill({ idx }) {
  const c = STAGE_COLOR[idx];
  return <span className="status-pill" style={{ color: c, borderColor: c + "55" }}>{STAGES[idx]}</span>;
}
function PriorityBadge({ score, compact }) {
  const t = tierOf(score);
  return (
    <span className="priority-badge" style={{ color: t.color, borderColor: t.color + "55", background: t.color + "1A" }}>
      {t.tier}{!compact && <span className="priority-badge-label"> · {t.label}</span>}
    </span>
  );
}
function SourceTag({ source }) {
  const m = SOURCE_META[source];
  return <span className="source-tag" style={{ color: m.color }}>{m.icon} {source}</span>;
}
function KpiCard({ icon, label, value, accent, sub }) {
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <div className="kpi-icon" style={{ color: accent, background: accent + "1A" }}>{icon}</div>
        {sub && <span className="kpi-sub">{sub}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
function ScoreBar({ label, value, max = 100, color }) {
  return (
    <div className="score-bar-row">
      <span className="score-bar-label">{label}</span>
      <div className="score-bar-track"><div className="score-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color || COLORS.amber }} /></div>
      <span className="score-bar-value">{Math.round(value)}</span>
    </div>
  );
}
function SensorDot({ label, ok }) {
  return <span className="sensor-dot"><span className="dotc" style={{ background: ok ? COLORS.green : COLORS.red, boxShadow: `0 0 0 3px ${ok ? COLORS.green : COLORS.red}22` }} />{label}</span>;
}

/* ------------------------------------------------------------------ */
/*  LEAFLET ICON FACTORIES — same visual language as before, rendered   */
/*  as divIcon HTML so real Leaflet markers can sit on real OSM tiles.  */
/* ------------------------------------------------------------------ */
function signIcon(type, severity, active) {
  const c = TYPE_META[type].color;
  const size = severity === "High" ? 14 : 11;
  const pulse = severity === "High"
    ? `<span style="position:absolute;inset:${-7}px;border-radius:999px;background:${c};opacity:.18;animation:rsPulse 2.2s infinite;"></span>` : "";
  const html = `
    <div style="position:relative;width:${size * 2}px;height:${size * 2}px;transform:translate(-50%,-50%);cursor:pointer;">
      ${pulse}
      <div style="position:absolute;inset:0;background:${COLORS.bgDeep};border:${active ? 3 : 2}px solid ${c};border-radius:3px;transform:rotate(45deg);"></div>
      <div style="position:absolute;left:50%;top:50%;width:${size * 0.64}px;height:${size * 0.64}px;background:${c};border-radius:999px;transform:translate(-50%,-50%);"></div>
    </div>`;
  return L.divIcon({ html, className: "rs-marker", iconSize: [size * 2, size * 2] });
}
function clusterIcon(count, color) {
  const html = `
    <div style="position:relative;width:32px;height:32px;transform:translate(-50%,-50%);cursor:pointer;">
      <div style="position:absolute;inset:0;border-radius:999px;background:${color};opacity:.25;"></div>
      <div style="position:absolute;inset:5px;border-radius:999px;background:${COLORS.bgDeep};border:2.5px solid ${color};display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:${color};">${count}</div>
    </div>`;
  return L.divIcon({ html, className: "rs-marker", iconSize: [32, 32] });
}
function busIcon(bus, showLabel) {
  const statusColor = bus.status === "ONLINE" ? COLORS.green : bus.status === "SYNCING" ? COLORS.amber : COLORS.red;
  const label = showLabel ? `<div style="position:absolute;left:14px;top:-4px;white-space:nowrap;font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:${COLORS.textMuted};">${bus.id}</div>` : "";
  const html = `
    <div style="position:relative;width:20px;height:20px;transform:translate(-50%,-50%);opacity:${bus.status === "OFFLINE" ? 0.45 : 1};">
      <svg width="20" height="20" viewBox="-10 -10 20 20" style="transform:rotate(${bus.heading}deg);">
        <path d="M 0 -10 L 8 8 L 0 4 L -8 8 Z" fill="${statusColor}" stroke="${COLORS.bgDeep}" stroke-width="1" />
      </svg>
      ${label}
    </div>`;
  return L.divIcon({ html, className: "rs-marker", iconSize: [20, 20] });
}

/* Dark basemap tiles (CARTO Voyager/Dark, free for light usage, attribution required)
   so the real OSM road network reads correctly against the dashboard's dark theme. */
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/* Road segments drawn as real polylines over the OSM tiles, colored by health score
   when the Heatmap layer is on — same data (`roadInfo`), just plotted at real coordinates. */
function RoadOverlay({ heatmap }) {
  return (
    <>
      {Object.entries(ROAD_LATLNGS).map(([name, positions]) => (
        <Polyline
          key={name}
          positions={positions}
          pathOptions={{
            color: heatmap ? healthColor(roadInfo[name].score) : COLORS.amber,
            weight: heatmap ? 7 : 4,
            opacity: heatmap ? 0.75 : 0.85,
          }}
        >
          <Popup>
            <strong>{name}</strong><br />
            Health score: {roadInfo[name].score}/100 · {roadInfo[name].authority}<br />
            Zone {roadInfo[name].zone} · Ward {roadInfo[name].ward}
          </Popup>
        </Polyline>
      ))}
    </>
  );
}

/* Small live map used on the Overview / Command Center panel. */
function MiniMap({ issues, onSelect }) {
  return (
    <MapContainer center={DELHI_NCR_CENTER} zoom={11} style={{ height: 260, width: "100%", borderRadius: 8 }} scrollWheelZoom={false} attributionControl={false}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
      <RoadOverlay />
      {issues.map((iss) => {
        const pos = toLatLng(iss.location, iss.x, iss.y);
        return (
          <Marker key={iss.id} position={pos} icon={signIcon(iss.type, iss.severity, false)} eventHandlers={{ click: () => onSelect(iss) }} />
        );
      })}
    </MapContainer>
  );
}

/* Speedometer-style Road Health Score gauge */
function HealthGauge({ score, size = 140, trend }) {
  const r = size / 2 - 14, cx = size / 2, cy = size / 2 + 6;
  const scoreAngle = 180 - (score / 100) * 180;
  const polar = (angle, radius) => { const rad = (angle * Math.PI) / 180; return { x: cx - radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }; };
  const arcPath = (a1, a2, radius) => {
    const p1 = polar(a1, radius), p2 = polar(a2, radius);
    const largeArc = Math.abs(a1 - a2) > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
  };
  const color = healthColor(score);
  const needle = polar(scoreAngle, r - 6);
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? COLORS.green : trend === "down" ? COLORS.red : COLORS.textMuted;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        <path d={arcPath(180, 0, r)} stroke={COLORS.line} strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d={arcPath(180, scoreAngle, r)} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={COLORS.textPrimary} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={COLORS.textPrimary} />
        <text x={cx} y={cy - 20} textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize="24" fontWeight="600" fill={COLORS.textPrimary}>{score}</text>
        <text x={cx} y={cy - 2} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill={COLORS.textMuted}>/ 100</text>
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: trendColor, fontFamily: "IBM Plex Mono, monospace" }}>
        <TrendIcon size={12} />{trend === "up" ? "Improving" : trend === "down" ? "Deteriorating" : "Stable"}
      </div>
    </div>
  );
}

function LifecycleStepper({ stageIndex, auditTrail }) {
  return (
    <div className="lifecycle">
      {STAGES.map((s, i) => {
        const done = i <= stageIndex;
        const entry = auditTrail[i];
        return (
          <div className="lifecycle-step" key={s}>
            <div className="lifecycle-marker" style={{ background: done ? STAGE_COLOR[i] : COLORS.lineFaint, boxShadow: done ? `0 0 0 3px ${STAGE_COLOR[i]}22` : "none" }} />
            <div className="lifecycle-text">
              <div style={{ color: done ? COLORS.textPrimary : COLORS.textFaint, fontWeight: done ? 600 : 400 }}>{s}</div>
              {entry && <div className="lifecycle-meta">{entry.actor} · {entry.time}</div>}
            </div>
            {i < STAGES.length - 1 && <div className="lifecycle-line" style={{ background: i < stageIndex ? STAGE_COLOR[i] : COLORS.lineFaint }} />}
          </div>
        );
      })}
    </div>
  );
}

function buildAuditTrail(stageIndex, date) {
  const actors = ["RoadSense AI", "RoadSense AI", "Ward Supervisor", "Zone Officer", "Assigned Contractor", "Assigned Contractor", "RoadSense AI", "Zone Officer"];
  const offsets = ["+0m", "+2m", "+38m", "+43m", "+2h 20m", "+1d 4h", "+1d 6h", "+1d 6h 30m"];
  return STAGES.map((s, i) => (i <= stageIndex ? { stage: s, actor: actors[i], time: `${date} ${offsets[i]}` } : null));
}

/* ------------------------------------------------------------------ */
/*  MAP VIEW                                                            */
/* ------------------------------------------------------------------ */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* Tracks Leaflet's real zoom level so the parent can decide when to cluster. */
function ZoomWatcher({ onZoom }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}
/* Exposes the Leaflet map instance to the custom zoom-control buttons outside MapContainer. */
function MapRefGrabber({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map]);
  return null;
}

function MapView({ issues, selectedIssue, setSelectedIssueId, advanceStage }) {
  const [layers, setLayers] = useState({ issues: true, buses: true, routes: false, heatmap: false });
  const [sevFilter, setSevFilter] = useState("All");
  const [timeRange, setTimeRange] = useState("168");
  const [zoom, setZoom] = useState(11);
  const mapRef = useRef(null);

  const toggleLayer = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  const filteredIssues = useMemo(() => issues.filter((i) =>
    (sevFilter === "All" || i.severity === sevFilter) && i.ageHours <= Number(timeRange)
  ), [issues, sevFilter, timeRange]);

  const clustered = zoom < 12;
  const groups = useMemo(() => {
    const map = {};
    filteredIssues.forEach((i) => {
      if (!map[i.location]) map[i.location] = [];
      map[i.location].push(i);
    });
    return Object.entries(map).map(([loc, arr]) => {
      const pts = arr.map((i) => toLatLng(i.location, i.x, i.y));
      const avgLat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const avgLng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const worst = arr.some((i) => i.severity === "High") ? COLORS.red : arr.some((i) => i.severity === "Medium") ? COLORS.orange : COLORS.dust;
      return { loc, pos: [avgLat, avgLng], count: arr.length, color: worst };
    });
  }, [filteredIssues]);

  return (
    <div className="map-layout">
      <div className="panel map-panel">
        <div className="panel-head">
          <span className="panel-title"><MapIcon size={15} /> Live Road Condition Map</span>
          <div className="map-controls">
            <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
              {["All", "High", "Medium", "Low"].map((t) => <option key={t}>{t}</option>)}
            </select>
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              <option value="1">Last 1 hour</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
            </select>
          </div>
        </div>

        <div className="layer-toggles">
          {[["issues", "Issues"], ["buses", "Buses"], ["routes", "Routes"], ["heatmap", "Heatmap"]].map((pair) => (
            <button key={pair[0]} className={`layer-chip ${layers[pair[0]] ? "on" : ""}`} onClick={() => toggleLayer(pair[0])}><Layers size={11} /> {pair[1]}</button>
          ))}
        </div>

        <div className="map-frame">
          <MapContainer center={DELHI_NCR_CENTER} zoom={11} style={{ height: 420, width: "100%", borderRadius: 8 }} zoomControl={false} attributionControl={true}>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
            <ZoomWatcher onZoom={setZoom} />
            <MapRefGrabber mapRef={mapRef} />

            <RoadOverlay heatmap={layers.heatmap} />

            {layers.routes && buses.filter((b) => b.status !== "OFFLINE").map((b) => {
              const anchor = ROAD_ANCHOR[b.road] || DELHI_NCR_CENTER;
              const pos = toLatLng(b.road, b.x, b.y);
              return (
                <Polyline key={b.id} positions={[anchor, pos]} pathOptions={{ color: COLORS.amber, weight: 2, dashArray: "6 5", opacity: 0.55 }} />
              );
            })}

            {layers.buses && buses.map((b) => (
              <Marker key={b.id} position={toLatLng(b.road, b.x, b.y)} icon={busIcon(b, zoom >= 12)}>
                <Popup>
                  <strong>{b.id}</strong> · {b.route}<br />
                  {b.status} · {b.speed} km/h on {b.road}<br />
                  Last sync {b.lastSync}
                </Popup>
              </Marker>
            ))}

            {layers.issues && (clustered
              ? groups.map((g) => (
                <Marker key={g.loc} position={g.pos} icon={clusterIcon(g.count, g.color)} eventHandlers={{ click: () => mapRef.current && mapRef.current.setView(g.pos, 14) }} />
              ))
              : filteredIssues.map((iss) => (
                <Marker
                  key={iss.id}
                  position={toLatLng(iss.location, iss.x, iss.y)}
                  icon={signIcon(iss.type, iss.severity, selectedIssue && selectedIssue.id === iss.id)}
                  eventHandlers={{ click: () => setSelectedIssueId(iss.id) }}
                />
              )))}
          </MapContainer>
          <div className="zoom-controls">
            <button onClick={() => mapRef.current && mapRef.current.zoomIn()}><ZoomIn size={14} /></button>
            <button onClick={() => mapRef.current && mapRef.current.zoomOut()}><ZoomOut size={14} /></button>
            <button onClick={() => mapRef.current && mapRef.current.setView(DELHI_NCR_CENTER, 11)}><Maximize2 size={13} /></button>
          </div>
          {clustered && layers.issues && <div className="cluster-hint">Zoomed out — showing clustered issue counts per road</div>}
        </div>

        <div className="legend">
          {Object.entries(TYPE_META).map(([k, v]) => <span key={k} className="legend-item"><span className="legend-dot" style={{ background: v.color }} />{v.label}</span>)}
        </div>
      </div>

      {selectedIssue ? (
        <IssueDetailPanel issue={selectedIssue} onClose={() => setSelectedIssueId(null)} advanceStage={advanceStage} />
      ) : (
        <div className="panel detail-empty">
          <MapPin size={26} color={COLORS.textFaint} />
          <p>Click a marker or bus cluster to see detection details, priority reasoning, and the repair lifecycle.</p>
        </div>
      )}
    </div>
  );
}

function IssueDetailPanel({ issue, onClose, advanceStage }) {
  const [showEvidence, setShowEvidence] = useState("before");
  const meta = TYPE_META[issue.type];
  const p = computePriority(issue);
  const tier = tierOf(p.total);
  const trail = buildAuditTrail(issue.stageIndex, issue.date);

  return (
    <div className="panel detail-panel">
      <button className="close-btn" onClick={onClose}><X size={16} /></button>
      <div className="detail-eyebrow" style={{ color: meta.color }}>{issue.type.toUpperCase()} DETECTED</div>

      <div className="detail-row"><MapPin size={14} /> {toLatLng(issue.location, issue.x, issue.y).map((v) => v.toFixed(4)).join(", ")}</div>
      <div className="detail-row"><Bus size={14} /> Detected by: {issue.bus} · corroborated by {issue.reports} independent sources</div>
      <div className="detail-row"><Building2 size={14} /> {issue.authority} · Zone {issue.zone} · Ward {issue.ward}</div>
      <div className="detail-row"><Clock size={14} /> {issue.date} · {issue.time}</div>
      <div style={{ marginBottom: 8 }}><SourceTag source={issue.source} /></div>

      <div className="evidence-tabs">
        <button className={showEvidence === "before" ? "active" : ""} onClick={() => setShowEvidence("before")}>Detection Frame</button>
        {issue.stageIndex >= 5 && <button className={showEvidence === "after" ? "active" : ""} onClick={() => setShowEvidence("after")}>After Repair</button>}
      </div>
      <div className="detail-image">
        {showEvidence === "before" ? (
          <>
            <div className="bbox" style={{ borderColor: meta.color }}>
              <span className="bbox-label" style={{ background: meta.color }}>{issue.type} {issue.confidence}%</span>
            </div>
            <Camera size={16} color={COLORS.textFaint} style={{ position: "absolute", bottom: 8, left: 8 }} />
          </>
        ) : (
          <div className="repair-frame">
            <CheckCircle2 size={20} color={COLORS.green} />
            <span style={{ color: COLORS.green, fontSize: 11 }}>AI Re-verification: {issue.stageIndex >= 6 ? "PASS" : "Pending"}</span>
          </div>
        )}
      </div>

      <div className="mini-panel-title">Impact Validation</div>
      <div className="impact-grid">
        <span>AI Detection <CheckCircle2 size={12} color={COLORS.green} /></span>
        <span>GPS Match <CheckCircle2 size={12} color={COLORS.green} /></span>
        <span>Accelerometer Impact <CheckCircle2 size={12} color={issue.type === "Pothole" ? COLORS.green : COLORS.textFaint} /></span>
        <span>Previous Reports <b>{issue.reports}</b></span>
      </div>
      <div className="confidence-total">Combined Confidence: <b style={{ color: COLORS.amber }}>{Math.min(issue.confidence + issue.reports, 99)}%</b></div>

      <div className="mini-panel-title" style={{ marginTop: 14 }}>Why is this {tier.tier}?</div>
      <div className="priority-score-head"><PriorityBadge score={p.total} /> <span className="priority-total">{p.total}/100</span></div>
      <ScoreBar label="Severity" value={p.sevScore} color={COLORS.red} />
      <ScoreBar label="AI Confidence" value={p.confScore} color={COLORS.amber} />
      <ScoreBar label="Repeat Detections" value={p.repeatScore} color={COLORS.violet} />
      <ScoreBar label="Traffic Importance" value={p.trafficScore} color={COLORS.blue} />
      <ScoreBar label="Road Classification" value={p.roadClassScore} color={COLORS.green} />
      <ScoreBar label="Proximity Risk" value={p.proximityScore} color={COLORS.orange} />
      <ScoreBar label="Recency" value={p.recencyScore} color={COLORS.teal} />
      <div className="detail-row muted" style={{ marginTop: -2, marginBottom: 4 }}>{issue.roadClass} road · {issue.proximity === "None" ? "no nearby sensitive site" : "near " + issue.proximity.toLowerCase()}</div>
      <div className="detail-row muted" style={{ marginTop: 4 }}>
        Reason: {issue.severity.toLowerCase()} {issue.type.toLowerCase()} confirmed by {issue.reports} sources on a {issue.traffic.toLowerCase()}-traffic {issue.roadClass.toLowerCase()} road ({issue.location}){issue.proximity !== "None" ? ", near a " + issue.proximity.toLowerCase() : ""}, assigned to {issue.authority}.
      </div>

      <div className="mini-panel-title" style={{ marginTop: 14 }}>Lifecycle &amp; Audit Trail</div>
      <LifecycleStepper stageIndex={issue.stageIndex} auditTrail={trail} />

      <div className="action-row">
        <button className="btn btn-outline" onClick={() => advanceStage(issue.id, 2)}><ShieldCheck size={14} /> Verify</button>
        <button className="btn btn-outline" onClick={() => advanceStage(issue.id, 3)}><UserCheck size={14} /> Assign to {issue.authority}</button>
        <button className="btn btn-solid" onClick={() => advanceStage(issue.id, Math.min(issue.stageIndex + 1, 7))} disabled={issue.stageIndex >= 7}>
          <CheckCircle2 size={14} /> {issue.stageIndex >= 7 ? "Resolved" : "Advance Stage"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  COMMAND CENTER                                                     */
/* ------------------------------------------------------------------ */
function CommandCenterView({ issues, setTab, setSelectedIssueId, advanceStage, zoneFilter, wardFilter }) {
  const scoped = issues.filter((i) => (zoneFilter === "All Zones" || i.zone === zoneFilter) && (wardFilter === "All Wards" || String(i.ward) === wardFilter));
  const withScore = scoped.map((i) => ({ ...i, ...computePriority(i) }));
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  withScore.forEach((i) => { counts[tierOf(i.total).tier]++; });
  const resolved = scoped.filter((i) => i.stageIndex === 7).length;
  const critical = withScore.filter((i) => tierOf(i.total).tier === "P1" && i.stageIndex < 5).sort((a, b) => b.total - a.total).slice(0, 4);

  const topRoads = [...roads].sort((a, b) => (b.potholes + b.cracks + b.waterlogging + b.debris) - (a.potholes + a.cracks + a.waterlogging + a.debris));
  const maxTotal = topRoads[0].potholes + topRoads[0].cracks + topRoads[0].waterlogging + topRoads[0].debris;
  const onlineC = buses.filter((b) => b.status === "ONLINE").length, syncC = buses.filter((b) => b.status === "SYNCING").length, offC = buses.filter((b) => b.status === "OFFLINE").length;

  return (
    <div className="view-stack">
      <div className="priority-kpi-grid">
        <KpiCard icon={<AlertTriangle size={18} />} label="P1 Critical Issues" value={counts.P1} accent={COLORS.red} />
        <KpiCard icon={<Radio size={18} />} label="P2 High Priority" value={counts.P2} accent={COLORS.orange} />
        <KpiCard icon={<Activity size={18} />} label="P3 Normal" value={counts.P3} accent={COLORS.amber} />
        <KpiCard icon={<CheckCircle2 size={18} />} label="Resolved" value={resolved} accent={COLORS.green} />
      </div>

      <div className="two-col">
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head">
            <span className="panel-title"><AlertTriangle size={15} color={COLORS.red} /> Critical Action Queue</span>
            <span className="panel-sub">P1 issues needing immediate action</span>
          </div>
          <div className="alert-list">
            {critical.map((iss) => (
              <div className="alert-card" key={iss.id}>
                <div className="alert-top">
                  <span className="alert-dot" />
                  <div>
                    <div className="alert-title">{iss.type} · {iss.location}</div>
                    <div className="alert-sub">{iss.reports} corroborating sources · unresolved {iss.lastSeen}</div>
                  </div>
                </div>
                <div className="alert-meta">Confidence {iss.confidence}% · Priority {iss.total}/100 · {iss.authority}</div>
                <div className="action-row">
                  <button className="btn btn-outline" onClick={() => { setSelectedIssueId(iss.id); setTab("map"); }}>View</button>
                  <button className="btn btn-solid" onClick={() => advanceStage(iss.id, 3)}>Assign</button>
                </div>
              </div>
            ))}
            {critical.length === 0 && <div className="empty-row">No P1 critical issues in this scope right now.</div>}
          </div>
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head"><span className="panel-title"><MapIcon size={15} /> Road Condition Map</span><button className="link-btn" onClick={() => setTab("map")}>Open full map →</button></div>
          <MiniMap issues={issues} onSelect={(iss) => { setSelectedIssueId(iss.id); setTab("map"); }} />
        </div>
      </div>

      <div className="two-col">
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head"><span className="panel-title"><BarChart3 size={15} /> Top Problematic Roads</span></div>
          <div className="bar-list">
            {topRoads.map((r, i) => {
              const total = r.potholes + r.cracks + r.waterlogging + r.debris;
              return (
                <div className="bar-row" key={r.name}>
                  <span className="bar-rank">{i + 1}</span>
                  <span className="bar-name">{r.name}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(total / maxTotal) * 100}%` }} /></div>
                  <span className="bar-count">{total}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head"><span className="panel-title"><Bus size={15} /> Fleet Status</span></div>
          <div className="fleet-strip">
            <div><span className="fleet-dot" style={{ background: COLORS.green }} />{onlineC} Online</div>
            <div><span className="fleet-dot" style={{ background: COLORS.amber }} />{syncC} Syncing</div>
            <div><span className="fleet-dot" style={{ background: COLORS.red }} />{offC} Offline</div>
          </div>
          <div className="detail-row muted" style={{ marginTop: 10 }}>Offline-first architecture: detections captured on-device and synced automatically once connectivity returns.</div>
        </div>
      </div>

      <ActionLoopDiagram />
    </div>
  );
}

const ACTION_LOOP = [
  "Bus", "Camera", "Edge AI", "GPS + IMU", "Road Issue", "Multi-Bus Confirmation",
  "Priority Engine", "Government Department", "Contractor / Field Team", "Repair",
  "Bus AI Re-verification", "Resolved",
];
function ActionLoopDiagram() {
  return (
    <div className="panel">
      <div className="panel-head"><span className="panel-title"><RefreshCw size={15} /> AI + Government Action Loop</span><span className="panel-sub">How a detection becomes a verified repair</span></div>
      <div className="action-loop">
        {ACTION_LOOP.map((node, i) => (
          <React.Fragment key={node}>
            <span className={"loop-node" + (node === "Resolved" ? " loop-node-final" : "")}>{node}</span>
            {i < ACTION_LOOP.length - 1 && <ChevronR size={14} color={COLORS.textFaint} className="loop-arrow" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ISSUES & MAINTENANCE                                               */
/* ------------------------------------------------------------------ */
function IssuesView({ issues, setTab, setSelectedIssueId, zoneFilter, wardFilter }) {
  const [typeFilter, setTypeFilter] = useState("All");
  const [sevFilter, setSevFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => issues.filter((i) =>
    (zoneFilter === "All Zones" || i.zone === zoneFilter) &&
    (wardFilter === "All Wards" || String(i.ward) === wardFilter) &&
    (typeFilter === "All" || i.type === typeFilter) &&
    (sevFilter === "All" || i.severity === sevFilter) &&
    (search === "" || i.location.toLowerCase().includes(search.toLowerCase()) || i.id.toLowerCase().includes(search.toLowerCase()))
  ), [issues, typeFilter, sevFilter, search, zoneFilter, wardFilter]);

  const select = (arr) => ["All"].concat(arr);

  return (
    <div className="view-stack">
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title"><ListChecks size={15} /> Issues &amp; Alerts</span>
          <span className="panel-sub">{filtered.length} of {issues.length} shown</span>
        </div>
        <div className="filters">
          <div className="search-box"><Search size={14} color={COLORS.textFaint} /><input placeholder="Search location or ID…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>{select(Object.keys(TYPE_META)).map((t) => <option key={t}>{t}</option>)}</select>
          <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>{select(["High", "Medium", "Low"]).map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Issue</th><th>Location</th><th>Source</th><th>Authority</th><th>Severity</th><th>Priority</th><th>Stage</th><th></th></tr></thead>
            <tbody>
              {filtered.map((iss) => {
                const p = computePriority(iss);
                return (
                  <tr key={iss.id} onClick={() => { setSelectedIssueId(iss.id); setTab("map"); }}>
                    <td><div className="issue-cell"><span className="dot" style={{ background: TYPE_META[iss.type].color }} /><div><div className="issue-type">{iss.type}</div><div className="issue-id">{iss.id}</div></div></div></td>
                    <td>{iss.location} <span className="ward-tag">Ward {iss.ward}</span></td>
                    <td><SourceTag source={iss.source} /></td>
                    <td className="mono">{iss.authority}</td>
                    <td><SeverityChip severity={iss.severity} /></td>
                    <td><PriorityBadge score={p.total} compact /></td>
                    <td><StagePill idx={iss.stageIndex} /></td>
                    <td className="chevron">→</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="empty-row">No issues match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MaintenanceView({ issues, setTab, setSelectedIssueId, advanceStage, zoneFilter, wardFilter }) {
  const scoped = issues.filter((i) => (zoneFilter === "All Zones" || i.zone === zoneFilter) && (wardFilter === "All Wards" || String(i.ward) === wardFilter));
  const ranked = scoped.map((i) => ({ ...i, ...computePriority(i) })).filter((i) => i.stageIndex < 7).sort((a, b) => b.total - a.total).slice(0, 8);

  return (
    <div className="view-stack">
      <div className="panel">
        <div className="panel-head"><span className="panel-title"><Wrench size={15} /> Maintenance Priority Queue</span><span className="panel-sub">Ranked by severity, confidence, recurrence &amp; traffic importance</span></div>
        <div className="queue-list">
          {ranked.map((iss, i) => (
            <div className="queue-row" key={iss.id}>
              <span className="queue-rank">#{i + 1}</span>
              <PriorityBadge score={iss.total} compact />
              <div className="queue-main">
                <div className="queue-title">{iss.location} — {iss.type}</div>
                <div className="queue-sub">{iss.reports} confirmations · {iss.authority} · {iss.contractor}</div>
              </div>
              <div className="queue-score">{iss.total}<span>/100</span></div>
              <div className="action-row" style={{ marginTop: 0 }}>
                <button className="btn btn-outline" onClick={() => { setSelectedIssueId(iss.id); setTab("map"); }}>View</button>
                <button className="btn btn-solid" onClick={() => advanceStage(iss.id, 3)}>Assign</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="panel-title"><TrendingDown size={15} /> Road Deterioration Forecast</span><span className="panel-sub">Projected 30-day health based on damage recurrence trend</span></div>
        <div className="forecast-grid">
          {roads.map((r) => (
            <div className="forecast-card" key={r.name}>
              <div className="forecast-name">{r.name.toUpperCase()}</div>
              <div className="forecast-row"><span>Current Health</span><b style={{ color: healthColor(r.score) }}>{r.score}/100</b></div>
              <div className="forecast-row"><span>30-day Change</span><b style={{ color: r.forecast < r.score ? COLORS.red : COLORS.green }}>{r.forecast < r.score ? "▼" : "▲"} {Math.abs(Math.round(((r.forecast - r.score) / r.score) * 100))}%</b></div>
              <div className="forecast-row"><span>Recurrence</span><b>{r.recurrence}</b></div>
              <div className="forecast-arrow">
                <span>{r.score}</span><ChevronR size={14} color={COLORS.textFaint} /><span style={{ color: healthColor(r.forecast) }}>{r.forecast}</span>
              </div>
              {r.forecast < r.score - 5 && <div className="forecast-warn">⚠ Maintenance recommended within 30 days</div>}
              <div className="forecast-authority">{r.authority} · {r.contractor}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BUS FLEET                                                          */
/* ------------------------------------------------------------------ */
function BusesView() {
  const onlineC = buses.filter((b) => b.status === "ONLINE").length, syncC = buses.filter((b) => b.status === "SYNCING").length, offC = buses.filter((b) => b.status === "OFFLINE").length;
  return (
    <div className="view-stack">
      <div className="panel">
        <div className="panel-head"><span className="panel-title"><Bus size={15} /> Bus Fleet — Live Tracking</span>
          <div className="fleet-strip small">
            <div><span className="fleet-dot" style={{ background: COLORS.green }} />{onlineC} Online</div>
            <div><span className="fleet-dot" style={{ background: COLORS.amber }} />{syncC} Syncing</div>
            <div><span className="fleet-dot" style={{ background: COLORS.red }} />{offC} Offline</div>
          </div>
        </div>
        <div className="bus-grid">
          {buses.map((b) => (
            <div className="bus-card" key={b.id}>
              <div className="bus-top">
                <span className="bus-id">{b.id}</span>
                <span className={"status-tag " + (b.status === "ONLINE" ? "on" : b.status === "SYNCING" ? "sync" : "off")}>
                  {b.status === "ONLINE" ? <Wifi size={12} /> : b.status === "SYNCING" ? <RefreshCw size={12} /> : <WifiOff size={12} />} {b.status}
                </span>
              </div>
              <div className="bus-route">{b.route}</div>
              <div className="bus-meta">
                <span><MapPin size={11} /> {b.road}</span>
                <span><Navigation size={11} /> {headingToCompass(b.heading)} · {b.speed} km/h</span>
              </div>
              <div className="sensor-grid">
                <SensorDot label="Camera" ok={b.sensors.camera} />
                <SensorDot label="GPS" ok={b.sensors.gps} />
                <SensorDot label="AI" ok={b.sensors.ai} />
                <SensorDot label="Network" ok={b.sensors.network} />
              </div>
              <div className="bus-detections"><Camera size={12} /> {b.detections} detections this week · last {b.lastDetection}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><span className="panel-title"><Activity size={15} /> Detections by Bus</span></div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={busActivity}>
              <CartesianGrid stroke={COLORS.lineFaint} vertical={false} />
              <XAxis dataKey="name" stroke={COLORS.textFaint} fontSize={12} />
              <YAxis stroke={COLORS.textFaint} fontSize={12} />
              <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.line}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="detections" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AI VISION MONITOR                                                  */
/* ------------------------------------------------------------------ */
function AIMonitorView({ issues }) {
  const feed = issues.slice(0, 8);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % feed.length), 3200);
    return () => clearInterval(t);
  }, [feed.length]);
  const current = feed[idx];
  const meta = TYPE_META[current.type];

  return (
    <div className="view-stack">
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title"><Cpu size={15} /> AI Vision Monitor</span>
          <span className="running-tag"><span className="live-dot" /> RUNNING</span>
        </div>
        <div className="camera-frame">
          <div className="scan-line" />
          <div className="bbox live" style={{ borderColor: meta.color, left: "38%", top: "34%" }}>
            <span className="bbox-label" style={{ background: meta.color }}>{current.type.toUpperCase()} {current.confidence}%</span>
          </div>
          <div className="camera-overlay-meta">
            <span>{current.bus}</span><span>{current.location}</span>
          </div>
        </div>
        <div className="ai-stats">
          <div><span>FPS</span><b>18.4</b></div>
          <div><span>Inference</span><b>54 ms</b></div>
          <div><span>Model</span><b>RoadSense-YOLO v3</b></div>
          <div><span>Device</span><b>Edge · Raspberry Pi 5</b></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="panel-title"><Signal size={15} /> Recent Detections Stream</span></div>
        <div className="stream-list">
          {feed.map((f) => (
            <div className="stream-row" key={f.id}>
              <span className="stream-thumb" style={{ background: TYPE_META[f.type].color + "26", color: TYPE_META[f.type].color }}><Camera size={13} /></span>
              <div className="stream-main"><div>{f.type} · {f.location}</div><div className="stream-sub">{f.bus} · {f.confidence}% confidence · {f.lastSeen}</div></div>
              <SeverityChip severity={f.severity} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ANALYTICS                                                          */
/* ------------------------------------------------------------------ */
function AnalyticsView() {
  return (
    <div className="view-stack">
      <div className="two-col">
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head"><span className="panel-title"><BarChart3 size={15} /> Issues Detected Per Day</span></div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={dailyDetections}>
                <CartesianGrid stroke={COLORS.lineFaint} vertical={false} />
                <XAxis dataKey="day" stroke={COLORS.textFaint} fontSize={12} />
                <YAxis stroke={COLORS.textFaint} fontSize={12} />
                <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.line}`, borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke={COLORS.amber} strokeWidth={2.5} dot={{ fill: COLORS.amber, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head"><span className="panel-title"><GaugeIcon size={15} /> Severity Distribution</span></div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={severityDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={3}>
                  {severityDist.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.line}`, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: COLORS.textMuted }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="panel-title"><GaugeIcon size={15} /> Road Health Score</span><span className="panel-sub">Weighted from pothole, crack, waterlogging &amp; debris counts</span></div>
        <div className="gauge-grid">
          {roads.map((r) => {
            const total = r.potholes + r.cracks + r.waterlogging + r.debris;
            return (
              <div className="gauge-card" key={r.name}>
                <div className="gauge-card-name">{r.name.toUpperCase()}</div>
                <HealthGauge score={r.score} trend={r.trend} />
                <div className="gauge-breakdown">
                  <span><i style={{ background: TYPE_META.Pothole.color }} />Potholes {r.potholes}</span>
                  <span><i style={{ background: TYPE_META.Crack.color }} />Cracks {r.cracks}</span>
                  <span><i style={{ background: TYPE_META.Waterlogging.color }} />Waterlogging {r.waterlogging}</span>
                  <span><i style={{ background: TYPE_META.Debris.color }} />Debris {r.debris}</span>
                </div>
                <div className="gauge-total">{total} total issues logged</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="panel-title"><Clock size={15} /> Operational Summary</span></div>
        <div className="summary-grid">
          <div><div className="summary-value">4.6 hrs</div><div className="summary-label">Avg. resolution time</div></div>
          <div><div className="summary-value">62%</div><div className="summary-label">Recurring damage rate</div></div>
          <div><div className="summary-value">1,284</div><div className="summary-label">Total detections (30d)</div></div>
          <div><div className="summary-value">94.1%</div><div className="summary-label">Avg. AI confidence</div></div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  REPORTS                                                             */
/* ------------------------------------------------------------------ */
const REPORT_TYPES = [
  { id: "weekly", name: "Weekly Maintenance Summary", desc: "All issues detected, assigned and resolved this week, by authority." },
  { id: "zone", name: "Zone-wise Issue Report", desc: "Breakdown of open and resolved issues by zone and ward." },
  { id: "contractor", name: "Contractor Performance Report", desc: "Average resolution time and repair pass-rate per contractor." },
  { id: "priority", name: "Priority Queue Snapshot", desc: "Current P1–P4 queue with priority scoring breakdown, exportable for review meetings." },
];

function ReportsView({ issues }) {
  const [generated, setGenerated] = useState(null);

  const zoneSummary = useMemo(() => {
    const byZone = {};
    issues.forEach((i) => {
      if (!byZone[i.zone]) byZone[i.zone] = { zone: i.zone, total: 0, resolved: 0, p1: 0 };
      byZone[i.zone].total++;
      if (i.stageIndex === 7) byZone[i.zone].resolved++;
      if (tierOf(computePriority(i).total).tier === "P1") byZone[i.zone].p1++;
    });
    return Object.values(byZone).sort((a, b) => b.total - a.total);
  }, [issues]);

  return (
    <div className="view-stack">
      <div className="panel">
        <div className="panel-head"><span className="panel-title"><FileText size={15} /> Generate Report</span><span className="panel-sub">Exportable summaries for review meetings &amp; audits</span></div>
        <div className="report-grid">
          {REPORT_TYPES.map((r) => (
            <div className="report-card" key={r.id}>
              <div className="report-name">{r.name}</div>
              <div className="report-desc">{r.desc}</div>
              <button className="btn btn-outline" onClick={() => setGenerated(r.id)}><Download size={13} /> Generate</button>
              {generated === r.id && <div className="report-generated">✓ Report generated — {issues.length} records as of 25 Aug 2026, 10:45 AM</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="panel-title"><BarChart3 size={15} /> Zone Summary (Live)</span><span className="panel-sub">Computed directly from current issue data</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Zone</th><th>Total Issues</th><th>P1 Critical</th><th>Resolved</th><th>Resolution Rate</th></tr></thead>
            <tbody>
              {zoneSummary.map((z) => (
                <tr key={z.zone} style={{ cursor: "default" }}>
                  <td>{z.zone}</td>
                  <td className="mono">{z.total}</td>
                  <td><span style={{ color: COLORS.red, fontWeight: 600 }}>{z.p1}</span></td>
                  <td className="mono">{z.resolved}</td>
                  <td className="mono">{Math.round((z.resolved / z.total) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SHELL                                                               */
/* ------------------------------------------------------------------ */
const NAV = [
  { id: "command", label: "Command Center", icon: <Home size={16} /> },
  { id: "map", label: "Live Map", icon: <MapIcon size={16} /> },
  { id: "issues", label: "Issues & Alerts", icon: <ListChecks size={16} /> },
  { id: "maintenance", label: "Maintenance", icon: <Wrench size={16} /> },
  { id: "buses", label: "Bus Fleet", icon: <Bus size={16} /> },
  { id: "ai", label: "AI Monitor", icon: <Cpu size={16} /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 size={16} /> },
  { id: "reports", label: "Reports", icon: <FileText size={16} /> },
];
const ZONES = ["All Zones", "South", "North", "Central", "East", "West"];
const CITIES = {
  Delhi: { state: "Delhi", live: true },
  Mumbai: { state: "Maharashtra", live: false },
  Bengaluru: { state: "Karnataka", live: false },
};

export default function RoadSenseDashboard() {
  const [tab, setTab] = useState("command");
  const [issuesState, setIssuesState] = useState(initialIssues);
  const [selectedIssueId, setSelectedIssueId] = useState(initialIssues[0].id);
  const [cityFilter, setCityFilter] = useState("Delhi");
  const [zoneFilter, setZoneFilter] = useState("All Zones");
  const [wardFilter, setWardFilter] = useState("All Wards");
  const [bellOpen, setBellOpen] = useState(false);

  const wardOptions = ["All Wards"].concat(
    Array.from(new Set(roads.filter((r) => zoneFilter === "All Zones" || r.zone === zoneFilter).map((r) => r.ward))).sort((a, b) => a - b)
  );

  const advanceStage = (id, targetIdx) => {
    setIssuesState((prev) => prev.map((i) => (i.id === id ? { ...i, stageIndex: Math.max(i.stageIndex, targetIdx) } : i)));
  };
  const selectedIssue = issuesState.find((i) => i.id === selectedIssueId) || null;

  const criticalAlerts = issuesState.map((i) => ({ ...i, ...computePriority(i) })).filter((i) => tierOf(i.total).tier === "P1" && i.stageIndex < 5).sort((a, b) => b.total - a.total);

  return (
    <div className="rs-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .rs-root { font-family: 'Inter', sans-serif; background: ${COLORS.bgDeep}; color: ${COLORS.textPrimary}; display: flex; min-height: 680px; width: 100%; border-radius: 14px; overflow: hidden; border: 1px solid ${COLORS.line}; }
        .rs-root * { box-sizing: border-box; }

        .sidebar { width: 214px; flex-shrink: 0; background: ${COLORS.bgPanel}; border-right: 1px solid ${COLORS.line}; padding: 20px 14px; display: flex; flex-direction: column; }
        .brand { display: flex; align-items: center; gap: 8px; padding: 4px 8px 22px 8px; }
        .brand-mark { width: 30px; height: 30px; border-radius: 7px; background: ${COLORS.amber}; display: flex; align-items: center; justify-content: center; color: ${COLORS.bgDeep}; }
        .brand-name { font-family: 'Oswald', sans-serif; font-size: 17px; font-weight: 600; letter-spacing: 0.5px; line-height: 1; }
        .brand-sub { font-size: 9px; color: ${COLORS.textFaint}; letter-spacing: 0.4px; margin-top: 2px; }
        .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; margin-bottom: 3px; color: ${COLORS.textMuted}; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; background: none; width: 100%; text-align: left; }
        .nav-item:hover { background: ${COLORS.bgCard}; color: ${COLORS.textPrimary}; }
        .nav-item.active { background: ${COLORS.amber}1A; color: ${COLORS.amber}; border-color: ${COLORS.amber}40; }
        .sidebar-foot { margin-top: auto; padding-top: 14px; font-size: 10px; color: ${COLORS.textFaint}; border-top: 1px solid ${COLORS.line}; font-family: 'IBM Plex Mono', monospace; line-height: 1.5; }

        .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 26px; border-bottom: 1px solid ${COLORS.line}; }
        .topbar-title { font-family: 'Oswald', sans-serif; font-size: 19px; font-weight: 600; letter-spacing: 0.3px; }
        .topbar-sub { font-size: 11.5px; color: ${COLORS.textFaint}; margin-top: 2px; }
        .topbar-right { display: flex; align-items: center; gap: 14px; }
        .live-tag { display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${COLORS.textMuted}; font-family: 'IBM Plex Mono', monospace; }
        .live-dot { width: 7px; height: 7px; border-radius: 50%; background: ${COLORS.green}; box-shadow: 0 0 0 3px ${COLORS.green}22; animation: pulse 1.6s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        .bell-wrap { position: relative; }
        .bell-btn { position: relative; background: ${COLORS.bgCard}; border: 1px solid ${COLORS.line}; border-radius: 8px; padding: 7px; color: ${COLORS.textMuted}; cursor: pointer; }
        .bell-badge { position: absolute; top: -5px; right: -5px; background: ${COLORS.red}; color: white; font-size: 9.5px; font-weight: 700; border-radius: 20px; padding: 1px 5px; }
        .bell-dropdown { position: absolute; right: 0; top: 42px; width: 300px; background: ${COLORS.bgCard}; border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 10px; z-index: 30; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
        .bell-dropdown-title { font-size: 11px; color: ${COLORS.textFaint}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }

        .jurisdiction-bar { display: flex; align-items: center; gap: 8px; padding: 10px 26px; border-bottom: 1px solid ${COLORS.lineFaint}; background: ${COLORS.bgPanel}; font-size: 12px; color: ${COLORS.textMuted}; flex-wrap: wrap; }
        .jurisdiction-bar select { background: ${COLORS.bgCard}; border: 1px solid ${COLORS.line}; color: ${COLORS.textPrimary}; border-radius: 7px; padding: 5px 9px; font-size: 12px; }
        .jurisdiction-note { margin-left: auto; font-size: 10.5px; color: ${COLORS.textFaint}; font-family: 'IBM Plex Mono', monospace; }

        .content { padding: 20px 26px 30px 26px; overflow-y: auto; flex: 1; }
        .view-stack { display: flex; flex-direction: column; gap: 18px; }

        .priority-kpi-grid, .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .kpi-card { background: ${COLORS.bgCard}; border: 1px solid ${COLORS.line}; border-radius: 12px; padding: 14px; }
        .kpi-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .kpi-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
        .kpi-sub { font-size: 10px; color: ${COLORS.textFaint}; font-family: 'IBM Plex Mono', monospace; }
        .kpi-value { font-family: 'Oswald', sans-serif; font-size: 25px; font-weight: 600; line-height: 1; }
        .kpi-label { font-size: 11.5px; color: ${COLORS.textMuted}; margin-top: 5px; }

        .two-col { display: flex; gap: 16px; align-items: stretch; }
        .panel { background: ${COLORS.bgCard}; border: 1px solid ${COLORS.line}; border-radius: 12px; padding: 16px; }
        .panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
        .panel-title { display: flex; align-items: center; gap: 7px; font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 500; letter-spacing: 0.3px; color: ${COLORS.textPrimary}; }
        .panel-sub { font-size: 11px; color: ${COLORS.textFaint}; font-family: 'IBM Plex Mono', monospace; }
        .link-btn { background: none; border: none; color: ${COLORS.amber}; font-size: 12px; cursor: pointer; font-weight: 500; }

        .leaflet-container { background: ${COLORS.bgPanel}; font-family: 'IBM Plex Mono', monospace; }
        .rs-marker { background: transparent; border: none; }
        .leaflet-popup-content-wrapper { background: ${COLORS.bgCard}; color: ${COLORS.textPrimary}; border: 1px solid ${COLORS.line}; border-radius: 8px; font-size: 11.5px; }
        .leaflet-popup-tip { background: ${COLORS.bgCard}; }
        .leaflet-control-attribution { background: ${COLORS.bgDeep}cc !important; color: ${COLORS.textFaint} !important; font-size: 9px !important; }
        .leaflet-control-attribution a { color: ${COLORS.textMuted} !important; }
        @keyframes rsPulse { 0% { transform: scale(0.9); opacity: 0.22; } 50% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(0.9); opacity: 0.22; } }
        .bar-list { display: flex; flex-direction: column; gap: 10px; }
        .bar-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
        .bar-rank { color: ${COLORS.textFaint}; font-family: 'IBM Plex Mono', monospace; width: 14px; }
        .bar-name { width: 84px; flex-shrink: 0; color: ${COLORS.textMuted}; }
        .bar-track { flex: 1; height: 8px; background: ${COLORS.lineFaint}; border-radius: 5px; overflow: hidden; }
        .bar-fill { height: 100%; background: linear-gradient(90deg, ${COLORS.amber}, ${COLORS.red}); border-radius: 5px; }
        .bar-count { font-family: 'IBM Plex Mono', monospace; color: ${COLORS.textPrimary}; width: 24px; text-align: right; }

        .fleet-strip { display: flex; gap: 16px; font-size: 13px; color: ${COLORS.textMuted}; }
        .fleet-strip.small { gap: 12px; font-size: 12px; }
        .fleet-strip div { display: flex; align-items: center; gap: 6px; }
        .fleet-dot { width: 8px; height: 8px; border-radius: 50%; }

        .alert-list { display: flex; flex-direction: column; gap: 10px; }
        .alert-card { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.red}40; border-radius: 10px; padding: 12px; }
        .alert-top { display: flex; align-items: flex-start; gap: 9px; }
        .alert-dot { width: 8px; height: 8px; border-radius: 50%; background: ${COLORS.red}; margin-top: 5px; flex-shrink: 0; box-shadow: 0 0 0 4px ${COLORS.red}22; }
        .alert-title { font-weight: 600; font-size: 13px; }
        .alert-sub { font-size: 11.5px; color: ${COLORS.textMuted}; margin-top: 2px; }
        .alert-meta { font-size: 10.5px; color: ${COLORS.textFaint}; font-family: 'IBM Plex Mono', monospace; margin: 8px 0; }

        .map-layout { display: flex; gap: 16px; align-items: flex-start; }
        .map-panel { flex: 1.6; }
        .map-controls { display: flex; gap: 8px; }
        .map-controls select { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; color: ${COLORS.textMuted}; border-radius: 7px; padding: 5px 9px; font-size: 11.5px; }
        .layer-toggles { display: flex; gap: 7px; margin-bottom: 10px; flex-wrap: wrap; }
        .layer-chip { display: flex; align-items: center; gap: 5px; font-size: 11px; padding: 5px 10px; border-radius: 20px; border: 1px solid ${COLORS.line}; background: ${COLORS.bgPanel}; color: ${COLORS.textFaint}; cursor: pointer; }
        .layer-chip.on { color: ${COLORS.amber}; border-color: ${COLORS.amber}55; background: ${COLORS.amber}14; }
        .map-frame { position: relative; }
        .zoom-controls { position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 5px; z-index: 500; }
        .zoom-controls button { background: ${COLORS.bgCard}ee; border: 1px solid ${COLORS.line}; color: ${COLORS.textMuted}; border-radius: 6px; padding: 6px; cursor: pointer; }
        .cluster-hint { position: absolute; bottom: 10px; left: 10px; background: ${COLORS.bgCard}ee; border: 1px solid ${COLORS.line}; border-radius: 7px; padding: 5px 10px; font-size: 10.5px; color: ${COLORS.textMuted}; }
        .legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
        .legend-item { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: ${COLORS.textMuted}; }
        .legend-dot { width: 8px; height: 8px; border-radius: 2px; transform: rotate(45deg); display: inline-block; }

        .detail-panel { flex: 1; position: relative; min-width: 300px; max-height: 760px; overflow-y: auto; }
        .detail-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; color: ${COLORS.textFaint}; font-size: 12.5px; min-height: 300px; }
        .close-btn { position: absolute; top: 14px; right: 14px; background: ${COLORS.bgCardHover}; border: 1px solid ${COLORS.line}; border-radius: 6px; color: ${COLORS.textMuted}; padding: 4px; cursor: pointer; }
        .detail-eyebrow { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.6px; margin-bottom: 10px; }
        .detail-row { display: flex; align-items: center; gap: 7px; font-size: 12px; color: ${COLORS.textPrimary}; margin-bottom: 6px; font-family: 'IBM Plex Mono', monospace; }
        .detail-row.muted { color: ${COLORS.textFaint}; font-family: 'Inter', sans-serif; margin-top: 4px; }
        .evidence-tabs { display: flex; gap: 6px; margin-top: 8px; }
        .evidence-tabs button { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; color: ${COLORS.textFaint}; font-size: 10.5px; padding: 5px 9px; border-radius: 6px 6px 0 0; cursor: pointer; }
        .evidence-tabs button.active { color: ${COLORS.amber}; border-color: ${COLORS.amber}55; }
        .detail-image { position: relative; height: 100px; border-radius: 0 8px 8px 8px; background: linear-gradient(135deg, #262A36, #1B1D25); border: 1px solid ${COLORS.line}; overflow: hidden; }
        .bbox { position: absolute; left: 40%; top: 32%; width: 90px; height: 55px; border: 2px solid; border-radius: 3px; }
        .bbox-label { position: absolute; top: -18px; left: -2px; font-size: 9px; font-weight: 700; color: ${COLORS.bgDeep}; padding: 1px 5px; border-radius: 3px; white-space: nowrap; }
        .repair-frame { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
        .mini-panel-title { font-size: 11px; color: ${COLORS.textFaint}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 7px; }
        .impact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; font-size: 11.5px; color: ${COLORS.textMuted}; }
        .impact-grid span { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .confidence-total { margin-top: 8px; font-size: 12px; color: ${COLORS.textMuted}; }
        .priority-score-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .priority-total { font-family: 'Oswald', sans-serif; font-size: 15px; font-weight: 600; }
        .score-bar-row { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 5px; }
        .score-bar-label { width: 110px; color: ${COLORS.textMuted}; flex-shrink: 0; }
        .score-bar-track { flex: 1; height: 6px; background: ${COLORS.lineFaint}; border-radius: 4px; overflow: hidden; }
        .score-bar-fill { height: 100%; border-radius: 4px; }
        .score-bar-value { width: 24px; text-align: right; color: ${COLORS.textPrimary}; font-family: 'IBM Plex Mono', monospace; }
        .action-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
        .btn { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; padding: 8px 12px; border-radius: 7px; cursor: pointer; }
        .btn-outline { background: none; border: 1px solid ${COLORS.line}; color: ${COLORS.textPrimary}; }
        .btn-outline:hover { border-color: ${COLORS.amber}; color: ${COLORS.amber}; }
        .btn-solid { background: ${COLORS.amber}; border: 1px solid ${COLORS.amber}; color: ${COLORS.bgDeep}; }
        .btn-solid:disabled { opacity: 0.5; cursor: default; }

        .lifecycle { display: flex; flex-direction: column; }
        .lifecycle-step { display: flex; align-items: flex-start; gap: 10px; position: relative; padding-bottom: 14px; }
        .lifecycle-marker { width: 11px; height: 11px; border-radius: 50%; margin-top: 2px; flex-shrink: 0; }
        .lifecycle-line { position: absolute; left: 5px; top: 15px; bottom: 0; width: 2px; }
        .lifecycle-text { font-size: 12px; }
        .lifecycle-meta { font-size: 10px; color: ${COLORS.textFaint}; font-family: 'IBM Plex Mono', monospace; margin-top: 1px; }

        .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px; border: 1px solid; }
        .chip-dot { width: 6px; height: 6px; border-radius: 50%; }
        .status-pill { font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 20px; border: 1px solid; }
        .priority-badge { font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid; white-space: nowrap; }
        .priority-badge-label { font-weight: 500; }
        .source-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; }
        .ward-tag { font-size: 10px; color: ${COLORS.textFaint}; margin-left: 4px; }

        .filters { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
        .search-box { display: flex; align-items: center; gap: 6px; background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; border-radius: 8px; padding: 7px 10px; flex: 1; min-width: 180px; }
        .search-box input { background: none; border: none; outline: none; color: ${COLORS.textPrimary}; font-size: 12.5px; width: 100%; }
        select { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; color: ${COLORS.textMuted}; border-radius: 8px; padding: 7px 10px; font-size: 12px; }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; color: ${COLORS.textFaint}; font-weight: 500; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; padding: 8px 10px; border-bottom: 1px solid ${COLORS.line}; }
        td { padding: 10px; border-bottom: 1px solid ${COLORS.lineFaint}; color: ${COLORS.textPrimary}; }
        tbody tr { cursor: pointer; }
        tbody tr:hover { background: ${COLORS.bgCardHover}; }
        .issue-cell { display: flex; align-items: center; gap: 9px; }
        .dot { width: 9px; height: 9px; border-radius: 3px; transform: rotate(45deg); flex-shrink: 0; }
        .issue-type { font-weight: 500; }
        .issue-id { font-size: 10.5px; color: ${COLORS.textFaint}; font-family: 'IBM Plex Mono', monospace; }
        .mono { font-family: 'IBM Plex Mono', monospace; color: ${COLORS.textMuted}; font-size: 11px; }
        .chevron { color: ${COLORS.textFaint}; text-align: right; }
        .empty-row { text-align: center; color: ${COLORS.textFaint}; padding: 24px !important; }

        .bus-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .bus-card { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 13px; }
        .bus-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .bus-id { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 14px; }
        .status-tag { display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 20px; }
        .status-tag.on { color: ${COLORS.green}; background: ${COLORS.green}1A; }
        .status-tag.sync { color: ${COLORS.amber}; background: ${COLORS.amber}1A; }
        .status-tag.off { color: ${COLORS.red}; background: ${COLORS.red}1A; }
        .bus-route { font-size: 12px; color: ${COLORS.textMuted}; margin-bottom: 8px; }
        .bus-meta { display: flex; justify-content: space-between; font-size: 10.5px; color: ${COLORS.textFaint}; margin-bottom: 8px; }
        .bus-meta span { display: flex; align-items: center; gap: 4px; }
        .sensor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 8px; }
        .sensor-dot { display: flex; align-items: center; gap: 5px; font-size: 10px; color: ${COLORS.textFaint}; }
        .dotc { width: 6px; height: 6px; border-radius: 50%; }
        .bus-detections { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: ${COLORS.amber}; border-top: 1px solid ${COLORS.line}; padding-top: 8px; }

        .running-tag { display: flex; align-items: center; gap: 6px; font-size: 11px; color: ${COLORS.green}; font-family: 'IBM Plex Mono', monospace; font-weight: 600; }
        .camera-frame { position: relative; height: 220px; border-radius: 10px; background: linear-gradient(160deg, #232733, #14151B); border: 1px solid ${COLORS.line}; overflow: hidden; }
        .scan-line { position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, ${COLORS.amber}, transparent); animation: scan 2.6s linear infinite; }
        @keyframes scan { 0%{top:0} 100%{top:100%} }
        .bbox.live { position: absolute; width: 130px; height: 80px; border-width: 2px; border-style: solid; border-radius: 4px; animation: bboxpulse 1.6s ease-in-out infinite; }
        @keyframes bboxpulse { 0%,100%{opacity:1} 50%{opacity:0.55} }
        .camera-overlay-meta { position: absolute; bottom: 10px; left: 10px; display: flex; gap: 12px; font-size: 10.5px; color: ${COLORS.textMuted}; font-family: 'IBM Plex Mono', monospace; }
        .ai-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 14px; }
        .ai-stats div { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; border-radius: 8px; padding: 10px; }
        .ai-stats span { display: block; font-size: 10px; color: ${COLORS.textFaint}; margin-bottom: 4px; }
        .ai-stats b { font-family: 'Oswald', sans-serif; font-size: 14px; }
        .stream-list { display: flex; flex-direction: column; gap: 8px; }
        .stream-row { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; background: ${COLORS.bgPanel}; }
        .stream-thumb { width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
        .stream-main { flex: 1; font-size: 12px; }
        .stream-sub { font-size: 10.5px; color: ${COLORS.textFaint}; margin-top: 2px; }

        .queue-list { display: flex; flex-direction: column; gap: 8px; }
        .queue-row { display: flex; align-items: center; gap: 12px; background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 10px 12px; }
        .queue-rank { font-family: 'IBM Plex Mono', monospace; color: ${COLORS.textFaint}; width: 26px; }
        .queue-main { flex: 1; }
        .queue-title { font-weight: 600; font-size: 12.5px; }
        .queue-sub { font-size: 10.5px; color: ${COLORS.textFaint}; margin-top: 2px; }
        .queue-score { font-family: 'Oswald', sans-serif; font-size: 17px; font-weight: 600; color: ${COLORS.amber}; }
        .queue-score span { font-size: 10px; color: ${COLORS.textFaint}; font-family: 'Inter', sans-serif; }

        .forecast-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .forecast-card { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 13px; }
        .forecast-name { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: ${COLORS.textFaint}; margin-bottom: 8px; }
        .forecast-row { display: flex; justify-content: space-between; font-size: 11.5px; color: ${COLORS.textMuted}; margin-bottom: 4px; }
        .forecast-arrow { display: flex; align-items: center; gap: 6px; font-family: 'Oswald', sans-serif; font-size: 17px; font-weight: 600; margin: 8px 0; }
        .forecast-warn { font-size: 10.5px; color: ${COLORS.orange}; margin-bottom: 6px; }
        .forecast-authority { font-size: 10px; color: ${COLORS.textFaint}; border-top: 1px solid ${COLORS.line}; padding-top: 6px; }

        .gauge-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .gauge-card { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; align-items: center; }
        .gauge-card-name { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: ${COLORS.textFaint}; letter-spacing: 0.6px; margin-bottom: 4px; }
        .gauge-breakdown { display: flex; flex-direction: column; gap: 4px; width: 100%; margin-top: 8px; font-size: 11px; color: ${COLORS.textMuted}; }
        .gauge-breakdown span { display: flex; align-items: center; gap: 6px; }
        .gauge-breakdown i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; }
        .gauge-total { margin-top: 8px; font-size: 10.5px; color: ${COLORS.textFaint}; border-top: 1px solid ${COLORS.line}; padding-top: 7px; width: 100%; text-align: center; }

        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .summary-value { font-family: 'Oswald', sans-serif; font-size: 24px; font-weight: 600; color: ${COLORS.amber}; }
        .summary-label { font-size: 11.5px; color: ${COLORS.textMuted}; margin-top: 3px; }

        .action-loop { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
        .loop-node { font-size: 11px; font-family: 'IBM Plex Mono', monospace; color: ${COLORS.textPrimary}; background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; border-radius: 20px; padding: 6px 12px; white-space: nowrap; }
        .loop-node-final { color: ${COLORS.green}; border-color: ${COLORS.green}55; background: ${COLORS.green}14; font-weight: 600; }
        .loop-arrow { flex-shrink: 0; }

        .onboarding-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; min-height: 340px; color: ${COLORS.textMuted}; }
        .onboarding-title { font-family: 'Oswald', sans-serif; font-size: 16px; font-weight: 600; color: ${COLORS.textPrimary}; }
        .onboarding-panel p { max-width: 420px; font-size: 12.5px; color: ${COLORS.textFaint}; }

        .report-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .report-card { background: ${COLORS.bgPanel}; border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 14px; }
        .report-name { font-weight: 600; font-size: 13px; margin-bottom: 5px; }
        .report-desc { font-size: 11.5px; color: ${COLORS.textFaint}; margin-bottom: 10px; }
        .report-generated { margin-top: 8px; font-size: 11px; color: ${COLORS.green}; font-family: 'IBM Plex Mono', monospace; }

        select:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 980px) {
          .priority-kpi-grid, .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .two-col, .map-layout { flex-direction: column; }
          .bus-grid { grid-template-columns: repeat(2, 1fr); }
          .gauge-grid, .forecast-grid { grid-template-columns: 1fr; }
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
          .ai-stats { grid-template-columns: repeat(2, 1fr); }
          .report-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Navigation size={16} /></div>
          <div><div className="brand-name">ROADSENSE</div><div className="brand-sub">MUNICIPAL ROAD INTELLIGENCE</div></div>
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={"nav-item " + (tab === n.id ? "active" : "")} onClick={() => setTab(n.id)}>{n.icon} {n.label}</button>
        ))}
        <div className="sidebar-foot">DEMO DEPLOYMENT: DELHI<br />Scalable to any city / authority<br />v2.0.0 · Edge sync OK</div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div>
            <div className="topbar-title">{(NAV.find((n) => n.id === tab) || {}).label}</div>
            <div className="topbar-sub">AI-powered road condition &amp; maintenance intelligence, fed by the public bus fleet</div>
          </div>
          <div className="topbar-right">
            <span className="live-tag"><span className="live-dot" />LIVE · 25 AUG 2026</span>
            <div className="bell-wrap">
              <button className="bell-btn" onClick={() => setBellOpen((v) => !v)}>
                <Bell size={16} />
                {criticalAlerts.length > 0 && <span className="bell-badge">{criticalAlerts.length}</span>}
              </button>
              {bellOpen && (
                <div className="bell-dropdown">
                  <div className="bell-dropdown-title">Critical Road Alerts</div>
                  {criticalAlerts.slice(0, 4).map((a) => (
                    <div key={a.id} className="alert-card" style={{ marginBottom: 8 }}>
                      <div className="alert-top"><span className="alert-dot" /><div><div className="alert-title">{a.type} · {a.location}</div><div className="alert-sub">Confidence {a.confidence}% · {a.reports} confirmations</div></div></div>
                      <div className="action-row">
                        <button className="btn btn-outline" onClick={() => { setSelectedIssueId(a.id); setTab("map"); setBellOpen(false); }}>View</button>
                        <button className="btn btn-solid" onClick={() => { advanceStage(a.id, 3); setBellOpen(false); }}>Assign</button>
                      </div>
                    </div>
                  ))}
                  {criticalAlerts.length === 0 && <div style={{ fontSize: 12, color: COLORS.textFaint }}>No critical alerts right now.</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="jurisdiction-bar">
          <span>State</span>
          <select value={CITIES[cityFilter].state} disabled><option>{CITIES[cityFilter].state}</option></select>
          <span>City</span>
          <select value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setZoneFilter("All Zones"); setWardFilter("All Wards"); }}>
            {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
          </select>
          <span>Zone</span>
          <select value={zoneFilter} onChange={(e) => { setZoneFilter(e.target.value); setWardFilter("All Wards"); }} disabled={!CITIES[cityFilter].live}>
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
          <span>Ward</span>
          <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)} disabled={!CITIES[cityFilter].live}>
            {wardOptions.map((w) => <option key={w} value={w}>{w === "All Wards" ? w : "Ward " + w}</option>)}
          </select>
          <span className="jurisdiction-note">Platform is city-agnostic — Delhi shown as live demo, other cities pending onboarding</span>
        </div>

        <div className="content">
          {!CITIES[cityFilter].live ? (
            <div className="panel onboarding-panel">
              <Building2 size={26} color={COLORS.textFaint} />
              <div className="onboarding-title">{cityFilter} pilot deployment — onboarding in progress</div>
              <p>RoadSense is architected to run in any city on the same platform. {cityFilter}'s bus fleet, road network, and jurisdiction data haven't been provisioned yet — switch back to Delhi to view the live demo deployment.</p>
              <button className="btn btn-solid" onClick={() => setCityFilter("Delhi")}>Switch to Delhi</button>
            </div>
          ) : (
            <>
              {tab === "command" && <CommandCenterView issues={issuesState} setTab={setTab} setSelectedIssueId={setSelectedIssueId} advanceStage={advanceStage} zoneFilter={zoneFilter} wardFilter={wardFilter} />}
              {tab === "map" && <MapView issues={issuesState} selectedIssue={selectedIssue} setSelectedIssueId={setSelectedIssueId} advanceStage={advanceStage} />}
              {tab === "issues" && <IssuesView issues={issuesState} setTab={setTab} setSelectedIssueId={setSelectedIssueId} zoneFilter={zoneFilter} wardFilter={wardFilter} />}
              {tab === "maintenance" && <MaintenanceView issues={issuesState} setTab={setTab} setSelectedIssueId={setSelectedIssueId} advanceStage={advanceStage} zoneFilter={zoneFilter} wardFilter={wardFilter} />}
              {tab === "buses" && <BusesView />}
              {tab === "ai" && <AIMonitorView issues={issuesState} />}
              {tab === "analytics" && <AnalyticsView />}
              {tab === "reports" && <ReportsView issues={issuesState} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
