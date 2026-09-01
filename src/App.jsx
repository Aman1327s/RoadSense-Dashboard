import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Bus, MapPin, AlertTriangle, CheckCircle2, Activity, TrendingDown,
  TrendingUp, Wifi, WifiOff, Camera, Search, Home, Map as MapIcon,
  ListChecks, BarChart3, Clock, Navigation, X, ShieldCheck, UserCheck,
  Minus, Radio, Gauge as GaugeIcon, Bell, Wrench, ZoomIn, ZoomOut,
  Maximize2, Layers, Building2, RefreshCw, ChevronRight as ChevronR,
  Signal, Users, Eye
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

/* ------------------------------------------------------------------ */
/*  DESIGN TOKENS — LIGHT THEME & GOVERNMENT ORANGE ACCENT             */
/* ------------------------------------------------------------------ */
const COLORS = {
  primary: "#ea580c",
  primaryDark: "#c2410c",
  primaryLight: "#fff7ed",
  primaryBorder: "#fed7aa",
  bgApp: "#f8fafc",
  bgSurface: "#ffffff",
  bgSubtle: "#f1f5f9",
  line: "#e2e8f0",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  red: "#dc2626",
  redLight: "#fef2f2",
  redBorder: "#fecaca",
  orange: "#ea580c",
  orangeLight: "#fff7ed",
  orangeBorder: "#fed7aa",
  amber: "#d97706",
  amberLight: "#fffbeb",
  amberBorder: "#fde68a",
  green: "#16a34a",
  greenLight: "#f0fdf4",
  greenBorder: "#bbf7d0",
  blue: "#2563eb",
  violet: "#7c3aed",
  teal: "#0d9488",
  dust: "#b45309",
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
  "AI / Bus Detection": { icon: <Activity size={12} />, color: COLORS.amber },
  "Citizen Complaint": { icon: <Users size={12} />, color: COLORS.blue },
  "Field Inspection": { icon: <ShieldCheck size={12} />, color: COLORS.teal },
  "IoT Sensor": { icon: <Signal size={12} />, color: COLORS.violet },
};

