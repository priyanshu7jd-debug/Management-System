import React, { useState, useEffect } from "react";
import { Building2, CheckCircle, XCircle, Upload, MapPin, Phone, FileText, ChevronRight, Globe, X, Ban, ShieldCheck, ShieldAlert, Trash2, Pencil, Settings2 } from "lucide-react";
import { api, adapt } from "../lib/api";

const inputCls = "w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors";

const NGO_TYPES = ["Relief & Rescue", "Medical & Health", "Food & Water", "Rescue & Evacuation", "Shelter Management", "Rehabilitation", "General Relief"];
const ASSAM_DISTRICTS = ["Kamrup", "Nalbari", "Barpeta", "Dhubri", "Darrang", "Sonitpur", "Jorhat", "Dibrugarh", "Silchar", "Karbi Anglong", "All Districts"];

const EMPTY_FORM = {
  name: "", type: NGO_TYPES[0], regNo: "", area: "", activities: "", contact: "", email: "", website: "", bankName: "", ifsc: "", account: ""
};

function fmt(n) {
  if (n >= 100000) return "Rs " + (n / 100000).toFixed(1) + "L";
  return "Rs " + (n / 1000).toFixed(0) + "K";
}

function ModalShell({ onClose, maxWidth = "480px", children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const NGO_STATUS_BADGE = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-green-50 text-green-700 border-green-200",
  Rejected: "bg-gray-100 text-gray-500 border-gray-200",
};

const NGO_MANAGE_TABS = [
  { id: "verification", label: "Verification" },
  { id: "details", label: "Details" },
  { id: "assign", label: "Assign" },
  { id: "services", label: "Services" },
  { id: "audit", label: "Audit" },
];

// Full staff-side NGO management: approve/reject, document + identity
// verification, suspend/deactivate/delete (all Admin-only per
// ngoRoutes.js), edit details, disaster/shelter/area assignment, service
// catalog, and the audit trail. Authority sees the same tabs but only the
// actions the backend actually grants them (assign, edit/services if
// assigned, everything else read-only).
function NgoManageModal({ ngoRow, token, isAdmin, currentUserId, disasters = [], shelters = [], onClose, onChange, onDeleted, showToast }) {
  const [tab, setTab] = useState("verification");
  const [ngo, setNgo] = useState(ngoRow);
  const [loading, setLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [areaInput, setAreaInput] = useState("");
  const [pickedDisaster, setPickedDisaster] = useState("");
  const [pickedShelter, setPickedShelter] = useState("");
  const [serviceForm, setServiceForm] = useState({ name: "", description: "" });
  const [audit, setAudit] = useState(null);

  const isAssigned = ngo && (ngo.assignedAuthorities || []).some((a) => a._id === currentUserId);
  const canEditDetails = isAdmin || isAssigned;

  useEffect(() => {
    setTab("verification");
    setNgo(ngoRow);
    setEditForm(null);
    setAudit(null);
    setReviewNotes(ngoRow?.reviewNotes || "");
  }, [ngoRow && ngoRow._id]);

  // Fetch the full (populated) record once, so Assign/Details/Audit have
  // real names instead of bare ids.
  useEffect(() => {
    if (!ngoRow) return;
    setLoading(true);
    api.ngos
      .getById(token, ngoRow._id)
      .then((res) => setNgo(adapt.ngo(res.data)))
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ngoRow && ngoRow._id]);

  useEffect(() => {
    if (!ngo || tab !== "audit" || audit !== null) return;
    api.ngos.getAudit(token, ngo._id).then((res) => setAudit(res.data)).catch((err) => showToast(err.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ngo && ngo._id]);

  if (!ngoRow) return null;

  function apply(updated) {
    setNgo(updated);
    onChange(updated);
  }

  async function doStatus(status) {
    try {
      const res = await api.ngos.updateStatus(token, ngo._id, { status, reviewNotes });
      apply(adapt.ngo(res.data));
      showToast("NGO " + status.toLowerCase());
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function toggleDocsVerified() {
    try {
      const res = await api.ngos.verifyDocuments(token, ngo._id, { verified: !ngo.documentsVerified });
      apply(adapt.ngo(res.data));
      showToast(ngo.documentsVerified ? "Document verification revoked" : "Documents verified");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function toggleIdentityVerified() {
    try {
      const res = await api.ngos.verifyIdentity(token, ngo._id, { verified: !ngo.identityVerified });
      apply(adapt.ngo(res.data));
      showToast(ngo.identityVerified ? "Identity verification revoked" : "Identity verified");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function doSuspend() {
    try {
      const res = await api.ngos.suspend(token, ngo._id, { reason: suspendReason });
      apply(adapt.ngo(res.data));
      setSuspendReason("");
      showToast("NGO suspended");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function doUnsuspend() {
    try {
      const res = await api.ngos.unsuspend(token, ngo._id);
      apply(adapt.ngo(res.data));
      showToast("Suspension lifted");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function toggleActive() {
    try {
      const res = await api.ngos.deactivate(token, ngo._id, { isActive: !ngo.isActive });
      apply(adapt.ngo(res.data));
      showToast(ngo.isActive ? "NGO deactivated" : "NGO reactivated");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function doDelete() {
    if (!window.confirm(`Permanently delete "${ngo.name}"? This can't be undone.`)) return;
    try {
      await api.ngos.remove(token, ngo._id);
      showToast("NGO deleted");
      onDeleted(ngo._id);
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function startEdit() {
    setEditForm({
      name: ngo.name, type: ngo.type, registrationNumber: ngo.registrationNumber,
      areaOfOperation: ngo.areaOfOperation, activities: ngo.activities,
      contactPhone: ngo.contactPhone, contactEmail: ngo.contactEmail, website: ngo.website,
      bankName: ngo.bankName, ifsc: ngo.ifsc, accountNumber: ngo.accountNumber,
    });
  }
  async function saveEdit() {
    try {
      const res = await api.ngos.update(token, ngo._id, editForm);
      apply(adapt.ngo(res.data));
      setEditForm(null);
      showToast("NGO details updated");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function addDisasterAssignment() {
    if (!pickedDisaster) return;
    try {
      const res = await api.ngos.assign(token, ngo._id, { disasters: { add: [pickedDisaster] } });
      apply(adapt.ngo(res.data));
      setPickedDisaster("");
      showToast("Disaster assignment added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function removeDisasterAssignment(id) {
    try {
      const res = await api.ngos.assign(token, ngo._id, { disasters: { remove: [id] } });
      apply(adapt.ngo(res.data));
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function addShelterAssignment() {
    if (!pickedShelter) return;
    try {
      const res = await api.ngos.assign(token, ngo._id, { shelters: { add: [pickedShelter] } });
      apply(adapt.ngo(res.data));
      setPickedShelter("");
      showToast("Shelter assignment added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function removeShelterAssignment(id) {
    try {
      const res = await api.ngos.assign(token, ngo._id, { shelters: { remove: [id] } });
      apply(adapt.ngo(res.data));
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function addAreaAssignment() {
    if (!areaInput.trim()) return;
    try {
      const res = await api.ngos.assign(token, ngo._id, { areas: { add: [areaInput.trim()] } });
      apply(adapt.ngo(res.data));
      setAreaInput("");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function removeAreaAssignment(area) {
    try {
      const res = await api.ngos.assign(token, ngo._id, { areas: { remove: [area] } });
      apply(adapt.ngo(res.data));
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function addService() {
    if (!serviceForm.name.trim()) return showToast("Enter a service name", "error");
    try {
      const services = [...(ngo.services || []), { name: serviceForm.name.trim(), description: serviceForm.description.trim(), active: true }];
      const res = await api.ngos.updateServices(token, ngo._id, { services });
      apply(adapt.ngo(res.data));
      setServiceForm({ name: "", description: "" });
      showToast("Service added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function toggleService(idx) {
    try {
      const services = ngo.services.map((s, i) => (i === idx ? { ...s, active: !s.active } : s));
      const res = await api.ngos.updateServices(token, ngo._id, { services });
      apply(adapt.ngo(res.data));
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function removeService(idx) {
    try {
      const services = ngo.services.filter((_, i) => i !== idx);
      const res = await api.ngos.updateServices(token, ngo._id, { services });
      apply(adapt.ngo(res.data));
      showToast("Service removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  const canManageServices = isAdmin || isAssigned;

  return (
    <ModalShell onClose={onClose} maxWidth="640px">
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">{ngo.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{ngo.id} - {ngo.type}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border " + (NGO_STATUS_BADGE[ngo.status] || "bg-gray-100 text-gray-500 border-gray-200")}>{ngo.status}</span>
          {!ngo.isActive && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-gray-100 text-gray-500 border-gray-200">Deactivated</span>}
          {ngo.suspended && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-red-50 text-red-700 border-red-200">Suspended</span>}
          {ngo.documentsVerified && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200"><ShieldCheck className="h-2.5 w-2.5" />Docs Verified</span>}
          {ngo.identityVerified && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200"><ShieldCheck className="h-2.5 w-2.5" />Identity Verified</span>}
        </div>

        <div className="flex items-center gap-1 mb-4 border-b border-gray-100 overflow-x-auto">
          {NGO_MANAGE_TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={"px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors " + (tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-xs text-gray-400 mb-3">Loading latest details...</p>}

        {tab === "verification" && (
          <div className="space-y-4">
            {ngo.status === "Pending" && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 space-y-2">
                <p className="text-xs font-semibold text-amber-700">Awaiting ASDMA verification</p>
                <textarea rows={2} className={inputCls} placeholder="Review notes (optional)" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
                {isAdmin ? (
                  <div className="flex gap-2">
                    <button onClick={() => doStatus("Approved")} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-500 text-xs font-medium text-white hover:bg-green-600"><CheckCircle className="h-3.5 w-3.5" />Approve</button>
                    <button onClick={() => doStatus("Rejected")} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"><XCircle className="h-3.5 w-3.5" />Reject</button>
                  </div>
                ) : <p className="text-[11px] text-amber-600">Only an Admin can approve or reject a registration.</p>}
              </div>
            )}
            {ngo.reviewNotes && <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Last review note: </span>{ngo.reviewNotes}</p>}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                <div><p className="text-xs font-semibold text-gray-700">Document Verification</p><p className="text-[11px] text-gray-400">{ngo.documentsVerified ? "Verified" : "Not verified"}</p></div>
                {isAdmin && <button onClick={toggleDocsVerified} className={"h-7 px-2.5 rounded-lg text-[11px] font-semibold border " + (ngo.documentsVerified ? "border-gray-200 text-gray-500 hover:bg-gray-50" : "border-blue-200 text-blue-600 hover:bg-blue-50")}>{ngo.documentsVerified ? "Revoke" : "Verify"}</button>}
              </div>
              <div className="p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                <div><p className="text-xs font-semibold text-gray-700">Identity Verification</p><p className="text-[11px] text-gray-400">{ngo.identityVerified ? "Verified" : "Not verified"}</p></div>
                {isAdmin && <button onClick={toggleIdentityVerified} className={"h-7 px-2.5 rounded-lg text-[11px] font-semibold border " + (ngo.identityVerified ? "border-gray-200 text-gray-500 hover:bg-gray-50" : "border-blue-200 text-blue-600 hover:bg-blue-50")}>{ngo.identityVerified ? "Revoke" : "Verify"}</button>}
              </div>
            </div>

            {ngo.documents && ngo.documents.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Submitted Documents</p>
                <div className="flex flex-wrap gap-1.5">
                  {ngo.documents.map((d, i) => <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-[11px] text-gray-600"><FileText className="h-3 w-3" />{d}</span>)}
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <p className="text-xs font-semibold text-gray-600">Standing / Lifecycle</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={toggleActive} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    {ngo.isActive ? <><Ban className="h-3.5 w-3.5" />Deactivate</> : <><CheckCircle className="h-3.5 w-3.5" />Reactivate</>}
                  </button>
                  {ngo.suspended ? (
                    <button onClick={doUnsuspend} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-green-200 text-xs font-medium text-green-700 hover:bg-green-50"><ShieldCheck className="h-3.5 w-3.5" />Lift Suspension</button>
                  ) : (
                    <button onClick={doDelete} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                  )}
                </div>
                {!ngo.suspended && (
                  <div className="flex gap-2">
                    <input className={inputCls + " mb-0"} placeholder="Suspension reason" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
                    <button onClick={doSuspend} className="h-9 px-3 shrink-0 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50 inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" />Suspend</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "details" && (
          editForm ? (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Name"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
                <Field label="Type"><select className={inputCls} value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>{NGO_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Registration Number"><input className={inputCls} value={editForm.registrationNumber} onChange={(e) => setEditForm({ ...editForm, registrationNumber: e.target.value })} /></Field>
                <Field label="Area of Operation"><input className={inputCls} value={editForm.areaOfOperation} onChange={(e) => setEditForm({ ...editForm, areaOfOperation: e.target.value })} /></Field>
                <Field label="Contact Phone"><input className={inputCls} value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} /></Field>
                <Field label="Contact Email"><input className={inputCls} value={editForm.contactEmail} onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })} /></Field>
                <Field label="Website"><input className={inputCls} value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} /></Field>
                <Field label="Bank Name"><input className={inputCls} value={editForm.bankName} onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })} /></Field>
                <Field label="IFSC"><input className={inputCls} value={editForm.ifsc} onChange={(e) => setEditForm({ ...editForm, ifsc: e.target.value })} /></Field>
                <Field label="Account Number"><input className={inputCls} value={editForm.accountNumber} onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })} /></Field>
              </div>
              <Field label="Activities"><textarea rows={2} className={inputCls} value={editForm.activities} onChange={(e) => setEditForm({ ...editForm, activities: e.target.value })} /></Field>
              <div className="flex gap-2">
                <button onClick={() => setEditForm(null)} className="flex-1 h-9 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={saveEdit} className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white">Save Changes</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div><span className="text-gray-400">Registration No.</span><div className="font-semibold text-gray-800">{ngo.registrationNumber}</div></div>
                <div><span className="text-gray-400">Area of Operation</span><div className="font-semibold text-gray-800">{ngo.areaOfOperation || "-"}</div></div>
                <div><span className="text-gray-400">Contact</span><div className="font-semibold text-gray-800">{ngo.contactEmail} {ngo.contactPhone && "· " + ngo.contactPhone}</div></div>
                <div><span className="text-gray-400">Website</span><div className="font-semibold text-gray-800">{ngo.website || "-"}</div></div>
                <div><span className="text-gray-400">Registered By</span><div className="font-semibold text-gray-800">{ngo.registeredBy || "-"}</div></div>
                <div><span className="text-gray-400">Bank</span><div className="font-semibold text-gray-800">{ngo.bankName ? `${ngo.bankName} · ${ngo.ifsc}` : "-"}</div></div>
              </div>
              <p className="text-xs text-gray-600">{ngo.activities || "No activities description provided."}</p>
              {canEditDetails ? (
                <button onClick={startEdit} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"><Pencil className="h-3 w-3" />Edit Details</button>
              ) : (
                <p className="text-[11px] text-gray-400">Only an Admin, or an Authority assigned to this NGO, can edit its details.</p>
              )}
            </div>
          )
        )}

        {tab === "assign" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Disaster Responses</p>
              <div className="flex gap-2 mb-2">
                <select className={inputCls + " mb-0"} value={pickedDisaster} onChange={(e) => setPickedDisaster(e.target.value)}>
                  <option value="">Add a disaster response...</option>
                  {disasters.map((d) => <option key={d._id} value={d._id}>{d.type} - {d.location}</option>)}
                </select>
                <button onClick={addDisasterAssignment} className="h-9 px-3 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white">Add</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(ngo.assignedDisasters || []).length === 0 && <span className="text-xs text-gray-300">None assigned.</span>}
                {(ngo.assignedDisasters || []).map((d) => (
                  <span key={d._id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-700">
                    {d.label || d._id}
                    <button onClick={() => removeDisasterAssignment(d._id)} className="hover:text-blue-900"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Shelters</p>
              <div className="flex gap-2 mb-2">
                <select className={inputCls + " mb-0"} value={pickedShelter} onChange={(e) => setPickedShelter(e.target.value)}>
                  <option value="">Add a shelter...</option>
                  {shelters.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
                <button onClick={addShelterAssignment} className="h-9 px-3 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white">Add</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(ngo.assignedShelters || []).length === 0 && <span className="text-xs text-gray-300">None assigned.</span>}
                {(ngo.assignedShelters || []).map((s) => (
                  <span key={s._id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-700">
                    {s.label || s._id}
                    <button onClick={() => removeShelterAssignment(s._id)} className="hover:text-blue-900"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Areas</p>
              <div className="flex gap-2 mb-2">
                <select className={inputCls + " mb-0"} value={areaInput} onChange={(e) => setAreaInput(e.target.value)}>
                  <option value="">Add a district...</option>
                  {ASSAM_DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                </select>
                <button onClick={addAreaAssignment} className="h-9 px-3 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white">Add</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(ngo.assignedAreas || []).length === 0 && <span className="text-xs text-gray-300">None assigned.</span>}
                {(ngo.assignedAreas || []).map((a) => (
                  <span key={a} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-700">
                    {a}
                    <button onClick={() => removeAreaAssignment(a)} className="hover:text-blue-900"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "services" && (
          <div className="space-y-3">
            {(ngo.services || []).length === 0 && <p className="text-xs text-gray-400">No services listed yet.</p>}
            <div className="space-y-1.5">
              {(ngo.services || []).map((s, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{s.name}</p>
                    {s.description && <p className="text-[11px] text-gray-500">{s.description}</p>}
                  </div>
                  {canManageServices && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleService(i)} className={"px-2 py-0.5 rounded-full text-[10px] font-bold border " + (s.active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200")}>{s.active ? "Active" : "Inactive"}</button>
                      <button onClick={() => removeService(i)} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {canManageServices ? (
              <div className="flex gap-2 pt-1">
                <input className={inputCls + " mb-0"} placeholder="Service name" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} />
                <input className={inputCls + " mb-0"} placeholder="Description (optional)" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} />
                <button onClick={addService} className="h-9 px-3 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white">Add</button>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">Only an Admin, or an Authority assigned to this NGO, can manage its services.</p>
            )}
          </div>
        )}

        {tab === "audit" && (
          audit === null ? <p className="text-xs text-gray-400">Loading...</p> : audit.length === 0 ? <p className="text-xs text-gray-400">No activity logged yet.</p> : (
            <div className="space-y-1.5">
              {audit.map((a, i) => (
                <div key={a._id || i} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <span className="font-medium text-gray-700">{a.action}</span>
                  <span className="text-gray-400"> · {a.performedBy?.name || "system"} ({a.performedByRole}) · {new Date(a.createdAt).toLocaleString()}</span>
                  {a.notes && <p className="text-gray-500 mt-0.5">{a.notes}</p>}
                </div>
              ))}
              {!isAdmin && <p className="text-[11px] text-gray-400 pt-1">Showing the most recent entries. Full history is visible to Admin.</p>}
            </div>
          )
        )}
      </div>
    </ModalShell>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold text-gray-600 mb-1 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

export default function NGOView({ userRole, token, currentUserId, disasters = [], shelters = [], showToast }) {
  const isAdmin = userRole === "admin";
  const isStaff = userRole === "authority" || userRole === "admin";
  const [tab, setTab] = useState(isStaff ? "manage" : "register");
  const [approvedNgos, setApprovedNgos] = useState([]);
  const [staffNgos, setStaffNgos] = useState([]);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(isStaff);
  const [manageTarget, setManageTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function loadApproved() {
    if (!token) return;
    setLoadingDirectory(true);
    api.ngos
      .list(token, { status: "Approved" })
      .then((res) => setApprovedNgos(res.data.map(adapt.ngo)))
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setLoadingDirectory(false));
  }

  // Full management queue for staff - Authority sees this too (assign/edit-
  // if-assigned are theirs to use even though approve/reject/verify/suspend/
  // delete stay Admin-only, gated inside the manage modal).
  function loadStaffNgos() {
    if (!token || !isStaff) return;
    setLoadingQueue(true);
    api.ngos
      .list(token, statusFilter ? { status: statusFilter } : {})
      .then((res) => setStaffNgos(res.data.map(adapt.ngo)))
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setLoadingQueue(false));
  }

  useEffect(() => {
    loadApproved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    loadStaffNgos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isStaff, statusFilter]);

  function handleNgoChanged(updated) {
    setStaffNgos((list) => list.map((n) => (n._id === updated._id ? updated : n)));
    setManageTarget(updated);
    if (updated.status === "Approved" || approvedNgos.some((n) => n._id === updated._id)) loadApproved();
  }
  function handleNgoDeleted(id) {
    setStaffNgos((list) => list.filter((n) => n._id !== id));
    setApprovedNgos((list) => list.filter((n) => n._id !== id));
  }

  async function quickApprove(id) {
    try {
      const res = await api.ngos.updateStatus(token, id, { status: "Approved" });
      showToast("NGO approved");
      setStaffNgos((list) => list.map((n) => (n._id === id ? adapt.ngo(res.data) : n)));
      loadApproved();
    } catch (err) {
      showToast(err.message, "error");
    }
  }
  async function quickReject(id) {
    try {
      const res = await api.ngos.updateStatus(token, id, { status: "Rejected" });
      showToast("NGO rejected");
      setStaffNgos((list) => list.map((n) => (n._id === id ? adapt.ngo(res.data) : n)));
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function submitRegistration() {
    if (!form.name.trim() || !form.regNo.trim() || !form.email.trim()) return;
    setSubmitting(true);
    try {
      await api.ngos.register(token, {
        name: form.name,
        type: form.type,
        registrationNumber: form.regNo,
        areaOfOperation: form.area,
        activities: form.activities,
        contactPhone: form.contact,
        contactEmail: form.email,
        website: form.website,
        bankName: form.bankName,
        ifsc: form.ifsc,
        accountNumber: form.account,
      });
      setSubmitted(true);
      loadStaffNgos();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }

  }

  const tabs = [
    ...(isStaff ? [
      { id: "manage", label: "Manage NGOs", count: statusFilter === "Pending" ? staffNgos.length : undefined },
    ] : []),
    { id: "directory", label: "Verified NGOs" },
    ...(isStaff ? [{ id: "register", label: "Register NGO" }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">NGO and Organization Registry</h2>
            <p className="text-xs text-gray-400 mt-0.5">Register, verify and manage disaster-relief organizations</p>
          </div>
        </div>

        <div className="flex rounded-xl bg-gray-100 p-1 mb-5 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={"px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 " + (tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
              {t.label}
              {t.count !== undefined && t.count > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.count}</span>}
            </button>
          ))}
        </div>

        {tab === "manage" && isStaff && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500">Review registrations, verify documents/identity, and manage assignment, services and standing.</p>
              <select className={inputCls + " mb-0 w-40"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="">All</option>
              </select>
            </div>
            {loadingQueue ? (
              <div className="text-center py-8 text-sm text-gray-400">Loading...</div>
            ) : (
              <>
                {staffNgos.map(n => (
                  <div key={n._id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="text-sm font-bold text-gray-900">{n.name}</span>
                          <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border " + (NGO_STATUS_BADGE[n.status] || "bg-gray-100 text-gray-500 border-gray-200")}>{n.status}</span>
                          {n.suspended && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-red-50 text-red-700 border-red-200">Suspended</span>}
                          {!n.isActive && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-gray-100 text-gray-500 border-gray-200">Deactivated</span>}
                          {n.documentsVerified && <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />}
                        </div>
                        <p className="text-xs text-gray-500">{n.type} · {n.areaOfOperation}</p>
                        <p className="text-xs text-gray-400 mt-1">Reg: {n.registrationNumber} | Contact: {n.contactEmail}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {isAdmin && n.status === "Pending" && (
                          <>
                            <button onClick={() => quickApprove(n._id)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-500 text-xs font-medium text-white hover:bg-green-600">
                              <CheckCircle className="h-3.5 w-3.5" />Approve
                            </button>
                            <button onClick={() => quickReject(n._id)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
                              <XCircle className="h-3.5 w-3.5" />Reject
                            </button>
                          </>
                        )}
                        <button onClick={() => setManageTarget(n)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
                          <Settings2 className="h-3.5 w-3.5" />Manage
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {staffNgos.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
                    <p className="text-sm">No NGOs match this filter.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "directory" && (
          <div className="space-y-4">
            {loadingDirectory ? (
              <div className="text-center py-8 text-sm text-gray-400">Loading...</div>
            ) : approvedNgos.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">No verified NGOs yet.</div>
            ) : (
              approvedNgos.map(n => (
                <div key={n._id} className="border border-gray-100 rounded-2xl overflow-hidden hover:border-blue-200 transition-colors">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="text-sm font-bold text-gray-900">{n.name}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            ASDMA Verified
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{n.type} • Reg: {n.registrationNumber}</p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3 mb-3">
                      <div className="text-center p-3 bg-blue-50 rounded-xl">
                        <div className="text-lg font-bold text-blue-600">{n.campaignCount}</div>
                        <div className="text-[10px] text-gray-500">Campaigns</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-xl">
                        <div className="text-lg font-bold text-green-600">{fmt(n.totalRaised)}</div>
                        <div className="text-[10px] text-gray-500">Total Raised</div>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-xl">
                        <div className="text-lg font-bold text-purple-600">{n.totalDonors.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-500">Total Donors</div>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-gray-600 mb-3">
                      <div className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" /><span>{n.areaOfOperation}</span></div>
                      <div className="flex items-start gap-2"><FileText className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" /><span>{n.activities}</span></div>
                      {n.contactPhone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" /><span>{n.contactPhone}</span></div>}
                      {n.website && <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-gray-400" /><a href={"https://" + n.website} className="text-blue-500 hover:underline">{n.website}</a></div>}
                    </div>

                    <button className="text-xs text-blue-500 hover:underline font-medium flex items-center gap-1">
                      View Campaigns <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "register" && (
          submitted ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Registration Submitted!</h3>
              <p className="text-sm text-gray-500 mb-4">Your NGO registration request has been submitted to ASDMA for verification.<br />You will receive a confirmation at <strong>{form.email}</strong> within 1-3 working days.</p>
              <button onClick={() => { setSubmitted(false); setForm(EMPTY_FORM); }} className="h-9 px-5 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
                Register Another
              </button>
            </div>
          ) : (
            <div className="max-w-2xl">
              <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                <strong>How it works:</strong> Fill in your organization details and submit for ASDMA verification. Once verified (1-3 working days), your organization can create relief campaigns and receive donations.
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <label className="block mb-4">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Organization Name *</span>
                  <input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Legal name of organization" />
                </label>
                <label className="block mb-4">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Organization Type *</span>
                  <select className={inputCls} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {NGO_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="block mb-4">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Registration Number *</span>
                  <input className={inputCls} value={form.regNo} onChange={e => setForm({ ...form, regNo: e.target.value })} placeholder="NGO / Trust registration no." />
                </label>
                <label className="block mb-4">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Primary Area of Operation *</span>
                  <select className={inputCls} value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}>
                    <option value="">Select district(s)</option>
                    {ASSAM_DISTRICTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </label>
              </div>

              <label className="block mb-4">
                <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Disaster Relief Activities</span>
                <textarea rows={2} className={inputCls} value={form.activities} onChange={e => setForm({ ...form, activities: e.target.value })} placeholder="Describe your disaster relief activities..." />
              </label>

              <div className="grid sm:grid-cols-3 gap-x-4">
                <label className="block mb-4">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Contact Phone</span>
                  <input className={inputCls} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="+91 XXXXXXXXXX" />
                </label>
                <label className="block mb-4">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Official Email *</span>
                  <input type="email" className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contact@ngo.org" />
                </label>
                <label className="block mb-4">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Website (optional)</span>
                  <input className={inputCls} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="www.ngo.org" />
                </label>
              </div>

              <div className="border border-gray-100 rounded-xl p-4 mb-5 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700 mb-3">Bank Details (for receiving donations)</p>
                <div className="grid sm:grid-cols-3 gap-x-4">
                  <label className="block mb-3">
                    <span className="block text-xs font-semibold text-gray-600 mb-1.5">Bank Name</span>
                    <input className={inputCls} value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="Bank name" />
                  </label>
                  <label className="block mb-3">
                    <span className="block text-xs font-semibold text-gray-600 mb-1.5">IFSC Code</span>
                    <input className={inputCls} value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value })} placeholder="XXXXX0000000" />
                  </label>
                  <label className="block mb-3">
                    <span className="block text-xs font-semibold text-gray-600 mb-1.5">Account Number</span>
                    <input className={inputCls} value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} placeholder="Account number" />
                  </label>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-700 mb-2">Upload Documents</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {["Registration Certificate", "Trust Deed / MoA", "80G Certificate (if applicable)", "Bank Statement (last 3 months)"].map(doc => (
                    <button key={doc} className="flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                      <Upload className="h-3.5 w-3.5 text-blue-500" />{doc}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={submitRegistration}
                disabled={submitting || !form.name || !form.regNo || !form.email}
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
              >
                <Building2 className="h-4 w-4" />{submitting ? "Submitting..." : "Submit Registration for ASDMA Verification"}
              </button>
              <p className="text-xs text-center text-gray-400 mt-3">By submitting, you agree to ASDMA NGO conduct guidelines. Verification takes 1-3 working days.</p>
            </div>
          )
        )}
      </div>
      <NgoManageModal
        ngoRow={manageTarget}
        token={token}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        disasters={disasters}
        shelters={shelters}
        onClose={() => setManageTarget(null)}
        onChange={handleNgoChanged}
        onDeleted={handleNgoDeleted}
        showToast={showToast}
      />
    </div>
  );
}
