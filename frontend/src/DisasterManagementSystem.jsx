import React, { useState, useEffect, useRef } from "react";
import {
  AlertTriangle, MapPin, Phone, Shield,
  Menu, X, ChevronRight, Bell, User, Users, LogOut, LayoutDashboard,
  FileText, CheckCircle, XCircle, Truck, Home, Settings, BarChart3,
  Package, ClipboardList, UserCheck, PlusCircle, Trash2, Upload,
  Clock, TrendingUp, Siren, Eye, Send, ArrowLeft, Cloud, Waves,
  Mountain, Flame, ShieldCheck, Pencil,
  MessageSquare, Radio, Brain, ChevronDown, Locate,
  AlertCircle, ExternalLink, Activity,
  Globe, Bot, Newspaper, Heart, Building2, Smartphone, DollarSign,
  Image as ImageIcon, Loader2, CheckCheck, UserCog, Ban
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import SatelliteView from "./features/SatelliteView";
import DisasterChatbot from "./features/DisasterChatbot";
import NewsView from "./features/NewsView";
import DonationsView from "./features/DonationsView";
import NGOView from "./features/NGOView";
import { api, adapt, ROLE_TO_KEY, KEY_TO_ROLE, API_ORIGIN } from "./lib/api";
import { shelterPermissionsFor, SCOPE as SHELTER_SCOPE } from "./lib/shelterPermissions";

const DISASTER_ICONS_MAP = { Flood: Waves, Cyclone: Cloud, Earthquake: Mountain, Landslide: Mountain, Fire: Flame, Accident: AlertTriangle };

const PIE_COLORS = ["#22c55e", "#f97316", "#ef4444"];
const INCIDENT_COLORS = ["#3b82f6", "#f97316", "#a855f7", "#ef4444", "#22c55e"];

// Severity <-> risk-score helpers, shared by the live risk map and the AI panel
// so real fetched disasters (not mock arrays) can be turned into zones/scores.
const SEVERITY_COLOR = { Critical: "#ef4444", High: "#f97316", Medium: "#eab308", Low: "#22c55e" };
const SEVERITY_SCORE = { Critical: 90, High: 70, Medium: 50, Low: 25 };
const SEVERITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function timeAgo(dateStr) {
  if (!dateStr) return "-";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  return days + "d ago";
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
      desc: g.count + (g.count === 1 ? " report" : " reports") + " · " + g.type,
      color: SEVERITY_COLOR[g.severity] || "#6b7280",
    };
  });
}

// Groups reported disasters by type and turns severity + frequency into a
// probability score for the AI Risk Engine panel - there's no ML model on
// the backend, so this is a simple, transparent heuristic over real reports.
function buildPredictions(disasters) {
  const groups = new Map();
  disasters.forEach((d) => {
    if (!d.type) return;
    if (!groups.has(d.type)) {
      groups.set(d.type, { type: d.type, locations: new Set(), maxSeverity: "Low", count: 0 });
    }
    const g = groups.get(d.type);
    if (d.location) g.locations.add(d.location);
    g.count += 1;
    if ((SEVERITY_RANK[d.severity] || 0) > (SEVERITY_RANK[g.maxSeverity] || 0)) {
      g.maxSeverity = d.severity;
    }
  });
  return Array.from(groups.values())
    .map((g) => {
      const base = SEVERITY_SCORE[g.maxSeverity] || 30;
      const probability = Math.min(97, base + Math.min(g.count - 1, 5) * 6);
      const risk = probability >= 80 ? "Critical" : probability >= 60 ? "High" : probability >= 40 ? "Medium" : "Low";
      const areaList = Array.from(g.locations);
      const area = areaList.length > 2 ? areaList.slice(0, 2).join(", ") + " +" + (areaList.length - 2) + " more" : (areaList.join(", ") || "Multiple areas");
      const action =
        risk === "Critical" ? "Deploy response teams immediately and issue public alerts." :
        risk === "High" ? "Pre-position resources and monitor affected areas closely." :
        risk === "Medium" ? "Increase monitoring frequency and prepare contingency resources." :
        "Continue routine monitoring - no immediate action required.";
      return { type: g.type, area, risk, probability, action };
    })
    .sort((a, b) => b.probability - a.probability);
}

function statusClasses(status) {
  const map = {
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Verified: "bg-blue-50 text-blue-700 border-blue-200",
    "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
    Resolved: "bg-green-50 text-green-700 border-green-200",
    Rejected: "bg-gray-100 text-gray-500 border-gray-200",
    Active: "bg-green-50 text-green-700 border-green-200",
    Blocked: "bg-red-50 text-red-700 border-red-200",
    Approved: "bg-green-50 text-green-700 border-green-200",
    Assigned: "bg-blue-50 text-blue-700 border-blue-200",
    Completed: "bg-green-50 text-green-700 border-green-200",
    Available: "bg-green-50 text-green-700 border-green-200",
    "Almost Full": "bg-amber-50 text-amber-700 border-amber-200",
    Full: "bg-red-50 text-red-700 border-red-200",
  };
  return map[status] || "bg-gray-100 text-gray-500 border-gray-200";
}

function severityClasses(sev) {
  const map = {
    Low: "bg-green-50 text-green-700 border-green-200",
    Medium: "bg-amber-50 text-amber-700 border-amber-200",
    High: "bg-orange-50 text-orange-700 border-orange-200",
    Critical: "bg-red-50 text-red-700 border-red-200",
  };
  return map[sev] || "bg-gray-100 text-gray-500 border-gray-200";
}

function alertDotColor(priority) {
  const map = { Critical: "bg-red-500", High: "bg-orange-500", Medium: "bg-yellow-400", Low: "bg-green-500" };
  return map[priority] || "bg-gray-400";
}

function Badge({ children, className }) {
  return <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border " + (className || "")}>{children}</span>;
}

