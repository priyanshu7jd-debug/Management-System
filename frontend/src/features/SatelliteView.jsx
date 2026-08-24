import React, { useState, useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from "react-leaflet";
import L from "leaflet";
import {
  Clock, Info, Eye, EyeOff, Plus, X, Trash2, Loader2, ShieldAlert,
  Route as RouteIcon, Construction, CheckCircle2, Settings2, Home,
} from "lucide-react";
import { api, adapt } from "../lib/api";
import { mapPermissionsFor } from "../lib/mapPermissions";
import { shelterPermissionsFor } from "../lib/shelterPermissions";

// Severity <-> risk-score helpers, mirroring the ones AssamMap's buildRiskZones
// uses in DisasterManagementSystem.jsx, so real fetched disasters (not a mock
// array) can be turned into map zones here too.
const SEVERITY_COLOR = { Critical: "#ef4444", High: "#f97316", Medium: "#eab308", Low: "#22c55e" };
const SEVERITY_SCORE = { Critical: 90, High: 70, Medium: 50, Low: 25 };
const SEVERITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const RISK_LEVEL_COLOR = { Critical: "#ef4444", High: "#f97316", Medium: "#eab308", Low: "#22c55e" };
const ROAD_BLOCK_COLOR = { Reported: "#f59e0b", Confirmed: "#ef4444", Cleared: "#22c55e" };

const inputCls = "w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors";
const btnPrimary = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40";
const btnGhost = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40";
const btnDanger = "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40";

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({ onClose, maxWidth = "480px", children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Groups geotagged disasters by location into map-ready risk zones. Only
// disasters with captured GPS coordinates can be plotted - there's no
// separate "zone" concept on the backend, so this is derived client-side.
function buildRiskZones(disasters) {
  const groups = new Map();
  disasters.forEach((d) => {
    if (d.lat == null || d.lng == null) return;
    const key = d.location;
    if (!groups.has(key)) {
      groups.set(key, { id: key, name: key, lat: d.lat, lng: d.lng, type: d.type, count: 0, severity: d.severity });
    }
    const g = groups.get(key);
    g.count += 1;
    if ((SEVERITY_RANK[d.severity] || 0) > (SEVERITY_RANK[g.severity] || 0)) {
      g.severity = d.severity;
      g.type = d.type;
    }
  });
  return Array.from(groups.values()).map((g) => {
    const score = Math.min(100, (SEVERITY_SCORE[g.severity] || 30) + Math.min(g.count - 1, 4) * 5);
    return {
      ...g,
      risk: g.severity,
      score,
      color: SEVERITY_COLOR[g.severity] || "#6b7280",
    };
  });
}

const SATELLITE_LAYERS = [
  {
    id: "osm",
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
  {
    id: "satellite",
    name: "Esri Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    maxZoom: 17,
  },
  {
    id: "hybrid",
    name: "Esri Hybrid",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri",
    maxZoom: 19,
  },
  {
    id: "topo",
    name: "Topographic",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap, SRTM | Map style: &copy; OpenTopoMap",
    maxZoom: 17,
  },
];

function createRiskIcon(color) {
  return L.divIcon({
    className: "",
    html: '<div style="width:28px;height:28px;background:' + color + ';border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:white;border-radius:50%;"></div></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createShelterIcon(status) {
  const bg = status === "Available" ? "#22c55e" : status === "Full" ? "#ef4444" : "#f97316";
  return L.divIcon({
    className: "",
    html: '<div style="width:26px;height:26px;background:' + bg + ';border:3px solid white;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;">S</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function createSquareIcon(color, letter) {
  return L.divIcon({
    className: "",
    html: '<div style="width:24px;height:24px;background:' + color + ';border:2px solid white;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;">' + letter + '</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function riskRadius(score) {
  if (score >= 75) return 38000;
  if (score >= 55) return 26000;
  if (score >= 35) return 18000;
  return 12000;
}

// Add/edit a RiskZone, override its AI score, or delete it. Fields shown
// are gated by `can` (from mapPermissionsFor) so an Authority editing an
// assigned zone never sees the delete button, etc.
function RiskZoneModal({ zone, token, can, onClose, onSaved, onDeleted, showToast }) {
  const isEdit = !!zone;
  const [form, setForm] = useState({
    name: zone?.name || "",
    district: zone?.district || "",
    lat: zone?.lat ?? "",
    lng: zone?.lng ?? "",
    radiusMeters: zone?.radiusMeters ?? 2000,
    riskLevel: zone?.riskLevel || "Medium",
    status: zone?.status || "Active",
  });
  const [overrideValue, setOverrideValue] = useState(zone?.effectiveScore ?? "");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.name.trim() || form.lat === "" || form.lng === "") {
      showToast("Name and coordinates are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        district: form.district.trim(),
        center: { lat: Number(form.lat), lng: Number(form.lng) },
        radiusMeters: Number(form.radiusMeters) || 2000,
        riskLevel: form.riskLevel,
      };
      if (isEdit) {
        payload.status = form.status;
        const res = await api.riskZones.update(token, zone._id, payload);
        onSaved(adapt.riskZone(res.data));
        showToast("Risk zone updated");
      } else {
        const res = await api.riskZones.create(token, payload);
        onSaved(adapt.riskZone(res.data));
        showToast("Risk zone added");
      }
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitOverride() {
    if (overrideValue === "" || Number(overrideValue) < 0 || Number(overrideValue) > 100) {
      showToast("Enter an override value between 0 and 100", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await api.riskZones.override(token, zone._id, { value: Number(overrideValue), reason: overrideReason });
      onSaved(adapt.riskZone(res.data));
      showToast("Risk score overridden");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this risk zone?")) return;
    setSaving(true);
    try {
      await api.riskZones.remove(token, zone._id);
      onDeleted(zone._id);
      showToast("Risk zone removed");
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const canEditFields = !isEdit || can.editRiskZone;

  return (
    <ModalShell onClose={onClose}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900">{isEdit ? "Manage Risk Zone" : "Add Risk Zone"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>

        {canEditFields && (
          <>
            <Field label="Name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kaziranga Flood Basin" /></Field>
            <Field label="District"><input className={inputCls} value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Latitude"><input className={inputCls} value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} placeholder="26.58" /></Field>
              <Field label="Longitude"><input className={inputCls} value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} placeholder="93.17" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Radius (meters)"><input type="number" className={inputCls} value={form.radiusMeters} onChange={e => setForm({ ...form, radiusMeters: e.target.value })} /></Field>
              <Field label="Risk level">
                <select className={inputCls} value={form.riskLevel} onChange={e => setForm({ ...form, riskLevel: e.target.value })}>
                  {["Low", "Medium", "High", "Critical"].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </div>
            {isEdit && (
              <Field label="Status">
                <select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {["Active", "Monitoring", "Cleared"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
            <button onClick={submit} disabled={saving} className={btnPrimary + " w-full justify-center mb-2"}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {isEdit ? "Save changes" : "Add zone"}
            </button>
          </>
        )}

        {isEdit && can.overrideAiRisk && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs font-bold text-gray-700 mb-2">Override AI risk score</div>
            <div className="text-[11px] text-gray-400 mb-2">
              AI score: <span className="font-semibold text-gray-600">{zone.aiRiskScore}</span>
              {zone.override?.value != null && <span> &middot; Current override: <span className="font-semibold text-gray-600">{zone.override.value}</span></span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Override value (0-100)"><input type="number" className={inputCls} value={overrideValue} onChange={e => setOverrideValue(e.target.value)} /></Field>
              <Field label="Reason"><input className={inputCls} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Ground survey, etc." /></Field>
            </div>
            <button onClick={submitOverride} disabled={saving} className={btnGhost + " w-full justify-center"}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings2 className="h-3.5 w-3.5" />}
              Apply override
            </button>
          </div>
        )}

        {isEdit && can.removeRiskZone && (
          <button onClick={remove} disabled={saving} className={btnDanger + " w-full justify-center mt-4"}>
            <Trash2 className="h-3.5 w-3.5" /> Delete risk zone
          </button>
        )}
      </div>
    </ModalShell>
  );
}

// Add/edit an EvacuationRoute or mark its destination area evacuated.
function EvacuationRouteModal({ route, token, can, onClose, onSaved, onDeleted, showToast }) {
  const isEdit = !!route;
  const [form, setForm] = useState({
    name: route?.name || "",
    district: route?.district || "",
    fromLabel: route?.from?.label || "",
    fromLat: route?.from?.lat ?? "",
    fromLng: route?.from?.lng ?? "",
    toLabel: route?.to?.label || "",
    toLat: route?.to?.lat ?? "",
    toLng: route?.to?.lng ?? "",
    notes: route?.notes || "",
    status: route?.status || "Active",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.name.trim() || form.fromLat === "" || form.fromLng === "" || form.toLat === "" || form.toLng === "") {
      showToast("Name, from-point and to-point are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        district: form.district.trim(),
        from: { label: form.fromLabel.trim(), lat: Number(form.fromLat), lng: Number(form.fromLng) },
        to: { label: form.toLabel.trim(), lat: Number(form.toLat), lng: Number(form.toLng) },
        notes: form.notes.trim(),
      };
      if (isEdit) {
        payload.status = form.status;
        const res = await api.evacuationRoutes.update(token, route._id, payload);
        onSaved(adapt.evacuationRoute(res.data));
        showToast("Evacuation route updated");
      } else {
        const res = await api.evacuationRoutes.create(token, payload);
        onSaved(adapt.evacuationRoute(res.data));
        showToast("Evacuation route created");
      }
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function markEvacuated() {
    setSaving(true);
    try {
      const res = await api.evacuationRoutes.markEvacuated(token, route._id);
      onSaved(adapt.evacuationRoute(res.data));
      showToast("Area marked evacuated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this evacuation route?")) return;
    setSaving(true);
    try {
      await api.evacuationRoutes.remove(token, route._id);
      onDeleted(route._id);
      showToast("Evacuation route deleted");
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900">{isEdit ? "Manage Evacuation Route" : "New Evacuation Route"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>

        <Field label="Name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nalbari to Guwahati" /></Field>
        <Field label="District"><input className={inputCls} value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} /></Field>

        <div className="text-xs font-bold text-gray-700 mb-1 mt-3">From</div>
        <Field label="Label"><input className={inputCls} value={form.fromLabel} onChange={e => setForm({ ...form, fromLabel: e.target.value })} placeholder="Starting point name" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude"><input className={inputCls} value={form.fromLat} onChange={e => setForm({ ...form, fromLat: e.target.value })} /></Field>
          <Field label="Longitude"><input className={inputCls} value={form.fromLng} onChange={e => setForm({ ...form, fromLng: e.target.value })} /></Field>
        </div>

        <div className="text-xs font-bold text-gray-700 mb-1 mt-3">To</div>
        <Field label="Label"><input className={inputCls} value={form.toLabel} onChange={e => setForm({ ...form, toLabel: e.target.value })} placeholder="Safe zone / destination name" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude"><input className={inputCls} value={form.toLat} onChange={e => setForm({ ...form, toLat: e.target.value })} /></Field>
          <Field label="Longitude"><input className={inputCls} value={form.toLng} onChange={e => setForm({ ...form, toLng: e.target.value })} /></Field>
        </div>

        <Field label="Notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>

        {isEdit && (
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {["Active", "Blocked", "Closed"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        )}

        <button onClick={submit} disabled={saving} className={btnPrimary + " w-full justify-center mb-2"}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {isEdit ? "Save changes" : "Create route"}
        </button>

        {isEdit && can.markAreaEvacuated && !route.areaEvacuated && (
          <button onClick={markEvacuated} disabled={saving} className={btnGhost + " w-full justify-center mb-2"}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark destination area evacuated
          </button>
        )}
        {isEdit && route.areaEvacuated && (
          <div className="text-xs text-green-600 font-semibold flex items-center gap-1.5 justify-center mb-2">
            <CheckCircle2 className="h-3.5 w-3.5" /> Area already marked evacuated
          </div>
        )}

        {isEdit && can.removeRiskZone /* Admin-only delete, same as risk zones */ && (
          <button onClick={remove} disabled={saving} className={btnDanger + " w-full justify-center mt-2"}>
            <Trash2 className="h-3.5 w-3.5" /> Delete route
          </button>
        )}
      </div>
    </ModalShell>
  );
}

// Report a new road block (Citizen/Volunteer -> lands as "Reported";
// Admin/Authority -> lands as "Confirmed" directly, per the backend scope),
// or manage an existing one (confirm / clear / delete).
function RoadBlockModal({ block, token, can, onClose, onSaved, onDeleted, showToast }) {
  const isEdit = !!block;
  const [form, setForm] = useState({
    location: block?.location || "",
    district: block?.district || "",
    lat: block?.lat ?? "",
    lng: block?.lng ?? "",
    reason: block?.reason || "Flooding",
    description: block?.description || "",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.location.trim()) {
      showToast("Location is required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        location: form.location.trim(),
        district: form.district.trim(),
        reason: form.reason,
        description: form.description.trim(),
      };
      if (form.lat !== "" && form.lng !== "") payload.coordinates = { lat: Number(form.lat), lng: Number(form.lng) };
      const res = await api.roadBlocks.report(token, payload);
      onSaved(adapt.roadBlock(res.data));
      showToast(can.markRoadBlocked === "full" ? "Road block marked" : "Road block reported");
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    setSaving(true);
    try {
      const res = await api.roadBlocks.confirm(token, block._id);
      onSaved(adapt.roadBlock(res.data));
      showToast("Road block confirmed");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      const res = await api.roadBlocks.clear(token, block._id);
      onSaved(adapt.roadBlock(res.data));
      showToast("Road block cleared");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this road block record?")) return;
    setSaving(true);
    try {
      await api.roadBlocks.remove(token, block._id);
      onDeleted(block._id);
      showToast("Road block deleted");
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900">{isEdit ? "Manage Road Block" : "Report Road Block"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>

        {!isEdit && (
          <>
            <Field label="Location"><input className={inputCls} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. NH-27 near Rangia" /></Field>
            <Field label="District"><input className={inputCls} value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Latitude (optional)"><input className={inputCls} value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} /></Field>
              <Field label="Longitude (optional)"><input className={inputCls} value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} /></Field>
            </div>
            <Field label="Reason">
              <select className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
                {["Flooding", "Debris", "Landslide", "Accident", "Structural Damage", "Other"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
            <button onClick={submit} disabled={saving} className={btnPrimary + " w-full justify-center"}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Report road block
            </button>
          </>
        )}

        {isEdit && (
          <>
            <div className="text-sm font-semibold text-gray-800 mb-1">{block.location}</div>
            <div className="text-xs text-gray-400 mb-3">{block.reason}{block.description ? " — " + block.description : ""}</div>
            <div className="text-xs font-semibold mb-4" style={{ color: ROAD_BLOCK_COLOR[block.status] }}>Status: {block.status}</div>

            <div className="flex flex-col gap-2">
              {block.status === "Reported" && can.markRoadBlocked && (
                <button onClick={confirm} disabled={saving} className={btnGhost + " w-full justify-center"}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirm block
                </button>
              )}
              {block.status !== "Cleared" && can.markRoadBlocked && (
                <button onClick={clear} disabled={saving} className={btnGhost + " w-full justify-center"}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Clear (road passable)
                </button>
              )}
              {can.removeRiskZone /* Admin-only delete */ && (
                <button onClick={remove} disabled={saving} className={btnDanger + " w-full justify-center"}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete record
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

// Manually add a shelter directly from the map (Admin/Authority), gated by
// the existing `addShelter` shelter-permission scope. Reuses api.shelters.create
// - the same endpoint the separate Shelters tab's "Add Shelter" form uses -
// so shelters placed from here go through the same approval rules (Admin
// auto-approved, Authority starts Pending).
function AddShelterMapModal({ token, onClose, onCreated, showToast }) {
  const [form, setForm] = useState({ name: "", location: "", lat: "", lng: "", capacity: "", contactPerson: "", contactPhone: "" });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.name.trim() || !form.location.trim() || !form.capacity || form.lat === "" || form.lng === "") {
      showToast("Name, location, coordinates and capacity are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        capacity: Number(form.capacity),
        contactPerson: form.contactPerson.trim(),
        contactPhone: form.contactPhone.trim(),
        coordinates: { lat: Number(form.lat), lng: Number(form.lng) },
      };
      const res = await api.shelters.create(token, payload);
      onCreated(adapt.shelter(res.data));
      showToast("Shelter added to the map");
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900">Add Shelter to Map</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>
        <Field label="Name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Guwahati Community Hall" /></Field>
        <Field label="Location"><input className={inputCls} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="District / block name" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude"><input className={inputCls} value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} placeholder="26.14" /></Field>
          <Field label="Longitude"><input className={inputCls} value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} placeholder="91.73" /></Field>
        </div>
        <Field label="Capacity"><input type="number" className={inputCls} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="200" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact person"><input className={inputCls} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></Field>
          <Field label="Contact phone"><input className={inputCls} value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></Field>
        </div>
        <button onClick={submit} disabled={saving} className={btnPrimary + " w-full justify-center"}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Home className="h-3.5 w-3.5" />}
          {saving ? "Saving..." : "Add shelter"}
        </button>
      </div>
    </ModalShell>
  );
}

export default function SatelliteView({ disasters = [], shelters = [], token, role, showToast = () => {}, onShelterAdded = () => {} }) {
  const [activeLayer, setActiveLayer] = useState("satellite");
  const [showZones, setShowZones] = useState(true);
  const [showShelters, setShowShelters] = useState(true);
  const [showFloodExtent, setShowFloodExtent] = useState(true);
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showRoadBlocks, setShowRoadBlocks] = useState(true);
  const [filterType, setFilterType] = useState("All");

  const [riskZones, setRiskZones] = useState([]);
  const [evacRoutes, setEvacRoutes] = useState([]);
  const [roadBlocks, setRoadBlocks] = useState([]);
  const [loading, setLoading] = useState(false);

  const [riskZoneModal, setRiskZoneModal] = useState(null); // { mode: "add" } | { mode: "edit", zone }
  const [routeModal, setRouteModal] = useState(null);
  const [roadBlockModal, setRoadBlockModal] = useState(null);
  const [shelterModal, setShelterModal] = useState(false);

  const can = mapPermissionsFor(role, [
    "addRiskZone", "editRiskZone", "removeRiskZone", "overrideAiRisk",
    "createEvacuationZone", "markRoadBlocked", "markAreaEvacuated",
  ]);
  const shelterCan = shelterPermissionsFor(role, ["addShelter"]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.riskZones.list(token, { limit: 200 }).catch(() => ({ data: [] })),
      api.evacuationRoutes.list(token).catch(() => ({ data: [] })),
      api.roadBlocks.list(token).catch(() => ({ data: [] })),
    ]).then(([rz, er, rb]) => {
      if (cancelled) return;
      setRiskZones((rz.data || []).map(adapt.riskZone));
      setEvacRoutes((er.data || []).map(adapt.evacuationRoute));
      setRoadBlocks((rb.data || []).map(adapt.roadBlock));
    }).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [token]);

  function upsertRiskZone(zone) {
    setRiskZones(prev => {
      const exists = prev.some(z => z._id === zone._id);
      return exists ? prev.map(z => (z._id === zone._id ? zone : z)) : [zone, ...prev];
    });
  }
  function upsertRoute(route) {
    setEvacRoutes(prev => {
      const exists = prev.some(r => r._id === route._id);
      return exists ? prev.map(r => (r._id === route._id ? route : r)) : [route, ...prev];
    });
  }
  function upsertRoadBlock(block) {
    setRoadBlocks(prev => {
      const exists = prev.some(b => b._id === block._id);
      return exists ? prev.map(b => (b._id === block._id ? block : b)) : [block, ...prev];
    });
  }

  const currentLayer = SATELLITE_LAYERS.find(l => l.id === activeLayer);
  const zones = useMemo(() => buildRiskZones(disasters), [disasters]);
  const filteredZones = filterType === "All" ? zones : zones.filter(z => z.type === filterType);
  const shelterPoints = shelters.filter(s => s.lat != null && s.lng != null);
  const floodZones = zones.filter(z => z.type === "Flood");
  const riskZonePoints = riskZones.filter(z => z.lat != null && z.lng != null);
  const routePoints = evacRoutes.filter(r => r.from?.lat != null && r.to?.lat != null);
  const roadBlockPoints = roadBlocks.filter(b => b.lat != null && b.lng != null);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Live Satellite Imagery</h2>
            <p className="text-xs text-gray-400 mt-0.5">Assam disaster zone monitoring</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-3.5 w-3.5 text-gray-300 animate-spin" />}
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              <span>Source: <span className="font-semibold text-gray-700">{currentLayer.name}</span></span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl p-1">
            {SATELLITE_LAYERS.map(l => (
              <button key={l.id} onClick={() => setActiveLayer(l.id)} className={"px-3 py-1.5 rounded-lg text-xs font-medium transition-colors " + (activeLayer === l.id ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700")}>
                {l.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {["All", "Flood", "Landslide", "Cyclone"].map(f => (
              <button key={f} onClick={() => setFilterType(f)} className={"px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors " + (filterType === f ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
                {f === "All" ? "All Hazards" : f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[
            { label: "Disaster Zones", state: showZones, setter: setShowZones, color: "text-red-500" },
            { label: "Shelters", state: showShelters, setter: setShowShelters, color: "text-green-600" },
            { label: "Flood Extent", state: showFloodExtent, setter: setShowFloodExtent, color: "text-blue-400" },
            { label: "Risk Zones", state: showRiskZones, setter: setShowRiskZones, color: "text-purple-500" },
            { label: "Evacuation Routes", state: showRoutes, setter: setShowRoutes, color: "text-teal-600" },
            { label: "Road Blocks", state: showRoadBlocks, setter: setShowRoadBlocks, color: "text-amber-600" },
          ].map(l => (
            <button key={l.label} onClick={() => l.setter(!l.state)} className={"flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors " + (l.state ? "bg-white border-gray-200 " + l.color : "bg-gray-50 border-gray-100 text-gray-400")}>
              {l.state ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {l.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            {can.addRiskZone && (
              <button onClick={() => setRiskZoneModal({ mode: "add" })} className={btnGhost}>
                <ShieldAlert className="h-3.5 w-3.5" /> Add Risk Zone
              </button>
            )}
            {can.createEvacuationZone && (
              <button onClick={() => setRouteModal({ mode: "add" })} className={btnGhost}>
                <RouteIcon className="h-3.5 w-3.5" /> Add Route
              </button>
            )}
            {shelterCan.addShelter && (
              <button onClick={() => setShelterModal(true)} className={btnGhost}>
                <Home className="h-3.5 w-3.5" /> Add Shelter
              </button>
            )}
            {token && (
              <button onClick={() => setRoadBlockModal({ mode: "add" })} className={btnGhost}>
                <Construction className="h-3.5 w-3.5" /> Report Road Block
              </button>
            )}
          </div>
        </div>

        <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: "1px solid #f1f5f9", height: "520px" }}>
          <MapContainer center={[26.2006, 92.2]} zoom={7} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              key={activeLayer}
              url={currentLayer.url}
              attribution={currentLayer.attribution}
              maxZoom={currentLayer.maxZoom}
            />

            {showFloodExtent && floodZones.map(zone => (
              <Circle key={"extent-" + zone.id} center={[zone.lat, zone.lng]} radius={riskRadius(zone.score) + 5000} pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.12, weight: 1, dashArray: "6 4" }} />
            ))}

            {showZones && filteredZones.map(zone => (
              <React.Fragment key={zone.id}>
                <Circle center={[zone.lat, zone.lng]} radius={riskRadius(zone.score)} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.20, weight: 1.5 }} />
                <Marker position={[zone.lat, zone.lng]} icon={createRiskIcon(zone.color)}>
                  <Popup>
                    <div style={{ minWidth: "180px", padding: "4px" }}>
                      <div style={{ fontWeight: 700, marginBottom: "4px" }}>{zone.name}</div>
                      <div style={{ fontSize: "11px", display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: "#6b7280" }}>Type:</span><span style={{ fontWeight: 600 }}>{zone.type}</span>
                      </div>
                      <div style={{ fontSize: "11px", display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ color: "#6b7280" }}>Risk Level:</span><span style={{ fontWeight: 700, color: zone.color }}>{zone.risk}</span>
                      </div>
                      <div style={{ background: "#f3f4f6", borderRadius: "4px", height: "5px" }}>
                        <div style={{ width: zone.score + "%", background: zone.color, height: "100%", borderRadius: "4px" }} />
                      </div>
                      <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "4px", textAlign: "right" }}>Risk score: {zone.score}/100</div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            ))}

            {showShelters && shelterPoints.map(s => (
              <Marker key={s._id || s.id} position={[s.lat, s.lng]} icon={createShelterIcon(s.status)}>
                <Popup>
                  <div style={{ minWidth: "160px", padding: "4px" }}>
                    <div style={{ fontWeight: 700, fontSize: "13px" }}>{s.name}</div>
                    <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>Occupancy: {s.occupancy}/{s.capacity}</div>
                    <div style={{ fontSize: "11px", fontWeight: 600, marginTop: "2px", color: s.status === "Available" ? "#16a34a" : s.status === "Full" ? "#dc2626" : "#d97706" }}>{s.status}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {showRiskZones && riskZonePoints.map(z => {
              const color = RISK_LEVEL_COLOR[z.riskLevel] || "#a855f7";
              return (
                <React.Fragment key={z._id}>
                  <Circle center={[z.lat, z.lng]} radius={z.radiusMeters} pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 1.5, dashArray: "3 3" }} />
                  <Marker position={[z.lat, z.lng]} icon={createSquareIcon(color, "Z")}>
                    <Popup>
                      <div style={{ minWidth: "190px", padding: "4px" }}>
                        <div style={{ fontWeight: 700, marginBottom: "4px" }}>{z.name}</div>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>{z.district || "—"} &middot; {z.status}</div>
                        <div style={{ fontSize: "11px", display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ color: "#6b7280" }}>Risk score:</span>
                          <span style={{ fontWeight: 700, color }}>{z.effectiveScore}/100 ({z.riskLevel})</span>
                        </div>
                        {(can.editRiskZone || can.removeRiskZone || can.overrideAiRisk) && (
                          <button
                            onClick={() => setRiskZoneModal({ mode: "edit", zone: z })}
                            style={{ width: "100%", fontSize: "11px", fontWeight: 600, color: "white", background: "#2563eb", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer" }}
                          >
                            Manage
                          </button>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              );
            })}

            {showRoutes && routePoints.map(r => (
              <React.Fragment key={r._id}>
                <Polyline
                  positions={[[r.from.lat, r.from.lng], ...(r.path || []).map(p => [p.lat, p.lng]), [r.to.lat, r.to.lng]]}
                  pathOptions={{ color: r.status === "Blocked" ? "#ef4444" : r.status === "Closed" ? "#6b7280" : "#0d9488", weight: 3, dashArray: r.status === "Active" ? undefined : "6 4" }}
                >
                  <Popup>
                    <div style={{ minWidth: "190px", padding: "4px" }}>
                      <div style={{ fontWeight: 700, marginBottom: "4px" }}>{r.name}</div>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>{r.from.label || "Start"} &rarr; {r.to.label || "Destination"}</div>
                      <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "6px", color: r.status === "Active" ? "#0d9488" : "#dc2626" }}>{r.status}{r.areaEvacuated ? " · Area evacuated" : ""}</div>
                      {(can.createEvacuationZone || can.markAreaEvacuated) && (
                        <button
                          onClick={() => setRouteModal({ mode: "edit", route: r })}
                          style={{ width: "100%", fontSize: "11px", fontWeight: 600, color: "white", background: "#0d9488", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer" }}
                        >
                          Manage
                        </button>
                      )}
                    </div>
                  </Popup>
                </Polyline>
                <Marker position={[r.from.lat, r.from.lng]} icon={createSquareIcon("#0d9488", "A")} />
                <Marker position={[r.to.lat, r.to.lng]} icon={createSquareIcon("#0d9488", "B")} />
              </React.Fragment>
            ))}

            {showRoadBlocks && roadBlockPoints.map(b => (
              <Marker key={b._id} position={[b.lat, b.lng]} icon={createSquareIcon(ROAD_BLOCK_COLOR[b.status] || "#f59e0b", "!")}>
                <Popup>
                  <div style={{ minWidth: "180px", padding: "4px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "4px" }}>{b.location}</div>
                    <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>{b.reason}</div>
                    <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "6px", color: ROAD_BLOCK_COLOR[b.status] }}>{b.status}</div>
                    <button
                      onClick={() => setRoadBlockModal({ mode: "edit", block: b })}
                      style={{ width: "100%", fontSize: "11px", fontWeight: 600, color: "white", background: "#d97706", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer" }}
                    >
                      Manage
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div style={{ position: "absolute", bottom: "16px", left: "12px", zIndex: 999, background: "rgba(15,30,61,0.92)", borderRadius: "12px", padding: "12px", backdropFilter: "blur(8px)", fontSize: "11px", color: "white" }}>
            <div style={{ fontWeight: 700, marginBottom: "8px", color: "#93c5fd" }}>Map Layers</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }}></span><span>Critical Risk Zone</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f97316", display: "inline-block" }}></span><span>High Risk Zone</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#eab308", display: "inline-block" }}></span><span>Medium Risk Zone</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#22c55e", display: "inline-block" }}></span><span>Shelter</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#a855f7", display: "inline-block" }}></span><span>Admin Risk Zone</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}><span style={{ width: "10px", height: "2px", background: "#0d9488", display: "inline-block" }}></span><span>Evacuation Route</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#f59e0b", display: "inline-block" }}></span><span>Road Block</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(59,130,246,0.4)", border: "1px dashed #3b82f6", display: "inline-block" }}></span><span>Flood Extent</span></div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><Info className="h-3 w-3" />Satellite: Esri World Imagery | Zoom in for detailed imagery</span>
          <span className="ml-auto">Resolution: 15m-1m depending on area | Coverage: Assam, Northeast India</span>
        </div>
      </div>

      {riskZoneModal && (
        <RiskZoneModal
          zone={riskZoneModal.mode === "edit" ? riskZoneModal.zone : null}
          token={token}
          can={can}
          onClose={() => setRiskZoneModal(null)}
          onSaved={upsertRiskZone}
          onDeleted={(id) => setRiskZones(prev => prev.filter(z => z._id !== id))}
          showToast={showToast}
        />
      )}
      {routeModal && (
        <EvacuationRouteModal
          route={routeModal.mode === "edit" ? routeModal.route : null}
          token={token}
          can={can}
          onClose={() => setRouteModal(null)}
          onSaved={upsertRoute}
          onDeleted={(id) => setEvacRoutes(prev => prev.filter(r => r._id !== id))}
          showToast={showToast}
        />
      )}
      {shelterModal && (
        <AddShelterMapModal
          token={token}
          onClose={() => setShelterModal(false)}
          onCreated={(s) => { onShelterAdded(s); setShelterModal(false); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