function healthColor(score) {
  const stops = [[0, [220, 38, 38]], [35, [234, 88, 12]], [60, [217, 119, 6]], [80, [101, 163, 13]], [100, [22, 163, 74]]];
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
  const sevScore = { High: 90, Medium: 60, Low: 30 }[issue.severity] || 50;
  const confScore = issue.confidence;
  const repeatScore = Math.min(issue.reports * 11, 100);
  const trafficScore = { HIGH: 95, MEDIUM: 65, LOW: 35 }[issue.traffic] || 50;
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
const initialRoads = [
  { name: "Ring Road", zone: "South", ward: 42, authority: "PWD", contractor: "Shree Infra Works", traffic: "HIGH", roadClass: "Arterial", proximity: "Major Junction", potholes: 18, cracks: 12, waterlogging: 4, debris: 7, score: 62, trend: "down", forecast: 48, recurrence: "HIGH" },
  { name: "MG Road", zone: "South", ward: 8, authority: "Municipal Corporation", contractor: "Delhi Roadways Ltd.", traffic: "HIGH", roadClass: "Arterial", proximity: "School Zone", potholes: 9, cracks: 14, waterlogging: 1, debris: 5, score: 74, trend: "up", forecast: 79, recurrence: "LOW" },
  { name: "Karol Bagh", zone: "Central", ward: 27, authority: "Municipal Corporation", contractor: "Nirman Constructions", traffic: "MEDIUM", roadClass: "Collector", proximity: "Hospital Zone", potholes: 6, cracks: 10, waterlogging: 0, debris: 8, score: 81, trend: "flat", forecast: 80, recurrence: "LOW" },
  { name: "NH-48", zone: "South", ward: 55, authority: "NHAI", contractor: "NHAI Zone-3 Maintenance", traffic: "HIGH", roadClass: "Arterial", proximity: "None", potholes: 12, cracks: 3, waterlogging: 0, debris: 2, score: 70, trend: "down", forecast: 60, recurrence: "MEDIUM" },
  { name: "CP Outer Circle", zone: "Central", ward: 5, authority: "Municipal Corporation", contractor: "Delhi Roadways Ltd.", traffic: "LOW", roadClass: "Collector", proximity: "Major Junction", potholes: 4, cracks: 5, waterlogging: 0, debris: 3, score: 88, trend: "up", forecast: 91, recurrence: "LOW" },
  { name: "Chandni Chowk", zone: "North", ward: 33, authority: "Drainage Dept.", contractor: "Jal Nirmaan Pvt Ltd", traffic: "MEDIUM", roadClass: "Local", proximity: "School Zone", potholes: 8, cracks: 6, waterlogging: 6, debris: 2, score: 66, trend: "down", forecast: 54, recurrence: "HIGH" },
];
const roadInfo = Object.fromEntries(initialRoads.map((r) => [r.name, r]));

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

const initialBuses = [
  { id: "Bus #24", route: "Route 521 (Outer Ring)", status: "ONLINE", lastSync: "10 sec ago", detections: 214, x: 235, y: 130, heading: 110, speed: 37, road: "Ring Road", sensors: { camera: true, gps: true, ai: true, network: true } },
  { id: "Bus #31", route: "Route 405 (Karol Bagh - CP)", status: "ONLINE", lastSync: "18 sec ago", detections: 187, x: 480, y: 255, heading: 20, speed: 24, road: "Karol Bagh", sensors: { camera: true, gps: true, ai: true, network: true } },
  { id: "Bus #42", route: "Route 723 (Old Delhi Line)", status: "OFFLINE", lastSync: "14 min ago", detections: 96, x: 320, y: 365, heading: 260, speed: 0, road: "Chandni Chowk", sensors: { camera: false, gps: true, ai: false, network: false } },
  { id: "Bus #17", route: "Route 118 (MG Road Exp)", status: "ONLINE", lastSync: "31 sec ago", detections: 152, x: 555, y: 160, heading: 300, speed: 41, road: "MG Road", sensors: { camera: true, gps: true, ai: true, network: true } },
  { id: "Bus #08", route: "Route 902 (NH-48 Corridor)", status: "SYNCING", lastSync: "3 min ago", detections: 260, x: 655, y: 405, heading: 200, speed: 18, road: "NH-48", sensors: { camera: true, gps: true, ai: true, network: false } },
  { id: "Bus #55", route: "Route 214 (Connaught Loop)", status: "OFFLINE", lastSync: "48 min ago", detections: 61, x: 140, y: 330, heading: 40, speed: 0, road: "CP Outer Circle", sensors: { camera: false, gps: false, ai: false, network: false } },
];

const analyticsDataByPeriod = {
  "7D": [
    { day: "Mon", count: 62, resolved: 48 }, { day: "Tue", count: 74, resolved: 59 },
    { day: "Wed", count: 51, resolved: 45 }, { day: "Thu", count: 88, resolved: 70 },
    { day: "Fri", count: 95, resolved: 78 }, { day: "Sat", count: 40, resolved: 36 },
    { day: "Sun", count: 33, resolved: 30 },
  ],
  "30D": [
    { day: "Week 1", count: 320, resolved: 280 }, { day: "Week 2", count: 410, resolved: 365 },
    { day: "Week 3", count: 385, resolved: 340 }, { day: "Week 4", count: 295, resolved: 275 },
  ],
  "90D": [
    { day: "June", count: 1420, resolved: 1290 }, { day: "July", count: 1840, resolved: 1610 },
    { day: "August", count: 1284, resolved: 1195 },
  ],
};

const severityDist = [
  { name: "High Severity", value: 183, color: COLORS.red },
  { name: "Medium Severity", value: 402, color: COLORS.orange },
  { name: "Low Severity", value: 699, color: COLORS.dust },
];

const ROAD_LATLNGS = {
  "Ring Road": [[28.5800, 77.1900], [28.6050, 77.1700], [28.6350, 77.1850], [28.6500, 77.2200], [28.6350, 77.2500], [28.6050, 77.2600], [28.5800, 77.2400], [28.5750, 77.2100], [28.5800, 77.1900]],
  "MG Road": [[28.4950, 77.0350], [28.4700, 77.0600], [28.4595, 77.0725], [28.4450, 77.0900]],
  "Karol Bagh": [[28.6450, 77.1850], [28.6550, 77.1850], [28.6550, 77.1970], [28.6450, 77.1970], [28.6450, 77.1850]],
  "NH-48": [[28.5000, 77.0100], [28.4700, 77.0500], [28.4200, 77.0850], [28.3700, 77.1200]],
  "CP Outer Circle": [[28.6280, 77.2100], [28.6350, 77.2130], [28.6350, 77.2210], [28.6280, 77.2230], [28.6260, 77.2160], [28.6280, 77.2100]],
  "Chandni Chowk": [[28.6580, 77.2280], [28.6500, 77.2300], [28.6430, 77.2320]],
};

const ROAD_ANCHOR = {
  "Ring Road": [28.6139, 77.2090], "MG Road": [28.4595, 77.0725], "Karol Bagh": [28.6500, 77.1910],
  "NH-48": [28.4700, 77.0500], "CP Outer Circle": [28.6300, 77.2165], "Chandni Chowk": [28.6506, 77.2303],
};

function toLatLng(roadName, x, y) {
  const base = ROAD_ANCHOR[roadName] || ROAD_ANCHOR["Ring Road"];
  const dLat = ((250 - y) / 500) * 0.05;
  const dLng = ((x - 400) / 800) * 0.06;
  return [base[0] + dLat, base[1] + dLng];
}
const DELHI_NCR_CENTER = [28.58, 77.18];

/* ------------------------------------------------------------------ */
/*  LEAFLET ICON FACTORIES                                             */
/* ------------------------------------------------------------------ */
function signIcon(type, severity, active) {
  const c = TYPE_META[type].color;
  const size = severity === "High" ? 14 : 11;
  const pulse = severity === "High"
    ? `<span style="position:absolute;inset:${-8}px;border-radius:999px;background:${c};opacity:.25;animation:rsPulse 2s infinite;"></span>` : "";
  const html = `
    <div style="position:relative;width:${size * 2}px;height:${size * 2}px;transform:translate(-50%,-50%);cursor:pointer;filter:drop-shadow(0 2px 4px rgba(15,23,42,0.25));">
      ${pulse}
      <div style="position:absolute;inset:0;background:#ffffff;border:${active ? 3 : 2}px solid ${c};border-radius:4px;transform:rotate(45deg);"></div>
      <div style="position:absolute;left:50%;top:50%;width:${size * 0.7}px;height:${size * 0.7}px;background:${c};border-radius:999px;transform:translate(-50%,-50%);"></div>
    </div>`;
  return L.divIcon({ html, className: "rs-marker", iconSize: [size * 2, size * 2] });
}

function clusterIcon(count, color) {
  const html = `
    <div style="position:relative;width:34px;height:34px;transform:translate(-50%,-50%);cursor:pointer;filter:drop-shadow(0 2px 5px rgba(15,23,42,0.18));">
      <div style="position:absolute;inset:0;border-radius:999px;background:${color};opacity:.2;"></div>
      <div style="position:absolute;inset:4px;border-radius:999px;background:#ffffff;border:2.5px solid ${color};display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:${color};">${count}</div>
    </div>`;
  return L.divIcon({ html, className: "rs-marker", iconSize: [34, 34] });
}

function busIcon(bus, showLabel) {
  const statusColor = bus.status === "ONLINE" ? COLORS.green : bus.status === "SYNCING" ? COLORS.amber : COLORS.red;
  const label = showLabel ? `<div style="position:absolute;left:16px;top:-5px;white-space:nowrap;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:${COLORS.textSecondary};background:#ffffff;padding:1px 5px;border-radius:4px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);">${bus.id}</div>` : "";
  const html = `
    <div style="position:relative;width:22px;height:22px;transform:translate(-50%,-50%);opacity:${bus.status === "OFFLINE" ? 0.5 : 1};filter:drop-shadow(0 2px 4px rgba(15,23,42,0.2));">
      <svg width="22" height="22" viewBox="-11 -11 22 22" style="transform:rotate(${bus.heading}deg);">
        <path d="M 0 -11 L 8 9 L 0 5 L -8 9 Z" fill="${statusColor}" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" />
      </svg>
      ${label}
    </div>`;
  return L.divIcon({ html, className: "rs-marker", iconSize: [22, 22] });
}

const TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function RoadOverlay({ heatmap }) {
  return (
    <>
      {Object.entries(ROAD_LATLNGS).map(([name, positions]) => (
        <Polyline
          key={name}
          positions={positions}
          pathOptions={{
            color: heatmap ? healthColor(roadInfo[name].score) : COLORS.primary,
            weight: heatmap ? 6 : 4,
            opacity: heatmap ? 0.85 : 0.75,
          }}
        >
          <Popup>
            <div style={{ padding: "4px 2px" }}>
              <strong style={{ fontSize: 13, color: COLORS.textPrimary }}>{name}</strong><br />
              <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Health score: <b style={{ color: healthColor(roadInfo[name].score) }}>{roadInfo[name].score}/100</b> · {roadInfo[name].authority}</span><br />
              <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Zone {roadInfo[name].zone} · Ward {roadInfo[name].ward}</span>
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  );
}

function MiniMap({ issues, onSelectIssue }) {
  return (
    <MapContainer center={DELHI_NCR_CENTER} zoom={11} style={{ height: 260, width: "100%", borderRadius: 8, border: `1px solid ${COLORS.line}` }} scrollWheelZoom={false} attributionControl={false}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
      <RoadOverlay />
      {issues.map((iss) => {
        const pos = toLatLng(iss.location, iss.x, iss.y);
        return (
          <Marker key={iss.id} position={pos} icon={signIcon(iss.type, iss.severity, false)} eventHandlers={{ click: () => onSelectIssue(iss) }}>
            <Popup>
              <div style={{ padding: 2 }}>
                <strong>{iss.type} ({iss.severity})</strong><br />
                <span>{iss.location}</span><br />
                <button className="btn btn-solid" style={{ marginTop: 6, padding: "3px 8px", fontSize: 10.5 }} onClick={() => onSelectIssue(iss)}>View Details</button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

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
        <path d={arcPath(180, 0, r)} stroke="#e2e8f0" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d={arcPath(180, scoreAngle, r)} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={COLORS.textPrimary} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4.5" fill={COLORS.textPrimary} />
        <text x={cx} y={cy - 20} textAnchor="middle" fontFamily="'Plus Jakarta Sans', sans-serif" fontSize="22" fontWeight="700" fill={COLORS.textPrimary}>{score}</text>
        <text x={cx} y={cy - 2} textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="9.5" fontWeight="500" fill={COLORS.textMuted}>/ 100</text>
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, color: trendColor, fontFamily: "'JetBrains Mono', monospace" }}>
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
            <div className="lifecycle-marker" style={{ background: done ? STAGE_COLOR[i] : "#cbd5e1", boxShadow: done ? `0 0 0 3px ${STAGE_COLOR[i]}25` : "none" }} />
            <div className="lifecycle-text">
              <div style={{ color: done ? COLORS.textPrimary : COLORS.textFaint, fontWeight: done ? 600 : 400 }}>{s}</div>
              {entry && <div className="lifecycle-meta">{entry.actor} · {entry.time}</div>}
            </div>
            {i < STAGES.length - 1 && <div className="lifecycle-line" style={{ background: i < stageIndex ? STAGE_COLOR[i] : "#e2e8f0" }} />}
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
/*  SMALL PRIMITIVES                                                   */
/* ------------------------------------------------------------------ */
function SeverityChip({ severity }) {
  const c = SEVERITY_META[severity];
  const bg = severity === "High" ? COLORS.redLight : severity === "Medium" ? COLORS.orangeLight : COLORS.amberLight;
  const border = severity === "High" ? COLORS.redBorder : severity === "Medium" ? COLORS.orangeBorder : COLORS.amberBorder;
  return (
    <span className="chip" style={{ color: c, borderColor: border, background: bg }}>
      <span className="chip-dot" style={{ background: c }} />
      {severity}
    </span>
  );
}

function StagePill({ idx }) {
  const c = STAGE_COLOR[idx];
  return (
    <span className="status-pill" style={{ color: c, borderColor: c + "40", background: c + "10" }}>
      {STAGES[idx]}
    </span>
  );
}

function PriorityBadge({ score, compact }) {
  const t = tierOf(score);
  const bg = t.tier === "P1" ? COLORS.redLight : t.tier === "P2" ? COLORS.orangeLight : t.tier === "P3" ? COLORS.amberLight : COLORS.bgSubtle;
  const border = t.tier === "P1" ? COLORS.redBorder : t.tier === "P2" ? COLORS.orangeBorder : t.tier === "P3" ? COLORS.amberBorder : COLORS.line;
  return (
    <span className="priority-badge" style={{ color: t.color, borderColor: border, background: bg }}>
      {t.tier}{!compact && <span className="priority-badge-label"> · {t.label}</span>}
    </span>
  );
}

function SourceTag({ source }) {
  const m = SOURCE_META[source] || { icon: <Activity size={12} />, color: COLORS.primary };
  return (
    <span className="source-tag" style={{ color: m.color }}>
      {m.icon} <span>{source}</span>
    </span>
  );
}

function KpiCard({ icon, label, value, accent, sub, onClick }) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${accent}`, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div className="kpi-top">
        <div className="kpi-icon" style={{ color: accent, background: accent + "14" }}>{icon}</div>
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
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color || COLORS.primary }} />
      </div>
      <span className="score-bar-value">{Math.round(value)}</span>
    </div>
  );
}

function SensorDot({ label, ok }) {
  return (
    <span className="sensor-dot">
      <span className="dotc" style={{ background: ok ? COLORS.green : COLORS.red, boxShadow: `0 0 0 2.5px ${ok ? COLORS.greenLight : COLORS.redLight}` }} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  ISSUE DETAIL MODAL DIALOG                                          */
/* ------------------------------------------------------------------ */
function IssueDetailModal({ issue, onClose, advanceStage, onToast }) {
  const [showEvidence, setShowEvidence] = useState("before");
  if (!issue) return null;

  const meta = TYPE_META[issue.type];
  const p = computePriority(issue);
  const trail = buildAuditTrail(issue.stageIndex, issue.date);

  const handleAdvance = (targetIdx, actionName) => {
    advanceStage(issue.id, targetIdx);
    onToast(`Status updated: ${STAGES[targetIdx]} (${actionName})`);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="detail-eyebrow" style={{ color: meta.color }}>{issue.type.toUpperCase()} · VERIFIED ROAD DEFECT #{issue.id}</div>
            <div className="detail-location-title">{issue.location} Corridor</div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close modal"><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="modal-grid">
            <div className="modal-col">
              <div className="meta-card">
                <div className="detail-row"><MapPin size={14} color={COLORS.textMuted} /> GPS: <strong>{toLatLng(issue.location, issue.x, issue.y).map((v) => v.toFixed(4)).join(", ")}</strong></div>
                <div className="detail-row"><Bus size={14} color={COLORS.textMuted} /> Detected by: <strong>{issue.bus}</strong> ({issue.reports} corroborations)</div>
                <div className="detail-row"><Building2 size={14} color={COLORS.textMuted} /> Authority: <strong>{issue.authority}</strong> (Zone {issue.zone}, Ward {issue.ward})</div>
                <div className="detail-row"><Clock size={14} color={COLORS.textMuted} /> Timestamp: <strong>{issue.date} · {issue.time}</strong></div>
                <div style={{ marginTop: 8 }}><SourceTag source={issue.source} /></div>
              </div>

              <div className="evidence-tabs">
                <button className={showEvidence === "before" ? "active" : ""} onClick={() => setShowEvidence("before")}>AI Detection Frame</button>
                {issue.stageIndex >= 5 && <button className={showEvidence === "after" ? "active" : ""} onClick={() => setShowEvidence("after")}>Post-Repair Inspection</button>}
              </div>
              <div className="detail-image" style={{ height: 160 }}>
                {showEvidence === "before" ? (
                  <>
                    <div className="bbox" style={{ borderColor: meta.color, left: "35%", top: "25%", width: 140, height: 80 }}>
                      <span className="bbox-label" style={{ background: meta.color }}>{issue.type} {issue.confidence}%</span>
                    </div>
                    <div className="camera-watermark"><Camera size={13} /> On-Bus Edge Camera · Frame ID #{issue.id} · 1080p</div>
                  </>
                ) : (
                  <div className="repair-frame">
                    <CheckCircle2 size={32} color={COLORS.green} />
                    <span style={{ color: COLORS.green, fontSize: 13, fontWeight: 700 }}>AI Post-Repair Re-verification: {issue.stageIndex >= 6 ? "PASSED" : "Pending Inspection"}</span>
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>No surface deformation detected on follow-up bus pass</span>
                  </div>
                )}
              </div>

              <div className="mini-panel-title" style={{ marginTop: 16 }}>Multi-Sensor Impact Validation</div>
              <div className="impact-grid">
                <span>AI Vision Detection <CheckCircle2 size={13} color={COLORS.green} /></span>
                <span>GPS Corridor Match <CheckCircle2 size={13} color={COLORS.green} /></span>
                <span>IMU Vibration Impact <CheckCircle2 size={13} color={issue.type === "Pothole" ? COLORS.green : COLORS.textFaint} /></span>
                <span>Fleet Corroborations <b>{issue.reports} buses</b></span>
              </div>
            </div>

            <div className="modal-col">
              <div className="priority-header-box">
                <div>
                  <span className="mini-panel-title" style={{ margin: 0 }}>Computed Priority Score</span>
                  <div className="priority-total" style={{ fontSize: 24 }}>{p.total} <span style={{ fontSize: 13, color: COLORS.textMuted }}>/ 100</span></div>
                </div>
                <PriorityBadge score={p.total} />
              </div>

              <div style={{ marginTop: 8 }}>
                <ScoreBar label="Severity Weight" value={p.sevScore} color={COLORS.red} />
                <ScoreBar label="AI Confidence" value={p.confScore} color={COLORS.primary} />
                <ScoreBar label="Repeat Detections" value={p.repeatScore} color={COLORS.violet} />
                <ScoreBar label="Traffic Corridor" value={p.trafficScore} color={COLORS.blue} />
                <ScoreBar label="Road Class" value={p.roadClassScore} color={COLORS.green} />
                <ScoreBar label="Proximity Risk" value={p.proximityScore} color={COLORS.orange} />
                <ScoreBar label="Recency" value={p.recencyScore} color={COLORS.teal} />
              </div>

              <div className="detail-reason-box">
                <strong>Scoring Rationale:</strong> {issue.severity.toLowerCase()} severity {issue.type.toLowerCase()} logged on a {issue.traffic.toLowerCase()}-density {issue.roadClass.toLowerCase()} corridor ({issue.location}){issue.proximity !== "None" ? ` near a ${issue.proximity.toLowerCase()}` : ""}. Assigned to {issue.authority} for targeted remediation.
              </div>

              <div className="mini-panel-title" style={{ marginTop: 14 }}>Resolution Lifecycle &amp; Audit Trail</div>
              <LifecycleStepper stageIndex={issue.stageIndex} auditTrail={trail} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={() => handleAdvance(2, "Supervisor Verified")}><ShieldCheck size={15} /> Supervisor Verify</button>
          <button className="btn btn-outline" onClick={() => handleAdvance(3, `Assigned to ${issue.authority}`)}><UserCheck size={15} /> Assign to {issue.authority}</button>
          <button className="btn btn-solid" onClick={() => handleAdvance(Math.min(issue.stageIndex + 1, 7), STAGES[Math.min(issue.stageIndex + 1, 7)])} disabled={issue.stageIndex >= 7}>
            <CheckCircle2 size={15} /> {issue.stageIndex >= 7 ? "Resolved & Closed" : `Advance to: ${STAGES[Math.min(issue.stageIndex + 1, 7)]}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FULL-WIDTH LIVE ROAD MAP VIEW                                      */
/* ------------------------------------------------------------------ */
function ZoomWatcher({ onZoom }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}

function MapRefGrabber({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function MapView({ issues, setSelectedIssue, buses }) {
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
      const worst = arr.some((i) => i.severity === "High") ? COLORS.red : arr.some((i) => i.severity === "Medium") ? COLORS.orange : COLORS.amber;
      return { loc, pos: [avgLat, avgLng], count: arr.length, color: worst, issues: arr };
    });
  }, [filteredIssues]);

  return (
    <div className="view-stack">
      <div className="panel full-map-panel">
        <div className="panel-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="panel-title" style={{ fontSize: 16 }}><MapIcon size={18} color={COLORS.primary} /> Regional Real-Time Road Infrastructure GIS Map</span>
            <span className="queue-count-badge">{filteredIssues.length} Active Defects Plotted</span>
          </div>
          <div className="map-controls">
            <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
              {["All", "High", "Medium", "Low"].map((t) => <option key={t} value={t}>{t === "All" ? "All Severities" : t + " Severity"}</option>)}
            </select>
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              <option value="1">Last 1 hour</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
            </select>
          </div>
        </div>

        <div className="layer-toggles" style={{ marginBottom: 12 }}>
          {[["issues", "Defect Markers"], ["buses", "Transit Fleet Telemetry"], ["routes", "Bus Transit Corridors"], ["heatmap", "Road Health Overlays"]].map((pair) => (
            <button key={pair[0]} className={`layer-chip ${layers[pair[0]] ? "on" : ""}`} onClick={() => toggleLayer(pair[0])}>
              <Layers size={13} /> {pair[1]}
            </button>
          ))}
        </div>

        <div className="map-frame full-map-frame">
          <MapContainer center={DELHI_NCR_CENTER} zoom={11} style={{ height: "100%", minHeight: 580, width: "100%" }} zoomControl={false} attributionControl={true}>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
            <ZoomWatcher onZoom={setZoom} />
            <MapRefGrabber mapRef={mapRef} />

            <RoadOverlay heatmap={layers.heatmap} />

            {layers.routes && buses.filter((b) => b.status !== "OFFLINE").map((b) => {
              const anchor = ROAD_ANCHOR[b.road] || DELHI_NCR_CENTER;
              const pos = toLatLng(b.road, b.x, b.y);
              return (
                <Polyline key={b.id} positions={[anchor, pos]} pathOptions={{ color: COLORS.primary, weight: 3, dashArray: "6 6", opacity: 0.75 }} />
              );
            })}

            {layers.buses && buses.map((b) => (
              <Marker key={b.id} position={toLatLng(b.road, b.x, b.y)} icon={busIcon(b, zoom >= 12)}>
                <Popup>
                  <div style={{ padding: "4px 2px" }}>
                    <strong style={{ fontSize: 13, color: COLORS.textPrimary }}>{b.id}</strong> · {b.route}<br />
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>Status: <b>{b.status}</b> · {b.speed} km/h on {b.road}</span><br />
                    <span style={{ fontSize: 10.5, color: COLORS.textFaint }}>Last sync: {b.lastSync}</span>
                  </div>
                </Popup>
              </Marker>
            ))}

            {layers.issues && (clustered
              ? groups.map((g) => (
                <Marker key={g.loc} position={g.pos} icon={clusterIcon(g.count, g.color)} eventHandlers={{ click: () => mapRef.current && mapRef.current.setView(g.pos, 14) }}>
                  <Popup>
                    <div style={{ padding: 2 }}>
                      <strong>{g.loc} Corridor</strong><br />
                      <span>{g.count} defects identified</span><br />
                      <button className="btn btn-solid" style={{ marginTop: 6, padding: "3px 8px", fontSize: 10.5 }} onClick={() => setSelectedIssue(g.issues[0])}>Inspect Corridor</button>
                    </div>
                  </Popup>
                </Marker>
              ))
              : filteredIssues.map((iss) => (
                <Marker
                  key={iss.id}
                  position={toLatLng(iss.location, iss.x, iss.y)}
                  icon={signIcon(iss.type, iss.severity, false)}
                  eventHandlers={{ click: () => setSelectedIssue(iss) }}
                >
                  <Popup>
                    <div style={{ padding: 4 }}>
                      <strong style={{ color: COLORS.textPrimary, fontSize: 13 }}>{iss.type} (#{iss.id})</strong><br />
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>{iss.location} · Ward {iss.ward}</span><br />
                      <span style={{ fontSize: 11, color: COLORS.primary, fontWeight: 600 }}>Confidence: {iss.confidence}%</span><br />
                      <button className="btn btn-solid" style={{ marginTop: 6, padding: "4px 10px", fontSize: 11, width: "100%", justifyContent: "center" }} onClick={() => setSelectedIssue(iss)}>
                        Open Full Details Modal
                      </button>
                    </div>
                  </Popup>
                </Marker>
              )))}
          </MapContainer>

          <div className="zoom-controls">
            <button onClick={() => mapRef.current && mapRef.current.zoomIn()} title="Zoom In"><ZoomIn size={15} /></button>
            <button onClick={() => mapRef.current && mapRef.current.zoomOut()} title="Zoom Out"><ZoomOut size={15} /></button>
            <button onClick={() => mapRef.current && mapRef.current.setView(DELHI_NCR_CENTER, 11)} title="Reset View"><Maximize2 size={14} /></button>
          </div>
          {clustered && layers.issues && <div className="cluster-hint">Corridor clustering active · Zoom in to pinpoint single defect markers</div>}
        </div>

        <div className="legend" style={{ marginTop: 14 }}>
          <span className="legend-label">Identified Defect Signatures:</span>
          {Object.entries(TYPE_META).map(([k, v]) => (
            <span key={k} className="legend-item">
              <span className="legend-dot" style={{ background: v.color }} />
              {v.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  COMMAND CENTER VIEW                                                */
/* ------------------------------------------------------------------ */
function CommandCenterView({ issues, setTab, setSelectedIssue, advanceStage, zoneFilter, wardFilter, onToast }) {
  const scoped = issues.filter((i) => (zoneFilter === "All Zones" || i.zone === zoneFilter) && (wardFilter === "All Wards" || String(i.ward) === wardFilter));
  const withScore = scoped.map((i) => ({ ...i, ...computePriority(i) }));
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  withScore.forEach((i) => { counts[tierOf(i.total).tier]++; });
  const resolved = scoped.filter((i) => i.stageIndex === 7).length;
  const critical = withScore.filter((i) => tierOf(i.total).tier === "P1" && i.stageIndex < 5).sort((a, b) => b.total - a.total).slice(0, 4);

  const topRoads = [...initialRoads].sort((a, b) => (b.potholes + b.cracks + b.waterlogging + b.debris) - (a.potholes + a.cracks + a.waterlogging + a.debris));
  const maxTotal = topRoads[0].potholes + topRoads[0].cracks + topRoads[0].waterlogging + topRoads[0].debris;
  const onlineC = initialBuses.filter((b) => b.status === "ONLINE").length, syncC = initialBuses.filter((b) => b.status === "SYNCING").length, offC = initialBuses.filter((b) => b.status === "OFFLINE").length;

  const handleQuickDispatch = (id, authority) => {
    advanceStage(id, 3);
    onToast(`Maintenance dispatched to ${authority} for issue #${id}`);
  };

  return (
    <div className="view-stack">
      <div className="priority-kpi-grid">
        <KpiCard icon={<AlertTriangle size={18} />} label="P1 Critical Action" value={counts.P1} accent={COLORS.red} sub="Immediate Dispatch" onClick={() => setTab("issues")} />
        <KpiCard icon={<Radio size={18} />} label="P2 High Priority" value={counts.P2} accent={COLORS.orange} sub="48-hr SLA" onClick={() => setTab("issues")} />
        <KpiCard icon={<Activity size={18} />} label="P3 Normal Queue" value={counts.P3} accent={COLORS.amber} sub="Scheduled Repair" onClick={() => setTab("issues")} />
        <KpiCard icon={<CheckCircle2 size={18} />} label="Resolved & Verified" value={resolved} accent={COLORS.green} sub="Current Period" onClick={() => setTab("issues")} />
      </div>

      <div className="two-col">
        <div className="panel" style={{ flex: 1.1 }}>
          <div className="panel-head">
            <div>
              <span className="panel-title"><AlertTriangle size={16} color={COLORS.red} /> Critical Action Queue</span>
              <div className="panel-sub">Highest priority safety risks flagged by AI multi-bus confirmation</div>
            </div>
            <span className="queue-count-badge">{critical.length} Urgent</span>
          </div>
          <div className="alert-list">
            {critical.map((iss) => (
              <div className="alert-card" key={iss.id}>
                <div className="alert-top">
                  <span className="alert-dot" />
                  <div style={{ flex: 1 }}>
                    <div className="alert-title">{iss.type} · {iss.location}</div>
                    <div className="alert-sub">{iss.reports} corroborating detections · Last detected {iss.lastSeen}</div>
                  </div>
                  <PriorityBadge score={iss.total} compact />
                </div>
                <div className="alert-meta">Multi-Sensor Confidence: {iss.confidence}% · Authority: <strong>{iss.authority}</strong> (Ward {iss.ward})</div>
                <div className="action-row">
                  <button className="btn btn-outline" onClick={() => setSelectedIssue(iss)}><Eye size={13} /> Inspect Details</button>
                  <button className="btn btn-solid" onClick={() => handleQuickDispatch(iss.id, iss.authority)}><CheckCircle2 size={13} /> Dispatch Maintenance</button>
                </div>
              </div>
            ))}
            {critical.length === 0 && <div className="empty-row">No P1 critical defects requiring immediate action in this jurisdiction.</div>}
          </div>
        </div>

        <div className="panel" style={{ flex: 0.9 }}>
          <div className="panel-head">
            <div>
              <span className="panel-title"><MapIcon size={16} color={COLORS.primary} /> Regional Defect Map</span>
              <div className="panel-sub">Live spatial clustering across Delhi NCR</div>
            </div>
            <button className="link-btn" onClick={() => setTab("map")}>Full Screen Map →</button>
          </div>
          <MiniMap issues={issues} onSelectIssue={setSelectedIssue} />
        </div>
      </div>

      <div className="two-col">
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head">
            <span className="panel-title"><BarChart3 size={16} color={COLORS.primary} /> Most Problematic Road Corridors</span>
            <span className="panel-sub">Ranked by total open defects</span>
          </div>
          <div className="bar-list">
            {topRoads.map((r, i) => {
              const total = r.potholes + r.cracks + r.waterlogging + r.debris;
              return (
                <div className="bar-row" key={r.name}>
                  <span className="bar-rank">0{i + 1}</span>
                  <span className="bar-name">{r.name}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(total / maxTotal) * 100}%` }} />
                  </div>
                  <span className="bar-count">{total}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head">
            <span className="panel-title"><Bus size={16} color={COLORS.primary} /> Municipal Fleet Telemetry</span>
            <div className="fleet-strip">
              <div><span className="fleet-dot" style={{ background: COLORS.green }} />{onlineC} Live</div>
              <div><span className="fleet-dot" style={{ background: COLORS.amber }} />{syncC} Syncing</div>
              <div><span className="fleet-dot" style={{ background: COLORS.red }} />{offC} Offline</div>
            </div>
          </div>
          <div className="fleet-info-box">
            <div className="fleet-stat">
              <div className="fleet-stat-num">98.2%</div>
              <div className="fleet-stat-label">Corridor Coverage</div>
            </div>
            <div className="fleet-stat">
              <div className="fleet-stat-num">54 ms</div>
              <div className="fleet-stat-label">On-Device Edge Inference</div>
            </div>
            <div className="fleet-stat">
              <div className="fleet-stat-num">6 Buses</div>
              <div className="fleet-stat-label">Active Pilot Route</div>
            </div>
          </div>
          <div className="detail-row muted" style={{ marginTop: 14 }}>
            <strong>Offline-first edge architecture:</strong> Detections and vibration telemetry are captured locally on each bus unit and synced automatically via 4G/5G upon entering depot / cellular coverage.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ISSUES & ALERTS TABLE VIEW                                         */
/* ------------------------------------------------------------------ */
function IssuesView({ issues, setSelectedIssue, zoneFilter, wardFilter }) {
  const [typeFilter, setTypeFilter] = useState("All");
  const [sevFilter, setSevFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => issues.filter((i) =>
    (zoneFilter === "All Zones" || i.zone === zoneFilter) &&
    (wardFilter === "All Wards" || String(i.ward) === wardFilter) &&
    (typeFilter === "All" || i.type === typeFilter) &&
    (sevFilter === "All" || i.severity === sevFilter) &&
    (stageFilter === "All" || (stageFilter === "Open" && i.stageIndex < 7) || (stageFilter === "Resolved" && i.stageIndex === 7)) &&
    (search === "" || i.location.toLowerCase().includes(search.toLowerCase()) || i.id.toLowerCase().includes(search.toLowerCase()))
  ), [issues, typeFilter, sevFilter, stageFilter, search, zoneFilter, wardFilter]);

  const select = (arr) => ["All"].concat(arr);

  return (
    <div className="view-stack">
      <div className="panel">
        <div className="panel-head">
          <div>
            <span className="panel-title"><ListChecks size={16} color={COLORS.primary} /> Municipal Defect Registry &amp; Alerts</span>
            <div className="panel-sub">Click any record to inspect full multi-sensor details and take maintenance actions</div>
          </div>
          <span className="queue-count-badge">{filtered.length} of {issues.length} Records</span>
        </div>
        <div className="filters">
          <div className="search-box">
            <Search size={14} color={COLORS.textMuted} />
            <input placeholder="Search road corridor, location, or Issue ID (e.g. RS-1042)…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {select(Object.keys(TYPE_META)).map((t) => <option key={t} value={t}>{t === "All" ? "All Defect Types" : t}</option>)}
          </select>
          <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
            {select(["High", "Medium", "Low"]).map((t) => <option key={t} value={t}>{t === "All" ? "All Severities" : t + " Severity"}</option>)}
          </select>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Open">Open Issues</option>
            <option value="Resolved">Resolved Issues</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Defect ID &amp; Type</th>
                <th>Corridor Location</th>
                <th>Detection Source</th>
                <th>Jurisdiction</th>
                <th>Severity</th>
                <th>Priority</th>
                <th>Workflow Stage</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((iss) => {
                const p = computePriority(iss);
                return (
                  <tr key={iss.id} onClick={() => setSelectedIssue(iss)}>
                    <td>
                      <div className="issue-cell">
                        <span className="dot" style={{ background: TYPE_META[iss.type].color }} />
                        <div>
                          <div className="issue-type">{iss.type}</div>
                          <div className="issue-id">{iss.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{iss.location}</strong> <span className="ward-tag">Ward {iss.ward}</span>
                    </td>
                    <td><SourceTag source={iss.source} /></td>
                    <td className="mono">{iss.authority}</td>
                    <td><SeverityChip severity={iss.severity} /></td>
                    <td><PriorityBadge score={p.total} compact /></td>
                    <td><StagePill idx={iss.stageIndex} /></td>
                    <td className="chevron" style={{ textAlign: "right" }}>
                      <span className="table-action-link">Inspect →</span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-row">No defects match the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAINTENANCE QUEUE & FORECAST                                       */
/* ------------------------------------------------------------------ */
function MaintenanceView({ issues, setSelectedIssue, advanceStage, zoneFilter, wardFilter, onToast }) {
  const scoped = issues.filter((i) => (zoneFilter === "All Zones" || i.zone === zoneFilter) && (wardFilter === "All Wards" || String(i.ward) === wardFilter));
  const ranked = scoped.map((i) => ({ ...i, ...computePriority(i) })).filter((i) => i.stageIndex < 7).sort((a, b) => b.total - a.total).slice(0, 8);

  const handleDispatch = (id, authority) => {
    advanceStage(id, 3);
    onToast(`Maintenance dispatched to ${authority} for issue #${id}`);
  };

  return (
    <div className="view-stack">
      <div className="panel">
        <div className="panel-head">
          <div>
            <span className="panel-title"><Wrench size={16} color={COLORS.primary} /> Maintenance Dispatch &amp; Priority Queue</span>
            <div className="panel-sub">Ranked algorithmically by severity, multi-bus confidence, recurrence &amp; corridor traffic importance</div>
          </div>
          <span className="queue-count-badge">{ranked.length} Pending Actions</span>
        </div>
        <div className="queue-list">
          {ranked.map((iss, i) => (
            <div className="queue-row" key={iss.id}>
              <span className="queue-rank">0{i + 1}</span>
              <PriorityBadge score={iss.total} compact />
              <div className="queue-main">
                <div className="queue-title">{iss.location} — {iss.type} (#{iss.id})</div>
                <div className="queue-sub">{iss.reports} independent detections · Responsible Authority: <strong>{iss.authority}</strong> · Contractor: {iss.contractor}</div>
              </div>
              <div className="queue-score">
                {iss.total}<span>/100</span>
              </div>
              <div className="action-row" style={{ marginTop: 0 }}>
                <button className="btn btn-outline" onClick={() => setSelectedIssue(iss)}><Eye size={13} /> Inspect</button>
                <button className="btn btn-solid" onClick={() => handleDispatch(iss.id, iss.authority)}><CheckCircle2 size={13} /> Dispatch Team</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <span className="panel-title"><TrendingDown size={16} color={COLORS.primary} /> 30-Day Road Deterioration Forecast</span>
            <div className="panel-sub">Predictive health modelling based on cumulative recurrence and seasonal wear trends</div>
          </div>
        </div>
        <div className="forecast-grid">
          {initialRoads.map((r) => (
            <div className="forecast-card" key={r.name}>
              <div className="forecast-header">
                <div className="forecast-name">{r.name}</div>
                <span className="forecast-zone-tag">Zone {r.zone}</span>
              </div>
              <div className="forecast-row"><span>Current Health Score</span><b style={{ color: healthColor(r.score) }}>{r.score}/100</b></div>
              <div className="forecast-row"><span>Projected 30-Day Change</span><b style={{ color: r.forecast < r.score ? COLORS.red : COLORS.green }}>{r.forecast < r.score ? "▼" : "▲"} {Math.abs(Math.round(((r.forecast - r.score) / r.score) * 100))}%</b></div>
              <div className="forecast-row"><span>Recurrence Rate</span><b>{r.recurrence}</b></div>
              <div className="forecast-arrow">
                <span className="forecast-score-badge" style={{ background: healthColor(r.score) + "18", color: healthColor(r.score) }}>{r.score}</span>
                <ChevronR size={14} color={COLORS.textMuted} />
                <span className="forecast-score-badge" style={{ background: healthColor(r.forecast) + "18", color: healthColor(r.forecast) }}>{r.forecast}</span>
              </div>
              {r.forecast < r.score - 5 && <div className="forecast-warn">⚠ Preventive maintenance recommended within 30 days</div>}
              <div className="forecast-authority">{r.authority} · {r.contractor}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BUS FLEET TELEMETRY VIEW                                           */
/* ------------------------------------------------------------------ */
function BusesView({ buses, setBuses, onToast }) {
  const [filterStatus, setFilterStatus] = useState("All");

  const filteredBuses = useMemo(() => {
    if (filterStatus === "All") return buses;
    return buses.filter((b) => b.status === filterStatus);
  }, [buses, filterStatus]);

  const onlineC = buses.filter((b) => b.status === "ONLINE").length;
  const syncC = buses.filter((b) => b.status === "SYNCING").length;
  const offC = buses.filter((b) => b.status === "OFFLINE").length;

  const handlePingTelemetry = (busId) => {
    setBuses((prev) => prev.map((b) => (b.id === busId ? { ...b, status: "ONLINE", lastSync: "Just now", speed: Math.floor(20 + Math.random() * 30) } : b)));
    onToast(`Telemetry ping received from ${busId}: GPS & AI Edge Online`);
  };

  const busActivity = buses.map((b) => ({ name: b.id.replace("Bus ", ""), detections: b.detections }));

  return (
    <div className="view-stack">
      <div className="panel">
        <div className="panel-head">
          <div>
            <span className="panel-title"><Bus size={16} color={COLORS.primary} /> Municipal Bus Fleet — Real-Time Telemetry</span>
            <div className="panel-sub">Public transit vehicles outfitted with AI edge vision &amp; vibration sensors</div>
          </div>
          <div className="fleet-strip small">
            <button className={`layer-chip ${filterStatus === "All" ? "on" : ""}`} onClick={() => setFilterStatus("All")}>All ({buses.length})</button>
            <button className={`layer-chip ${filterStatus === "ONLINE" ? "on" : ""}`} onClick={() => setFilterStatus("ONLINE")}><span className="fleet-dot" style={{ background: COLORS.green }} />{onlineC} Online</button>
            <button className={`layer-chip ${filterStatus === "SYNCING" ? "on" : ""}`} onClick={() => setFilterStatus("SYNCING")}><span className="fleet-dot" style={{ background: COLORS.amber }} />{syncC} Syncing</button>
            <button className={`layer-chip ${filterStatus === "OFFLINE" ? "on" : ""}`} onClick={() => setFilterStatus("OFFLINE")}><span className="fleet-dot" style={{ background: COLORS.red }} />{offC} Offline</button>
          </div>
        </div>

        <div className="bus-grid">
          {filteredBuses.map((b) => (
            <div className="bus-card" key={b.id}>
              <div className="bus-top">
                <span className="bus-id">{b.id}</span>
                <span className={"status-tag " + (b.status === "ONLINE" ? "on" : b.status === "SYNCING" ? "sync" : "off")}>
                  {b.status === "ONLINE" ? <Wifi size={12} /> : b.status === "SYNCING" ? <RefreshCw size={12} /> : <WifiOff size={12} />} {b.status}
                </span>
              </div>
              <div className="bus-route">{b.route}</div>
              <div className="bus-meta">
                <span><MapPin size={11} color={COLORS.textMuted} /> {b.road}</span>
                <span><Navigation size={11} color={COLORS.textMuted} /> {headingToCompass(b.heading)} · {b.speed} km/h</span>
              </div>
              <div className="sensor-grid">
                <SensorDot label="Camera" ok={b.sensors.camera} />
                <SensorDot label="GPS" ok={b.sensors.gps} />
                <SensorDot label="AI Edge" ok={b.sensors.ai} />
                <SensorDot label="Cellular" ok={b.sensors.network} />
              </div>
              <div className="bus-detections" style={{ justifyContent: "space-between" }}>
                <span><Camera size={12} /> {b.detections} detections</span>
                <button className="btn btn-outline" style={{ padding: "3px 8px", fontSize: 10.5 }} onClick={() => handlePingTelemetry(b.id)}>Ping Telemetry</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title"><Activity size={16} color={COLORS.primary} /> Weekly Defect Ingestion Volume by Transit Vehicle</span>
          <span className="panel-sub">Past 7 days aggregated edge logs</span>
        </div>
        <div style={{ width: "100%", height: 230 }}>
          <ResponsiveContainer>
            <BarChart data={busActivity}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" stroke={COLORS.textMuted} fontSize={12} tickLine={false} />
              <YAxis stroke={COLORS.textMuted} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#ffffff", border: `1px solid ${COLORS.line}`, borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
              <Bar dataKey="detections" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ANALYTICS & INDICES VIEW                                           */
/* ------------------------------------------------------------------ */
function AnalyticsView() {
  const [period, setPeriod] = useState("7D");

  return (
    <div className="view-stack">
      <div className="two-col">
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head">
            <div>
              <span className="panel-title"><BarChart3 size={16} color={COLORS.primary} /> Defect Detection Trend</span>
              <div className="panel-sub">Total logged issues across corridors over time</div>
            </div>
            <div className="fleet-strip small">
              {["7D", "30D", "90D"].map((p) => (
                <button key={p} className={`layer-chip ${period === p ? "on" : ""}`} onClick={() => setPeriod(p)}>{p}</button>
              ))}
            </div>
          </div>
          <div style={{ width: "100%", height: 230 }}>
            <ResponsiveContainer>
              <LineChart data={analyticsDataByPeriod[period]}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" stroke={COLORS.textMuted} fontSize={12} tickLine={false} />
                <YAxis stroke={COLORS.textMuted} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#ffffff", border: `1px solid ${COLORS.line}`, borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Line type="monotone" dataKey="count" stroke={COLORS.primary} strokeWidth={3} dot={{ fill: COLORS.primary, r: 4 }} name="Detected" />
                <Line type="monotone" dataKey="resolved" stroke={COLORS.green} strokeWidth={2} strokeDasharray="4 4" dot={{ fill: COLORS.green, r: 3 }} name="Resolved" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head">
            <div>
              <span className="panel-title"><GaugeIcon size={16} color={COLORS.primary} /> Defect Severity Distribution</span>
              <div className="panel-sub">Current active breakdown by safety risk tier</div>
            </div>
          </div>
          <div style={{ width: "100%", height: 230 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={severityDist} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={4}>
                  {severityDist.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#ffffff", border: `1px solid ${COLORS.line}`, borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Legend wrapperStyle={{ fontSize: 12, color: COLORS.textSecondary }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <span className="panel-title"><GaugeIcon size={16} color={COLORS.primary} /> Road Corridor Health Indices</span>
            <div className="panel-sub">Calculated via defect density, severity weight, and recurrence rate</div>
          </div>
        </div>
        <div className="gauge-grid">
          {initialRoads.map((r) => {
            const total = r.potholes + r.cracks + r.waterlogging + r.debris;
            return (
              <div className="gauge-card" key={r.name}>
                <div className="gauge-card-name">{r.name}</div>
                <HealthGauge score={r.score} trend={r.trend} />
                <div className="gauge-breakdown">
                  <span><i style={{ background: TYPE_META.Pothole.color }} />Potholes: <b>{r.potholes}</b></span>
                  <span><i style={{ background: TYPE_META.Crack.color }} />Cracks: <b>{r.cracks}</b></span>
                  <span><i style={{ background: TYPE_META.Waterlogging.color }} />Waterlogging: <b>{r.waterlogging}</b></span>
                  <span><i style={{ background: TYPE_META.Debris.color }} />Debris: <b>{r.debris}</b></span>
                </div>
                <div className="gauge-total">{total} Total Logged Defects</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="panel-title"><Clock size={16} color={COLORS.primary} /> Civic Operational Performance Metrics</span></div>
        <div className="summary-grid">
          <div><div className="summary-value">4.6 hrs</div><div className="summary-label">Avg. P1 Resolution Time</div></div>
          <div><div className="summary-value">62%</div><div className="summary-label">Recurring Damage Rate</div></div>
          <div><div className="summary-value">1,284</div><div className="summary-label">Total Monthly Detections</div></div>
          <div><div className="summary-value">94.1%</div><div className="summary-label">Average AI Confidence</div></div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN APPLICATION SHELL                                             */
/* ------------------------------------------------------------------ */
const NAV = [
  { id: "command", label: "Command Center", icon: <Home size={16} /> },
  { id: "map", label: "Live Road Map", icon: <MapIcon size={16} /> },
  { id: "issues", label: "Issues & Alerts", icon: <ListChecks size={16} /> },
  { id: "maintenance", label: "Maintenance Queue", icon: <Wrench size={16} /> },
  { id: "buses", label: "Bus Fleet Telemetry", icon: <Bus size={16} /> },
  { id: "analytics", label: "Analytics & Indices", icon: <BarChart3 size={16} /> },
];

const ZONES = ["All Zones", "South", "North", "Central", "East", "West"];
const CITIES = {
  Delhi: { state: "Delhi (NCT)", live: true },
  Mumbai: { state: "Maharashtra", live: false },
  Bengaluru: { state: "Karnataka", live: false },
};

export default function RoadSenseDashboard() {
  const [tab, setTab] = useState("command");
  const [issuesState, setIssuesState] = useState(initialIssues);
  const [busesState, setBusesState] = useState(initialBuses);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [cityFilter, setCityFilter] = useState("Delhi");
  const [zoneFilter, setZoneFilter] = useState("All Zones");
  const [wardFilter, setWardFilter] = useState("All Wards");
  const [bellOpen, setBellOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3800);
  };

  const wardOptions = ["All Wards"].concat(
    Array.from(new Set(initialRoads.filter((r) => zoneFilter === "All Zones" || r.zone === zoneFilter).map((r) => r.ward))).sort((a, b) => a - b)
  );

  const advanceStage = (id, targetIdx) => {
    setIssuesState((prev) => prev.map((i) => (i.id === id ? { ...i, stageIndex: Math.max(i.stageIndex, targetIdx) } : i)));
    if (selectedIssue && selectedIssue.id === id) {
      setSelectedIssue((prev) => ({ ...prev, stageIndex: Math.max(prev.stageIndex, targetIdx) }));
    }
  };

  const criticalAlerts = issuesState.map((i) => ({ ...i, ...computePriority(i) })).filter((i) => tierOf(i.total).tier === "P1" && i.stageIndex < 5).sort((a, b) => b.total - a.total);

  return (
    <div className="rs-root">
      <style>{`
        .rs-root {
          font-family: var(--font-sans, 'Inter', sans-serif);
          background: #f8fafc;
          color: #0f172a;
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100%;
          overflow: hidden;
        }
        .rs-root * { box-sizing: border-box; }

        /* Top Government Portal Strip */
        .gov-banner {
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          padding: 6px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #475569;
          position: relative;
          flex-shrink: 0;
          z-index: 20;
        }
        .gov-banner::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #ea580c 0%, #ea580c 33%, #ffffff 33%, #ffffff 66%, #16a34a 66%, #16a34a 100%);
        }
        .gov-banner-left {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }
        .gov-emblem {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ea580c;
          display: inline-block;
        }
        .gov-banner-right {
          display: flex;
          align-items: center;
          gap: 16px;
          font-family: var(--font-mono, monospace);
          font-size: 10.5px;
          color: #64748b;
        }

        /* App Body Layout */
        .app-body {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        /* Fixed Sidebar Navigation */
        .sidebar {
          width: 240px;
          flex-shrink: 0;
          background: #ffffff;
          border-right: 1px solid #e2e8f0;
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow-y: auto;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 8px 24px 8px;
          border-bottom: 1px solid #f1f5f9;
          margin-bottom: 16px;
          flex-shrink: 0;
        }
        .brand-mark {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: linear-gradient(135deg, #ea580c, #c2410c);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(234, 88, 12, 0.25);
        }
        .brand-name {
          font-family: var(--font-heading, sans-serif);
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.4px;
          line-height: 1.1;
          color: #0f172a;
        }
        .brand-sub {
          font-size: 9.5px;
          color: #64748b;
          letter-spacing: 0.3px;
          margin-top: 2px;
          font-weight: 500;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 7px;
          margin-bottom: 3px;
          color: #475569;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          background: none;
          width: 100%;
          text-align: left;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .nav-item:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .nav-item.active {
          background: #fff7ed;
          color: #ea580c;
          border-color: #fed7aa;
          font-weight: 600;
        }

        /* Main Workspace */
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: #f8fafc;
          position: relative;
          height: 100%;
          overflow: hidden;
        }

        /* Topbar */
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 28px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
        }
        .topbar-title {
          font-family: var(--font-heading, sans-serif);
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }
        .topbar-sub {
          font-size: 11.5px;
          color: #64748b;
          margin-top: 2px;
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .live-tag {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: #334155;
          font-family: var(--font-mono, monospace);
          background: #f1f5f9;
          padding: 5px 10px;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          font-weight: 500;
        }
        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #16a34a;
          box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2);
          animation: pulse 1.6s infinite;
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        .bell-wrap { position: relative; }
        .bell-btn {
          position: relative;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 7px;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .bell-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .bell-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background: #dc2626;
          color: white;
          font-size: 9.5px;
          font-weight: 700;
          border-radius: 20px;
          padding: 1px 5px;
          box-shadow: 0 1px 3px rgba(220, 38, 38, 0.3);
        }
        .bell-dropdown {
          position: absolute;
          right: 0;
          top: 42px;
          width: 320px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px;
          z-index: 50;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12);
        }
        .bell-dropdown-title {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #f1f5f9;
        }

        /* Jurisdiction Filter Strip */
        .jurisdiction-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 28px;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
          font-size: 12px;
          color: #64748b;
          flex-wrap: wrap;
        }
        .jurisdiction-label {
          font-weight: 600;
          color: #334155;
        }
        .jurisdiction-bar select {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          color: #0f172a;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 500;
        }
        .jurisdiction-note {
          margin-left: auto;
          font-size: 10.5px;
          color: #94a3b8;
          font-family: var(--font-mono, monospace);
        }

        /* Content Area */
        .content {
          padding: 24px 28px 36px 28px;
          overflow-y: auto;
          flex: 1;
        }
        .view-stack {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* KPI Cards */
        .priority-kpi-grid, .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 16px;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .kpi-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.06);
        }
        .kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .kpi-icon {
          width: 32px;
          height: 32px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kpi-sub {
          font-size: 10.5px;
          color: #64748b;
          font-weight: 500;
        }
        .kpi-value {
          font-family: var(--font-heading, sans-serif);
          font-size: 26px;
          font-weight: 700;
          line-height: 1;
          color: #0f172a;
        }
        .kpi-label {
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
          margin-top: 6px;
        }

        /* Panels & Layout */
        .two-col {
          display: flex;
          gap: 18px;
          align-items: stretch;
        }
        .panel {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 18px;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04);
        }
        .full-map-panel {
          padding: 18px;
        }
        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-heading, sans-serif);
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }
        .panel-sub {
          font-size: 11.5px;
          color: #64748b;
          margin-top: 2px;
        }
        .link-btn {
          background: none;
          border: none;
          color: #ea580c;
          font-size: 12px;
          cursor: pointer;
          font-weight: 600;
          padding: 0;
        }
        .link-btn:hover {
          text-decoration: underline;
        }

        /* Problematic Roads Bar */
        .bar-list { display: flex; flex-direction: column; gap: 11px; }
        .bar-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
        .bar-rank { color: #94a3b8; font-family: var(--font-mono, monospace); width: 20px; font-weight: 600; }
        .bar-name { width: 100px; flex-shrink: 0; color: #334155; font-weight: 600; }
        .bar-track { flex: 1; height: 8px; background: #f1f5f9; border-radius: 5px; overflow: hidden; border: 1px solid #e2e8f0; }
        .bar-fill { height: 100%; background: linear-gradient(90deg, #ea580c, #dc2626); border-radius: 5px; }
        .bar-count { font-family: var(--font-mono, monospace); color: #0f172a; font-weight: 700; width: 28px; text-align: right; }

        /* Fleet Strip & Info */
        .fleet-strip { display: flex; gap: 8px; font-size: 12.5px; color: #475569; font-weight: 500; }
        .fleet-strip.small { gap: 8px; font-size: 11.5px; }
        .fleet-strip div { display: flex; align-items: center; gap: 6px; }
        .fleet-dot { width: 8px; height: 8px; border-radius: 50%; }
        .fleet-info-box { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
        .fleet-stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
        .fleet-stat-num { font-family: var(--font-heading, sans-serif); font-size: 18px; font-weight: 700; color: #0f172a; }
        .fleet-stat-label { font-size: 10.5px; color: #64748b; margin-top: 3px; font-weight: 500; }

        /* Alerts & Action Queue */
        .alert-list { display: flex; flex-direction: column; gap: 10px; }
        .alert-card { background: #ffffff; border: 1px solid #fecaca; border-left: 3.5px solid #dc2626; border-radius: 8px; padding: 14px; }
        .alert-top { display: flex; align-items: flex-start; gap: 10px; }
        .alert-dot { width: 8px; height: 8px; border-radius: 50%; background: #dc2626; margin-top: 5px; flex-shrink: 0; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.2); }
        .alert-title { font-weight: 700; font-size: 13.5px; color: #0f172a; }
        .alert-sub { font-size: 11.5px; color: #64748b; margin-top: 2px; }
        .alert-meta { font-size: 11px; color: #475569; margin: 8px 0; font-family: var(--font-sans, sans-serif); }
        .queue-count-badge { font-size: 11px; font-weight: 700; background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; padding: 2px 8px; border-radius: 12px; }

        /* Live Map Layout & Controls */
        .map-controls { display: flex; gap: 8px; }
        .map-controls select { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; border-radius: 6px; padding: 5px 9px; font-size: 12px; font-weight: 500; }
        .layer-toggles { display: flex; gap: 8px; flex-wrap: wrap; }
        .layer-chip { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 500; padding: 5px 12px; border-radius: 20px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; cursor: pointer; transition: all 0.15s ease; }
        .layer-chip.on { color: #ea580c; border-color: #ea580c; background: #fff7ed; font-weight: 600; }
        .map-frame { position: relative; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        .full-map-frame { min-height: 580px; }
        .zoom-controls { position: absolute; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 5px; z-index: 500; }
        .zoom-controls button { background: #ffffff; border: 1px solid #cbd5e1; color: #334155; border-radius: 6px; padding: 7px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.08); display: flex; align-items: center; justify-content: center; }
        .zoom-controls button:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
        .cluster-hint { position: absolute; bottom: 12px; left: 12px; background: rgba(255, 255, 255, 0.95); border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 10px; font-size: 11px; color: #475569; font-weight: 500; box-shadow: 0 2px 4px rgba(0,0,0,0.06); z-index: 500; }
        .legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
        .legend-label { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; }
        .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #334155; font-weight: 500; }
        .legend-dot { width: 9px; height: 9px; border-radius: 2px; transform: rotate(45deg); display: inline-block; }

        /* Modal Dialog */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(3px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.15s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .modal-content {
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
          width: 860px;
          max-width: 95vw;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 18px 24px;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
        }
        .modal-body {
          padding: 20px 24px;
          overflow-y: auto;
          flex: 1;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 24px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .modal-grid {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 20px;
        }
        .modal-col {
          display: flex;
          flex-direction: column;
        }
        .meta-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
        }
        .priority-header-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .close-btn {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          color: #64748b;
          padding: 5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .close-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        .detail-eyebrow { font-family: var(--font-heading, sans-serif); font-size: 11px; font-weight: 800; letter-spacing: 0.6px; margin-bottom: 2px; }
        .detail-location-title { font-family: var(--font-heading, sans-serif); font-size: 17px; font-weight: 700; color: #0f172a; }
        .detail-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #334155; margin-bottom: 5px; }
        .detail-row strong { color: #0f172a; font-weight: 600; }
        .detail-reason-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; font-size: 11.5px; color: #334155; margin: 10px 0; line-height: 1.5; }
        .evidence-tabs { display: flex; gap: 6px; margin-top: 4px; }
        .evidence-tabs button { background: #f1f5f9; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; font-weight: 600; padding: 6px 11px; border-radius: 6px 6px 0 0; cursor: pointer; }
        .evidence-tabs button.active { background: #ffffff; color: #ea580c; border-color: #e2e8f0; border-bottom-color: #ffffff; }
        .detail-image { position: relative; border-radius: 0 8px 8px 8px; background: #0f172a; border: 1px solid #e2e8f0; overflow: hidden; }
        .camera-watermark { position: absolute; bottom: 8px; left: 8px; font-family: var(--font-mono, monospace); font-size: 9.5px; color: #94a3b8; display: flex; align-items: center; gap: 5px; }
        .bbox { position: absolute; border: 2px solid; border-radius: 3px; }
        .bbox-label { position: absolute; top: -18px; left: -2px; font-size: 9.5px; font-weight: 700; color: #ffffff; padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
        .repair-frame { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; background: #f0fdf4; padding: 16px; text-align: center; }
        .mini-panel-title { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; margin-top: 14px; }
        .impact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; font-size: 11.5px; color: #334155; }
        .impact-grid span { display: flex; align-items: center; justify-content: space-between; gap: 6px; background: #f8fafc; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
        .priority-total { font-family: var(--font-heading, sans-serif); font-size: 16px; font-weight: 700; color: #0f172a; }
        .score-bar-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; margin-bottom: 6px; }
        .score-bar-label { width: 120px; color: #64748b; flex-shrink: 0; font-size: 11px; }
        .score-bar-track { flex: 1; height: 6px; background: #f1f5f9; border-radius: 4px; overflow: hidden; border: 1px solid #e2e8f0; }
        .score-bar-fill { height: 100%; border-radius: 4px; }
        .score-bar-value { width: 24px; text-align: right; color: #0f172a; font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 600; }
        .action-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
        .btn { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 8px 14px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease; }
        .btn-outline { background: #ffffff; border: 1px solid #cbd5e1; color: #334155; }
        .btn-outline:hover { border-color: #ea580c; color: #ea580c; background: #fff7ed; }
        .btn-solid { background: #ea580c; border: 1px solid #ea580c; color: #ffffff; }
        .btn-solid:hover { background: #c2410c; border-color: #c2410c; }
        .btn-solid:disabled { opacity: 0.5; cursor: default; background: #94a3b8; border-color: #94a3b8; }

        /* Stepper */
        .lifecycle { display: flex; flex-direction: column; margin-top: 8px; }
        .lifecycle-step { display: flex; align-items: flex-start; gap: 10px; position: relative; padding-bottom: 14px; }
        .lifecycle-marker { width: 11px; height: 11px; border-radius: 50%; margin-top: 3px; flex-shrink: 0; }
        .lifecycle-line { position: absolute; left: 5px; top: 16px; bottom: 0; width: 2px; }
        .lifecycle-text { font-size: 12px; color: #334155; }
        .lifecycle-meta { font-size: 10px; color: #94a3b8; font-family: var(--font-mono, monospace); margin-top: 1px; }

        /* Chips & Pills */
        .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; border: 1px solid; }
        .chip-dot { width: 6px; height: 6px; border-radius: 50%; }
        .status-pill { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; border: 1px solid; }
        .priority-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 5px; border: 1px solid; white-space: nowrap; font-family: var(--font-sans, sans-serif); }
        .priority-badge-label { font-weight: 500; font-size: 10.5px; }
        .source-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; }
        .ward-tag { font-size: 10.5px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; margin-left: 6px; font-weight: 500; }

        /* Filter Row & Search */
        .filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .search-box { display: flex; align-items: center; gap: 8px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 12px; flex: 1; min-width: 220px; }
        .search-box input { background: none; border: none; outline: none; color: #0f172a; font-size: 12.5px; width: 100%; font-family: inherit; }
        select { background: #ffffff; border: 1px solid #cbd5e1; color: #334155; border-radius: 6px; padding: 7px 12px; font-size: 12px; outline: none; }
        select:focus, .search-box:focus-within { border-color: #ea580c; box-shadow: 0 0 0 2px rgba(234, 88, 12, 0.15); }

        /* Tables */
        .table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; background: #ffffff; }
        th { text-align: left; color: #475569; font-weight: 700; font-size: 10.5px; letter-spacing: 0.5px; text-transform: uppercase; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
        td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
        tbody tr { cursor: pointer; transition: background 0.1s ease; }
        tbody tr:hover { background: #f8fafc; }
        .issue-cell { display: flex; align-items: center; gap: 10px; }
        .dot { width: 9px; height: 9px; border-radius: 3px; transform: rotate(45deg); flex-shrink: 0; }
        .issue-type { font-weight: 600; color: #0f172a; }
        .issue-id { font-size: 10.5px; color: #64748b; font-family: var(--font-mono, monospace); margin-top: 1px; }
        .mono { font-family: var(--font-mono, monospace); color: #334155; font-size: 11.5px; }
        .chevron { color: #ea580c; text-align: right; }
        .table-action-link { font-size: 11.5px; font-weight: 600; color: #ea580c; }
        .empty-row { text-align: center; color: #94a3b8; padding: 32px !important; }

        /* Buses Grid */
        .bus-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .bus-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.03); }
        .bus-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .bus-id { font-family: var(--font-heading, sans-serif); font-weight: 700; font-size: 14.5px; color: #0f172a; }
        .status-tag { display: flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
        .status-tag.on { color: #16a34a; background: #f0fdf4; border: 1px solid #bbf7d0; }
        .status-tag.sync { color: #d97706; background: #fffbeb; border: 1px solid #fde68a; }
        .status-tag.off { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; }
        .bus-route { font-size: 12px; color: #64748b; margin-bottom: 10px; font-weight: 500; }
        .bus-meta { display: flex; justify-content: space-between; font-size: 11px; color: #475569; margin-bottom: 10px; background: #f8fafc; padding: 6px 8px; border-radius: 6px; }
        .bus-meta span { display: flex; align-items: center; gap: 4px; }
        .sensor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
        .sensor-dot { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: #475569; font-weight: 500; }
        .dotc { width: 6px; height: 6px; border-radius: 50%; }
        .bus-detections { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #ea580c; border-top: 1px solid #f1f5f9; padding-top: 10px; font-weight: 600; }

        /* Maintenance Queue */
        .queue-list { display: flex; flex-direction: column; gap: 10px; }
        .queue-row { display: flex; align-items: center; gap: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
        .queue-rank { font-family: var(--font-mono, monospace); color: #94a3b8; width: 26px; font-weight: 700; font-size: 12px; }
        .queue-main { flex: 1; }
        .queue-title { font-weight: 700; font-size: 13.5px; color: #0f172a; }
        .queue-sub { font-size: 11.5px; color: #64748b; margin-top: 2px; }
        .queue-score { font-family: var(--font-heading, sans-serif); font-size: 18px; font-weight: 700; color: #ea580c; text-align: right; }
        .queue-score span { font-size: 10.5px; color: #94a3b8; font-family: var(--font-sans, sans-serif); }

        /* Forecast Grid */
        .forecast-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .forecast-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
        .forecast-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .forecast-name { font-weight: 700; font-size: 13.5px; color: #0f172a; }
        .forecast-zone-tag { font-size: 10px; background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
        .forecast-row { display: flex; justify-content: space-between; font-size: 11.5px; color: #64748b; margin-bottom: 5px; }
        .forecast-row b { color: #0f172a; }
        .forecast-arrow { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
        .forecast-score-badge { font-family: var(--font-heading, sans-serif); font-size: 15px; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
        .forecast-warn { font-size: 11px; color: #ea580c; background: #fff7ed; border: 1px solid #fed7aa; padding: 5px 8px; border-radius: 6px; margin-bottom: 8px; font-weight: 600; }
        .forecast-authority { font-size: 10.5px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 8px; }

        /* Gauges & Summary */
        .gauge-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .gauge-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; }
        .gauge-card-name { font-weight: 700; font-size: 13.5px; color: #0f172a; margin-bottom: 4px; }
        .gauge-breakdown { display: flex; flex-direction: column; gap: 5px; width: 100%; margin-top: 10px; font-size: 11.5px; color: #475569; }
        .gauge-breakdown span { display: flex; align-items: center; justify-content: space-between; }
        .gauge-breakdown i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; margin-right: 6px; }
        .gauge-total { margin-top: 10px; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 8px; width: 100%; text-align: center; font-weight: 600; }

        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .summary-value { font-family: var(--font-heading, sans-serif); font-size: 24px; font-weight: 800; color: #ea580c; }
        .summary-label { font-size: 11.5px; color: #64748b; margin-top: 4px; font-weight: 500; }

        /* Onboarding */
        .onboarding-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; min-height: 380px; color: #64748b; padding: 32px; }
        .onboarding-title { font-family: var(--font-heading, sans-serif); font-size: 18px; font-weight: 700; color: #0f172a; }
        .onboarding-panel p { max-width: 480px; font-size: 13px; color: #64748b; line-height: 1.5; }

        /* Toast */
        .toast-banner {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: #0f172a;
          color: #ffffff;
          padding: 12px 18px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 2000;
          animation: slideUp 0.2s ease;
          border-left: 4px solid #ea580c;
        }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        select:disabled { opacity: 0.6; cursor: not-allowed; }

        @media (max-width: 1080px) {
          .priority-kpi-grid, .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .two-col { flex-direction: column; }
          .bus-grid { grid-template-columns: repeat(2, 1fr); }
          .gauge-grid, .forecast-grid { grid-template-columns: 1fr; }
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
          .modal-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Official Government Portal Top Strip */}
      <header className="gov-banner">
        <div className="gov-banner-left">
          <span className="gov-emblem" />
          <span>MINISTRY OF ROAD TRANSPORT &amp; HIGHWAYS / MUNICIPAL CORPORATION OF DELHI (MCD)</span>
        </div>
        <div className="gov-banner-right">
          <span>NATIONAL SMART URBAN MOBILITY MISSION</span>
          <span>·</span>
          <span>PORTAL ID: RS-DL-MCD-2026</span>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar Navigation */}
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark"><Navigation size={18} /></div>
            <div>
              <div className="brand-name">ROADSENSE</div>
              <div className="brand-sub">MUNICIPAL ROAD INTELLIGENCE</div>
            </div>
          </div>
          {NAV.map((n) => (
            <button key={n.id} className={"nav-item " + (tab === n.id ? "active" : "")} onClick={() => setTab(n.id)}>
              {n.icon} {n.label}
            </button>
          ))}
        </aside>

        {/* Main Content Area */}
        <main className="main">
          <div className="topbar">
            <div>
              <div className="topbar-title">{(NAV.find((n) => n.id === tab) || {}).label}</div>
              <div className="topbar-sub">AI-powered road asset monitoring &amp; maintenance orchestration fed by public transit fleet</div>
            </div>
            <div className="topbar-right">
              <span className="live-tag"><span className="live-dot" />TELEMETRY LIVE · 25 AUG 2026</span>
              <div className="bell-wrap">
                <button className="bell-btn" onClick={() => setBellOpen((v) => !v)} aria-label="Notifications">
                  <Bell size={17} />
                  {criticalAlerts.length > 0 && <span className="bell-badge">{criticalAlerts.length}</span>}
                </button>
                {bellOpen && (
                  <div className="bell-dropdown">
                    <div className="bell-dropdown-title">Urgent Road Hazard Alerts ({criticalAlerts.length})</div>
                    {criticalAlerts.slice(0, 4).map((a) => (
                      <div key={a.id} className="alert-card" style={{ marginBottom: 8, padding: 10 }}>
                        <div className="alert-top">
                          <span className="alert-dot" />
                          <div style={{ flex: 1 }}>
                            <div className="alert-title" style={{ fontSize: 12.5 }}>{a.type} · {a.location}</div>
                            <div className="alert-sub" style={{ fontSize: 11 }}>Confidence {a.confidence}% · {a.reports} confirmations</div>
                          </div>
                        </div>
                        <div className="action-row" style={{ marginTop: 8 }}>
                          <button className="btn btn-outline" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => { setSelectedIssue(a); setBellOpen(false); }}>Inspect</button>
                          <button className="btn btn-solid" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => { advanceStage(a.id, 3); showToast(`Dispatched maintenance to ${a.authority}`); setBellOpen(false); }}>Dispatch</button>
                        </div>
                      </div>
                    ))}
                    {criticalAlerts.length === 0 && <div style={{ fontSize: 12, color: COLORS.textFaint, padding: "8px 0" }}>No critical hazard alerts at this time.</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Jurisdiction Filters */}
          <div className="jurisdiction-bar">
            <span className="jurisdiction-label">State/UT:</span>
            <select value={CITIES[cityFilter].state} disabled><option>{CITIES[cityFilter].state}</option></select>
            <span className="jurisdiction-label">City:</span>
            <select value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setZoneFilter("All Zones"); setWardFilter("All Wards"); showToast(`Switched city to ${e.target.value}`); }}>
              {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
            </select>
            <span className="jurisdiction-label">Zone:</span>
            <select value={zoneFilter} onChange={(e) => { setZoneFilter(e.target.value); setWardFilter("All Wards"); }} disabled={!CITIES[cityFilter].live}>
              {ZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
            <span className="jurisdiction-label">Ward:</span>
            <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)} disabled={!CITIES[cityFilter].live}>
              {wardOptions.map((w) => <option key={w} value={w}>{w === "All Wards" ? w : "Ward " + w}</option>)}
            </select>
            <span className="jurisdiction-note">Active Pilot: Delhi NCR · Multi-zone civic monitoring operational</span>
          </div>

          <div className="content">
            {!CITIES[cityFilter].live ? (
              <div className="panel onboarding-panel">
                <Building2 size={32} color={COLORS.primary} />
                <div className="onboarding-title">{cityFilter} Pilot Deployment — Onboarding in Progress</div>
                <p>RoadSense is designed for instant city-wide deployment. {cityFilter}'s municipal bus fleet, road asset GIS dataset, and contractor directory are currently being provisioned. Switch back to Delhi to view the active deployment.</p>
                <button className="btn btn-solid" onClick={() => { setCityFilter("Delhi"); showToast("Switched back to Delhi active deployment"); }}>Switch to Delhi Deployment</button>
              </div>
            ) : (
              <>
                {tab === "command" && (
                  <CommandCenterView
                    issues={issuesState}
                    setTab={setTab}
                    setSelectedIssue={setSelectedIssue}
                    advanceStage={advanceStage}
                    zoneFilter={zoneFilter}
                    wardFilter={wardFilter}
                    onToast={showToast}
                  />
                )}
                {tab === "map" && (
                  <MapView
                    issues={issuesState}
                    setSelectedIssue={setSelectedIssue}
                    buses={busesState}
                  />
                )}
                {tab === "issues" && (
                  <IssuesView
                    issues={issuesState}
                    setSelectedIssue={setSelectedIssue}
                    zoneFilter={zoneFilter}
                    wardFilter={wardFilter}
                  />
                )}
                {tab === "maintenance" && (
                  <MaintenanceView
                    issues={issuesState}
                    setSelectedIssue={setSelectedIssue}
                    advanceStage={advanceStage}
                    zoneFilter={zoneFilter}
                    wardFilter={wardFilter}
                    onToast={showToast}
                  />
                )}
                {tab === "buses" && (
                  <BusesView
                    buses={busesState}
                    setBuses={setBusesState}
                    onToast={showToast}
                  />
                )}
                {tab === "analytics" && (
                  <AnalyticsView />
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Full Detail Modal */}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          advanceStage={advanceStage}
          onToast={showToast}
        />
      )}

      {/* Feedback Toast Notification */}
      {toastMessage && (
        <div className="toast-banner">
          <CheckCircle2 size={16} color={COLORS.green} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