function Card({ title, action, children, className }) {
  return (
    <div className={"bg-white border border-gray-100 rounded-xl p-5 shadow-sm " + (className || "")}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-sm font-semibold text-gray-800">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors";

function Table({ columns, rows, renderActions }) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-400 uppercase text-xs tracking-wider">
            {columns.map((c) => <th key={c.key} className="px-3 py-2.5 font-semibold">{c.label}</th>)}
            {renderActions && <th className="px-3 py-2.5 font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2.5 text-gray-700 text-sm">
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
              {renderActions && <td className="px-3 py-2.5">{renderActions(row)}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-gray-400">No records found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function IconBtn({ icon: Icon, onClick, title, tone }) {
  const t = tone || "default";
  const tones = {
    default: "text-gray-400 hover:text-gray-700 hover:bg-gray-100",
    success: "text-green-600 hover:bg-green-50",
    danger: "text-red-500 hover:bg-red-50",
    primary: "text-blue-500 hover:bg-blue-50",
  };
  return (
    <button title={title} onClick={onClick} className={"p-1.5 rounded-lg transition-colors " + tones[t]}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function PrimaryBtn({ children, onClick, className, icon: Icon, danger, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className={"inline-flex items-center justify-center h-9 rounded-lg " + (danger ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700") + " px-4 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50 " + (className || "")}>
      {Icon && <Icon className="mr-1.5 h-3.5 w-3.5" />}{children}
    </button>
  );
}

function GhostBtn({ children, onClick, className, icon: Icon }) {
  return (
    <button onClick={onClick} className={"inline-flex items-center justify-center h-9 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 " + (className || "")}>
      {Icon && <Icon className="mr-1.5 h-3.5 w-3.5" />}{children}
    </button>
  );
}

// --- Notifications (top-bar bell dropdown) -----------------------------------
const NOTIFICATION_ICONS = { Alert: Bell, Task: ClipboardList, Donation: Heart, Disaster: AlertTriangle, Shelter: Home, NGO: Building2, News: Newspaper, System: Settings };

function timeAgoShort(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return new Date(dateStr).toLocaleDateString();
}

function NotificationsPanel({ token, role, open, onClose, unreadCount, onUnreadChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canDelete = role === "authority" || role === "admin";

  function load() {
    if (!token) return;
    setLoading(true);
    setError("");
    api.notifications.list(token)
      .then((res) => setItems(res.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function markRead(id) {
    const item = items.find((n) => n._id === id);
    if (!item || item.read) return;
    try {
      await api.notifications.markRead(token, id);
      setItems(items.map((n) => (n._id === id ? { ...n, read: true } : n)));
      onUnreadChange(Math.max(0, unreadCount - 1));
    } catch {
      /* best-effort */
    }
  }

  async function markAllRead() {
    try {
      await api.notifications.markAllRead(token);
      setItems(items.map((n) => ({ ...n, read: true })));
      onUnreadChange(0);
    } catch {
      /* best-effort */
    }
  }

  async function removeOne(id) {
    const wasUnread = items.find((n) => n._id === id && !n.read);
    try {
      await api.notifications.remove(token, id);
      setItems(items.filter((n) => n._id !== id));
      if (wasUnread) onUnreadChange(Math.max(0, unreadCount - 1));
    } catch {
      /* best-effort */
    }
  }

  if (!open) return null;

  return (
    <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-900">Notifications</span>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
            <CheckCheck className="h-3.5 w-3.5" />Mark all read
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {loading && <div className="text-center py-8 text-xs text-gray-400">Loading...</div>}
        {!loading && error && <div className="text-center py-8 text-xs text-red-500">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400">No notifications yet.</div>
        )}
        {!loading && items.map((n) => {
          const Icon = NOTIFICATION_ICONS[n.type] || Bell;
          return (
            <div key={n._id} onClick={() => markRead(n._id)} className={"flex items-start gap-2.5 px-3.5 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 " + (n.read ? "" : "bg-blue-50/50")}>
              <div className={"h-7 w-7 rounded-lg flex items-center justify-center shrink-0 " + (n.read ? "bg-gray-100 text-gray-400" : "bg-blue-100 text-blue-600")}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={"text-xs leading-tight " + (n.read ? "text-gray-600" : "text-gray-900 font-semibold")}>{n.title}</p>
                {n.message && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>}
                <p className="text-[10px] text-gray-300 mt-1">{timeAgoShort(n.createdAt)}</p>
              </div>
              {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
              {canDelete && (
                <button onClick={(e) => { e.stopPropagation(); removeOne(n._id); }} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0" title="Delete">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Evidence photos/videos (shared by citizen report form + incident table) -
function EvidenceManager({ token, disasterId, images, canUpload, canDelete, onChange, showToast }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const res = await api.disasters.uploadImages(token, disasterId, files);
      onChange(res.data.images || []);
      showToast("Evidence uploaded");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(imageUrl) {
    try {
      const res = await api.disasters.deleteImage(token, disasterId, imageUrl);
      onChange(res.data.images || []);
      showToast("Image removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  return (
    <div>
      {images.length === 0 && <p className="text-xs text-gray-400 mb-3">No evidence uploaded yet.</p>}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {images.map((url) => (
            <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
              <img src={API_ORIGIN + url} alt="Evidence" className="w-full h-full object-cover" />
              {canDelete && (
                <button onClick={() => handleDelete(url)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canUpload && (
        <>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={handleFiles} />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <Upload className="h-4 w-4 text-blue-500" />}
            {uploading ? "Uploading..." : "Upload Photo / Video"}
          </button>
          <p className="text-[10px] text-gray-400 mt-1.5">JPEG, PNG, WEBP or GIF, up to 5MB each, 5 files max.</p>
        </>
      )}
    </div>
  );
}

// --- Evidence picker for the "before submitting" step of the citizen report
// form. Files are only staged locally (with object-URL previews) - nothing
// is uploaded to the server until the report itself is created, at which
// point submitReport() uploads the staged files against the new disasterId
// so the evidence is saved together with the incident report. Mirrors the
// server-side limits in backend/src/middleware/uploadMiddleware.js (JPEG/
// PNG/WEBP/GIF, 5MB each, 5 files max).
const EVIDENCE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const EVIDENCE_MAX_FILES = 5;
const EVIDENCE_MAX_SIZE = 5 * 1024 * 1024;

function EvidencePicker({ staged, onChange, showToast }) {
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTargetId = useRef(null);

  function validateFile(file) {
    if (!EVIDENCE_ACCEPT.split(",").includes(file.type)) {
      showToast("Only JPEG, PNG, WEBP or GIF images are allowed", "error");
      return false;
    }
    if (file.size > EVIDENCE_MAX_SIZE) {
      showToast(file.name + " is over 5MB", "error");
      return false;
    }
    return true;
  }

  function handleAdd(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = EVIDENCE_MAX_FILES - staged.length;
    if (room <= 0) {
      showToast("You can attach up to " + EVIDENCE_MAX_FILES + " files", "error");
      return;
    }
    const accepted = files.filter(validateFile).slice(0, room);
    if (accepted.length < files.length) {
      showToast("Only the first " + accepted.length + " file(s) were added (5 file limit)", "error");
    }
    const staged2 = accepted.map((file) => ({
      id: Date.now() + "-" + Math.random().toString(36).slice(2),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    onChange([...staged, ...staged2]);
  }

  function handleRemove(id) {
    const target = staged.find((s) => s.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(staged.filter((s) => s.id !== id));
  }

  function startReplace(id) {
    replaceTargetId.current = id;
    if (replaceInputRef.current) replaceInputRef.current.click();
  }

  function handleReplace(e) {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    const id = replaceTargetId.current;
    if (!file || !id) return;
    if (!validateFile(file)) return;
    onChange(
      staged.map((s) => {
        if (s.id !== id) return s;
        URL.revokeObjectURL(s.previewUrl);
        return { ...s, file, previewUrl: URL.createObjectURL(file) };
      })
    );
  }

  return (
    <div>
      {staged.length === 0 && <p className="text-xs text-gray-400 mb-3">No evidence attached yet.</p>}
      {staged.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {staged.map((item) => (
            <div key={item.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
              <img src={item.previewUrl} alt="Evidence preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => startReplace(item.id)}
                  className="h-6 w-6 rounded-full bg-white/90 text-gray-700 flex items-center justify-center hover:bg-white"
                  title="Replace"
                  type="button"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                  title="Remove"
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <input ref={addInputRef} type="file" accept={EVIDENCE_ACCEPT} multiple className="hidden" onChange={handleAdd} />
      <input ref={replaceInputRef} type="file" accept={EVIDENCE_ACCEPT} className="hidden" onChange={handleReplace} />
      <button
        onClick={() => addInputRef.current && addInputRef.current.click()}
        disabled={staged.length >= EVIDENCE_MAX_FILES}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        type="button"
      >
        <ImageIcon className="h-4 w-4 text-blue-500" />
        Add Photo / Video
      </button>
      <p className="text-[10px] text-gray-400 mt-1.5">JPEG, PNG, WEBP or GIF, up to 5MB each, {EVIDENCE_MAX_FILES} files max. Attached here will be saved with your report.</p>
    </div>
  );
}

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function createRiskIcon(color) {
  return L.divIcon({
    className: "",
    html: '<div style="width:28px;height:28px;background:' + color + ';border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:white;border-radius:50%;"></div></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createShelterIcon() {
  return L.divIcon({
    className: "",
    html: '<div style="width:26px;height:26px;background:#22c55e;border:3px solid white;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:white;">S</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// Marker for zones an Admin has drawn manually on the map (as opposed to the
// dashed/derived zones auto-built from disaster reports), so the two are
// visually distinguishable.
function createManualZoneIcon(color) {
  return L.divIcon({
    className: "",
    html: '<div style="width:26px;height:26px;background:' + color + ';border:3px solid white;border-radius:6px 6px 6px 0;transform:rotate(45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 24],
  });
}

// Sits inside the MapContainer purely to listen for clicks while "add zone"
// mode is active, and to swap the cursor so it's obvious the map is
// clickable right now.
function ManualZoneClickCapture({ active, onPick }) {
  const map = useMap();
  React.useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = active ? "crosshair" : "";
    return () => { el.style.cursor = ""; };
  }, [active, map]);
  useMapEvents({
    click(e) {
      if (active) onPick(e.latlng);
    },
  });
  return null;
}

function GPSLocator() {
  const map = useMap();
  function locate() {
    map.locate({ setView: true, maxZoom: 13 });
    map.once("locationfound", (e) => {
      L.circle(e.latlng, { radius: e.accuracy / 2, color: "#3b82f6", fillOpacity: 0.15 }).addTo(map);
      L.marker(e.latlng, {
        icon: L.divIcon({
          className: "",
          html: '<div style="width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(59,130,246,0.5);"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        })
      }).addTo(map).bindPopup("You are here").openPopup();
    });
    map.once("locationerror", () => { map.setView([26.2006, 92.9376], 7); });
  }
  return (
    <button onClick={locate} title="Locate me (GPS)" style={{ position: "absolute", bottom: "96px", right: "12px", zIndex: 999, width: "32px", height: "32px", background: "white", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      <Locate className="h-4 w-4 text-blue-600" />
    </button>
  );
}

const MANUAL_ZONE_RISK_COLOR = { Low: "#22c55e", Medium: "#eab308", High: "#f97316", Critical: "#ef4444" };
const EMPTY_MANUAL_ZONE_FORM = { name: "", district: "", riskLevel: "Medium", radiusMeters: 2000, estimatedPopulation: "" };
const EMPTY_MANUAL_SHELTER_FORM = { name: "", location: "", capacity: "", contactPerson: "", contactPhone: "" };

// Admin-only: `canCreateZone` turns on a "Add Risk Zone" toggle that lets an
// Admin click anywhere on the map to manually drop and configure an official
// risk zone (backed by POST /map/risk-zones), separate from the zones that
// are auto-derived from disaster reports above. `canCreateShelter` turns on a
// parallel "Add Shelter" toggle that lets an Admin click the map to drop a
// new shelter record (backed by POST /shelters). Only one placement tool
// (`addMode`: null | "zone" | "shelter") can be active at a time.
function AssamMap({ disasters = [], shelters = [], showShelters, canCreateZone = false, canCreateShelter = false, token, showToast, onShelterCreated, onRemoveReportZone }) {
  const [filter, setFilter] = useState("All");
  const filters = ["All", "Flood", "Landslide", "Cyclone"];
  const zones = React.useMemo(() => buildRiskZones(disasters), [disasters]);
  const filtered = filter === "All" ? zones : zones.filter(z => z.type === filter);
  const shelterPoints = shelters.filter(s => s.lat != null && s.lng != null);

  const [manualZones, setManualZones] = useState([]);
  const [addMode, setAddMode] = useState(null); // null | "zone" | "shelter"
  const [pendingPoint, setPendingPoint] = useState(null); // {lat, lng} awaiting risk-zone form submission
  const [zoneForm, setZoneForm] = useState(EMPTY_MANUAL_ZONE_FORM);
  const [savingZone, setSavingZone] = useState(false);
  const [pendingShelterPoint, setPendingShelterPoint] = useState(null); // {lat, lng} awaiting shelter form submission
  const [shelterForm, setShelterForm] = useState(EMPTY_MANUAL_SHELTER_FORM);
  const [savingShelter, setSavingShelter] = useState(false);

  useEffect(() => {
    if (!canCreateZone || !token) return;
    let cancelled = false;
    api.riskZones.list(token).then(res => {
      if (!cancelled) setManualZones((res.data || []).map(adapt.riskZone));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [canCreateZone, token]);

  function riskRadius(score) {
    if (score >= 75) return 35000;
    if (score >= 55) return 25000;
    if (score >= 35) return 18000;
    return 12000;
  }

  function handleMapPick(latlng) {
    if (addMode === "shelter") {
      setPendingShelterPoint({ lat: latlng.lat, lng: latlng.lng });
      setShelterForm(EMPTY_MANUAL_SHELTER_FORM);
    } else {
      setPendingPoint({ lat: latlng.lat, lng: latlng.lng });
      setZoneForm(EMPTY_MANUAL_ZONE_FORM);
    }
  }

  function cancelZoneDraft() {
    setPendingPoint(null);
    setZoneForm(EMPTY_MANUAL_ZONE_FORM);
  }

  function cancelShelterDraft() {
    setPendingShelterPoint(null);
    setShelterForm(EMPTY_MANUAL_SHELTER_FORM);
  }

  function toggleAddMode(mode) {
    setAddMode(m => (m === mode ? null : mode));
    cancelZoneDraft();
    cancelShelterDraft();
  }

  async function saveManualZone() {
    if (!zoneForm.name.trim()) { showToast && showToast("Enter a zone name first", "error"); return; }
    if (!pendingPoint) return;
    setSavingZone(true);
    try {
      const res = await api.riskZones.create(token, {
        name: zoneForm.name.trim(),
        district: zoneForm.district.trim(),
        center: { lat: pendingPoint.lat, lng: pendingPoint.lng },
        radiusMeters: Number(zoneForm.radiusMeters) || 2000,
        riskLevel: zoneForm.riskLevel,
        estimatedPopulation: Number(zoneForm.estimatedPopulation) || 0,
      });
      setManualZones(prev => [adapt.riskZone(res.data), ...prev]);
      showToast && showToast("Risk zone created");
      cancelZoneDraft();
      setAddMode(null);
    } catch (err) {
      showToast && showToast(err.message, "error");
    } finally {
      setSavingZone(false);
    }
  }

  async function deleteManualZone(zone) {
    try {
      await api.riskZones.remove(token, zone._id);
      setManualZones(prev => prev.filter(z => z._id !== zone._id));
      showToast && showToast("Risk zone removed");
    } catch (err) {
      showToast && showToast(err.message, "error");
    }
  }

  async function saveManualShelter() {
    if (!shelterForm.name.trim()) { showToast && showToast("Enter a shelter name first", "error"); return; }
    if (!shelterForm.location.trim()) { showToast && showToast("Enter a location first", "error"); return; }
    if (!shelterForm.capacity) { showToast && showToast("Enter a capacity first", "error"); return; }
    if (!pendingShelterPoint) return;
    setSavingShelter(true);
    try {
      const res = await api.shelters.create(token, {
        name: shelterForm.name.trim(),
        location: shelterForm.location.trim(),
        capacity: Number(shelterForm.capacity),
        contactPerson: shelterForm.contactPerson.trim(),
        contactPhone: shelterForm.contactPhone.trim(),
        coordinates: { lat: pendingShelterPoint.lat, lng: pendingShelterPoint.lng },
      });
      onShelterCreated && onShelterCreated(adapt.shelter(res.data));
      showToast && showToast("Shelter added");
      cancelShelterDraft();
      setAddMode(null);
    } catch (err) {
      showToast && showToast(err.message, "error");
    } finally {
      setSavingShelter(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} className={"px-3 py-1 rounded-lg text-xs font-medium border transition-colors " + (filter === f ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
            {f === "All" ? "All Hazards" : f}
          </button>
        ))}
        {canCreateZone && (
          <button
            onClick={() => toggleAddMode("zone")}
            className={"px-3 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 " + (addMode === "zone" ? "bg-orange-600 text-white border-orange-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}
            title="Manually place a new official risk zone on the map"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            {addMode === "zone" ? "Click map to place zone" : "Add Risk Zone"}
          </button>
        )}
        {canCreateShelter && (
          <button
            onClick={() => toggleAddMode("shelter")}
            className={"px-3 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 " + (addMode === "shelter" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}
            title="Manually place a new shelter on the map"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            {addMode === "shelter" ? "Click map to place shelter" : "Add Shelter"}
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500 inline-block"></span>Live GPS
        </span>
      </div>

      <div style={{ position: "relative", flex: 1, borderRadius: "12px", overflow: "hidden", border: "1px solid #f1f5f9", minHeight: "340px" }}>
        <MapContainer center={[26.2006, 92.2]} zoom={7} style={{ height: "100%", width: "100%" }} zoomControl={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filtered.map(zone => (
            <React.Fragment key={zone.id}>
              <Circle center={[zone.lat, zone.lng]} radius={riskRadius(zone.score)} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.18, weight: 1.5 }} />
              <Marker position={[zone.lat, zone.lng]} icon={createRiskIcon(zone.color)}>
                <Popup>
                  <div style={{ minWidth: "170px", padding: "4px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>{zone.name}</div>
                    <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px" }}>{zone.desc}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                      <span>Risk:</span>
                      <span style={{ fontWeight: 700, color: zone.color }}>{zone.risk}</span>
                    </div>
                    <div style={{ background: "#f3f4f6", borderRadius: "4px", height: "6px", marginTop: "6px" }}>
                      <div style={{ width: zone.score + "%", background: zone.color, height: "100%", borderRadius: "4px" }} />
                    </div>
                    <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "4px" }}>Score: {zone.score}/100</div>
                    {onRemoveReportZone && (
                      <button
                        onClick={() => onRemoveReportZone(zone.id)}
                        style={{ fontSize: "11px", color: "#dc2626", background: "none", border: "none", padding: "8px 0 0", cursor: "pointer" }}
                      >
                        Remove zone
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}
          {showShelters && shelterPoints.map(s => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={createShelterIcon()}>
              <Popup>
                <div style={{ minWidth: "150px", padding: "4px" }}>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>{s.name}</div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>{s.location}</div>
                  <div style={{ fontSize: "11px", marginTop: "4px" }}>Occupancy: <strong>{s.occupancy}/{s.capacity}</strong></div>
                  <div style={{ fontSize: "11px", fontWeight: 600, marginTop: "2px", color: s.status === "Available" ? "#16a34a" : s.status === "Full" ? "#dc2626" : "#d97706" }}>{s.status}</div>
                  <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px" }}>{s.contact}</div>
                </div>
              </Popup>
            </Marker>
          ))}
          {canCreateZone && manualZones.map(z => (
            <React.Fragment key={z._id}>
              <Circle center={[z.lat, z.lng]} radius={z.radiusMeters} pathOptions={{ color: MANUAL_ZONE_RISK_COLOR[z.riskLevel] || "#6b7280", fillColor: MANUAL_ZONE_RISK_COLOR[z.riskLevel] || "#6b7280", fillOpacity: 0.12, weight: 1.5, dashArray: "6 4" }} />
              <Marker position={[z.lat, z.lng]} icon={createManualZoneIcon(MANUAL_ZONE_RISK_COLOR[z.riskLevel] || "#6b7280")}>
                <Popup>
                  <div style={{ minWidth: "170px", padding: "4px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "2px" }}>{z.name}</div>
                    <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "6px" }}>Manually added · {z.id}</div>
                    {z.district && <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>{z.district}</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "6px" }}>
                      <span>Risk level:</span>
                      <span style={{ fontWeight: 700, color: MANUAL_ZONE_RISK_COLOR[z.riskLevel] || "#6b7280" }}>{z.riskLevel}</span>
                    </div>
                    <button
                      onClick={() => deleteManualZone(z)}
                      style={{ fontSize: "11px", color: "#dc2626", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      Remove zone
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}
          {pendingPoint && (
            <Marker position={[pendingPoint.lat, pendingPoint.lng]} icon={createManualZoneIcon("#3b82f6")} />
          )}
          {pendingShelterPoint && (
            <Marker position={[pendingShelterPoint.lat, pendingShelterPoint.lng]} icon={createShelterIcon()} />
          )}
          <ManualZoneClickCapture
            active={(addMode === "zone" && !pendingPoint) || (addMode === "shelter" && !pendingShelterPoint)}
            onPick={handleMapPick}
          />
          <GPSLocator />
        </MapContainer>

        <div style={{ position: "absolute", bottom: "16px", left: "12px", zIndex: 999, background: "white", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", fontSize: "11px" }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Risk Level</div>
          {[
            { label: "Low (0-30)", color: "#22c55e" },
            { label: "Moderate (31-60)", color: "#eab308" },
            { label: "High (61-80)", color: "#f97316" },
            { label: "Critical (81-100)", color: "#ef4444" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: l.color, flexShrink: 0 }} />
              <span style={{ color: "#6b7280" }}>{l.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#22c55e", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: 700, color: "white" }}>S</span>
            <span style={{ color: "#6b7280" }}>Shelter</span>
          </div>
        </div>

        {canCreateZone && addMode === "zone" && !pendingPoint && (
          <div style={{ position: "absolute", top: "12px", left: "50%", transform: "translateX(-50%)", zIndex: 999, background: "#1f2937", color: "white", borderRadius: "8px", padding: "6px 12px", fontSize: "11px", fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
            Click anywhere on the map to place the new risk zone
          </div>
        )}

        {canCreateShelter && addMode === "shelter" && !pendingShelterPoint && (
          <div style={{ position: "absolute", top: "12px", left: "50%", transform: "translateX(-50%)", zIndex: 999, background: "#1f2937", color: "white", borderRadius: "8px", padding: "6px 12px", fontSize: "11px", fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
            Click anywhere on the map to place the new shelter
          </div>
        )}

        {pendingPoint && (
          <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 999, width: "230px", background: "white", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "14px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
            <div style={{ fontWeight: 600, color: "#374151", fontSize: "12px", marginBottom: "8px" }}>New Risk Zone</div>
            <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "8px" }}>{pendingPoint.lat.toFixed(4)}, {pendingPoint.lng.toFixed(4)}</div>
            <input
              className={inputCls + " mb-2 text-xs"}
              placeholder="Zone name"
              value={zoneForm.name}
              onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })}
              autoFocus
            />
            <input
              className={inputCls + " mb-2 text-xs"}
              placeholder="District (optional)"
              value={zoneForm.district}
              onChange={e => setZoneForm({ ...zoneForm, district: e.target.value })}
            />
            <select
              className={inputCls + " mb-2 text-xs"}
              value={zoneForm.riskLevel}
              onChange={e => setZoneForm({ ...zoneForm, riskLevel: e.target.value })}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
            <input
              className={inputCls + " mb-2 text-xs"}
              type="number"
              min="0"
              placeholder="Radius (meters)"
              value={zoneForm.radiusMeters}
              onChange={e => setZoneForm({ ...zoneForm, radiusMeters: e.target.value })}
            />
            <input
              className={inputCls + " mb-3 text-xs"}
              type="number"
              min="0"
              placeholder="Population at risk (optional)"
              value={zoneForm.estimatedPopulation}
              onChange={e => setZoneForm({ ...zoneForm, estimatedPopulation: e.target.value })}
            />
            <div className="flex gap-2">
              <button onClick={saveManualZone} disabled={savingZone} className="flex-1 h-8 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                {savingZone ? "Saving..." : "Save Zone"}
              </button>
              <button onClick={cancelZoneDraft} disabled={savingZone} className="h-8 px-3 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {pendingShelterPoint && (
          <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 999, width: "230px", background: "white", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "14px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
            <div style={{ fontWeight: 600, color: "#374151", fontSize: "12px", marginBottom: "8px" }}>New Shelter</div>
            <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "8px" }}>{pendingShelterPoint.lat.toFixed(4)}, {pendingShelterPoint.lng.toFixed(4)}</div>
            <input
              className={inputCls + " mb-2 text-xs"}
              placeholder="Shelter name"
              value={shelterForm.name}
              onChange={e => setShelterForm({ ...shelterForm, name: e.target.value })}
              autoFocus
            />
            <input
              className={inputCls + " mb-2 text-xs"}
              placeholder="Location / district"
              value={shelterForm.location}
              onChange={e => setShelterForm({ ...shelterForm, location: e.target.value })}
            />
            <input
              className={inputCls + " mb-2 text-xs"}
              type="number"
              min="0"
              placeholder="Capacity"
              value={shelterForm.capacity}
              onChange={e => setShelterForm({ ...shelterForm, capacity: e.target.value })}
            />
            <input
              className={inputCls + " mb-2 text-xs"}
              placeholder="Contact person (optional)"
              value={shelterForm.contactPerson}
              onChange={e => setShelterForm({ ...shelterForm, contactPerson: e.target.value })}
            />
            <input
              className={inputCls + " mb-3 text-xs"}
              placeholder="Contact phone (optional)"
              value={shelterForm.contactPhone}
              onChange={e => setShelterForm({ ...shelterForm, contactPhone: e.target.value })}
            />
            <div className="flex gap-2">
              <button onClick={saveManualShelter} disabled={savingShelter} className="flex-1 h-8 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                {savingShelter ? "Saving..." : "Save Shelter"}
              </button>
              <button onClick={cancelShelterDraft} disabled={savingShelter} className="h-8 px-3 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ROLE_META = {
  citizen: { label: "Citizen / User", shortLabel: "Citizen", icon: User, color: "text-emerald-600", bg: "bg-emerald-50", ring: "border-emerald-200" },
  authority: { label: "Disaster Management Authority", shortLabel: "Authority", icon: ShieldCheck, color: "text-blue-600", bg: "bg-blue-50", ring: "border-blue-200" },
  volunteer: { label: "Volunteer", shortLabel: "Volunteer", icon: Users, color: "text-purple-600", bg: "bg-purple-50", ring: "border-purple-200" },
  admin: { label: "Admin", shortLabel: "Admin", icon: Settings, color: "text-orange-600", bg: "bg-orange-50", ring: "border-orange-200" },
};

const SIDEBAR_NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, roles: ["citizen", "authority", "volunteer", "admin"] },
  { id: "map", label: "Live Risk Map", icon: MapPin, roles: ["citizen", "authority", "admin"] },
  { id: "satellite", label: "Satellite Imagery", icon: Globe, roles: ["citizen", "authority", "volunteer", "admin"] },
  { id: "alerts", label: "Alerts & Warnings", icon: Bell, badgeKey: "alerts", roles: ["citizen", "authority", "admin"] },
  { id: "reports", label: "Incident Reports", icon: FileText, badgeKey: "reports", roles: ["citizen", "authority", "admin"] },
  { id: "chatbot", label: "AI Disaster Assistant", icon: Bot, roles: ["citizen", "authority", "volunteer", "admin"] },
  { id: "news", label: "Disaster News", icon: Newspaper, roles: ["citizen", "authority", "volunteer", "admin"] },
  { id: "donations", label: "Relief Fund", icon: Heart, roles: ["citizen", "authority", "admin", "volunteer"] },
  { id: "ngo", label: "NGO Registry", icon: Building2, roles: ["authority", "admin"] },
  { id: "ai", label: "AI Risk Engine", icon: Brain, roles: ["authority", "admin"] },
  // Everyone gets this nav entry - Authority/Admin get the full manage
  // console (SheltersView), Citizen/Volunteer get role-scoped self-service
  // views (see CitizenDashboard/VolunteerDashboard's tab === "shelters"
  // branches). Table: "View shelters" is FULL for every role.
  { id: "shelters", label: "Shelters", icon: Home, roles: ["citizen", "authority", "volunteer", "admin"] },
  { id: "resources", label: "Resource Management", icon: Package, roles: ["authority", "admin"] },
  { id: "analytics", label: "Analytics and Reports", icon: BarChart3, roles: ["authority", "admin"] },
  { id: "communication", label: "Communication", icon: MessageSquare, roles: ["authority", "admin"] },
  { id: "tasks", label: "My Tasks", icon: ClipboardList, roles: ["volunteer"] },
  { id: "history", label: "Task History", icon: Clock, roles: ["volunteer"] },
  { id: "users", label: "User Management", icon: Users, roles: ["admin"] },
  { id: "contacts", label: "Emergency Contacts", icon: Phone, roles: ["admin"] },
  // Backend permits both Authority and Admin to approve/reject/assign/inactivate
  // volunteers (PATCH /:id/status, /:id/assign) - only delete is Admin-only -
  // so this must be visible to Authority too, not just Admin.
  { id: "volunteers", label: "Volunteers", icon: UserCheck, roles: ["authority", "admin"] },
  // Backend gives Authority+Admin view access to every team (GET /teams),
  // but create/edit/delete/member-management/notify are Admin-only
  // (teamRoutes.js) - TeamsView gates those buttons by role itself.
  { id: "teams", label: "Volunteer Teams", icon: Users, roles: ["authority", "admin"] },
  { id: "myteam", label: "My Team", icon: Users, roles: ["volunteer"] },
  { id: "profile", label: "My Volunteer Profile", icon: UserCog, roles: ["volunteer"] },
  { id: "settings", label: "System Settings", icon: Settings, roles: ["admin"] },
];

export default function DisasterManagementSystem() {
  // Auth: JWT + logged-in user, persisted to localStorage so a refresh doesn't log you out.
  const [token, setToken] = useState(() => localStorage.getItem("suraksha_token") || null);
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("suraksha_user") || "null"); } catch { return null; }
  });

  // The dashboard is strictly role-specific: `role` is always derived from
  // the logged-in account's actual role (never user-switchable - there is no
  // "switch role" control anywhere in the UI anymore). If a session was
  // already persisted (token+user in localStorage from a previous visit),
  // land straight in that role's dashboard instead of the public landing page.
  const [page, setPage] = useState(() => (localStorage.getItem("suraksha_token") && localStorage.getItem("suraksha_user") ? "dashboard" : "landing"));
  const role = currentUser ? (ROLE_TO_KEY[currentUser.role] || "citizen") : null;
  const [authMode, setAuthMode] = useState("login");
  const [presetRole, setPresetRole] = useState("citizen");
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [disasters, setDisasters] = useState([]);
  const [resources, setResources] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [alerts, setAlerts] = useState([]);

  function showToast(msg, type) {
    setToast({ msg, type: type || "success" });
    setTimeout(() => setToast(null), 2800);
  }

  function persistAuth(u) {
    setToken(u.token);
    setCurrentUser(u);
    localStorage.setItem("suraksha_token", u.token);
    localStorage.setItem("suraksha_user", JSON.stringify(u));
  }

  function goDashboard() {
    setActiveTab("overview");
    setPage("dashboard");
  }

  // Sends a visitor to the auth screen, optionally pre-selecting a role tab
  // on the registration form. Admins can't self-register, so that role
  // always opens straight into the login form instead.
  function goToAuth(mode, role) {
    setAuthMode(role === "admin" ? "login" : mode);
    setPresetRole(role || "citizen");
    setAuthError("");
    setPage("auth");
  }

  function logout() {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem("suraksha_token");
    localStorage.removeItem("suraksha_user");
    setPage("landing");
  }

  async function handleLogin(email, password) {
    setAuthError("");
    setAuthBusy(true);
    try {
      const res = await api.auth.login({ email, password });
      persistAuth(res.data);
      goDashboard();
      showToast("Welcome back, " + res.data.name);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegister(payload) {
    setAuthError("");
    setAuthBusy(true);
    try {
      const res = await api.auth.register(payload);
      persistAuth(res.data);
      goDashboard();
      showToast("Account created - welcome, " + res.data.name);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  // Public data - fetch once, no login required.
  useEffect(() => {
    api.shelters.list().then((res) => setShelters(res.data.map(adapt.shelter))).catch(() => {});
    api.alerts.list().then((res) => setAlerts(res.data.map(adapt.alert))).catch(() => {});
    api.contacts.list().then((res) => setContacts(res.data.map(adapt.contact))).catch(() => {});
  }, []);

  // Protected data - fetch whenever we have a token, scoped to what the current role can see.
  useEffect(() => {
    if (!token) return;
    api.disasters
      .list(token)
      .then((res) => setDisasters(res.data.map(adapt.disaster)))
      .catch((err) => showToast(err.message, "error"));

    if (role === "authority" || role === "admin") {
      api.resources.list(token).then((res) => setResources(res.data.map(adapt.resource))).catch(() => {});
      api.volunteers.list(token).then((res) => setVolunteers(res.data.map(adapt.volunteer))).catch(() => {});
    }
    if (role === "admin") {
      api.users.list(token).then((res) => setUsers(res.data.map(adapt.user))).catch(() => {});
    }
    if (role === "volunteer") {
      api.tasks.mine(token).then((res) => setTasks(res.data.map(adapt.task))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role]);

  const data = {
    disasters, setDisasters, resources, setResources, shelters, setShelters,
    volunteers, setVolunteers, tasks, setTasks, users, setUsers, contacts, setContacts,
    alerts, setAlerts, token, currentUser,
  };

  return (
    <div className="min-h-screen w-full flex flex-col font-sans bg-slate-50 text-gray-900">
      {toast && (
        <div className={"fixed top-4 right-4 z-[200] px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2 border " + (toast.type === "error" ? "bg-red-50 border-red-200 text-red-800" : "bg-white border-gray-100 text-gray-800")}>
          <CheckCircle className={"h-4 w-4 shrink-0 " + (toast.type === "error" ? "text-red-500" : "text-green-500")} />
          {toast.msg}
        </div>
      )}
      {page === "landing" && (
        <Landing
          onLogin={() => goToAuth("login")}
          onGetStarted={(role) => goToAuth("register", role)}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />
      )}
      {page === "auth" && (
        <AuthPage
          authMode={authMode}
          setAuthMode={(m) => { setAuthMode(m); setAuthError(""); }}
          initialRole={presetRole}
          onBack={() => setPage("landing")}
          onLogin={handleLogin}
          onRegister={handleRegister}
          error={authError}
          busy={authBusy}
        />
      )}
      {page === "dashboard" && currentUser && (
        <DashboardShell role={role} activeTab={activeTab} setActiveTab={setActiveTab} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={logout} data={data} showToast={showToast} currentUser={currentUser} />
      )}
    </div>
  );
}

function Sidebar({ role, activeTab, setActiveTab, setSidebarOpen, badges }) {
  const navItems = SIDEBAR_NAV.filter(n => n.roles.includes(role));
  return (
    <div className="flex flex-col h-full" style={{ background: "linear-gradient(180deg, #0f1e3d 0%, #162040 60%, #1a2648 100%)" }}>
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="h-10 w-10 shrink-0 flex items-center justify-center">
          <img src="/logo-shield.png" alt="Suraksha" className="h-10 w-10 object-contain" />
        </div>
        <div>
          <div className="text-white font-bold text-base leading-tight">Suraksha</div>
          <div className="text-blue-300 text-[10px] leading-tight">AI-Powered Disaster Intelligence</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          const badgeValue = item.badgeKey ? badges?.[item.badgeKey] : undefined;
          return (
            <button key={item.id} onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }} className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group " + (active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white")}>
              <item.icon className={"h-4 w-4 shrink-0 " + (active ? "text-white" : "text-slate-400 group-hover:text-white")} />
              <span className="flex-1 text-left">{item.label}</span>
              {!!badgeValue && (
                <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded-full " + (active ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{badgeValue}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <button onClick={() => { setActiveTab("communication"); setSidebarOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm transition-colors">
          <AlertCircle className="h-4 w-4 animate-pulse" />
          <div className="text-left">
            <div className="text-xs font-bold">Emergency Broadcast</div>
            <div className="text-[10px] text-red-200">Send Alert to All Citizens</div>
          </div>
        </button>
      </div>

      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-300">System Status</span>
          <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-semibold">OPERATIONAL</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-[10px] text-slate-500">Updated 2 mins ago</span>
        </div>
      </div>
    </div>
  );
}

function DashboardShell({ role, activeTab, setActiveTab, sidebarOpen, setSidebarOpen, onLogout, data, showToast, currentUser }) {
  const meta = ROLE_META[role];
  const currentNav = SIDEBAR_NAV.find(n => n.id === activeTab);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const badges = {
    alerts: data.alerts?.length || 0,
    reports: data.disasters?.filter(d => d.status === "Pending").length || 0,
  };

  useEffect(() => {
    if (!data.token) return;
    api.notifications.unreadCount(data.token).then((res) => setUnreadCount(res.data.unread)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.token, activeTab]);

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex flex-col w-56 shrink-0 h-screen sticky top-0 overflow-hidden shadow-xl">
        <Sidebar role={role} activeTab={activeTab} setActiveTab={setActiveTab} setSidebarOpen={setSidebarOpen} badges={badges} />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-56 h-full shadow-2xl">
            <Sidebar role={role} activeTab={activeTab} setActiveTab={setActiveTab} setSidebarOpen={setSidebarOpen} badges={badges} />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-gray-100 shadow-sm flex items-center justify-between px-4 sm:px-6 gap-4">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-gray-600" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base font-bold text-gray-900 leading-tight">{currentNav ? currentNav.label : "Dashboard"}</h1>
            <span className={"hidden sm:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full " + meta.bg + " " + meta.color + " border " + meta.ring}>
              <meta.icon className="h-3 w-3" />{meta.shortLabel} Panel
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative">
              <button onClick={() => { setNotifOpen(!notifOpen); setAccountOpen(false); }} className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <Bell className="h-4 w-4 text-gray-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
              </button>
              <NotificationsPanel
                token={data.token}
                role={role}
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
                unreadCount={unreadCount}
                onUnreadChange={setUnreadCount}
              />
            </div>

            {/* Account menu - shows the logged-in account's own role (fixed,
                not switchable) and Log out. There is no way to change role
                here; role always comes from the account you logged in as. */}
            <div className="relative">
              <button onClick={() => { setAccountOpen(!accountOpen); setNotifOpen(false); }} className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <div className={"h-7 w-7 rounded-lg " + meta.bg + " " + meta.color + " flex items-center justify-center shrink-0"}>
                  <meta.icon className="h-3.5 w-3.5" />
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-gray-900 leading-tight">{currentUser?.name || meta.shortLabel}</div>
                  <div className="text-[10px] text-gray-400 leading-tight">{meta.label}</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
                  <div className="px-3 py-2 flex items-center gap-2.5">
                    <div className={"h-8 w-8 rounded-lg " + meta.bg + " " + meta.color + " flex items-center justify-center shrink-0"}><meta.icon className="h-4 w-4" /></div>
                    <div className="text-left overflow-hidden">
                      <div className="text-xs font-semibold text-gray-900 truncate">{currentUser?.name || "Account"}</div>
                      <div className="text-[10px] text-gray-400 truncate">{currentUser?.email || meta.label}</div>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button onClick={onLogout} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                      <LogOut className="h-4 w-4" />Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-5 overflow-auto">
          {role === "citizen" && <CitizenDashboard tab={activeTab} data={data} showToast={showToast} />}
          {role === "authority" && <AuthorityDashboard tab={activeTab} data={data} showToast={showToast} />}
          {role === "volunteer" && <VolunteerDashboard tab={activeTab} data={data} showToast={showToast} />}
          {role === "admin" && <AdminDashboard tab={activeTab} data={data} showToast={showToast} />}
        </main>
      </div>
      {activeTab !== "chatbot" && <DisasterChatbot />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, bg, trend }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={"p-2.5 rounded-xl " + bg + " " + color}><Icon className="h-4 w-4" /></div>
        {trend && (
          <svg viewBox="0 0 60 24" className={"w-14 h-6 opacity-60 " + color} style={{ overflow: "visible" }}>
            <polyline points={trend} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 leading-tight">{value}</div>
      <div className="text-xs font-semibold text-gray-700 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function OverviewDashboard({ data, showToast }) {
  const { alerts, disasters = [], shelters = [] } = data;

  const criticalAlerts = alerts.filter(a => a.priority === "Critical" || a.priority === "High").length;
  const riskZones = React.useMemo(() => buildRiskZones(disasters), [disasters]);
  const highRiskZones = riskZones.filter(z => z.risk === "High" || z.risk === "Critical");
  const districtCount = new Set(riskZones.map(z => z.name)).size;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const newToday = disasters.filter(d => d.createdAt && new Date(d.createdAt) >= today).length;
  const totalOccupancy = shelters.reduce((sum, s) => sum + (s.occupancy || 0), 0);
  const responseTeams = new Set(disasters.map(d => d.team).filter(t => t && t !== "Unassigned")).size;

  const disastersByTypeData = React.useMemo(() => {
    const counts = {};
    disasters.forEach(d => { counts[d.type] = (counts[d.type] || 0) + 1; });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [disasters]);

  const reportsTrendData = React.useMemo(() => {
    const days = 7;
    const buckets = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0);
      buckets.push({ date: d, label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), count: 0 });
    }
    disasters.forEach(item => {
      if (!item.createdAt) return;
      const t = new Date(item.createdAt); t.setHours(0, 0, 0, 0);
      const b = buckets.find(b => b.date.getTime() === t.getTime());
      if (b) b.count += 1;
    });
    return buckets.map(b => ({ month: b.label, count: b.count }));
  }, [disasters]);

  const recentIncidents = React.useMemo(() => (
    [...disasters].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 3)
  ), [disasters]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard icon={AlertTriangle} label="Active Alerts" value={alerts.length} sub={criticalAlerts + " High Priority"} color="text-red-500" bg="bg-red-50" />
        <StatCard icon={AlertCircle} label="High Risk Zones" value={highRiskZones.length} sub={"Across " + districtCount + " Locations"} color="text-orange-600" bg="bg-orange-50" />
        <StatCard icon={FileText} label="Incident Reports" value={disasters.length} sub={newToday + " New Today"} color="text-blue-600" bg="bg-blue-50" />
        <StatCard icon={Home} label="Active Shelters" value={shelters.length} sub={totalOccupancy.toLocaleString() + " Sheltered"} color="text-green-600" bg="bg-green-50" />
        <StatCard icon={Users} label="Response Teams" value={responseTeams} sub="Deployed" color="text-purple-600" bg="bg-purple-50" />
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <Card title="Live Risk Map - Assam" action={<span className="text-xs text-gray-400">Click markers for details</span>} className="h-full">
            <div style={{ height: 440 }}>
              <AssamMap disasters={disasters} shelters={shelters} showShelters={true} />
            </div>
          </Card>
        </div>

        <div>
          <Card title="Active Alerts" action={<button className="text-xs text-blue-500 hover:underline">View All</button>} className="h-full">
            <div className="space-y-3">
              {alerts.length === 0 && <p className="text-sm text-gray-400">No active alerts right now.</p>}
              {alerts.map((a) => (
                <div key={a.id} className="border border-gray-100 rounded-xl p-3 hover:border-blue-200 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={"h-2 w-2 rounded-full shrink-0 " + alertDotColor(a.priority)}></span>
                      <span className="text-sm font-semibold text-gray-900">{a.title}</span>
                    </div>
                    {a.priority === "Critical" && <span className="text-[9px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded shrink-0">NEW</span>}
                  </div>
                  <div className="text-[10px] text-gray-400 mb-1 ml-3.5">{a.location} · {a.time}</div>
                  <p className="text-xs text-gray-500 ml-3.5">{a.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        <Card title="Incident Reports Summary">
          {disastersByTypeData.length === 0 ? (
            <p className="text-sm text-gray-400">No incident reports yet.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div style={{ width: 110, height: 110 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={disastersByTypeData} dataKey="count" cx="50%" cy="50%" innerRadius={28} outerRadius={50}>
                      {disastersByTypeData.map((_, i) => <Cell key={i} fill={INCIDENT_COLORS[i % 5]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5 text-xs">
                {disastersByTypeData.map((d, i) => (
                  <div key={d.type} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ background: INCIDENT_COLORS[i % 5] }}></span>
                      <span className="text-gray-600">{d.type}</span>
                    </div>
                    <span className="font-semibold text-gray-700">{d.count}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-gray-100 font-bold text-gray-800">{disasters.length} Total</div>
              </div>
            </div>
          )}
        </Card>

        <Card title="Reports Trend">
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={reportsTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={9} />
                <YAxis stroke="#9ca3af" fontSize={9} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="count" name="Reports" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Recent Incidents" action={<button className="text-xs text-blue-500 hover:underline">View All</button>}>
          <div className="space-y-3">
            {recentIncidents.length === 0 && <p className="text-sm text-gray-400">No incidents reported yet.</p>}
            {recentIncidents.map((r) => (
              <div key={r._id || r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="h-9 w-9 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center"><MapPin className="h-4 w-4 text-gray-400" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-900 truncate">{r.type} reported</div>
                  <div className="text-[10px] text-gray-400">{r.location}</div>
                </div>
                <div className="text-right">
                  <Badge className={severityClasses(r.severity)}>{r.severity}</Badge>
                  <div className="text-[9px] text-gray-400 mt-0.5">{timeAgo(r.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CitizenDashboard({ tab, data, showToast }) {
  const { disasters, setDisasters, shelters, alerts, token, currentUser } = data;
  const [form, setForm] = useState({ type: "Flood", location: "", description: "", severity: "Medium", gps: false, coordinates: null });
  const [stagedEvidence, setStagedEvidence] = useState([]); // [{id, file, previewUrl}] - attached before submit, uploaded right after create
  const [justSubmitted, setJustSubmitted] = useState(null);
  const [historyEvidenceTarget, setHistoryEvidenceTarget] = useState(null);
  const [sosStep, setSosStep] = useState("idle");
  const [sosRequest, setSosRequest] = useState(null);
  const [vibCountdown, setVibCountdown] = useState(null);
  const shakeCount = useRef(0);
  const lastShake = useRef(0);

  useEffect(() => {
    function handleMotion(e) {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const total = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);
      const now = Date.now();
      if (total > 30 && now - lastShake.current > 300) {
        lastShake.current = now;
        shakeCount.current += 1;
        if (shakeCount.current >= 5 && sosStep === "idle") {
          shakeCount.current = 0;
          setSosStep("vibration_confirm");
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          let count = 5;
          setVibCountdown(count);
          const timer = setInterval(() => {
            count -= 1;
            setVibCountdown(count);
            if (count <= 0) {
              clearInterval(timer);
              setSosStep("idle");
              setVibCountdown(null);
            }
          }, 1000);
        }
      }
    }
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [sosStep]);

  async function submitReport() {
    if (!form.location.trim()) { showToast("Enter a location first", "error"); return; }
    if (!token) {
      showToast("Please log in to submit a report", "error");
      return;
    }
    try {
      const res = await api.disasters.create(token, {
        type: form.type,
        location: form.location,
        severity: form.severity,
        description: form.description,
        coordinates: form.coordinates || undefined,
      });
      let row = adapt.disaster(res.data);

      // Evidence attached before submitting is uploaded now, against the
      // freshly-created report, so it's saved together with the incident
      // report rather than left as a separate step.
      if (stagedEvidence.length > 0) {
        try {
          const uploadRes = await api.disasters.uploadImages(token, row._id, stagedEvidence.map((s) => s.file));
          row = { ...row, images: uploadRes.data.images || [] };
        } catch (err) {
          showToast("Report submitted, but evidence upload failed: " + err.message, "error");
        }
        stagedEvidence.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      }

      setDisasters([row, ...disasters]);
      setForm({ type: "Flood", location: "", description: "", severity: "Medium", gps: false, coordinates: null });
      setStagedEvidence([]);
      setJustSubmitted(row);
      showToast("Report " + row.id + " submitted successfully");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function captureGPS() {
    if (!navigator.geolocation) {
      showToast("GPS is not supported on this device", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, gps: true, coordinates: { lat: pos.coords.latitude, lng: pos.coords.longitude } }));
        showToast("GPS location captured");
      },
      () => showToast("Couldn't get your location - check location permissions", "error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function raiseSOS() {
    const id = "SOS-" + Math.floor(1000 + Math.random() * 9000);
    setSosRequest({ id, status: "Pending", team: "Locating...", eta: "-" });
    setSosStep("active");
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    setTimeout(() => setSosRequest(r => r && ({ ...r, status: "Assigned", team: "ASDMA Team Alpha", eta: "6 mins" })), 1500);
  }

  if (tab === "overview") return <OverviewDashboard data={data} showToast={showToast} />;
  if (tab === "satellite") return <SatelliteView disasters={disasters} shelters={shelters} token={token} role="Citizen" showToast={showToast} />;
  if (tab === "chatbot") return <Card title="AI Disaster Assistant"><DisasterChatbot embedded /></Card>;
  if (tab === "news") return <NewsView token={token} userRole="citizen" currentUserId={currentUser?._id} showToast={showToast} />;
  if (tab === "donations") return <DonationsView userRole="citizen" token={token} currentUserId={currentUser?._id} showToast={showToast} />;

  if (tab === "map") return (
    <Card title="Live Risk Map - Assam" className="h-[calc(100vh-120px)]">
      <div style={{ height: "calc(100% - 40px)", minHeight: 400 }}>
        <AssamMap disasters={disasters} shelters={shelters} showShelters={true} />
      </div>
    </Card>
  );

  if (tab === "reports") {
    return (
      <div className="space-y-5 max-w-2xl">
        <Card title="Report a Disaster">
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Disaster Type">
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {["Flood", "Earthquake", "Cyclone", "Landslide", "Fire", "Accident", "Other"].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Severity">
              <select className={inputCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {["Low", "Medium", "High", "Critical"].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Location"><input className={inputCls} placeholder="District, Block, Village - Assam" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Description"><textarea rows={3} className={inputCls} placeholder="Describe the situation..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <button onClick={captureGPS} className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 mb-2">
            <Locate className="h-4 w-4 text-green-600" />{form.gps ? "Location captured" : "Capture GPS Location"}
          </button>
          <Field label="Evidence (optional)">
            <p className="text-xs text-gray-400 mb-2 -mt-1">Attach photos to support your report. They'll be saved together with it when you submit.</p>
            <EvidencePicker staged={stagedEvidence} onChange={setStagedEvidence} showToast={showToast} />
          </Field>
          <PrimaryBtn onClick={submitReport} className="w-full mt-2" icon={Send}>Submit Disaster Report</PrimaryBtn>
        </Card>

        {justSubmitted && (
          <Card title={"Evidence for " + justSubmitted.id}>
            <p className="text-xs text-gray-400 mb-3">You can keep adding more evidence any time before it's reviewed.</p>
            <EvidenceManager
              token={token}
              disasterId={justSubmitted._id}
              images={justSubmitted.images || []}
              canUpload
              canDelete
              onChange={(images) => {
                setJustSubmitted((r) => ({ ...r, images }));
                setDisasters((ds) => ds.map((d) => (d._id === justSubmitted._id ? { ...d, images } : d)));
              }}
              showToast={showToast}
            />
          </Card>
        )}

        <Card title="Incident History">
          {disasters.length === 0 ? (
            <p className="text-sm text-gray-400">You haven't submitted any incident reports yet.</p>
          ) : (
            <Table
              columns={[
                { key: "id", label: "Report ID" },
                { key: "type", label: "Type" },
                { key: "location", label: "Location" },
                { key: "severity", label: "Severity", render: r => <Badge className={severityClasses(r.severity)}>{r.severity}</Badge> },
                { key: "status", label: "Status", render: r => <Badge className={statusClasses(r.status)}>{r.status}</Badge> },
                { key: "date", label: "Date" },
                { key: "evidence", label: "", render: r => <GhostBtn onClick={() => setHistoryEvidenceTarget(r)}>View Evidence</GhostBtn> },
              ]}
              rows={disasters}
            />
          )}
        </Card>

        <EvidenceModal
          disaster={historyEvidenceTarget}
          token={token}
          onClose={() => setHistoryEvidenceTarget(null)}
          onChange={(images) => {
            setDisasters(disasters.map((d) => (d._id === historyEvidenceTarget._id ? { ...d, images } : d)));
            setHistoryEvidenceTarget((t) => t && { ...t, images });
          }}
          showToast={showToast}
        />
      </div>
    );
  }

  if (tab === "alerts") {
    return (
      <Card title="Alerts and Warnings">
        <div className="space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-500">
                  {React.createElement(DISASTER_ICONS_MAP[a.type] || Bell, { className: "h-4 w-4" })}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                  <p className="text-xs text-gray-400">{a.location} · {a.time}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
                </div>
              </div>
              <Badge className={severityClasses(a.priority)}>{a.priority}</Badge>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (tab === "shelters") {
    return (
      <CitizenSheltersTab shelters={shelters} token={token} currentUser={currentUser} showToast={showToast} />
    );
  }

  const content = <OverviewDashboard data={data} showToast={showToast} />;

  return (
    <>
      {sosStep === "vibration_confirm" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Smartphone className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Shake SOS Detected!</h2>
            <p className="text-sm text-gray-500 mb-6">We detected an emergency shake pattern. Sending SOS in {vibCountdown}s with your GPS location.</p>
            <div className="flex gap-3">
              <button onClick={() => { setSosStep("idle"); setVibCountdown(null); }} className="flex-1 h-10 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => { raiseSOS(); setSosStep("active"); setVibCountdown(null); }} className="flex-1 h-10 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700">Send Now</button>
            </div>
          </div>
        </div>
      )}
      {content}
    </>
  );
}

// Citizen's own "Shelters" tab - view/find shelters (map + table, same as
// before) plus real self-service actions the product table gives Citizen:
// check-in/out (Self), report a shelter problem (Full). Uses
// GET /api/shelters/me/status so the citizen doesn't have to already know
// which shelter they're assigned to.
function CitizenSheltersTab({ shelters, token, currentUser, showToast }) {
  const [myStatus, setMyStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problemTarget, setProblemTarget] = useState(null);
  const [problemForm, setProblemForm] = useState({ category: "Other", description: "", severity: "Medium" });

  async function loadStatus() {
    try {
      const res = await api.shelters.myStatus(token);
      setMyStatus(res.data && res.data.length ? res.data[0] : null);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  useEffect(() => { loadStatus(); }, []);

  async function checkIn(shelterId) {
    setBusy(true);
    try {
      await api.shelters.checkIn(token, shelterId, { citizenId: currentUser._id });
      showToast("Checked in");
      await loadStatus();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    if (!myStatus) return;
    setBusy(true);
    try {
      await api.shelters.checkOut(token, myStatus.shelter._id, { citizenId: currentUser._id });
      showToast("Checked out");
      await loadStatus();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitProblem() {
    if (!problemTarget || !problemForm.description.trim()) return showToast("Describe the problem first", "error");
    try {
      await api.shelters.reportProblem(token, problemTarget._id, problemForm);
      showToast("Problem reported to shelter staff");
      setProblemTarget(null);
      setProblemForm({ category: "Other", description: "", severity: "Medium" });
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  return (
    <div className="space-y-5">
      <div style={{ height: 360 }}><AssamMap disasters={[]} shelters={shelters} showShelters={true} /></div>

      <Card title="My Shelter Status">
        {myStatus ? (
          <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">{myStatus.shelter?.name}</p>
              <p className="text-xs text-gray-400">{myStatus.shelter?.location}</p>
              <Badge className={statusClasses(myStatus.status === "CheckedIn" ? "Available" : "Full")}>
                {myStatus.status === "CheckedIn" ? "Checked in" : "Assigned - not checked in"}
              </Badge>
            </div>
            <div className="flex gap-2">
              {myStatus.status === "Assigned" && (
                <PrimaryBtn onClick={() => checkIn(myStatus.shelter._id)} disabled={busy}>Check In</PrimaryBtn>
              )}
              {myStatus.status === "CheckedIn" && (
                <GhostBtn onClick={checkOut}>Check Out</GhostBtn>
              )}
              <GhostBtn onClick={() => setProblemTarget(myStatus.shelter)}>Report Problem</GhostBtn>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            You're not currently assigned to a shelter. If Authority/Volunteer staff assign you to one, it'll show up here for check-in.
          </p>
        )}
      </Card>

      <Card title="Nearby Shelters - Assam">
        <Table columns={[
          { key: "name", label: "Shelter" }, { key: "location", label: "Location" },
          { key: "capacity", label: "Occupancy", render: r => r.occupancy + "/" + r.capacity },
          { key: "status", label: "Status", render: r => <Badge className={statusClasses(r.status)}>{r.status}</Badge> },
          { key: "contact", label: "Contact" },
          { key: "action", label: "", render: r => <GhostBtn onClick={() => setProblemTarget(r)}>Report Problem</GhostBtn> },
        ]} rows={shelters} />
      </Card>

      {problemTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Report a Problem</h3>
            <p className="text-xs text-gray-400 mb-4">{problemTarget.name}</p>
            <Field label="Category">
              <select className={inputCls} value={problemForm.category} onChange={(e) => setProblemForm({ ...problemForm, category: e.target.value })}>
                {["Facility", "Food", "Water", "Medical", "Safety", "Overcrowding", "Other"].map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Severity">
              <select className={inputCls} value={problemForm.severity} onChange={(e) => setProblemForm({ ...problemForm, severity: e.target.value })}>
                {["Low", "Medium", "High", "Critical"].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Description"><textarea rows={3} className={inputCls} value={problemForm.description} onChange={(e) => setProblemForm({ ...problemForm, description: e.target.value })} /></Field>
            <div className="flex gap-3 mt-2">
              <GhostBtn onClick={() => setProblemTarget(null)} className="flex-1">Cancel</GhostBtn>
              <PrimaryBtn onClick={submitProblem} className="flex-1">Submit</PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthorityDashboard({ tab, data, showToast }) {
  const { disasters, setDisasters, resources, shelters, setShelters, volunteers, setVolunteers, alerts, setAlerts, token, currentUser } = data;
  const [alertForm, setAlertForm] = useState({ title: "", type: "Flood", location: "", radius: "5", priority: "Medium" });
  const [evidenceTarget, setEvidenceTarget] = useState(null);
  const [assignTeamTarget, setAssignTeamTarget] = useState(null);
  const [addShelterTarget, setAddShelterTarget] = useState(null);

  function handleEvidenceChange(images) {
    setDisasters(disasters.map(d => d._id === evidenceTarget._id ? { ...d, images } : d));
    setEvidenceTarget((t) => t && { ...t, images });
  }

  async function updateStatus(id, status) {
    const row = disasters.find(d => d.id === id);
    if (!row) return;
    try {
      const res = await api.disasters.updateStatus(token, row._id || row.id, { status });
      setDisasters(disasters.map(d => d.id === id ? adapt.disaster(res.data) : d));
      showToast(id + " marked " + status);
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  function handleTeamAssigned(updated) {
    setDisasters(disasters.map(d => d._id === updated._id ? updated : d));
  }
  async function sendAlert() {
    if (!alertForm.title.trim() || !alertForm.location.trim()) { showToast("Fill in title and location first", "error"); return; }
    try {
      const res = await api.alerts.create(token, {
        title: alertForm.title,
        type: alertForm.type,
        location: alertForm.location,
        priority: alertForm.priority,
        description: "Alert broadcast to affected areas.",
      });
      setAlerts([adapt.alert(res.data), ...alerts]);
      setAlertForm({ title: "", type: "Flood", location: "", radius: "5", priority: "Medium" });
      showToast("Emergency alert broadcast to all citizens");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  if (tab === "overview") return <OverviewDashboard data={data} showToast={showToast} />;
  if (tab === "map") return <Card title="Live Risk Map - Assam" className="h-[calc(100vh-130px)]"><div style={{ height: "calc(100% - 40px)", minHeight: 400 }}><AssamMap disasters={disasters} shelters={shelters} showShelters={true} /></div></Card>;

  if (tab === "reports") return (
    <>
      <Card title="All Disaster Reports" action={<GhostBtn icon={FileText}>Export</GhostBtn>}>
        <DisasterTable disasters={disasters} updateStatus={updateStatus} onViewEvidence={setEvidenceTarget} onAssignTeam={setAssignTeamTarget} onAddShelter={setAddShelterTarget} />
      </Card>
      <EvidenceModal disaster={evidenceTarget} token={token} onClose={() => setEvidenceTarget(null)} onChange={handleEvidenceChange} showToast={showToast} />
      <AssignTeamModal disaster={assignTeamTarget} token={token} onClose={() => setAssignTeamTarget(null)} onAssigned={handleTeamAssigned} showToast={showToast} />
      <AddShelterModal
        open={!!addShelterTarget}
        token={token}
        title={addShelterTarget ? `Add Shelter Record - ${addShelterTarget.id}` : "Add Shelter"}
        initial={addShelterTarget ? { location: addShelterTarget.location, lat: addShelterTarget.lat, lng: addShelterTarget.lng, disasterId: addShelterTarget._id, disasterLabel: addShelterTarget.id } : null}
        onClose={() => setAddShelterTarget(null)}
        onCreated={(s) => { setShelters([s, ...shelters]); showToast("Shelter record added for " + addShelterTarget.id); }}
        showToast={showToast}
      />
    </>
  );

  if (tab === "alerts") {
    return (
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Broadcast Emergency Alert">
          <Field label="Alert Title"><input className={inputCls} value={alertForm.title} onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })} placeholder="e.g. Flood Warning - Guwahati" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type"><select className={inputCls} value={alertForm.type} onChange={(e) => setAlertForm({ ...alertForm, type: e.target.value })}>{["Flood", "Cyclone", "Earthquake", "Fire", "Landslide", "General"].map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Priority"><select className={inputCls} value={alertForm.priority} onChange={(e) => setAlertForm({ ...alertForm, priority: e.target.value })}>{["Low", "Medium", "High", "Critical"].map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="Location"><input className={inputCls} value={alertForm.location} onChange={(e) => setAlertForm({ ...alertForm, location: e.target.value })} placeholder="District or block name" /></Field>
          <PrimaryBtn onClick={sendAlert} icon={Radio} className="w-full">Broadcast to All Citizens</PrimaryBtn>
        </Card>
        <Card title="Recent Alerts">
          <div className="space-y-2">{alerts.map(a => (<div key={a.id} className="flex items-start justify-between p-3 rounded-xl bg-gray-50 border border-gray-100"><div><p className="text-sm font-semibold text-gray-900">{a.title}</p><p className="text-xs text-gray-400">{a.location} · {a.time}</p></div><Badge className={severityClasses(a.priority)}>{a.priority}</Badge></div>))}</div>
        </Card>
      </div>
    );
  }

  if (tab === "ai") return <AIPanel disasters={disasters} token={token} role="authority" showToast={showToast} />;
  if (tab === "satellite") return <SatelliteView disasters={disasters} shelters={shelters} token={token} role="Authority" showToast={showToast} onShelterAdded={(s) => setShelters([s, ...shelters])} />;
  if (tab === "chatbot") return <Card title="AI Disaster Assistant"><DisasterChatbot embedded /></Card>;
  if (tab === "news") return <NewsView token={token} userRole="authority" currentUserId={currentUser?._id} showToast={showToast} />;
  if (tab === "donations") return <DonationsView userRole="authority" token={token} currentUserId={currentUser?._id} showToast={showToast} />;
  if (tab === "ngo") return <NGOView userRole="authority" token={token} currentUserId={currentUser?._id} disasters={disasters} shelters={shelters} showToast={showToast} />;
  if (tab === "resources") return <ResourcesView resources={resources} setResources={setResources} token={token} role="Authority" showToast={showToast} />;
  if (tab === "shelters") return <SheltersView disasters={disasters} shelters={shelters} setShelters={setShelters} token={token} role="Authority" volunteers={volunteers} showToast={showToast} />;
  if (tab === "volunteers") return <VolunteersView volunteers={volunteers} setVolunteers={setVolunteers} disasters={disasters} shelters={shelters} token={token} role="Authority" showToast={showToast} />;
  if (tab === "teams") return <TeamsView volunteers={volunteers} token={token} role="Authority" showToast={showToast} />;
  if (tab === "analytics") return <AnalyticsView resources={resources} disasters={disasters} shelters={shelters} token={token} />;
  if (tab === "communication") return <CommunicationPanel token={token} alerts={alerts} setAlerts={setAlerts} showToast={showToast} />;
  return <OverviewDashboard data={data} showToast={showToast} />;
}

// Wraps the real volunteer dashboard with a profile gate: a User account
// with role "Volunteer" has no Volunteer profile (and so is invisible to
// the admin/authority approval queue) until they submit skills/district/
// availability via POST /api/volunteers. Every volunteer tab is blocked
// behind that registration step, matching STATUS-REPORT Phase 13 item #1.
function VolunteerDashboard({ tab, data, showToast }) {
  const { token } = data;
  // undefined = still checking, null = confirmed not registered, object = registered profile
  const [profile, setProfile] = useState(undefined);

  async function loadProfile() {
    try {
      const res = await api.volunteers.me(token);
      setProfile(adapt.volunteer(res.data));
    } catch (err) {
      setProfile(null);
    }
  }
  useEffect(() => { loadProfile(); }, [token]);

  if (profile === undefined) {
    return <Card title="Volunteer Dashboard"><p className="text-sm text-gray-400">Loading your volunteer profile...</p></Card>;
  }
  if (profile === null) {
    return <VolunteerRegistrationForm token={token} showToast={showToast} onRegistered={loadProfile} />;
  }
  if (tab === "profile") {
    return <VolunteerProfileTab profile={profile} token={token} showToast={showToast} onUpdated={setProfile} />;
  }
  if (tab === "myteam") {
    return <MyTeamView token={token} showToast={showToast} />;
  }
  return <VolunteerDashboardBody tab={tab} data={data} showToast={showToast} />;
}

// The registration form itself, and every existing volunteer tab (tasks,
// history, satellite, etc.) - unchanged behavior, just renamed so
// VolunteerDashboard above can gate it behind a completed profile.
function VolunteerDashboardBody({ tab, data, showToast }) {
  const { tasks, setTasks, disasters, shelters, token, currentUser } = data;
  const active = tasks.filter(t => t.status !== "Completed" && t.status !== "Cancelled");
  const done = tasks.filter(t => t.status === "Completed");

  async function updateTaskStatus(id, status) {
    const row = tasks.find(t => t.id === id);
    if (!row) return;
    try {
      const res = await api.tasks.updateStatus(token, row._id || row.id, { status });
      setTasks(tasks.map(t => t.id === id ? adapt.task(res.data) : t));
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function accept(id) { await updateTaskStatus(id, "In Progress"); showToast("Task accepted"); }
  async function reject(id) { await updateTaskStatus(id, "Cancelled"); showToast("Task declined"); }
  // No backend field for "field report uploaded" - tracked client-side only, so this stays local.
  function upload(id) { setTasks(tasks.map(t => t.id === id ? { ...t, uploaded: true } : t)); showToast("Field report uploaded"); }
  async function complete(id) { await updateTaskStatus(id, "Completed"); showToast("Task marked complete"); }

  if (tab === "overview") return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon={ClipboardList} label="Pending Tasks" value={tasks.filter(t => t.status === "Pending").length} sub="Awaiting action" color="text-blue-600" bg="bg-blue-50" />
        <StatCard icon={Activity} label="In Progress" value={tasks.filter(t => t.status === "In Progress").length} sub="Currently active" color="text-amber-600" bg="bg-amber-50" />
        <StatCard icon={CheckCircle} label="Completed" value={done.length} sub="Total completed" color="text-green-600" bg="bg-green-50" />
      </div>
      <Card title="Active Tasks"><TaskList tasks={active} accept={accept} reject={reject} upload={upload} complete={complete} /></Card>
    </div>
  );
  if (tab === "tasks") return <Card title="Assigned and In-Progress Tasks"><TaskList tasks={active} accept={accept} reject={reject} upload={upload} complete={complete} /></Card>;
  if (tab === "history") return <Card title="Completed Tasks"><Table columns={[{ key: "id", label: "Task ID" }, { key: "disaster", label: "Disaster" }, { key: "task", label: "Task" }, { key: "status", label: "Status", render: r => <Badge className={statusClasses(r.status)}>{r.status}</Badge> }]} rows={done} /></Card>;
  if (tab === "satellite") return <SatelliteView disasters={disasters} shelters={shelters} token={token} role="Volunteer" showToast={showToast} />;
  if (tab === "chatbot") return <Card title="AI Disaster Assistant"><DisasterChatbot embedded /></Card>;
  if (tab === "news") return <NewsView token={token} userRole="volunteer" currentUserId={currentUser?._id} showToast={showToast} />;
  if (tab === "donations") return <DonationsView userRole="volunteer" token={token} currentUserId={currentUser?._id} showToast={showToast} />;
  if (tab === "shelters") return <VolunteerShelterTab token={token} shelters={shelters} showToast={showToast} />;
  return <OverviewDashboard data={data} showToast={showToast} />;
}

const SKILL_OPTIONS = ["First Aid", "Medical", "Search and Rescue", "Cooking", "Logistics", "Driving", "Communication", "Construction", "Counseling", "IT Support", "Translation", "General Labor"];

// Shown the first time a "Volunteer" account logs in, before any Volunteer
// profile exists. Fixes STATUS-REPORT Phase 13 item #1: without this the
// account never reaches the admin/authority approval queue.
function VolunteerRegistrationForm({ token, showToast, onRegistered }) {
  const [form, setForm] = useState({ skills: [], district: "", availability: "Available" });
  const [saving, setSaving] = useState(false);

  function toggleSkill(s) {
    setForm((f) => ({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] }));
  }

  async function submit() {
    if (!form.district.trim()) { showToast("Enter your district first", "error"); return; }
    if (form.skills.length === 0) { showToast("Pick at least one skill", "error"); return; }
    setSaving(true);
    try {
      await api.volunteers.register(token, form);
      showToast("Volunteer profile submitted - an admin or authority will review it");
      onRegistered();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Complete Your Volunteer Profile">
      <p className="text-sm text-gray-500 mb-4">
        Your account is registered as a Volunteer, but you still need to submit a profile before you
        can be approved and assigned to a disaster response, shelter, or team.
      </p>
      <Field label="District">
        <input className={inputCls} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="e.g. Kamrup Metropolitan" />
      </Field>
      <Field label="Availability">
        <select className={inputCls} value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })}>
          {["Available", "Busy", "Unavailable"].map((a) => <option key={a}>{a}</option>)}
        </select>
      </Field>
      <Field label="Skills (select all that apply)">
        <div className="flex flex-wrap gap-2">
          {SKILL_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => toggleSkill(s)}
              className={"px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " + (form.skills.includes(s) ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-blue-300")}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <PrimaryBtn onClick={submit} disabled={saving} className="w-full mt-2">{saving ? "Submitting..." : "Submit Volunteer Profile"}</PrimaryBtn>
    </Card>
  );
}

// "My Volunteer Profile" tab - edit skills/district/availability via
// PUT /api/volunteers/me. Existed as an unused client method
// (api.volunteers.updateMe) before this - fixes STATUS-REPORT Phase 13 item #5.
function VolunteerProfileTab({ profile, token, showToast, onUpdated }) {
  const [form, setForm] = useState({ skills: profile.skillsArray || [], district: profile.district || "", availability: profile.availability || "Available" });
  const [saving, setSaving] = useState(false);

  function toggleSkill(s) {
    setForm((f) => ({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api.volunteers.updateMe(token, form);
      onUpdated(adapt.volunteer(res.data));
      showToast("Profile updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon={UserCheck} label="Status" value={profile.status} sub={profile.status === "Approved" ? "Cleared for assignment" : "Under review"} color="text-blue-600" bg="bg-blue-50" />
        <StatCard icon={Activity} label="Availability" value={profile.availability} sub="Current status" color="text-amber-600" bg="bg-amber-50" />
        <StatCard icon={MapPin} label="District" value={profile.district || "-"} sub="Registered district" color="text-green-600" bg="bg-green-50" />
      </div>
      <Card title="Edit Profile">
        <Field label="District">
          <input className={inputCls} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
        </Field>
        <Field label="Availability">
          <select className={inputCls} value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })}>
            {["Available", "Busy", "Unavailable"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Skills">
          <div className="flex flex-wrap gap-2">
            {SKILL_OPTIONS.map((s) => (
              <button key={s} type="button" onClick={() => toggleSkill(s)}
                className={"px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " + (form.skills.includes(s) ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-blue-300")}>
                {s}
              </button>
            ))}
          </div>
        </Field>
        <PrimaryBtn onClick={save} disabled={saving} className="w-full mt-2">{saving ? "Saving..." : "Save Changes"}</PrimaryBtn>
      </Card>
      {(profile.assignedDisaster || profile.assignedShelter) && (
        <Card title="Current Assignment">
          <div className="text-sm text-gray-600 space-y-1">
            {profile.assignedDisaster && <p>Disaster response: <span className="font-medium text-gray-900">{profile.assignedDisaster.label}</span></p>}
            {profile.assignedShelter && <p>Shelter: <span className="font-medium text-gray-900">{profile.assignedShelter.label}</span></p>}
          </div>
        </Card>
      )}
    </div>
  );
}

// "My Team" tab for a Volunteer - fetches GET /teams/me. Fixes
// STATUS-REPORT Phase 13 item #3.
function MyTeamView({ token, showToast }) {
  const [teams, setTeams] = useState(null);

  async function load() {
    try {
      const res = await api.teams.mine(token);
      setTeams((res.data || []).map(adapt.team));
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  useEffect(() => { load(); }, []);

  if (teams === null) return <Card title="My Team"><p className="text-sm text-gray-400">Loading...</p></Card>;
  if (teams.length === 0) return <Card title="My Team"><p className="text-sm text-gray-400">You're not currently on a team. An admin can add you to one once your profile is approved.</p></Card>;

  return (
    <div className="space-y-5">
      {teams.map((t) => (
        <Card key={t._id} title={t.name}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">{t.description || "No description"}</p>
            <Badge className={statusClasses(t.status)}>{t.status}</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-3">
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">Leader: </span>
              {t.leader ? t.leader.name : "Not set"}
            </div>
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">District: </span>
              {t.district || "-"}
            </div>
          </div>
          {(t.assignedDisaster || t.assignedShelter) && (
            <div className="text-xs text-gray-500 mb-3">
              {t.assignedDisaster && <div><span className="font-semibold text-gray-700">Disaster: </span>{t.assignedDisaster.label}</div>}
              {t.assignedShelter && <div><span className="font-semibold text-gray-700">Shelter: </span>{t.assignedShelter.label}</div>}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">Members ({t.members.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {t.members.map((m) => (
                <span key={m._id} className="text-xs px-2 py-1 rounded-full bg-gray-50 border border-gray-100 text-gray-600">{m.name}</span>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Admin/Authority "Volunteer Teams" screen - fixes STATUS-REPORT Phase 13
// item #2. Authority gets view-only (matches teamRoutes.js: GET is open to
// Authority+Admin, every mutation is Admin-only); Admin gets full management.
function TeamsView({ volunteers = [], token, role, showToast }) {
  const isAdmin = role === "Admin";
  const [teams, setTeams] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState(null);

  async function load() {
    try {
      const res = await api.teams.list(token);
      setTeams((res.data || []).map(adapt.team));
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  useEffect(() => { load(); }, []);

  function handleCreated(team) {
    setTeams((t) => [team, ...(t || [])]);
    setCreateOpen(false);
  }
  function handleChanged(team) {
    setTeams((t) => (t || []).map((x) => (x._id === team._id ? team : x)));
    setManageTarget(team);
  }
  async function deleteTeam(team) {
    if (!window.confirm(`Delete team "${team.name}"? This can't be undone.`)) return;
    try {
      await api.teams.remove(token, team._id);
      setTeams((t) => (t || []).filter((x) => x._id !== team._id));
      showToast("Team deleted");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  const approvedVolunteers = volunteers.filter((v) => v.status === "Approved");

  return (
    <>
      <Card title="Volunteer Teams" action={isAdmin ? <PrimaryBtn icon={PlusCircle} onClick={() => setCreateOpen(true)}>Create Team</PrimaryBtn> : undefined}>
        <Table
          columns={[
            { key: "name", label: "Team" },
            { key: "leader", label: "Leader", render: (r) => r.leader ? r.leader.name : "-" },
            { key: "members", label: "Members", render: (r) => r.members.length },
            { key: "district", label: "District", render: (r) => r.district || "-" },
            { key: "status", label: "Status", render: (r) => <Badge className={statusClasses(r.status)}>{r.status}</Badge> },
            {
              key: "assignment", label: "Assigned To", render: (r) =>
                r.assignedDisaster || r.assignedShelter
                  ? <span className="text-xs text-gray-600">{[r.assignedDisaster?.label, r.assignedShelter?.label].filter(Boolean).join(" / ")}</span>
                  : <span className="text-xs text-gray-300">-</span>,
            },
          ]}
          rows={teams || []}
          renderActions={(r) => (
            <div className="flex gap-1">
              <IconBtn icon={Eye} tone="primary" title={isAdmin ? "Manage" : "View"} onClick={() => setManageTarget(r)} />
              {isAdmin && <IconBtn icon={Trash2} tone="danger" title="Delete team" onClick={() => deleteTeam(r)} />}
            </div>
          )}
        />
        {teams === null && <p className="text-sm text-gray-400 py-3">Loading...</p>}
        {teams && teams.length === 0 && <p className="text-sm text-gray-400 py-3">No teams yet.</p>}
      </Card>
      <CreateTeamModal open={createOpen} volunteers={approvedVolunteers} token={token} onClose={() => setCreateOpen(false)} onCreated={handleCreated} showToast={showToast} />
      <TeamManageModal team={manageTarget} volunteers={approvedVolunteers} token={token} isAdmin={isAdmin} onClose={() => setManageTarget(null)} onChange={handleChanged} showToast={showToast} />
    </>
  );
}

function CreateTeamModal({ open, volunteers = [], token, onClose, onCreated, showToast }) {
  const [form, setForm] = useState({ name: "", description: "", district: "", leader: "", members: [] });
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  function toggleMember(id) {
    setForm((f) => ({ ...f, members: f.members.includes(id) ? f.members.filter((x) => x !== id) : [...f.members, id] }));
  }

  async function submit() {
    if (!form.name.trim()) { showToast("Team name is required", "error"); return; }
    setSaving(true);
    try {
      const res = await api.teams.create(token, {
        name: form.name.trim(), description: form.description, district: form.district,
        leader: form.leader || undefined, members: form.members,
      });
      onCreated(adapt.team(res.data));
      showToast("Team created");
      setForm({ name: "", description: "", district: "", leader: "", members: [] });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">Create Team</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>
          <Field label="Team Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Guwahati Rapid Response" /></Field>
          <Field label="Description"><textarea rows={2} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="District"><input className={inputCls} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></Field>
          <Field label="Leader (optional)">
            <select className={inputCls} value={form.leader} onChange={(e) => setForm({ ...form, leader: e.target.value })}>
              <option value="">No leader yet</option>
              {volunteers.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Members">
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-1">
              {volunteers.length === 0 && <p className="text-xs text-gray-400 px-1 py-1">No approved volunteers available yet.</p>}
              {volunteers.map((v) => (
                <label key={v._id} className="flex items-center gap-2 px-1 py-1 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.members.includes(v._id)} onChange={() => toggleMember(v._id)} />
                  {v.name} <span className="text-xs text-gray-400">{v.district}</span>
                </label>
              ))}
            </div>
          </Field>
          <PrimaryBtn onClick={submit} icon={PlusCircle} className="w-full" disabled={saving}>{saving ? "Creating..." : "Create Team"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// Manage an existing team: edit details, add/remove members, change leader,
// link a disaster/shelter, disband (status), delete, and message every
// member. Authority gets a read-only version (no action buttons/inputs).
function TeamManageModal({ team, volunteers = [], token, isAdmin, onClose, onChange, showToast }) {
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addMemberId, setAddMemberId] = useState("");
  const [notifyForm, setNotifyForm] = useState({ title: "", message: "" });
  const [sendingNotify, setSendingNotify] = useState(false);

  useEffect(() => {
    if (!team) return;
    setEdit({ name: team.name, description: team.description, district: team.district, status: team.status, leader: team.leader?._id || "" });
    setAddMemberId("");
    setNotifyForm({ title: "", message: "" });
  }, [team && team._id]);

  if (!team || !edit) return null;

  const memberIds = new Set(team.members.map((m) => m._id));
  const availableToAdd = volunteers.filter((v) => !memberIds.has(v._id));

  async function saveDetails() {
    setSaving(true);
    try {
      const res = await api.teams.update(token, team._id, {
        name: edit.name, description: edit.description, district: edit.district, status: edit.status,
        leader: edit.leader || null,
      });
      onChange(adapt.team(res.data));
      showToast("Team updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    if (!addMemberId) return;
    try {
      const res = await api.teams.addMembers(token, team._id, [addMemberId]);
      onChange(adapt.team(res.data));
      setAddMemberId("");
      showToast("Member added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function removeMember(volunteerId) {
    try {
      const res = await api.teams.removeMember(token, team._id, volunteerId);
      onChange(adapt.team(res.data));
      showToast("Member removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function sendNotify() {
    if (!notifyForm.title.trim()) { showToast("Enter a message title", "error"); return; }
    setSendingNotify(true);
    try {
      await api.teams.notify(token, team._id, notifyForm);
      showToast("Message sent to every team member");
      setNotifyForm({ title: "", message: "" });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSendingNotify(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">{isAdmin ? "Manage Team" : "Team"}: {team.name}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>

          {isAdmin ? (
            <>
              <Field label="Team Name"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Description"><textarea rows={2} className={inputCls} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="District"><input className={inputCls} value={edit.district} onChange={(e) => setEdit({ ...edit, district: e.target.value })} /></Field>
                <Field label="Status">
                  <select className={inputCls} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                    {["Active", "Disbanded"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Leader">
                <select className={inputCls} value={edit.leader} onChange={(e) => setEdit({ ...edit, leader: e.target.value })}>
                  <option value="">No leader</option>
                  {team.members.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                </select>
              </Field>
              <PrimaryBtn onClick={saveDetails} disabled={saving} className="w-full mb-4">{saving ? "Saving..." : "Save Details"}</PrimaryBtn>
            </>
          ) : (
            <div className="text-sm text-gray-600 space-y-1 mb-4">
              <p>{team.description || "No description"}</p>
              <p><span className="font-semibold text-gray-700">District: </span>{team.district || "-"}</p>
              <p><span className="font-semibold text-gray-700">Status: </span>{team.status}</p>
              <p><span className="font-semibold text-gray-700">Leader: </span>{team.leader ? team.leader.name : "Not set"}</p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4 mb-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">Members ({team.members.length})</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {team.members.map((m) => (
                <div key={m._id} className="flex items-center justify-between text-sm text-gray-700 px-2 py-1.5 rounded-lg bg-gray-50">
                  <span>{m.name} {m.email && <span className="text-xs text-gray-400">({m.email})</span>}</span>
                  {isAdmin && <IconBtn icon={Trash2} tone="danger" title="Remove from team" onClick={() => removeMember(m._id)} />}
                </div>
              ))}
              {team.members.length === 0 && <p className="text-xs text-gray-400">No members yet.</p>}
            </div>
            {isAdmin && (
              <div className="flex gap-2 mt-2">
                <select className={inputCls} value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)}>
                  <option value="">Add a volunteer...</option>
                  {availableToAdd.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
                </select>
                <GhostBtn onClick={addMember}>Add</GhostBtn>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">Message the team</p>
              <Field label="Title"><input className={inputCls} value={notifyForm.title} onChange={(e) => setNotifyForm({ ...notifyForm, title: e.target.value })} /></Field>
              <Field label="Message (optional)"><textarea rows={2} className={inputCls} value={notifyForm.message} onChange={(e) => setNotifyForm({ ...notifyForm, message: e.target.value })} /></Field>
              <PrimaryBtn icon={Send} onClick={sendNotify} disabled={sendingNotify} className="w-full">{sendingNotify ? "Sending..." : "Send to Team"}</PrimaryBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Volunteer's own "Shelters" tab - a trimmed-down manage view scoped to
// whichever single shelter the Volunteer is currently assigned to (product
// table gives Volunteer ASSIGNED scope on occupancy/check-in/check-out and
// supplies, and FULL on reporting a problem). Fetches the assignment via
// api.volunteers.me (a Volunteer's relationship to a shelter is an
// assignment, not an occupant record, so this doesn't use /shelters/me/status
// - that endpoint is for Citizen self-check-in only).
function VolunteerShelterTab({ token, shelters = [], showToast }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [occForm, setOccForm] = useState({ citizenId: "", notes: "" });
  const [headcount, setHeadcount] = useState("");
  const [savingHeadcount, setSavingHeadcount] = useState(false);
  const [resources, setResourcesList] = useState(null);
  const [problemForm, setProblemForm] = useState({ category: "Other", description: "", severity: "Medium" });

  const assignment = me?.assignedShelter;
  // assignedShelter from /volunteers/me is only populated with
  // { shelterId, name, location } - the full row (occupancy/capacity) lives
  // in the already-fetched, adapted `shelters` list, matched by _id.
  const shelter = assignment ? shelters.find(s => s._id === assignment._id) || null : null;

  async function loadMe() {
    setLoading(true);
    try {
      const res = await api.volunteers.me(token);
      setMe(adapt.volunteer(res.data));
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (shelter) setHeadcount(String(shelter.occupancy ?? ""));
  }, [shelter && shelter._id, shelter && shelter.occupancy]);

  useEffect(() => { loadMe(); }, []);

  useEffect(() => {
    if (!shelter) { setResourcesList(null); return; }
    (async () => {
      try {
        const res = await api.shelters.getResources(token, shelter._id);
        setResourcesList(res.data);
      } catch (err) {
        showToast(err.message, "error");
      }
    })();
  }, [shelter && shelter._id]);

  async function saveHeadcount() {
    if (!shelter || headcount === "") return;
    setSavingHeadcount(true);
    try {
      await api.shelters.updateOccupancy(token, shelter._id, { currentOccupancy: Number(headcount) });
      showToast("Occupancy updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingHeadcount(false);
    }
  }

  async function assistCheckIn() {
    if (!shelter) return;
    if (!occForm.citizenId.trim()) return showToast("Enter a citizen user ID", "error");
    try {
      await api.shelters.checkIn(token, shelter._id, { citizenId: occForm.citizenId.trim(), notes: occForm.notes });
      showToast("Checked in");
      setOccForm({ citizenId: "", notes: "" });
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function assistCheckOut() {
    if (!shelter) return;
    if (!occForm.citizenId.trim()) return showToast("Enter a citizen user ID", "error");
    try {
      await api.shelters.checkOut(token, shelter._id, { citizenId: occForm.citizenId.trim(), notes: occForm.notes });
      showToast("Checked out");
      setOccForm({ citizenId: "", notes: "" });
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function adjustResource(r, delta) {
    if (!shelter) return;
    const next = Math.max(0, r.quantity + delta);
    try {
      const res = await api.shelters.updateResource(token, shelter._id, r._id, { quantity: next });
      setResourcesList(resources.map(x => x._id === r._id ? res.data : x));
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function submitProblem() {
    if (!shelter) return;
    if (!problemForm.description.trim()) return showToast("Describe the problem first", "error");
    try {
      await api.shelters.reportProblem(token, shelter._id, problemForm);
      showToast("Problem reported to shelter staff");
      setProblemForm({ category: "Other", description: "", severity: "Medium" });
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  if (loading) return <Card title="My Assigned Shelter"><p className="text-sm text-gray-400">Loading...</p></Card>;

  if (!assignment) {
    return (
      <Card title="My Assigned Shelter">
        <p className="text-sm text-gray-400">
          You're not currently assigned to a shelter. Once Authority/Admin assigns you to one from Volunteer Management, it'll show up here.
        </p>
      </Card>
    );
  }

  if (!shelter) {
    return (
      <Card title="My Assigned Shelter">
        <p className="text-sm text-gray-400">
          You're assigned to {assignment.label || "a shelter"}, but its details couldn't be loaded right now.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card title={shelter.name}>
        <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
          <div>
            <p className="text-xs text-gray-400">Update the current headcount at your assigned shelter.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min="0" className={inputCls + " w-24"} value={headcount} onChange={e => setHeadcount(e.target.value)} />
            <PrimaryBtn onClick={saveHeadcount} disabled={savingHeadcount}>{savingHeadcount ? "Saving..." : "Save"}</PrimaryBtn>
          </div>
        </div>
      </Card>

      <Card title="Check In / Check Out a Citizen">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Citizen user ID"><input className={inputCls} value={occForm.citizenId} onChange={e => setOccForm({ ...occForm, citizenId: e.target.value })} placeholder="Citizen's user ID" /></Field>
          <Field label="Notes (optional)"><input className={inputCls} value={occForm.notes} onChange={e => setOccForm({ ...occForm, notes: e.target.value })} /></Field>
        </div>
        <div className="flex gap-3 mt-2">
          <PrimaryBtn onClick={assistCheckIn} className="flex-1">Check In</PrimaryBtn>
          <GhostBtn onClick={assistCheckOut} className="flex-1">Check Out</GhostBtn>
        </div>
      </Card>

      <Card title="Supplies">
        {resources === null ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : resources.length === 0 ? (
          <p className="text-sm text-gray-400">No supplies recorded for this shelter yet.</p>
        ) : (
          <div className="space-y-2">
            {resources.map(r => (
              <div key={r._id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.category}{r.unit ? " · " + r.unit : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => adjustResource(r, -1)} className="h-6 w-6 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500 text-xs">-</button>
                  <span className="text-sm font-semibold text-gray-900 w-10 text-center">{r.quantity}</span>
                  <button onClick={() => adjustResource(r, 1)} className="h-6 w-6 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500 text-xs">+</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Report a Problem">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Category">
            <select className={inputCls} value={problemForm.category} onChange={e => setProblemForm({ ...problemForm, category: e.target.value })}>
              {["Facility", "Food", "Water", "Medical", "Safety", "Overcrowding", "Other"].map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Severity">
            <select className={inputCls} value={problemForm.severity} onChange={e => setProblemForm({ ...problemForm, severity: e.target.value })}>
              {["Low", "Medium", "High", "Critical"].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description"><textarea rows={3} className={inputCls} value={problemForm.description} onChange={e => setProblemForm({ ...problemForm, description: e.target.value })} /></Field>
        <PrimaryBtn onClick={submitProblem} className="w-full mt-2">Submit</PrimaryBtn>
      </Card>
    </div>
  );
}

function AdminDashboard({ tab, data, showToast }) {
  const { users, setUsers, resources, setResources, shelters, setShelters, volunteers, setVolunteers, contacts, setContacts, disasters, setDisasters, alerts, setAlerts, token, currentUser } = data;
  const [newContact, setNewContact] = useState({ name: "", number: "" });
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "Citizen" });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ name: "", email: "", role: "Citizen" });
  const [evidenceTarget, setEvidenceTarget] = useState(null);
  const [assignTeamTarget, setAssignTeamTarget] = useState(null);
  const [addShelterTarget, setAddShelterTarget] = useState(null);

  function handleEvidenceChange(images) {
    setDisasters(disasters.map(d => d._id === evidenceTarget._id ? { ...d, images } : d));
    setEvidenceTarget((t) => t && { ...t, images });
  }

  async function toggleUser(id) {
    const row = users.find(u => u.id === id);
    if (!row) return;
    const status = row.status === "Active" ? "Blocked" : "Active";
    try {
      const res = await api.users.updateStatus(token, row._id || row.id, { status });
      setUsers(users.map(u => u.id === id ? adapt.user(res.data) : u));
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function deleteUserRow(id) {
    const row = users.find(u => u.id === id);
    try {
      if (row?._id) await api.users.remove(token, row._id);
      setUsers(users.filter(u => u.id !== id));
      showToast("User removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function addUser() {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password) { showToast("Enter name, email and password first", "error"); return; }
    if (newUser.role === "Admin") { showToast("Admin accounts can't be self-registered - ask an existing admin to promote a user instead", "error"); return; }
    try {
      const res = await api.auth.register({ name: newUser.name, email: newUser.email, password: newUser.password, role: newUser.role });
      setUsers([adapt.user(res.data), ...users]);
      setNewUser({ name: "", email: "", password: "", role: "Citizen" });
      showToast("User added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  function startEditUser(u) { setEditingUserId(u.id); setEditUserForm({ name: u.name, email: u.email, role: u.role }); }
  async function saveEditUser(id) {
    const row = users.find(u => u.id === id);
    if (!row) return;
    try {
      const res = await api.users.updateRole(token, row._id || row.id, { role: editUserForm.role });
      setUsers(users.map(u => u.id === id ? adapt.user(res.data) : u));
      setEditingUserId(null);
      showToast("User role updated");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function addContact() {
    if (!newContact.name.trim() || !newContact.number.trim()) { showToast("Fill in both fields", "error"); return; }
    try {
      const res = await api.contacts.create(token, { name: newContact.name, number: newContact.number });
      setContacts([...contacts, adapt.contact(res.data)]);
      setNewContact({ name: "", number: "" });
      showToast("Emergency contact added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function deleteContactRow(id) {
    const row = contacts.find(c => c.id === id);
    try {
      if (row?._id) await api.contacts.remove(token, row._id);
      setContacts(contacts.filter(c => c.id !== id));
      showToast("Emergency contact removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function updateDisasterStatus(id, status) {
    const row = disasters.find(d => d.id === id);
    if (!row) return;
    try {
      const res = await api.disasters.updateStatus(token, row._id || row.id, { status });
      setDisasters(disasters.map(d => d.id === id ? adapt.disaster(res.data) : d));
      showToast(id + " marked " + status);
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  function handleTeamAssigned(updated) {
    setDisasters(disasters.map(d => d._id === updated._id ? updated : d));
  }
  async function deleteDisasterRow(id) {
    const row = disasters.find(d => d.id === id);
    if (!row) return;
    if (!window.confirm(`Delete disaster report "${row.id}"? This can't be undone.`)) return;
    try {
      await api.disasters.remove(token, row._id || row.id);
      setDisasters(disasters.filter(d => d.id !== id));
      showToast(row.id + " deleted");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function clearAllReports() {
    if (disasters.length === 0) return;
    if (!window.confirm(`Delete all ${disasters.length} disaster report(s)? This can't be undone.`)) return;
    const targets = disasters;
    const results = await Promise.allSettled(targets.map(d => api.disasters.remove(token, d._id || d.id)));
    const failed = results.filter(r => r.status === "rejected").length;
    const removedIds = new Set(targets.filter((_, i) => results[i].status === "fulfilled").map(d => d.id));
    setDisasters(disasters.filter(d => !removedIds.has(d.id)));
    if (failed === 0) showToast("All disaster reports cleared");
    else showToast(`Cleared ${targets.length - failed} report(s), ${failed} failed`, failed === targets.length ? "error" : "info");
  }
  // Report-derived zones on the Live Risk Map aren't their own DB record -
  // they're disaster reports grouped by location (see buildRiskZones). The
  // only way to remove one from the map is to delete every disaster report
  // that makes it up.
  async function removeReportZone(locationName) {
    const targets = disasters.filter(d => d.location === locationName);
    if (targets.length === 0) return;
    if (!window.confirm(`Remove risk zone "${locationName}"? This will delete ${targets.length} disaster report(s) reported at this location. This can't be undone.`)) return;
    const results = await Promise.allSettled(targets.map(d => api.disasters.remove(token, d._id || d.id)));
    const failed = results.filter(r => r.status === "rejected").length;
    const removedIds = new Set(targets.filter((_, i) => results[i].status === "fulfilled").map(d => d.id));
    setDisasters(disasters.filter(d => !removedIds.has(d.id)));
    if (failed === 0) showToast(`Risk zone "${locationName}" removed`);
    else showToast(`Removed ${targets.length - failed} of ${targets.length} report(s) at this location`, failed === targets.length ? "error" : "info");
  }
  async function deleteAlertRow(id) {
    const row = alerts.find(a => a.id === id);
    if (!row) return;
    if (!window.confirm(`Delete alert "${row.title}"? This can't be undone.`)) return;
    try {
      await api.alerts.remove(token, row._id || row.id);
      setAlerts(alerts.filter(a => a.id !== id));
      showToast("Alert deleted");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function sendAdminAlert(form) {
    if (!form.title.trim() || !form.location.trim()) { showToast("Fill in title and location first", "error"); return; }
    try {
      const res = await api.alerts.create(token, { title: form.title, type: form.type, location: form.location, priority: form.priority, description: "Alert broadcast to affected areas." });
      setAlerts([adapt.alert(res.data), ...alerts]);
      showToast("Emergency alert broadcast to all citizens");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  if (tab === "overview") return <OverviewDashboard data={data} showToast={showToast} />;
  if (tab === "map") return <Card title="Live Risk Map - Assam" className="h-[calc(100vh-130px)]"><div style={{ height: "calc(100% - 40px)", minHeight: 400 }}><AssamMap disasters={disasters} shelters={shelters} showShelters={true} canCreateZone={true} canCreateShelter={true} token={token} showToast={showToast} onShelterCreated={(s) => setShelters([s, ...shelters])} onRemoveReportZone={removeReportZone} /></div></Card>;

  if (tab === "alerts") {
    return <AdminAlertsPanel alerts={alerts} onSend={sendAdminAlert} onDelete={deleteAlertRow} />;
  }

  if (tab === "reports") return (
    <>
      <Card
        title="All Disaster Reports"
        action={disasters.length > 0 && <GhostBtn icon={Trash2} className="!text-red-500 !border-red-200 hover:!bg-red-50" onClick={clearAllReports}>Clear All</GhostBtn>}
      >
        <DisasterTable disasters={disasters} updateStatus={updateDisasterStatus} onViewEvidence={setEvidenceTarget} onAssignTeam={setAssignTeamTarget} onAddShelter={setAddShelterTarget} onDelete={deleteDisasterRow} />
      </Card>
      <EvidenceModal disaster={evidenceTarget} token={token} onClose={() => setEvidenceTarget(null)} onChange={handleEvidenceChange} showToast={showToast} />
      <AssignTeamModal disaster={assignTeamTarget} token={token} onClose={() => setAssignTeamTarget(null)} onAssigned={handleTeamAssigned} showToast={showToast} />
      <AddShelterModal
        open={!!addShelterTarget}
        token={token}
        title={addShelterTarget ? `Add Shelter Record - ${addShelterTarget.id}` : "Add Shelter"}
        initial={addShelterTarget ? { location: addShelterTarget.location, lat: addShelterTarget.lat, lng: addShelterTarget.lng, disasterId: addShelterTarget._id, disasterLabel: addShelterTarget.id } : null}
        onClose={() => setAddShelterTarget(null)}
        onCreated={(s) => { setShelters([s, ...shelters]); showToast("Shelter record added for " + addShelterTarget.id); }}
        showToast={showToast}
      />
    </>
  );
  if (tab === "ai") return <AIPanel disasters={disasters} token={token} role="admin" showToast={showToast} />;

  if (tab === "resources") return <ResourcesView resources={resources} setResources={setResources} token={token} role="Admin" showToast={showToast} />;

  if (tab === "shelters") return <SheltersView disasters={disasters} shelters={shelters} setShelters={setShelters} token={token} role="Admin" volunteers={volunteers} showToast={showToast} />;
  if (tab === "satellite") return <SatelliteView disasters={disasters} shelters={shelters} token={token} role="Admin" showToast={showToast} onShelterAdded={(s) => setShelters([s, ...shelters])} />;
  if (tab === "chatbot") return <Card title="AI Disaster Assistant"><DisasterChatbot embedded /></Card>;
  if (tab === "news") return <NewsView token={token} userRole="admin" currentUserId={currentUser?._id} users={users} showToast={showToast} />;
  if (tab === "donations") return <DonationsView userRole="admin" token={token} currentUserId={currentUser?._id} showToast={showToast} />;
  if (tab === "ngo") return <NGOView userRole="admin" token={token} currentUserId={currentUser?._id} disasters={disasters} shelters={shelters} showToast={showToast} />;

  if (tab === "volunteers") return <VolunteersView volunteers={volunteers} setVolunteers={setVolunteers} disasters={disasters} shelters={shelters} token={token} role="Admin" showToast={showToast} />;
  if (tab === "teams") return <TeamsView volunteers={volunteers} token={token} role="Admin" showToast={showToast} />;

  if (tab === "users") {
    return (
      <div className="space-y-5">
        <Card title="Add User">
          <div className="grid sm:grid-cols-5 gap-3 items-end">
            <Field label="Name"><input className={inputCls} value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} /></Field>
            <Field label="Email"><input className={inputCls} value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} /></Field>
            <Field label="Password"><input type="password" className={inputCls} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} /></Field>
            <Field label="Role"><select className={inputCls} value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>{["Citizen", "Authority", "Volunteer", "Admin"].map(r => <option key={r}>{r}</option>)}</select></Field>
            <PrimaryBtn onClick={addUser} icon={PlusCircle} className="mb-4">Add User</PrimaryBtn>
          </div>
        </Card>
        <Card title="Manage Users">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-gray-400 uppercase text-xs tracking-wider text-left">{["Name", "Email", "Role", "Status", "Actions"].map(h => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {users.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                    {editingUserId === r.id ? (
                      <>
                        <td className="px-3 py-2.5 text-gray-700 font-medium">{r.name}</td>
                        <td className="px-3 py-2.5 text-gray-500">{r.email}</td>
                        <td className="px-2 py-2"><select className={inputCls} value={editUserForm.role} onChange={e => setEditUserForm({ ...editUserForm, role: e.target.value })}>{["Citizen", "Authority", "Volunteer", "Admin"].map(rl => <option key={rl}>{rl}</option>)}</select></td>
                        <td className="px-3 py-2.5"><Badge className={statusClasses(r.status)}>{r.status}</Badge></td>
                        <td className="px-3 py-2.5"><div className="flex gap-1"><IconBtn icon={CheckCircle} tone="success" title="Save role" onClick={() => saveEditUser(r.id)} /><IconBtn icon={XCircle} title="Cancel" onClick={() => setEditingUserId(null)} /></div></td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-gray-700 font-medium">{r.name}</td>
                        <td className="px-3 py-2.5 text-gray-500">{r.email}</td>
                        <td className="px-3 py-2.5 text-gray-700">{r.role}</td>
                        <td className="px-3 py-2.5"><Badge className={statusClasses(r.status)}>{r.status}</Badge></td>
                        <td className="px-3 py-2.5"><div className="flex gap-1"><IconBtn icon={Pencil} tone="primary" title="Edit role" onClick={() => startEditUser(r)} /><IconBtn icon={r.status === "Active" ? XCircle : CheckCircle} tone={r.status === "Active" ? "danger" : "success"} title={r.status === "Active" ? "Block" : "Unblock"} onClick={() => toggleUser(r.id)} /><IconBtn icon={Trash2} tone="danger" title="Delete" onClick={() => deleteUserRow(r.id)} /></div></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  if (tab === "contacts") {
    return (
      <div className="space-y-5">
        <Card title="Add Emergency Contact">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <Field label="Name"><input className={inputCls} value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} /></Field>
            <Field label="Number"><input className={inputCls} value={newContact.number} onChange={e => setNewContact({ ...newContact, number: e.target.value })} /></Field>
            <PrimaryBtn onClick={addContact} icon={PlusCircle} className="mb-4">Add</PrimaryBtn>
          </div>
        </Card>
        <Card title="Emergency Contacts">
          <Table columns={[{ key: "name", label: "Name" }, { key: "number", label: "Number" }]} rows={contacts} renderActions={r => <IconBtn icon={Trash2} tone="danger" title="Delete" onClick={() => deleteContactRow(r.id)} />} />
        </Card>
      </div>
    );
  }

  if (tab === "analytics") return <AnalyticsView resources={resources} disasters={disasters} shelters={shelters} token={token} />;
  if (tab === "communication") return <CommunicationPanel token={token} alerts={alerts} setAlerts={setAlerts} showToast={showToast} />;
  if (tab === "settings") {
    return (
      <Card title="System Settings" className="max-w-lg">
        <Field label="System Name"><input className={inputCls} defaultValue="Suraksha - ASDMA Disaster Intelligence" /></Field>
        <Field label="Admin Email"><input className={inputCls} defaultValue="admin@asdma.gov.in" /></Field>
        <Field label="SMS API Endpoint"><input className={inputCls} defaultValue="https://api.sms.gov.in/send" /></Field>
        <Field label="GPS Refresh Interval (seconds)"><input type="number" className={inputCls} defaultValue={30} /></Field>
        <PrimaryBtn onClick={() => showToast("Settings saved")} icon={CheckCircle}>Save Settings</PrimaryBtn>
      </Card>
    );
  }

  return <OverviewDashboard data={data} showToast={showToast} />;
}

function AdminAlertsPanel({ alerts, onSend, onDelete }) {
  const [form, setForm] = useState({ title: "", type: "Flood", location: "", priority: "Medium" });
  async function submit() {
    await onSend(form);
    setForm({ title: "", type: "Flood", location: "", priority: "Medium" });
  }
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card title="Broadcast Emergency Alert">
        <Field label="Title"><input className={inputCls} placeholder="Flood Warning - Guwahati" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type"><select className={inputCls} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{["Flood", "Cyclone", "Earthquake", "Landslide", "Fire", "Accident", "Other"].map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Priority"><select className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{["Low", "Medium", "High", "Critical"].map(t => <option key={t}>{t}</option>)}</select></Field>
        </div>
        <Field label="Location"><input className={inputCls} placeholder="District or block" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
        <PrimaryBtn icon={Radio} className="w-full" onClick={submit}>Broadcast to All Citizens</PrimaryBtn>
      </Card>
      <Card title="Recent Alerts">
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className="flex items-start justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                <p className="text-xs text-gray-400">{a.location}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={severityClasses(a.priority)}>{a.priority}</Badge>
                {onDelete && <IconBtn icon={Trash2} tone="danger" title="Delete alert" onClick={() => onDelete(a.id)} />}
              </div>
            </div>
          ))}
          {alerts.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No alerts yet.</p>}
        </div>
      </Card>
    </div>
  );
}

function DisasterTable({ disasters, updateStatus, onViewEvidence, onAssignTeam, onAddShelter, onDelete }) {
  return (
    <Table
      columns={[
        { key: "id", label: "Report ID" }, { key: "type", label: "Type" }, { key: "location", label: "Location" },
        { key: "severity", label: "Severity", render: r => <Badge className={severityClasses(r.severity)}>{r.severity}</Badge> },
        { key: "reportedBy", label: "Reported By" }, { key: "date", label: "Date" },
        { key: "status", label: "Status", render: r => <Badge className={statusClasses(r.status)}>{r.status}</Badge> },
        { key: "team", label: "Team", render: r => r.team && r.team !== "Unassigned" ? <span className="text-xs font-medium text-gray-600">{r.team}</span> : <span className="text-xs text-gray-300">Unassigned</span> },
      ]}
      rows={disasters}
      renderActions={r => (
        <div className="flex gap-1">
          {r.status === "Pending" && <IconBtn icon={CheckCircle} tone="success" title="Verify" onClick={() => updateStatus(r.id, "Verified")} />}
          {r.status === "Pending" && <IconBtn icon={XCircle} tone="danger" title="Reject" onClick={() => updateStatus(r.id, "Rejected")} />}
          {(r.status === "Verified" || r.status === "In Progress") && <IconBtn icon={Users} tone="primary" title="Assign volunteer team" onClick={() => onAssignTeam && onAssignTeam(r)} />}
          {r.status === "In Progress" && <IconBtn icon={CheckCircle} tone="success" title="Resolve" onClick={() => updateStatus(r.id, "Resolved")} />}
          {r.status === "Verified" && <IconBtn icon={Activity} tone="primary" title="Start" onClick={() => updateStatus(r.id, "In Progress")} />}
          <IconBtn icon={Home} title="Add shelter record" onClick={() => onAddShelter && onAddShelter(r)} />
          <IconBtn icon={ImageIcon} title="Evidence" onClick={() => onViewEvidence && onViewEvidence(r)} />
          {onDelete && <IconBtn icon={Trash2} tone="danger" title="Delete report" onClick={() => onDelete(r.id)} />}
        </div>
      )}
    />
  );
}

// Lets Authority/Admin assign one of the real Volunteer Teams (`api.teams.*`)
// to an incident, replacing the old hardcoded "Assign Team Alpha" button.
// Links both directions: the team's `assignedDisaster` (so the team roster
// shows what it's working) and the disaster's `team` display field (so the
// incident table/citizen view show the team name), via the endpoints that
// already existed for each (api.teams.update / api.disasters.updateStatus).
function AssignTeamModal({ disaster, token, onClose, onAssigned, showToast }) {
  const [teams, setTeams] = useState(null);
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!disaster) return;
    setTeams(null);
    setTeamId("");
    api.teams.list(token, { status: "Active" })
      .then(res => setTeams((res.data || []).map(adapt.team)))
      .catch(err => { showToast(err.message, "error"); setTeams([]); });
  }, [disaster && disaster._id]);

  if (!disaster) return null;

  async function submit() {
    if (!teamId) { showToast("Pick a team first", "error"); return; }
    const team = teams.find(t => t._id === teamId);
    setSaving(true);
    try {
      await api.teams.update(token, teamId, { assignedDisaster: disaster._id });
      const res = await api.disasters.updateStatus(token, disaster._id, {
        team: team.name,
        status: disaster.status === "Pending" ? "Verified" : undefined,
      });
      onAssigned(adapt.disaster(res.data));
      showToast(team.name + " assigned to " + disaster.id);
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "440px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-base font-bold text-gray-900">Assign Volunteer Team</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-xs text-gray-400 mb-4">{disaster.id} &middot; {disaster.type} &middot; {disaster.location}</p>
          {disaster.team && disaster.team !== "Unassigned" && (
            <p className="text-xs text-gray-500 mb-3">Currently assigned: <span className="font-semibold text-gray-700">{disaster.team}</span></p>
          )}
          {teams === null && <p className="text-sm text-gray-400 py-4">Loading teams...</p>}
          {teams && teams.length === 0 && <p className="text-sm text-gray-400 py-2">No active volunteer teams yet. Create one from the Volunteer Teams tab first.</p>}
          {teams && teams.length > 0 && (
            <Field label="Team">
              <select className={inputCls} value={teamId} onChange={e => setTeamId(e.target.value)}>
                <option value="">Select a team...</option>
                {teams.map(t => <option key={t._id} value={t._id}>{t.name} ({t.members.length} member{t.members.length === 1 ? "" : "s"})</option>)}
              </select>
            </Field>
          )}
          <PrimaryBtn onClick={submit} icon={Users} className="w-full" disabled={saving || !teams || teams.length === 0}>{saving ? "Assigning..." : "Assign Team"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// Fixed overlay modal listing/managing a single disaster's evidence photos.
// Shared by the Authority and Admin incident tables.
function EvidenceModal({ disaster, token, onClose, onChange, showToast }) {
  if (!disaster) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Evidence - {disaster.id}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{disaster.type} · {disaster.location}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>
          <EvidenceManager
            token={token}
            disasterId={disaster._id}
            images={disaster.images || []}
            canUpload
            canDelete
            onChange={onChange}
            showToast={showToast}
          />
        </div>
      </div>
    </div>
  );
}

// --- Volunteers (Authority + Admin) ------------------------------------------
// Shared between AuthorityDashboard and AdminDashboard - the backend permits
// both roles to approve/reject/inactivate/assign a volunteer (PATCH
// /volunteers/:id/status, /:id/assign); only delete (DELETE /volunteers/:id)
// is Admin-only, gated below with the `role` prop.
function VolunteersView({ volunteers = [], setVolunteers, disasters = [], shelters = [], token, role, showToast }) {
  const [assignTarget, setAssignTarget] = useState(null);
  const [recordTarget, setRecordTarget] = useState(null);
  const isAdmin = role === "Admin";

  async function updateStatus(row, status) {
    try {
      const res = await api.volunteers.updateStatus(token, row._id, { status });
      setVolunteers(volunteers.map((v) => (v._id === row._id ? adapt.volunteer(res.data) : v)));
      showToast("Volunteer " + status.toLowerCase());
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function removeVolunteer(row) {
    if (!window.confirm(`Remove ${row.name}'s volunteer profile? This can't be undone.`)) return;
    try {
      await api.volunteers.remove(token, row._id);
      setVolunteers(volunteers.filter((v) => v._id !== row._id));
      showToast("Volunteer profile removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function handleAssigned(updated) {
    setVolunteers(volunteers.map((v) => (v._id === updated._id ? updated : v)));
    setAssignTarget(null);
  }

  return (
    <>
      <Card title="Volunteers">
        <Table
          columns={[
            { key: "name", label: "Name" },
            { key: "skills", label: "Skills", render: (r) => r.skills || "-" },
            { key: "district", label: "District", render: (r) => r.district || "-" },
            { key: "availability", label: "Availability", render: (r) => <Badge className={statusClasses(r.availability)}>{r.availability}</Badge> },
            { key: "status", label: "Status", render: (r) => <Badge className={statusClasses(r.status)}>{r.status}</Badge> },
            {
              key: "assignment",
              label: "Assigned To",
              render: (r) =>
                r.assignedDisaster || r.assignedShelter ? (
                  <span className="text-xs text-gray-600">{[r.assignedDisaster?.label, r.assignedShelter?.label].filter(Boolean).join(" / ")}</span>
                ) : (
                  <span className="text-xs text-gray-300">-</span>
                ),
            },
          ]}
          rows={volunteers}
          renderActions={(r) => (
            <div className="flex gap-1">
              <IconBtn icon={Eye} tone="primary" title="View record" onClick={() => setRecordTarget(r)} />
              {r.status === "Pending" && (
                <>
                  <IconBtn icon={CheckCircle} tone="success" title="Approve" onClick={() => updateStatus(r, "Approved")} />
                  <IconBtn icon={XCircle} tone="danger" title="Reject" onClick={() => updateStatus(r, "Rejected")} />
                </>
              )}
              {r.status === "Approved" && (
                <>
                  <IconBtn icon={UserCog} tone="primary" title="Assign to disaster/shelter" onClick={() => setAssignTarget(r)} />
                  <IconBtn icon={Ban} tone="danger" title="Deactivate" onClick={() => updateStatus(r, "Inactive")} />
                </>
              )}
              {(r.status === "Inactive" || r.status === "Rejected") && (
                <IconBtn icon={CheckCircle} tone="success" title="Reactivate" onClick={() => updateStatus(r, "Approved")} />
              )}
              {isAdmin && <IconBtn icon={Trash2} tone="danger" title="Delete profile" onClick={() => removeVolunteer(r)} />}
            </div>
          )}
        />
      </Card>
      <AssignVolunteerModal
        volunteer={assignTarget}
        disasters={disasters}
        shelters={shelters}
        token={token}
        onClose={() => setAssignTarget(null)}
        onAssigned={handleAssigned}
        showToast={showToast}
      />
      <VolunteerRecordModal volunteer={recordTarget} token={token} onClose={() => setRecordTarget(null)} showToast={showToast} />
    </>
  );
}

// Combines three already-existing endpoints into one read-only record view -
// profile (row data already in hand), task history (GET /tasks?assignedTo=
// <userId>), and team membership (GET /teams, filtered client-side since
// there's no "teams by volunteer" filter for an Admin/Authority caller).
// Fixes STATUS-REPORT Phase 13 item #4 - no new backend needed.
function VolunteerRecordModal({ volunteer, token, onClose, showToast }) {
  const [tasks, setTasks] = useState(null);
  const [teams, setTeams] = useState(null);

  useEffect(() => {
    if (!volunteer) return;
    setTasks(null);
    setTeams(null);
    (async () => {
      try {
        const [taskRes, teamRes] = await Promise.all([
          volunteer.userId ? api.tasks.list(token, { assignedTo: volunteer.userId }) : Promise.resolve({ data: [] }),
          api.teams.list(token),
        ]);
        setTasks((taskRes.data || []).map(adapt.task));
        setTeams((teamRes.data || []).map(adapt.team).filter((t) => t.members.some((m) => m._id === volunteer._id)));
      } catch (err) {
        showToast(err.message, "error");
      }
    })();
  }, [volunteer && volunteer._id]);

  if (!volunteer) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">{volunteer.name}</h3>
              <p className="text-xs text-gray-500">{volunteer.email} {volunteer.phone && `· ${volunteer.phone}`}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <div className="text-sm"><span className="font-semibold text-gray-700">Status: </span><Badge className={statusClasses(volunteer.status)}>{volunteer.status}</Badge></div>
            <div className="text-sm"><span className="font-semibold text-gray-700">Availability: </span><Badge className={statusClasses(volunteer.availability)}>{volunteer.availability}</Badge></div>
            <div className="text-sm"><span className="font-semibold text-gray-700">District: </span>{volunteer.district || "-"}</div>
            <div className="text-sm"><span className="font-semibold text-gray-700">Skills: </span>{volunteer.skills || "-"}</div>
          </div>
          {(volunteer.assignedDisaster || volunteer.assignedShelter) && (
            <div className="text-sm text-gray-600 mb-4">
              <span className="font-semibold text-gray-700">Current assignment: </span>
              {[volunteer.assignedDisaster?.label, volunteer.assignedShelter?.label].filter(Boolean).join(" / ")}
            </div>
          )}

          <div className="border-t border-gray-100 pt-3 mb-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">Team membership</p>
            {teams === null && <p className="text-xs text-gray-400">Loading...</p>}
            {teams && teams.length === 0 && <p className="text-xs text-gray-400">Not on any team.</p>}
            {teams && teams.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {teams.map((t) => <span key={t._id} className="text-xs px-2 py-1 rounded-full bg-gray-50 border border-gray-100 text-gray-600">{t.name}{t.leader?._id === volunteer._id ? " (Leader)" : ""}</span>)}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-sm font-semibold text-gray-900 mb-2">Task history</p>
            {tasks === null && <p className="text-xs text-gray-400">Loading...</p>}
            {tasks && tasks.length === 0 && <p className="text-xs text-gray-400">No tasks assigned yet.</p>}
            {tasks && tasks.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-gray-50">
                    <span className="text-gray-700">{t.task}</span>
                    <Badge className={statusClasses(t.status)}>{t.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignVolunteerModal({ volunteer, disasters = [], shelters = [], token, onClose, onAssigned, showToast }) {
  const [disasterId, setDisasterId] = useState("");
  const [shelterId, setShelterId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (volunteer) {
      setDisasterId(volunteer.assignedDisaster?._id || "");
      setShelterId(volunteer.assignedShelter?._id || "");
    }
  }, [volunteer]);

  if (!volunteer) return null;

  async function save() {
    setBusy(true);
    try {
      const res = await api.volunteers.assign(token, volunteer._id, {
        assignedDisaster: disasterId || null,
        assignedShelter: shelterId || null,
      });
      onAssigned(adapt.volunteer(res.data));
      showToast("Assignment updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "420px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Assign {volunteer.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">Pick a disaster response and/or shelter. Leave as "Not assigned" to clear.</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>
          <Field label="Disaster Response">
            <select className={inputCls} value={disasterId} onChange={(e) => setDisasterId(e.target.value)}>
              <option value="">Not assigned</option>
              {disasters.map((d) => <option key={d._id} value={d._id}>{d.type} - {d.location}</option>)}
            </select>
          </Field>
          <Field label="Shelter">
            <select className={inputCls} value={shelterId} onChange={(e) => setShelterId(e.target.value)}>
              <option value="">Not assigned</option>
              {shelters.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </Field>
          <div className="flex gap-2 mt-2">
            <GhostBtn onClick={onClose} className="flex-1">Cancel</GhostBtn>
            <PrimaryBtn onClick={save} disabled={busy} className="flex-1">{busy ? "Saving..." : "Save Assignment"}</PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

const AI_TABS = [
  { id: "predictions", label: "Predictions" },
  { id: "insights", label: "Insights" },
  { id: "ground", label: "Ground Conditions" },
  { id: "audit", label: "Audit Logs" },
  { id: "settings", label: "Settings", adminOnly: true },
];

function AIPanel({ disasters = [], token, role, showToast }) {
  const [tab, setTab] = useState("predictions");
  const tabs = AI_TABS.filter(t => !t.adminOnly || role === "admin");
  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-gray-100 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={"px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors " + (tab === t.id ? "border-purple-500 text-purple-600" : "border-transparent text-gray-400 hover:text-gray-600")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "predictions" && <AIPredictionsPanel disasters={disasters} token={token} role={role} showToast={showToast} />}
      {tab === "insights" && <AIInsightsPanel token={token} showToast={showToast} />}
      {tab === "ground" && <AIGroundConditionsPanel token={token} showToast={showToast} />}
      {tab === "audit" && <AIAuditLogsPanel token={token} showToast={showToast} />}
      {tab === "settings" && role === "admin" && <AIRiskSettingsPanel token={token} showToast={showToast} />}
    </div>
  );
}

const PREDICTION_STATUS_CLASSES = {
  Pending: "bg-gray-50 text-gray-500 border-gray-200",
  Approved: "bg-blue-50 text-blue-600 border-blue-200",
  Confirmed: "bg-green-50 text-green-600 border-green-200",
  Rejected: "bg-red-50 text-red-600 border-red-200",
};

// @desc AI predictions workflow - "View disaster predictions",
// "Generate AI risk assessment", "Approve/Confirm AI recommendations",
// "AI-analyze citizen reports", record prediction outcome, AI accuracy.
function AIPredictionsPanel({ disasters, token, role, showToast }) {
  const [predictions, setPredictions] = useState([]);
  const [accuracy, setAccuracy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [districtFilter, setDistrictFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ disasterType: "", district: "", lat: "", lng: "", affectedAreas: "", populationAtRisk: "", relatedDisaster: "", relatedRiskZone: "" });
  const [genSaving, setGenSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // prediction being confirmed/rejected
  const [confirmReason, setConfirmReason] = useState("");
  const [analyzeModal, setAnalyzeModal] = useState(null); // prediction being analyzed
  const [selectedReportIds, setSelectedReportIds] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const [predRes, accRes] = await Promise.all([
        api.aiRisk.listPredictions(token, { district: districtFilter || undefined, status: statusFilter || undefined }),
        api.aiRisk.getAiAccuracy(token),
      ]);
      setPredictions((predRes.data || []).map(adapt.aiPrediction));
      setAccuracy(accRes.data);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token, districtFilter, statusFilter]);

  async function generate() {
    if (!genForm.disasterType.trim()) { showToast("Enter a disaster type", "error"); return; }
    setGenSaving(true);
    try {
      const payload = {
        disasterType: genForm.disasterType.trim(),
        district: genForm.district.trim() || undefined,
        center: genForm.lat && genForm.lng ? { lat: Number(genForm.lat), lng: Number(genForm.lng) } : undefined,
        affectedAreas: genForm.affectedAreas ? genForm.affectedAreas.split(",").map(a => a.trim()).filter(Boolean) : [],
        populationAtRisk: genForm.populationAtRisk ? Number(genForm.populationAtRisk) : undefined,
        relatedDisaster: genForm.relatedDisaster || undefined,
        relatedRiskZone: genForm.relatedRiskZone.trim() || undefined,
      };
      await api.aiRisk.generateAssessment(token, payload);
      showToast("AI risk assessment generated");
      setGenOpen(false);
      setGenForm({ disasterType: "", district: "", lat: "", lng: "", affectedAreas: "", populationAtRisk: "", relatedDisaster: "", relatedRiskZone: "" });
      load();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setGenSaving(false);
    }
  }

  async function approve(p) {
    try {
      await api.aiRisk.approvePrediction(token, p._id);
      showToast("Recommendation approved");
      load();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function submitConfirm(confirmed) {
    try {
      await api.aiRisk.confirmPrediction(token, confirmModal._id, { confirmed, reason: confirmReason });
      showToast(confirmed ? "Prediction confirmed" : "Prediction rejected");
      setConfirmModal(null);
      setConfirmReason("");
      load();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function submitAnalyze() {
    try {
      await api.aiRisk.analyzeCitizenReports(token, analyzeModal._id, selectedReportIds);
      showToast("Citizen reports analyzed");
      setAnalyzeModal(null);
      setSelectedReportIds([]);
      load();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function recordOutcome(p, outcome) {
    try {
      await api.aiRisk.recordOutcome(token, p._id, outcome);
      showToast("Outcome recorded");
      load();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  return (
    <div className="space-y-5">
      {accuracy && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            ["Total", accuracy.total],
            ["Accurate", accuracy.accurate],
            ["Inaccurate", accuracy.inaccurate],
            ["Unknown", accuracy.unknown],
            ["Accuracy Rate", accuracy.accuracyRate !== null ? accuracy.accuracyRate + "%" : "-"],
          ].map(([label, val]) => (
            <Card key={label} className="text-center">
              <p className="text-xl font-bold text-gray-900">{val}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </Card>
          ))}
        </div>
      )}

      <Card
        title="Disaster Predictions"
        action={<PrimaryBtn onClick={() => setGenOpen(true)} icon={PlusCircle}>Generate Assessment</PrimaryBtn>}
      >
        <div className="flex gap-3 mb-4">
          <input className={inputCls} placeholder="Filter by district" value={districtFilter} onChange={e => setDistrictFilter(e.target.value)} />
          <select className={inputCls} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {["Pending", "Approved", "Confirmed", "Rejected"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-6">Loading predictions...</p>
        ) : (
          <Table
            columns={[
              { key: "disasterType", label: "Type" },
              { key: "district", label: "District" },
              { key: "riskScore", label: "Score" },
              { key: "status", label: "Status", render: p => <Badge className={PREDICTION_STATUS_CLASSES[p.status] || PREDICTION_STATUS_CLASSES.Pending}>{p.status}</Badge> },
              { key: "outcome", label: "Outcome" },
            ]}
            rows={predictions}
            renderActions={(p) => (
              <div className="flex gap-1 flex-wrap">
                {p.status === "Pending" && <IconBtn icon={CheckCircle} tone="success" title="Approve" onClick={() => approve(p)} />}
                <IconBtn icon={CheckCheck} tone="primary" title="Confirm / Reject" onClick={() => { setConfirmModal(p); setConfirmReason(""); }} />
                <IconBtn icon={Activity} tone="default" title="Analyze citizen reports" onClick={() => { setAnalyzeModal(p); setSelectedReportIds([]); }} />
                <IconBtn icon={TrendingUp} tone="success" title="Mark accurate" onClick={() => recordOutcome(p, "Accurate")} />
                <IconBtn icon={XCircle} tone="danger" title="Mark inaccurate" onClick={() => recordOutcome(p, "Inaccurate")} />
              </div>
            )}
          />
        )}
      </Card>

      {genOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setGenOpen(false)}>
          <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-base font-bold text-gray-900">Generate AI Risk Assessment</h3>
                <button onClick={() => setGenOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
              </div>
              <Field label="Disaster type"><input className={inputCls} value={genForm.disasterType} onChange={e => setGenForm({ ...genForm, disasterType: e.target.value })} placeholder="Flood, Cyclone, Earthquake..." /></Field>
              <Field label="District"><input className={inputCls} value={genForm.district} onChange={e => setGenForm({ ...genForm, district: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Center latitude"><input type="number" className={inputCls} value={genForm.lat} onChange={e => setGenForm({ ...genForm, lat: e.target.value })} /></Field>
                <Field label="Center longitude"><input type="number" className={inputCls} value={genForm.lng} onChange={e => setGenForm({ ...genForm, lng: e.target.value })} /></Field>
              </div>
              <Field label="Affected areas (comma-separated)"><input className={inputCls} value={genForm.affectedAreas} onChange={e => setGenForm({ ...genForm, affectedAreas: e.target.value })} /></Field>
              <Field label="Population at risk"><input type="number" className={inputCls} value={genForm.populationAtRisk} onChange={e => setGenForm({ ...genForm, populationAtRisk: e.target.value })} /></Field>
              <Field label="Related disaster (optional)">
                <select className={inputCls} value={genForm.relatedDisaster} onChange={e => setGenForm({ ...genForm, relatedDisaster: e.target.value })}>
                  <option value="">None</option>
                  {disasters.map(d => <option key={d._id} value={d._id}>{d.type} - {d.location}</option>)}
                </select>
              </Field>
              <Field label="Related risk zone ID (optional)"><input className={inputCls} value={genForm.relatedRiskZone} onChange={e => setGenForm({ ...genForm, relatedRiskZone: e.target.value })} /></Field>
              <PrimaryBtn onClick={generate} icon={PlusCircle} className="w-full" disabled={genSaving}>{genSaving ? "Generating..." : "Generate"}</PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setConfirmModal(null)}>
          <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "420px" }} onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-base font-bold text-gray-900 mb-4">Confirm or Reject Prediction</h3>
              <Field label="Reason (optional)"><textarea rows={2} className={inputCls} value={confirmReason} onChange={e => setConfirmReason(e.target.value)} /></Field>
              <div className="flex gap-3">
                <PrimaryBtn onClick={() => submitConfirm(true)} icon={CheckCircle} className="flex-1">Confirm</PrimaryBtn>
                <PrimaryBtn onClick={() => submitConfirm(false)} icon={XCircle} danger className="flex-1">Reject</PrimaryBtn>
              </div>
            </div>
          </div>
        </div>
      )}

      {analyzeModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setAnalyzeModal(null)}>
          <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "460px", maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-base font-bold text-gray-900 mb-4">Analyze Citizen Reports</h3>
              <p className="text-xs text-gray-400 mb-3">Pick disaster reports to fold into this prediction's risk score.</p>
              <div className="space-y-2 mb-4 max-h-64 overflow-auto">
                {disasters.map(d => (
                  <label key={d._id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={selectedReportIds.includes(d._id)}
                      onChange={e => setSelectedReportIds(e.target.checked ? [...selectedReportIds, d._id] : selectedReportIds.filter(id => id !== d._id))} />
                    {d.type} - {d.location} ({d.severity})
                  </label>
                ))}
                {disasters.length === 0 && <p className="text-sm text-gray-400">No disaster reports available.</p>}
              </div>
              <PrimaryBtn onClick={submitAnalyze} icon={CheckCircle} className="w-full" disabled={selectedReportIds.length === 0}>Analyze {selectedReportIds.length} Report(s)</PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// @desc Read-only AI Risk Engine views - overall risk, risk score by
// district, risk factors, affected areas, population at risk, shelter/
// evacuation recommendations, resource predictions/shortages.
function AIInsightsPanel({ token, showToast }) {
  const [loading, setLoading] = useState(true);
  const [overall, setOverall] = useState(null);
  const [riskScores, setRiskScores] = useState([]);
  const [factors, setFactors] = useState(null);
  const [affected, setAffected] = useState(null);
  const [population, setPopulation] = useState(null);
  const [shelterRecs, setShelterRecs] = useState([]);
  const [evacRecs, setEvacRecs] = useState([]);
  const [resourcePreds, setResourcePreds] = useState([]);
  const [resourceShortages, setResourceShortages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, rs, f, aa, pop, sr, er, rp, rsh] = await Promise.all([
          api.aiRisk.getOverallRisk(token),
          api.aiRisk.getRiskScore(token),
          api.aiRisk.getRiskFactors(token),
          api.aiRisk.getAffectedAreas(token),
          api.aiRisk.getPopulationAtRisk(token),
          api.aiRisk.getShelterRecommendations(token),
          api.aiRisk.getEvacuationRecommendations(token),
          api.aiRisk.getResourcePredictions(token),
          api.aiRisk.getResourceShortages(token),
        ]);
        if (cancelled) return;
        setOverall(o.data);
        setRiskScores(rs.data || []);
        setFactors(f.data);
        setAffected(aa.data);
        setPopulation(pop.data);
        setShelterRecs(sr.data || []);
        setEvacRecs(er.data || []);
        setResourcePreds(rp.data || []);
        setResourceShortages(rsh.data || []);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return <Card><p className="text-sm text-gray-400 text-center py-6">Loading AI risk insights...</p></Card>;

  return (
    <div className="space-y-5">
      <Card title="Overall Risk">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><p className="text-xl font-bold text-gray-900">{overall?.zoneCount ?? 0}</p><p className="text-xs text-gray-400">Risk zones</p></div>
          <div><p className="text-xl font-bold text-gray-900">{overall?.averageRiskScore ?? 0}</p><p className="text-xs text-gray-400">Avg. risk score</p></div>
          {overall?.byLevel && Object.entries(overall.byLevel).map(([level, count]) => (
            <div key={level}><p className="text-xl font-bold text-gray-900">{count}</p><p className="text-xs text-gray-400">{level}</p></div>
          ))}
        </div>
      </Card>

      <Card title="Risk Score by Zone">
        <Table
          columns={[
            { key: "name", label: "Zone" },
            { key: "district", label: "District" },
            { key: "riskLevel", label: "Level" },
            { key: "effectiveScore", label: "Score" },
          ]}
          rows={riskScores.map(z => ({ id: z._id || z.zoneId, ...z }))}
        />
      </Card>

      {factors && (
        <Card title="Risk Factors">
          {factors.weights ? (
            <div className="space-y-1.5">
              {Object.entries(factors.weights).map(([factor, weight]) => (
                <div key={factor} className="flex justify-between text-sm"><span className="text-gray-700">{factor}</span><span className="font-mono text-gray-500">{weight}</span></div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">{(factors.factors || []).map(f => <Badge key={f} className="bg-purple-50 text-purple-600 border-purple-200">{f}</Badge>)}</div>
          )}
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Affected Areas">
          <p className="text-xs text-gray-400 mb-2">{affected?.disasters?.length || 0} active disaster(s), {affected?.riskZones?.length || 0} risk zone(s)</p>
          <div className="space-y-1 max-h-40 overflow-auto">
            {(affected?.disasters || []).map(d => <p key={d._id} className="text-sm text-gray-700">{d.type} - {d.location} <Badge className={severityClasses(d.severity)}>{d.severity}</Badge></p>)}
          </div>
        </Card>
        <Card title="Population at Risk">
          <p className="text-xl font-bold text-gray-900 mb-2">{population?.totalPopulationAtRisk?.toLocaleString() || 0}</p>
          <div className="space-y-1">
            {Object.entries(population?.byDistrict || {}).map(([d, n]) => (
              <div key={d} className="flex justify-between text-sm"><span className="text-gray-700">{d}</span><span className="font-mono text-gray-500">{n.toLocaleString()}</span></div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Shelter Recommendations">
          <div className="space-y-2 max-h-56 overflow-auto">
            {shelterRecs.map(r => (
              <div key={r.shelter._id} className="flex justify-between text-sm"><span className="text-gray-700">{r.shelter.name}</span><span className="font-mono text-gray-500">{r.availableCapacity} free</span></div>
            ))}
            {shelterRecs.length === 0 && <p className="text-sm text-gray-400">No shelters with available capacity.</p>}
          </div>
        </Card>
        <Card title="Evacuation Recommendations">
          <div className="space-y-2 max-h-56 overflow-auto">
            {evacRecs.map(r => <p key={r._id} className="text-sm text-gray-700">{r.name} ({r.district})</p>)}
            {evacRecs.length === 0 && <p className="text-sm text-gray-400">No active evacuation routes.</p>}
          </div>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="Resource Predictions">
          <Table
            columns={[{ key: "resource", label: "Resource" }, { key: "currentQuantity", label: "Qty" }, { key: "projectedStatusIn7Days", label: "In 7 days" }]}
            rows={resourcePreds.map((r, i) => ({ id: i, ...r }))}
          />
        </Card>
        <Card title="Resource Shortages">
          <div className="space-y-2 max-h-56 overflow-auto">
            {resourceShortages.map(r => <div key={r._id} className="flex justify-between text-sm"><span className="text-gray-700">{r.name}</span><Badge className="bg-red-50 text-red-600 border-red-200">{r.status}</Badge></div>)}
            {resourceShortages.length === 0 && <p className="text-sm text-gray-400">No resource shortages.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// @desc Ground-condition reports - "Report ground conditions" (everyone)
// and browsing the feed (Admin/Authority see the full feed here).
function AIGroundConditionsPanel({ token, showToast }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ district: "", location: "", disasterType: "", condition: "", severity: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.aiRisk.getGroundConditions(token);
      setReports((res.data || []).map(adapt.groundConditionReport));
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [token]);

  async function submit() {
    if (!form.condition.trim()) { showToast("Describe the ground condition", "error"); return; }
    setSaving(true);
    try {
      await api.aiRisk.reportGroundCondition(token, form);
      showToast("Ground condition reported");
      setForm({ district: "", location: "", disasterType: "", condition: "", severity: "" });
      load();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Report Ground Conditions">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="District"><input className={inputCls} value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} /></Field>
          <Field label="Location"><input className={inputCls} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Disaster type"><input className={inputCls} value={form.disasterType} onChange={e => setForm({ ...form, disasterType: e.target.value })} /></Field>
          <Field label="Severity"><input className={inputCls} value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} placeholder="Low, Medium, High, Critical" /></Field>
        </div>
        <Field label="Condition"><textarea rows={2} className={inputCls} value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} /></Field>
        <PrimaryBtn onClick={submit} icon={PlusCircle} disabled={saving}>{saving ? "Submitting..." : "Submit Report"}</PrimaryBtn>
      </Card>
      <Card title="Ground Condition Reports">
        {loading ? <p className="text-sm text-gray-400 text-center py-6">Loading...</p> : (
          <Table
            columns={[
              { key: "district", label: "District" },
              { key: "location", label: "Location" },
              { key: "disasterType", label: "Type" },
              { key: "condition", label: "Condition" },
              { key: "severity", label: "Severity" },
              { key: "reportedByName", label: "Reported By" },
            ]}
            rows={reports}
          />
        )}
      </Card>
    </div>
  );
}

// @desc AI Risk Engine audit logs - "View audit logs" (Admin: FULL,
// Authority: LIMITED to their own district - enforced server-side).
function AIAuditLogsPanel({ token, showToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.aiRisk.getAuditLogs(token, { page });
        if (cancelled) return;
        setLogs(res.data || []);
        setPages(res.pages || 1);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, page]);

  return (
    <Card title="AI Risk Engine Audit Logs">
      {loading ? <p className="text-sm text-gray-400 text-center py-6">Loading...</p> : (
        <>
          <Table
            columns={[
              { key: "action", label: "Action" },
              { key: "entityType", label: "Entity" },
              { key: "performedBy", label: "By", render: l => l.performedBy?.name || "-" },
              { key: "district", label: "District" },
              { key: "createdAt", label: "When", render: l => l.createdAt ? new Date(l.createdAt).toLocaleString() : "-" },
            ]}
            rows={logs.map(l => ({ id: l._id, ...l }))}
          />
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <GhostBtn onClick={() => setPage(p => Math.max(1, p - 1))} className={page <= 1 ? "opacity-50 pointer-events-none" : ""}>Previous</GhostBtn>
              <span className="text-xs text-gray-400">Page {page} of {pages}</span>
              <GhostBtn onClick={() => setPage(p => Math.min(pages, p + 1))} className={page >= pages ? "opacity-50 pointer-events-none" : ""}>Next</GhostBtn>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// --- AI Risk Engine admin settings (§3.14) -----------------------------------
// Backend (controllers/aiRiskController.js "Configuration" section +
// config/aiRiskPermissions.js) was already fully built - Admin: FULL,
// everyone else: NONE on all five actions below. This was pure frontend gap:
// no client methods (api.aiRisk.*) and no UI existed before Phase 9.
function AIRiskSettingsPanel({ token, showToast }) {
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState({ low: 25, medium: 50, high: 75, critical: 90 });
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [weights, setWeights] = useState({});
  const [newWeightFactor, setNewWeightFactor] = useState("");
  const [newWeightValue, setNewWeightValue] = useState("");
  const [savingWeights, setSavingWeights] = useState(false);
  const [disasterTypes, setDisasterTypes] = useState([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeCategory, setNewTypeCategory] = useState("");
  const [general, setGeneral] = useState({ modelVersion: "", autoConfirmAboveScore: "", alertsEnabled: true });
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [dataSources, setDataSources] = useState([]);
  const [newSource, setNewSource] = useState({ name: "", type: "", endpoint: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, w, dt, g, ds] = await Promise.all([
          api.aiRisk.getThresholds(token),
          api.aiRisk.getWeights(token),
          api.aiRisk.getDisasterTypes(token),
          api.aiRisk.getSettings(token),
          api.aiRisk.getDataSources(token),
        ]);
        if (cancelled) return;
        setThresholds(t.data);
        setWeights(w.data);
        setDisasterTypes(dt.data);
        setGeneral({ modelVersion: "", autoConfirmAboveScore: "", alertsEnabled: true, ...g.data });
        setDataSources(ds.data);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function saveThresholds() {
    setSavingThresholds(true);
    try {
      const res = await api.aiRisk.updateThresholds(token, thresholds);
      setThresholds(res.data);
      showToast("Risk thresholds updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingThresholds(false);
    }
  }

  async function saveWeights(nextWeights) {
    setSavingWeights(true);
    try {
      const res = await api.aiRisk.updateWeights(token, nextWeights);
      setWeights(res.data);
      showToast("Risk factor weights updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingWeights(false);
    }
  }

  function addWeight() {
    const factor = newWeightFactor.trim();
    if (!factor || newWeightValue === "") { showToast("Enter a factor name and weight", "error"); return; }
    saveWeights({ ...weights, [factor]: Number(newWeightValue) });
    setNewWeightFactor("");
    setNewWeightValue("");
  }

  function removeWeight(factor) {
    const next = { ...weights };
    delete next[factor];
    // The backend only ever sets/merges factors (Map.set), so "removing" one
    // means saving every remaining factor back with the dropped one omitted -
    // there's no dedicated delete-a-weight endpoint.
    saveWeights(next);
  }

  async function addType() {
    if (!newTypeName.trim()) { showToast("Enter a disaster type name", "error"); return; }
    try {
      const res = await api.aiRisk.addDisasterType(token, { name: newTypeName.trim(), category: newTypeCategory.trim() });
      setDisasterTypes(res.data);
      setNewTypeName("");
      setNewTypeCategory("");
      showToast("Disaster type added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function toggleTypeActive(type) {
    try {
      const res = await api.aiRisk.updateDisasterType(token, type.name, { active: !type.active });
      setDisasterTypes(res.data);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function removeType(type) {
    try {
      const res = await api.aiRisk.removeDisasterType(token, type.name);
      setDisasterTypes(res.data);
      showToast("Disaster type removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function saveGeneral() {
    setSavingGeneral(true);
    try {
      const res = await api.aiRisk.updateSettings(token, {
        ...general,
        autoConfirmAboveScore: general.autoConfirmAboveScore === "" ? null : Number(general.autoConfirmAboveScore),
      });
      setGeneral({ modelVersion: "", autoConfirmAboveScore: "", alertsEnabled: true, ...res.data });
      showToast("AI settings updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingGeneral(false);
    }
  }

  async function addDataSource() {
    if (!newSource.name.trim()) { showToast("Enter a data source name", "error"); return; }
    try {
      const res = await api.aiRisk.addDataSource(token, newSource);
      setDataSources(res.data);
      setNewSource({ name: "", type: "", endpoint: "" });
      showToast("Data source added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function toggleDataSourceEnabled(source) {
    try {
      const res = await api.aiRisk.updateDataSource(token, source._id, { enabled: !source.enabled });
      setDataSources(res.data);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function removeDataSource(source) {
    try {
      const res = await api.aiRisk.removeDataSource(token, source._id);
      setDataSources(res.data);
      showToast("Data source removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  if (loading) {
    return (
      <Card title="AI Risk Engine Settings">
        <p className="text-sm text-gray-400 text-center py-6">Loading AI risk settings...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pt-2">
        <Brain className="h-4 w-4 text-purple-600" /> AI Risk Engine Settings
        <Badge className="bg-orange-50 text-orange-600 border-orange-200">Admin only</Badge>
      </h3>

      <Card title="Risk Score Thresholds" action={<PrimaryBtn onClick={saveThresholds} icon={CheckCircle} disabled={savingThresholds}>{savingThresholds ? "Saving..." : "Save"}</PrimaryBtn>}>
        <p className="text-xs text-gray-400 mb-3">Score bands (0-100) used to turn a numeric AI risk score into a Low/Medium/High/Critical label.</p>
        <div className="grid sm:grid-cols-4 gap-4">
          {["low", "medium", "high", "critical"].map(key => (
            <Field key={key} label={key}>
              <input type="number" min="0" max="100" className={inputCls} value={thresholds[key]}
                onChange={e => setThresholds({ ...thresholds, [key]: Number(e.target.value) })} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Risk Factor Weights">
        <p className="text-xs text-gray-400 mb-3">Factor -&gt; weight used when the AI computes a risk score.</p>
        <div className="space-y-2 mb-3">
          {Object.entries(weights).map(([factor, weight]) => (
            <div key={factor} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 flex-1">{factor}</span>
              <input type="number" step="0.05" className={inputCls + " w-28"} value={weight}
                onChange={e => setWeights({ ...weights, [factor]: Number(e.target.value) })} />
              <IconBtn icon={CheckCircle} tone="success" title="Save this weight" onClick={() => saveWeights(weights)} />
              <IconBtn icon={Trash2} tone="danger" title="Remove factor" onClick={() => removeWeight(factor)} />
            </div>
          ))}
          {Object.keys(weights).length === 0 && <p className="text-sm text-gray-400">No factors configured yet.</p>}
        </div>
        <div className="flex items-center gap-3 pt-3 border-t border-gray-50">
          <input className={inputCls} placeholder="New factor name" value={newWeightFactor} onChange={e => setNewWeightFactor(e.target.value)} />
          <input type="number" step="0.05" className={inputCls + " w-28"} placeholder="Weight" value={newWeightValue} onChange={e => setNewWeightValue(e.target.value)} />
          <PrimaryBtn onClick={addWeight} icon={PlusCircle} disabled={savingWeights}>Add</PrimaryBtn>
        </div>
      </Card>

      <Card title="Disaster Types">
        <Table
          columns={[
            { key: "name", label: "Name" },
            { key: "category", label: "Category" },
            { key: "active", label: "Status", render: (t) => <Badge className={t.active ? "bg-green-50 text-green-600 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}>{t.active ? "Active" : "Inactive"}</Badge> },
          ]}
          rows={disasterTypes.map(t => ({ id: t.name, ...t }))}
          renderActions={(t) => (
            <div className="flex gap-1">
              <IconBtn icon={t.active ? Ban : CheckCheck} tone={t.active ? "danger" : "success"} title={t.active ? "Deactivate" : "Activate"} onClick={() => toggleTypeActive(t)} />
              <IconBtn icon={Trash2} tone="danger" title="Remove" onClick={() => removeType(t)} />
            </div>
          )}
        />
        <div className="flex items-center gap-3 pt-3 mt-3 border-t border-gray-50">
          <input className={inputCls} placeholder="New disaster type" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} />
          <input className={inputCls} placeholder="Category (optional)" value={newTypeCategory} onChange={e => setNewTypeCategory(e.target.value)} />
          <PrimaryBtn onClick={addType} icon={PlusCircle}>Add</PrimaryBtn>
        </div>
      </Card>

      <Card title="General AI Settings" action={<PrimaryBtn onClick={saveGeneral} icon={CheckCircle} disabled={savingGeneral}>{savingGeneral ? "Saving..." : "Save"}</PrimaryBtn>}>
        <div className="grid sm:grid-cols-2 gap-x-8">
          <Field label="Model version"><input className={inputCls} value={general.modelVersion || ""} onChange={e => setGeneral({ ...general, modelVersion: e.target.value })} /></Field>
          <Field label="Auto-confirm above score"><input type="number" min="0" max="100" className={inputCls} value={general.autoConfirmAboveScore ?? ""} onChange={e => setGeneral({ ...general, autoConfirmAboveScore: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 mt-1">
          <input type="checkbox" checked={!!general.alertsEnabled} onChange={e => setGeneral({ ...general, alertsEnabled: e.target.checked })} />
          AI alerts enabled
        </label>
      </Card>

      <Card title="AI Data Sources">
        <Table
          columns={[
            { key: "name", label: "Name" },
            { key: "type", label: "Type" },
            { key: "endpoint", label: "Endpoint" },
            { key: "enabled", label: "Status", render: (s) => <Badge className={s.enabled ? "bg-green-50 text-green-600 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}>{s.enabled ? "Enabled" : "Disabled"}</Badge> },
          ]}
          rows={dataSources.map(s => ({ id: s._id, ...s }))}
          renderActions={(s) => (
            <div className="flex gap-1">
              <IconBtn icon={s.enabled ? Ban : CheckCheck} tone={s.enabled ? "danger" : "success"} title={s.enabled ? "Disable" : "Enable"} onClick={() => toggleDataSourceEnabled(s)} />
              <IconBtn icon={Trash2} tone="danger" title="Remove" onClick={() => removeDataSource(s)} />
            </div>
          )}
        />
        <div className="grid sm:grid-cols-3 gap-3 pt-3 mt-3 border-t border-gray-50">
          <input className={inputCls} placeholder="Name" value={newSource.name} onChange={e => setNewSource({ ...newSource, name: e.target.value })} />
          <input className={inputCls} placeholder="Type (e.g. Weather API)" value={newSource.type} onChange={e => setNewSource({ ...newSource, type: e.target.value })} />
          <input className={inputCls} placeholder="Endpoint URL" value={newSource.endpoint} onChange={e => setNewSource({ ...newSource, endpoint: e.target.value })} />
        </div>
        <PrimaryBtn onClick={addDataSource} icon={PlusCircle} className="mt-3">Add Data Source</PrimaryBtn>
      </Card>
    </div>
  );
}

const RESOURCE_CATEGORIES = ["Food", "Water", "Medical", "Clothing", "Bedding", "Equipment", "Other"];

function ResourceFormModal({ open, mode, initial, token, onClose, onSaved, showToast }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);
  if (!open) return null;

  async function submit() {
    if (!form.name.trim() || form.available === "") { showToast("Enter a name and quantity", "error"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), category: form.category,
        quantity: Number(form.available), unit: form.unit, lowStockThreshold: Number(form.required) || 0,
        notes: form.notes,
      };
      const res = mode === "edit"
        ? await api.resources.update(token, form._id, payload)
        : await api.resources.create(token, payload);
      onSaved(adapt.resource(res.data), mode);
      showToast(mode === "edit" ? "Resource updated" : "Resource added");
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "460px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">{mode === "edit" ? "Edit Resource" : "Add Resource"}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>
          <Field label="Name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category"><select className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{RESOURCE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Unit"><input className={inputCls} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="kg, boxes, units..." /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity available"><input type="number" className={inputCls} value={form.available} onChange={e => setForm({ ...form, available: e.target.value })} /></Field>
            <Field label="Low-stock threshold"><input type="number" className={inputCls} value={form.required} onChange={e => setForm({ ...form, required: e.target.value })} /></Field>
          </div>
          <Field label="Notes (optional)"><textarea rows={2} className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
          <PrimaryBtn onClick={submit} icon={mode === "edit" ? Pencil : PlusCircle} className="w-full" disabled={saving}>{saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Add Resource"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

const EMPTY_RESOURCE_FORM = { name: "", category: "Food", available: "", required: "", unit: "units", notes: "" };

function ResourcesView({ resources, setResources, token, role, showToast }) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("add");
  const [formInitial, setFormInitial] = useState(EMPTY_RESOURCE_FORM);

  const canManage = role === "Authority" || role === "Admin";
  const canDelete = role === "Admin";

  function openAdd() { setFormMode("add"); setFormInitial(EMPTY_RESOURCE_FORM); setFormOpen(true); }
  function openEdit(r) { setFormMode("edit"); setFormInitial({ _id: r._id, name: r.name, category: r.category, available: r.available, required: r.required, unit: r.unit || "units", notes: r.notes || "" }); setFormOpen(true); }
  function handleSaved(row, mode) {
    if (mode === "edit") setResources(resources.map(r => r._id === row._id ? row : r));
    else setResources([row, ...resources]);
  }

  async function adjust(r, delta) {
    try {
      const res = await api.resources.adjustQuantity(token, r._id, { change: delta });
      setResources(resources.map(x => x._id === r._id ? adapt.resource(res.data) : x));
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function remove(r) {
    try {
      await api.resources.remove(token, r._id);
      setResources(resources.filter(x => x._id !== r._id));
      showToast("Resource deleted");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Available vs Required">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={resources}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} angle={-12} textAnchor="end" height={55} />
              <YAxis stroke="#9ca3af" fontSize={10} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="available" name="Available" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="required" name="Required" fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Resource Inventory" action={canManage ? <PrimaryBtn icon={PlusCircle} onClick={openAdd}>Add Resource</PrimaryBtn> : undefined}>
        <Table
          columns={[
            { key: "name", label: "Resource" }, { key: "category", label: "Category" },
            {
              key: "available", label: "Available", render: r => canManage ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => adjust(r, -1)} className="h-5 w-5 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500 text-xs">-</button>
                  <span>{r.available}</span>
                  <button onClick={() => adjust(r, 1)} className="h-5 w-5 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500 text-xs">+</button>
                </div>
              ) : r.available
            },
            { key: "required", label: "Required" },
            { key: "s", label: "Status", render: r => r.available < r.required ? <Badge className={severityClasses("High")}>Low Stock</Badge> : <Badge className={statusClasses("Available")}>Sufficient</Badge> },
          ]}
          rows={resources}
          renderActions={canManage ? r => (
            <>
              <IconBtn icon={Pencil} title="Edit" onClick={() => openEdit(r)} />
              {canDelete && <IconBtn icon={Trash2} tone="danger" title="Delete" onClick={() => remove(r)} />}
            </>
          ) : undefined}
        />
      </Card>
      <ResourceFormModal open={formOpen} mode={formMode} initial={formInitial} token={token} onClose={() => setFormOpen(false)} onSaved={handleSaved} showToast={showToast} />
    </div>
  );
}

// Shelter photo evidence - same upload/delete pattern as EvidenceManager,
// repointed at the shelter image endpoints (see STATUS-REPORT Phase 2).
function ShelterEvidenceManager({ token, shelterId, images, canUpload, canDelete, onChange, showToast }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const res = await api.shelters.uploadImages(token, shelterId, files);
      onChange(res.data.images || []);
      showToast("Photo uploaded");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(imageUrl) {
    try {
      const res = await api.shelters.deleteImage(token, shelterId, imageUrl);
      onChange(res.data.images || []);
      showToast("Photo removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  return (
    <div>
      {images.length === 0 && <p className="text-xs text-gray-400 mb-3">No photos uploaded yet.</p>}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {images.map((url) => (
            <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
              <img src={API_ORIGIN + url} alt="Shelter" className="w-full h-full object-cover" />
              {canDelete && (
                <button onClick={() => handleDelete(url)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canUpload && (
        <>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={handleFiles} />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <Upload className="h-4 w-4 text-blue-500" />}
            {uploading ? "Uploading..." : "Upload Photo"}
          </button>
          <p className="text-[10px] text-gray-400 mt-1.5">JPEG, PNG, WEBP or GIF, up to 5MB each, 5 files max.</p>
        </>
      )}
    </div>
  );
}

function AddShelterModal({ open, token, onClose, onCreated, showToast, initial = null, title = "Add Shelter" }) {
  const [form, setForm] = useState({ name: "", location: "", lat: "", lng: "", capacity: "", contactPerson: "", contactPhone: "" });
  const [saving, setSaving] = useState(false);

  // Re-seed the form from `initial` every time the modal opens (e.g. opened
  // from an incident's "Add shelter record" action, prefilled with that
  // incident's location/coordinates) instead of once on mount.
  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        location: initial?.location || "",
        lat: initial?.lat != null ? String(initial.lat) : "",
        lng: initial?.lng != null ? String(initial.lng) : "",
        capacity: "",
        contactPerson: "",
        contactPhone: "",
      });
    }
  }, [open, initial]);

  if (!open) return null;

  async function submit() {
    if (!form.name.trim() || !form.location.trim() || !form.capacity) {
      showToast("Name, location and capacity are required", "error");
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
      };
      if (form.lat && form.lng) payload.coordinates = { lat: Number(form.lat), lng: Number(form.lng) };
      // When opened from an incident's "Add shelter record" action, link the
      // new shelter back to that incident (Shelter.relatedDisaster).
      if (initial?.disasterId) payload.relatedDisaster = initial.disasterId;
      const res = await api.shelters.create(token, payload);
      onCreated(adapt.shelter(res.data));
      showToast("Shelter added");
      setForm({ name: "", location: "", lat: "", lng: "", capacity: "", contactPerson: "", contactPhone: "" });
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>
          {initial?.disasterId && (
            <div className="mb-4 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
              This shelter will be linked to incident {initial.disasterLabel || initial.disasterId}.
            </div>
          )}
          <Field label="Name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Guwahati Community Hall" /></Field>
          <Field label="Location"><input className={inputCls} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="District / block name" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude (optional)"><input className={inputCls} value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} placeholder="26.14" /></Field>
            <Field label="Longitude (optional)"><input className={inputCls} value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} placeholder="91.73" /></Field>
          </div>
          <Field label="Capacity"><input type="number" className={inputCls} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="200" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact person"><input className={inputCls} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></Field>
            <Field label="Contact phone"><input className={inputCls} value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></Field>
          </div>
          <PrimaryBtn onClick={submit} icon={PlusCircle} className="w-full" disabled={saving}>{saving ? "Saving..." : "Add Shelter"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

const SHELTER_TABS = [
  { id: "details", label: "Details" },
  { id: "occupants", label: "Occupants" },
  { id: "supplies", label: "Supplies" },
  { id: "volunteers", label: "Volunteers" },
  { id: "problems", label: "Problems" },
  { id: "alerts", label: "Alerts" },
  { id: "audit", label: "Audit" },
];

// Full shelter management modal - covers everything in STATUS-REPORT Phase 2:
// edit details, approve/reject, occupancy, photos, facilities, occupants
// (assign/check-in/check-out/transfer), supplies, volunteer assignment,
// problems (report/resolve) and shelter alerts, plus audit history.
function ShelterManageModal({ shelter, token, role, can, volunteers = [], onClose, onChange, showToast }) {
  const [tab, setTab] = useState("details");
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  const [occupants, setOccupants] = useState(null);
  const [occForm, setOccForm] = useState({ citizenId: "", toShelterId: "", notes: "" });

  const [resources, setResourcesList] = useState(null);
  const [resForm, setResForm] = useState({ name: "", category: "Food", quantity: "", unit: "" });

  const [shelterVolunteers, setShelterVolunteers] = useState(null);
  const [pickedVolunteer, setPickedVolunteer] = useState("");

  const [problems, setProblems] = useState(null);
  const [problemForm, setProblemForm] = useState({ category: "Other", description: "", severity: "Medium" });

  const [audit, setAudit] = useState(null);
  const [alertForm, setAlertForm] = useState({ title: "", type: "Other", priority: "Medium", description: "" });

  useEffect(() => {
    if (!shelter) return;
    setEdit({
      name: shelter.name, location: shelter.location,
      capacity: shelter.capacity, contactPerson: shelter.contactPerson || "",
      contactPhone: shelter.contactPhone || "",
    });
    setTab("details");
    setOccupants(null); setResourcesList(null); setShelterVolunteers(null); setProblems(null); setAudit(null);
  }, [shelter && shelter._id]);

  useEffect(() => {
    if (!shelter) return;
    (async () => {
      try {
        if (tab === "occupants" && occupants === null) {
          const res = await api.shelters.getOccupants(token, shelter._id);
          setOccupants(res.data);
        } else if (tab === "supplies" && resources === null) {
          const res = await api.shelters.getResources(token, shelter._id);
          setResourcesList(res.data);
        } else if (tab === "volunteers" && shelterVolunteers === null) {
          const res = await api.shelters.getVolunteers(token, shelter._id);
          setShelterVolunteers(res.data);
        } else if (tab === "problems" && problems === null) {
          const res = await api.shelters.getProblems(token, shelter._id);
          setProblems(res.data);
        } else if (tab === "audit" && audit === null) {
          const res = await api.shelters.getAudit(token, shelter._id);
          setAudit(res.data);
        }
      } catch (err) {
        showToast(err.message, "error");
      }
    })();
  }, [tab, shelter && shelter._id]);

  if (!shelter || !edit) return null;

  async function saveDetails() {
    setSaving(true);
    try {
      const res = await api.shelters.update(token, shelter._id, {
        name: edit.name, location: edit.location,
        capacity: Number(edit.capacity), contactPerson: edit.contactPerson, contactPhone: edit.contactPhone,
      });
      onChange(adapt.shelter(res.data));
      showToast("Shelter updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFacility(key) {
    try {
      const res = await api.shelters.updateFacilities(token, shelter._id, { [key]: !shelter.resources[key] });
      onChange(adapt.shelter(res.data));
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function approve(decision) {
    try {
      const res = await api.shelters.approve(token, shelter._id, decision);
      onChange(adapt.shelter(res.data));
      showToast(`Shelter ${decision.toLowerCase()}`);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function doAssign() {
    if (!occForm.citizenId.trim()) return showToast("Enter a citizen user ID", "error");
    try {
      await api.shelters.assignCitizen(token, shelter._id, { citizenId: occForm.citizenId.trim(), notes: occForm.notes });
      const res = await api.shelters.getOccupants(token, shelter._id);
      setOccupants(res.data);
      showToast("Citizen assigned");
    } catch (err) { showToast(err.message, "error"); }
  }
  async function doCheckIn() {
    if (!occForm.citizenId.trim()) return showToast("Enter a citizen user ID", "error");
    try {
      const res = await api.shelters.checkIn(token, shelter._id, { citizenId: occForm.citizenId.trim(), notes: occForm.notes });
      onChange({ ...shelter, occupancy: shelter.occupancy + 1 });
      const occ = await api.shelters.getOccupants(token, shelter._id);
      setOccupants(occ.data);
      showToast("Checked in");
    } catch (err) { showToast(err.message, "error"); }
  }
  async function doCheckOut() {
    if (!occForm.citizenId.trim()) return showToast("Enter a citizen user ID", "error");
    try {
      await api.shelters.checkOut(token, shelter._id, { citizenId: occForm.citizenId.trim(), notes: occForm.notes });
      onChange({ ...shelter, occupancy: Math.max(0, shelter.occupancy - 1) });
      const occ = await api.shelters.getOccupants(token, shelter._id);
      setOccupants(occ.data);
      showToast("Checked out");
    } catch (err) { showToast(err.message, "error"); }
  }
  async function doTransfer() {
    if (!occForm.citizenId.trim() || !occForm.toShelterId.trim()) return showToast("Enter citizen user ID and destination shelter ID", "error");
    try {
      await api.shelters.transferCitizen(token, shelter._id, { citizenId: occForm.citizenId.trim(), toShelterId: occForm.toShelterId.trim() });
      const occ = await api.shelters.getOccupants(token, shelter._id);
      setOccupants(occ.data);
      showToast("Citizen transferred");
    } catch (err) { showToast(err.message, "error"); }
  }

  async function addResource() {
    if (!resForm.name.trim() || !resForm.quantity) return showToast("Enter item name and quantity", "error");
    try {
      const res = await api.shelters.addResource(token, shelter._id, {
        name: resForm.name.trim(), category: resForm.category, quantity: Number(resForm.quantity), unit: resForm.unit,
      });
      setResourcesList([res.data, ...(resources || [])]);
      setResForm({ name: "", category: "Food", quantity: "", unit: "" });
      showToast("Supply added");
    } catch (err) { showToast(err.message, "error"); }
  }
  async function adjustResource(r, delta) {
    const next = Math.max(0, r.quantity + delta);
    try {
      const res = await api.shelters.updateResource(token, shelter._id, r._id, { quantity: next });
      setResourcesList(resources.map(x => x._id === r._id ? res.data : x));
    } catch (err) { showToast(err.message, "error"); }
  }

  async function assignVolunteer() {
    if (!pickedVolunteer) return showToast("Pick a volunteer first", "error");
    try {
      await api.shelters.assignVolunteer(token, shelter._id, pickedVolunteer);
      const res = await api.shelters.getVolunteers(token, shelter._id);
      setShelterVolunteers(res.data);
      setPickedVolunteer("");
      showToast("Volunteer assigned");
    } catch (err) { showToast(err.message, "error"); }
  }

  async function submitProblem() {
    if (!problemForm.description.trim()) return showToast("Describe the problem first", "error");
    try {
      const res = await api.shelters.reportProblem(token, shelter._id, problemForm);
      setProblems([res.data, ...(problems || [])]);
      setProblemForm({ category: "Other", description: "", severity: "Medium" });
      showToast("Problem reported");
    } catch (err) { showToast(err.message, "error"); }
  }
  async function resolveProblem(p, status) {
    try {
      const res = await api.shelters.resolveProblem(token, shelter._id, p._id, { status });
      setProblems(problems.map(x => x._id === p._id ? res.data : x));
    } catch (err) { showToast(err.message, "error"); }
  }

  async function sendAlert() {
    if (!alertForm.title.trim()) return showToast("Enter an alert title", "error");
    try {
      await api.shelters.sendAlert(token, shelter._id, alertForm);
      setAlertForm({ title: "", type: "Other", priority: "Medium", description: "" });
      showToast("Alert sent to shelter occupants and volunteers");
    } catch (err) { showToast(err.message, "error"); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "720px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-gray-900">{shelter.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{shelter.id} · {shelter.location}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
          </div>

          {shelter.approvalStatus !== "Approved" && (
            <div className={"mb-3 px-3 py-2 rounded-lg text-xs font-medium " + (shelter.approvalStatus === "Pending" ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-red-50 text-red-700 border border-red-100")}>
              Approval status: {shelter.approvalStatus}
              {can.approveShelter && shelter.approvalStatus === "Pending" && (
                <span className="ml-3 inline-flex gap-2">
                  <button onClick={() => approve("Approved")} className="underline hover:no-underline">Approve</button>
                  <button onClick={() => approve("Rejected")} className="underline hover:no-underline">Reject</button>
                </span>
              )}
            </div>
          )}
          {shelter.deletionRequested && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-100">
              Deletion requested by managing Authority{can.deleteShelter && can.deleteShelter === SHELTER_SCOPE.FULL ? " - use Delete below to confirm." : "."}
            </div>
          )}
          {shelter.relatedDisaster && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
              Linked incident: {shelter.relatedDisaster.id || shelter.relatedDisaster}
              {shelter.relatedDisaster.type ? ` (${shelter.relatedDisaster.type})` : ""}
            </div>
          )}

          <div className="flex items-center gap-1 mb-4 border-b border-gray-100 overflow-x-auto">
            {SHELTER_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={"px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors " + (tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <div className="space-y-4">
              <Field label="Name"><input className={inputCls} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} disabled={!can.editShelter} /></Field>
              <Field label="Location"><input className={inputCls} value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })} disabled={!can.editShelter} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Capacity"><input type="number" className={inputCls} value={edit.capacity} onChange={e => setEdit({ ...edit, capacity: e.target.value })} disabled={!can.manageCapacity && !can.editShelter} /></Field>
                <Field label="Current occupancy"><input className={inputCls} value={shelter.occupancy} disabled /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact person"><input className={inputCls} value={edit.contactPerson} onChange={e => setEdit({ ...edit, contactPerson: e.target.value })} disabled={!can.editShelter} /></Field>
                <Field label="Contact phone"><input className={inputCls} value={edit.contactPhone} onChange={e => setEdit({ ...edit, contactPhone: e.target.value })} disabled={!can.editShelter} /></Field>
              </div>
              {can.editShelter && <PrimaryBtn onClick={saveDetails} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</PrimaryBtn>}

              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Facilities available</p>
                <div className="flex flex-wrap gap-2">
                  {["food", "water", "medical", "bedding"].map(key => (
                    <button key={key} onClick={() => can.manageFacilities && toggleFacility(key)} disabled={!can.manageFacilities}
                      className={"px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors " + (shelter.resources[key] ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-400 border-gray-200") + (can.manageFacilities ? " hover:opacity-80" : "")}>
                      {key}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Photos</p>
                <ShelterEvidenceManager
                  token={token} shelterId={shelter._id} images={shelter.images || []}
                  canUpload={can.editShelter} canDelete={can.editShelter}
                  onChange={(images) => onChange({ ...shelter, images })}
                  showToast={showToast}
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex gap-2">
                {can.deleteShelter === SHELTER_SCOPE.FULL && (
                  <GhostBtn icon={Trash2} onClick={async () => { try { await api.shelters.remove(token, shelter._id); showToast("Shelter deleted"); onClose(); onChange(null, shelter._id); } catch (err) { showToast(err.message, "error"); } }}>Delete Shelter</GhostBtn>
                )}
                {can.deleteShelter === SHELTER_SCOPE.REQUEST && !shelter.deletionRequested && (
                  <GhostBtn icon={Trash2} onClick={async () => { try { const res = await api.shelters.requestDeletion(token, shelter._id, "Requested from Shelter Management"); onChange(adapt.shelter(res.data)); showToast("Deletion requested"); } catch (err) { showToast(err.message, "error"); } }}>Request Deletion</GhostBtn>
                )}
              </div>
            </div>
          )}

          {tab === "occupants" && (
            <div className="space-y-4">
              {(can.citizenCheckInOut || can.assignShelter) && (
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Citizen user ID" value={occForm.citizenId} onChange={e => setOccForm({ ...occForm, citizenId: e.target.value })} />
                    <input className={inputCls} placeholder="Notes (optional)" value={occForm.notes} onChange={e => setOccForm({ ...occForm, notes: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {can.assignShelter && <GhostBtn onClick={doAssign}>Assign</GhostBtn>}
                    {can.citizenCheckInOut && <GhostBtn onClick={doCheckIn}>Check In</GhostBtn>}
                    {can.citizenCheckInOut && <GhostBtn onClick={doCheckOut}>Check Out</GhostBtn>}
                  </div>
                  {can.transferCitizen && (
                    <div className="flex gap-2 pt-1">
                      <input className={inputCls} placeholder="Destination shelter ID (Mongo _id)" value={occForm.toShelterId} onChange={e => setOccForm({ ...occForm, toShelterId: e.target.value })} />
                      <GhostBtn onClick={doTransfer}>Transfer</GhostBtn>
                    </div>
                  )}
                </div>
              )}
              {occupants === null ? <p className="text-xs text-gray-400">Loading...</p> : occupants.length === 0 ? <p className="text-xs text-gray-400">No occupant records yet.</p> : (
                <div className="space-y-1.5">
                  {occupants.map(o => (
                    <div key={o._id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                      <span className="font-medium text-gray-800">{o.citizen?.name || o.citizen}</span>
                      <Badge className={statusClasses(o.status)}>{o.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "supplies" && (
            <div className="space-y-4">
              {(can.manageFoodWater || can.manageMedicines) && (
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Item name" value={resForm.name} onChange={e => setResForm({ ...resForm, name: e.target.value })} />
                  <select className={inputCls} value={resForm.category} onChange={e => setResForm({ ...resForm, category: e.target.value })}>
                    <option>Food</option><option>Water</option><option>Medical</option>
                  </select>
                  <input type="number" className={inputCls} placeholder="Quantity" value={resForm.quantity} onChange={e => setResForm({ ...resForm, quantity: e.target.value })} />
                  <input className={inputCls} placeholder="Unit (kg, boxes...)" value={resForm.unit} onChange={e => setResForm({ ...resForm, unit: e.target.value })} />
                  <PrimaryBtn onClick={addResource} className="col-span-2">Add Supply</PrimaryBtn>
                </div>
              )}
              {resources === null ? <p className="text-xs text-gray-400">Loading...</p> : resources.length === 0 ? <p className="text-xs text-gray-400">No supplies logged yet.</p> : (
                <div className="space-y-1.5">
                  {resources.map(r => (
                    <div key={r._id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                      <div><span className="font-medium text-gray-800">{r.name}</span> <span className="text-xs text-gray-400">({r.category})</span></div>
                      <div className="flex items-center gap-2">
                        <span>{r.quantity} {r.unit}</span>
                        {(can.manageFoodWater || can.manageMedicines) && (
                          <>
                            <button onClick={() => adjustResource(r, -1)} className="h-6 w-6 rounded-md border border-gray-200 hover:bg-white text-gray-500">-</button>
                            <button onClick={() => adjustResource(r, 1)} className="h-6 w-6 rounded-md border border-gray-200 hover:bg-white text-gray-500">+</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "volunteers" && (
            <div className="space-y-4">
              {can.assignVolunteers && (
                <div className="flex gap-2">
                  <select className={inputCls} value={pickedVolunteer} onChange={e => setPickedVolunteer(e.target.value)}>
                    <option value="">Select an approved volunteer...</option>
                    {volunteers.filter(v => v.status === "Approved").map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
                  </select>
                  <GhostBtn onClick={assignVolunteer}>Assign</GhostBtn>
                </div>
              )}
              {shelterVolunteers === null ? <p className="text-xs text-gray-400">Loading...</p> : shelterVolunteers.length === 0 ? <p className="text-xs text-gray-400">No volunteers assigned yet.</p> : (
                <div className="space-y-1.5">
                  {shelterVolunteers.map(v => (
                    <div key={v._id} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm font-medium text-gray-800">{v.user?.name}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "problems" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select className={inputCls} value={problemForm.category} onChange={e => setProblemForm({ ...problemForm, category: e.target.value })}>
                    <option>Facility</option><option>Food</option><option>Water</option><option>Medical</option><option>Safety</option><option>Overcrowding</option><option>Other</option>
                  </select>
                  <select className={inputCls} value={problemForm.severity} onChange={e => setProblemForm({ ...problemForm, severity: e.target.value })}>
                    <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                  </select>
                </div>
                <textarea rows={2} className={inputCls} placeholder="Describe the problem" value={problemForm.description} onChange={e => setProblemForm({ ...problemForm, description: e.target.value })} />
                <GhostBtn onClick={submitProblem}>Report Problem</GhostBtn>
              </div>
              {problems === null ? <p className="text-xs text-gray-400">Loading...</p> : problems.length === 0 ? <p className="text-xs text-gray-400">No problems reported yet.</p> : (
                <div className="space-y-1.5">
                  {problems.map(p => (
                    <div key={p._id} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800">{p.description}</span>
                        <Badge className={statusClasses(p.status)}>{p.status}</Badge>
                      </div>
                      {can.resolveShelterProblems && p.status !== "Resolved" && (
                        <div className="flex gap-2 mt-1.5">
                          <button onClick={() => resolveProblem(p, "In Progress")} className="text-xs text-blue-600 underline hover:no-underline">Mark In Progress</button>
                          <button onClick={() => resolveProblem(p, "Resolved")} className="text-xs text-green-600 underline hover:no-underline">Resolve</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "alerts" && can.sendShelterAlerts && (
            <div className="space-y-3">
              <Field label="Title"><input className={inputCls} value={alertForm.title} onChange={e => setAlertForm({ ...alertForm, title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Type"><select className={inputCls} value={alertForm.type} onChange={e => setAlertForm({ ...alertForm, type: e.target.value })}>{["Flood", "Cyclone", "Earthquake", "Fire", "Landslide", "Other"].map(t => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Priority"><select className={inputCls} value={alertForm.priority} onChange={e => setAlertForm({ ...alertForm, priority: e.target.value })}>{["Low", "Medium", "High", "Critical"].map(t => <option key={t}>{t}</option>)}</select></Field>
              </div>
              <Field label="Message"><textarea rows={3} className={inputCls} value={alertForm.description} onChange={e => setAlertForm({ ...alertForm, description: e.target.value })} /></Field>
              <PrimaryBtn onClick={sendAlert} icon={Radio} className="w-full">Send Alert to Shelter</PrimaryBtn>
            </div>
          )}

          {tab === "audit" && (
            audit === null ? <p className="text-xs text-gray-400">Loading...</p> : audit.length === 0 ? <p className="text-xs text-gray-400">No activity logged yet.</p> : (
              <div className="space-y-1.5">
                {audit.map(a => (
                  <div key={a._id} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                    <span className="font-medium text-gray-700">{a.action.replace(/_/g, " ")}</span>
                    <span className="text-gray-400"> · {a.performedBy?.name || "system"} · {new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SheltersView({ disasters = [], shelters, setShelters, token, role, volunteers = [], showToast }) {
  const [manageTarget, setManageTarget] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const can = shelterPermissionsFor(role, [
    "addShelter", "editShelter", "manageCapacity", "approveShelter", "manageFacilities",
    "citizenCheckInOut", "assignShelter", "transferCitizen", "manageFoodWater", "manageMedicines",
    "assignVolunteers", "reportShelterProblem", "resolveShelterProblems", "sendShelterAlerts", "viewAuditHistory",
  ]);
  // deleteShelter needs the actual scope (FULL vs REQUEST), not just a boolean.
  const deleteScope = shelterPermissionsFor(role, ["deleteShelter"]).deleteShelter
    ? (role === "Admin" ? SHELTER_SCOPE.FULL : SHELTER_SCOPE.REQUEST)
    : SHELTER_SCOPE.NONE;
  can.deleteShelter = deleteScope;

  function handleChange(updated, removedId) {
    if (updated === null && removedId) {
      setShelters(shelters.filter(s => s._id !== removedId));
      return;
    }
    setShelters(shelters.map(s => s._id === updated._id ? { ...s, ...updated } : s));
    setManageTarget((t) => (t && t._id === updated._id ? { ...t, ...updated } : t));
  }

  return (
    <div className="space-y-5">
      <div style={{ height: 300 }}><AssamMap disasters={disasters} shelters={shelters} showShelters={true} /></div>
      <Card title="Shelter Management" action={can.addShelter ? <PrimaryBtn icon={PlusCircle} onClick={() => setAddOpen(true)}>Add Shelter</PrimaryBtn> : undefined}>
        <Table columns={[
          { key: "name", label: "Shelter" }, { key: "location", label: "Location" },
          { key: "capacity", label: "Occupancy", render: r => r.occupancy + "/" + r.capacity },
          {
            key: "status", label: "Status", render: r => (
              <div className="flex items-center gap-1.5">
                <Badge className={statusClasses(r.status)}>{r.status}</Badge>
                {r.approvalStatus === "Pending" && <Badge className="bg-amber-50 text-amber-700">Pending</Badge>}
              </div>
            )
          },
          { key: "contact", label: "Contact" },
        ]} rows={shelters} renderActions={r => (
          <IconBtn icon={Pencil} title="Manage" onClick={() => setManageTarget(r)} />
        )} />
      </Card>
      <AddShelterModal open={addOpen} token={token} onClose={() => setAddOpen(false)} onCreated={(s) => setShelters([s, ...shelters])} showToast={showToast} />
      <ShelterManageModal shelter={manageTarget} token={token} role={role} can={can} volunteers={volunteers} onClose={() => setManageTarget(null)} onChange={handleChange} showToast={showToast} />
    </div>
  );
}

function AnalyticsView({ resources, disasters = [], shelters = [], token }) {
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    if (!token) return;
    api.dashboard.trends(token).then((res) => setTrend(res.data || [])).catch(() => {});
  }, [token]);

  const disastersByType = React.useMemo(() => {
    const counts = {};
    disasters.forEach(d => { counts[d.type] = (counts[d.type] || 0) + 1; });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [disasters]);

  const trendData = React.useMemo(() => (
    trend.map(t => ({ month: new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), count: t.disasters }))
  ), [trend]);

  const shelterPie = React.useMemo(() => {
    const buckets = { Available: 0, "Almost Full": 0, Full: 0 };
    shelters.forEach(s => { if (buckets[s.status] !== undefined) buckets[s.status] += 1; });
    return Object.entries(buckets).map(([name, value]) => ({ name, value })).filter(b => b.value > 0);
  }, [shelters]);

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <GhostBtn icon={FileText}>Generate PDF</GhostBtn>
        <GhostBtn icon={TrendingUp}>Export CSV</GhostBtn>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Disasters by Type">
          <div className="h-56">
            {disastersByType.length === 0 ? <p className="text-sm text-gray-400 text-center py-16">No disaster reports yet.</p> : (
              <ResponsiveContainer width="100%" height="100%"><BarChart data={disastersByType}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="type" stroke="#9ca3af" fontSize={11} /><YAxis stroke="#9ca3af" fontSize={11} /><Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }} /><Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card title="Reports Trend (last 14 days)">
          <div className="h-56">
            {trendData.length === 0 ? <p className="text-sm text-gray-400 text-center py-16">No trend data available.</p> : (
              <ResponsiveContainer width="100%" height="100%"><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="month" stroke="#9ca3af" fontSize={10} /><YAxis stroke="#9ca3af" fontSize={10} /><Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }} /><Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card title="Resource Status">
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={resources}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="name" stroke="#9ca3af" fontSize={9} interval={0} angle={-15} textAnchor="end" height={55} /><YAxis stroke="#9ca3af" fontSize={10} /><Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }} /><Legend /><Bar dataKey="available" fill="#22c55e" radius={[3, 3, 0, 0]} /><Bar dataKey="required" fill="#f97316" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Shelter Occupancy">
          <div className="h-56">
            {shelterPie.length === 0 ? <p className="text-sm text-gray-400 text-center py-16">No shelter data available.</p> : (
              <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={shelterPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={{ fontSize: 10 }}>{shelterPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}</Pie><Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }} /></PieChart></ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CommunicationPanel({ token, alerts = [], setAlerts, showToast }) {
  const [form, setForm] = useState({ title: "", type: "Flood", location: "", priority: "Critical", message: "" });

  async function broadcast() {
    if (!form.message.trim() || !form.location.trim()) { showToast("Enter a message and location first", "error"); return; }
    try {
      const res = await api.alerts.create(token, {
        title: form.title.trim() || form.message.slice(0, 60),
        type: form.type,
        location: form.location,
        priority: form.priority,
        description: form.message,
      });
      if (setAlerts) setAlerts([adapt.alert(res.data), ...alerts]);
      setForm({ title: "", type: "Flood", location: "", priority: "Critical", message: "" });
      showToast("Emergency broadcast sent to all citizens");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Emergency Broadcast">
        <div className="p-4 rounded-xl bg-red-50 border border-red-100 mb-4">
          <p className="text-sm font-semibold text-red-800 flex items-center gap-2"><AlertCircle className="h-4 w-4" />This message will be sent to all registered citizens in Assam.</p>
        </div>
        <Field label="Title (optional)"><input className={inputCls} placeholder="e.g. Flood Warning - Guwahati" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type"><select className={inputCls} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{["Flood", "Cyclone", "Earthquake", "Landslide", "Fire", "Accident", "Other"].map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Priority"><select className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{["Low", "Medium", "High", "Critical"].map(t => <option key={t}>{t}</option>)}</select></Field>
        </div>
        <Field label="Location"><input className={inputCls} placeholder="District or block name" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Message"><textarea rows={4} className={inputCls} placeholder="Type your emergency message..." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} /></Field>
        <PrimaryBtn onClick={broadcast} icon={Radio} danger={true} className="w-full">Send Emergency Broadcast</PrimaryBtn>
      </Card>
      <Card title="Recent Alerts">
        <div className="space-y-2">
          {alerts.length === 0 && <p className="text-sm text-gray-400">No alerts sent yet.</p>}
          {alerts.map(a => (
            <div key={a.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-gray-900 font-semibold">{a.title}</p>
                <p className="text-xs text-gray-400 mt-1">{a.location} · {a.time}</p>
              </div>
              <Badge className={severityClasses(a.priority)}>{a.priority}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TaskList({ tasks, accept, reject, upload, complete }) {
  if (tasks.length === 0) return <p className="text-sm text-gray-400">No active tasks right now.</p>;
  return (
    <div className="space-y-3">
      {tasks.map(t => (
        <div key={t.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100 hover:border-blue-200 transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{t.task}</p>
              <p className="text-xs text-gray-400">{t.disaster} · {t.id}</p>
            </div>
            <Badge className={statusClasses(t.status)}>{t.status}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {t.status === "Assigned" && (
              <>
                <button onClick={() => accept(t.id)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700"><CheckCircle className="h-3.5 w-3.5" />Accept</button>
                <button onClick={() => reject(t.id)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100"><XCircle className="h-3.5 w-3.5" />Reject</button>
              </>
            )}
            {t.status === "In Progress" && (
              <>
                <button onClick={() => upload(t.id)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100"><Upload className="h-3.5 w-3.5" />{t.uploaded ? "Uploaded" : "Upload Report"}</button>
                <button onClick={() => complete(t.id)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-500 text-xs font-medium text-white hover:bg-green-600"><CheckCircle className="h-3.5 w-3.5" />Complete</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Landing({ onLogin, onGetStarted, mobileMenuOpen, setMobileMenuOpen }) {
  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/95 backdrop-blur shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 flex items-center justify-center shrink-0">
                <img src="/logo-shield.png" alt="Suraksha" className="h-9 w-9 object-contain" />
              </div>
              <div>
                <div className="text-base font-bold text-gray-900 leading-tight">Suraksha</div>
                <div className="text-[10px] text-gray-400 leading-tight">AI-Powered Disaster Intelligence</div>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-5">
              {["Home", "Features", "Roles", "How It Works"].map(l => <a key={l} href="#" className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors">{l}</a>)}
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <button onClick={onLogin} className="text-sm font-medium text-gray-500 hover:text-gray-900">Login</button>
              <button onClick={onLogin} className="h-9 px-4 rounded-lg bg-red-500 text-sm font-medium text-white hover:bg-red-600 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Emergency</button>
            </div>
            <button className="md:hidden text-gray-600" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-5 space-y-3">
            {["Home", "Features", "Roles"].map(l => <a key={l} href="#" className="block text-sm font-medium text-gray-600">{l}</a>)}
            <div className="pt-3 flex flex-col gap-2">
              <button onClick={onLogin} className="w-full text-center text-sm font-medium text-gray-700 border border-gray-200 rounded-lg py-2">Login</button>
              <button onClick={onLogin} className="w-full h-10 rounded-lg bg-red-500 text-sm font-medium text-white">Emergency SOS</button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0f1e3d] via-[#1a2f5a] to-[#162040] pt-20 pb-32 lg:pt-28 lg:pb-40">
          <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(255,255,255,0.03) 31px, rgba(255,255,255,0.03) 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, rgba(255,255,255,0.03) 31px, rgba(255,255,255,0.03) 32px)" }} />
          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-sm text-blue-200 mb-8" style={{ background: "rgba(255,255,255,0.05)" }}>
              <span className="h-2 w-2 rounded-full bg-red-400 mr-2 animate-pulse"></span>
              Live: Flood warning active in Brahmaputra Valley, Assam
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              <img src="/logo-wordmark.png" alt="Suraksha" className="mx-auto h-14 sm:h-16 lg:h-20 w-auto mb-3" />
              <span className="text-blue-400 block text-2xl sm:text-3xl lg:text-4xl">Assam Disaster Intelligence</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-blue-200 sm:text-lg">
              AI-powered platform connecting citizens, ASDMA authorities, volunteers and administrators for faster disaster response across Assam.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => onGetStarted("citizen")} className="w-full sm:w-auto h-12 px-8 rounded-xl bg-red-500 text-base font-semibold text-white shadow-lg hover:bg-red-600 transition-all flex items-center justify-center gap-2">
                <Siren className="h-5 w-5" />Report an Emergency
              </button>
              <button onClick={onLogin} className="w-full sm:w-auto h-12 px-8 rounded-xl border border-white/20 text-base font-medium text-white hover:opacity-90 transition-all" style={{ background: "rgba(255,255,255,0.1)" }}>
                Sign In to Dashboard
              </button>
              <button onClick={() => onGetStarted("citizen")} className="w-full sm:w-auto h-12 px-8 rounded-xl text-base font-medium text-blue-200 hover:text-white flex items-center justify-center">
                Create Account <ChevronRight className="ml-1 h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="py-20 bg-slate-50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold text-gray-900">Built for every stakeholder</h2>
              <p className="mt-2 text-gray-500">Create an account or sign in to access the dashboard built for your role.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {Object.entries(ROLE_META).map(([key, meta]) => (
                <div key={key} className="p-5 rounded-2xl bg-white border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all flex flex-col">
                  <div className={"mb-4 p-2.5 rounded-xl inline-flex " + meta.bg + " " + meta.color + " w-fit"}><meta.icon className="h-5 w-5" /></div>
                  <h3 className="font-semibold text-gray-900 mb-1">{meta.label}</h3>
                  <p className="text-xs text-gray-400 mb-4 flex-1">
                    {key === "citizen" && "Report incidents, view live alerts, find shelters and track rescue status."}
                    {key === "authority" && "Monitor Assam disaster situation, manage resources and coordinate ASDMA response."}
                    {key === "volunteer" && "View assigned tasks, accept rescue requests and upload field reports."}
                    {key === "admin" && "Manage users, configure AI thresholds, manage resources and run system analytics."}
                  </p>
                  <button onClick={() => (key === "admin" ? onLogin() : onGetStarted(key))} className={"text-xs font-semibold " + meta.color + " hover:underline flex items-center"}>
                    {key === "admin" ? "Admin Login" : "Get Started as " + meta.shortLabel} <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 bg-white py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-shield.png" alt="Suraksha" className="h-5 w-5 object-contain" />
            <span className="font-bold text-gray-900">Suraksha</span>
            <span className="text-gray-400 text-sm">· ASDMA Disaster Intelligence Platform</span>
          </div>
          <p className="text-xs text-gray-400">&copy; 2026 Assam State Disaster Management Authority. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}

function AuthPage({ authMode, setAuthMode, initialRole, onBack, onLogin, onRegister, error, busy }) {
  const [selectedRole, setSelectedRole] = useState(initialRole || "citizen");
  const [form, setForm] = useState({ name: "", email: "", password: "", district: "" });

  useEffect(() => {
    if (initialRole) setSelectedRole(initialRole);
  }, [initialRole]);

  // Admin accounts can't be self-registered (the backend only allows
  // Citizen/Volunteer/Authority on /auth/register); Admin is login-only.
  const registerRoles = Object.entries(ROLE_META).filter(([key]) => key !== "admin");

  function submit() {
    if (authMode === "login") {
      if (!form.email.trim() || !form.password) return;
      onLogin(form.email.trim(), form.password);
    } else {
      if (!form.name.trim() || !form.email.trim() || !form.password) return;
      onRegister({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        district: form.district.trim(),
        role: KEY_TO_ROLE[selectedRole],
      });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative" style={{ background: "linear-gradient(135deg, #0f1e3d, #1a2f5a)" }}>
      <button onClick={onBack} className="absolute top-6 left-6 inline-flex items-center text-sm text-blue-300 hover:text-white">
        <ArrowLeft className="h-4 w-4 mr-1" />Back
      </button>
      <div className="w-full max-w-md bg-white border border-gray-100 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="h-10 w-10 flex items-center justify-center">
            <img src="/logo-shield.png" alt="Suraksha" className="h-10 w-10 object-contain" />
          </div>
          <div><div className="text-base font-bold text-gray-900">Suraksha</div><div className="text-[10px] text-gray-400">AI-Powered Disaster Intelligence</div></div>
        </div>
        <div className="flex rounded-xl bg-gray-100 p-1 mb-5">
          {["login", "register"].map(m => (
            <button key={m} onClick={() => setAuthMode(m)} className={"flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize " + (authMode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}>{m === "login" ? "Login" : "Register"}</button>
          ))}
        </div>
        {authMode === "register" && (
          <div className="mb-5">
            <span className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Select Role</span>
            <div className="grid grid-cols-2 gap-2">
              {registerRoles.map(([key, meta]) => (
                <button key={key} onClick={() => setSelectedRole(key)} className={"flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-colors " + (selectedRole === key ? meta.bg + " " + meta.color + " " + meta.ring : "border-gray-200 text-gray-500 hover:bg-gray-50")}>
                  <meta.icon className="h-3.5 w-3.5" />{meta.shortLabel}
                </button>
              ))}
            </div>
          </div>
        )}
        {authMode === "register" && <Field label="Full Name"><input className={inputCls} placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>}
        <Field label="Email"><input type="email" className={inputCls} placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        {authMode === "register" && <Field label="District / Location"><input className={inputCls} placeholder="District, Assam" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} /></Field>}
        <Field label="Password"><input type="password" className={inputCls} placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} onKeyDown={e => e.key === "Enter" && submit()} /></Field>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}
        {authMode === "login" && (
          <div className="flex justify-between mb-5 text-xs">
            <label className="flex items-center gap-1.5 text-gray-500"><input type="checkbox" className="rounded" />Remember me</label>
            <a href="#" className="text-blue-500 hover:underline">Forgot password?</a>
          </div>
        )}
        <button onClick={submit} disabled={busy} className="w-full h-10 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60">
          {busy ? "Please wait…" : authMode === "login" ? "Login to Dashboard" : "Create Account"}
        </button>
        <p className="text-xs text-center text-gray-400 mt-4">Connects to the Suraksha API - use a seeded account or register a new one.</p>
      </div>
    </div>
  );
}
