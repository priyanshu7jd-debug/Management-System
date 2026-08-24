import React, { useState, useEffect } from "react";
import {
  Heart, DollarSign, CheckCircle, Building2, X, Users, EyeOff, ShieldCheck,
  PlusCircle, Pencil, Trash2, Send, AlertTriangle, Ban, HandCoins, Paperclip,
  Upload, FileText, BadgeCheck, XCircle, Wallet,
} from "lucide-react";
import { api, adapt, API_ORIGIN } from "../lib/api";
import { hasFullFundAccess, canAccessFund, getFundScope, SCOPE } from "../lib/fundPermissions";

const DISASTER_COLORS = {
  Flood: "bg-blue-50 text-blue-700 border-blue-200",
  Cyclone: "bg-purple-50 text-purple-700 border-purple-200",
  Landslide: "bg-amber-50 text-amber-700 border-amber-200",
  Fire: "bg-red-50 text-red-700 border-red-200",
  Earthquake: "bg-orange-50 text-orange-700 border-orange-200",
};

const AMOUNTS = [100, 500, 1000, 2500, 5000];
// Must match the backend's Donation.paymentMethod enum exactly.
const METHODS = ["UPI", "Bank Transfer", "Card", "Cash", "Other"];
const DONATION_STATUSES = ["Pending", "Received", "Utilized", "Cancelled"];
const EMPTY_CAMPAIGN_FORM = { title: "", ngo: "", relatedDisaster: "", description: "", location: "", target: "", deadline: "", bankDetails: "" };

// Must match the backend's AssistanceRequest.category enum exactly.
const ASSISTANCE_CATEGORIES = ["Medical", "Housing", "Livelihood", "Food", "Other"];
const ASSISTANCE_STATUS_COLORS = {
  Pending: "bg-gray-100 text-gray-600",
  FieldVerified: "bg-blue-50 text-blue-700",
  Verified: "bg-indigo-50 text-indigo-700",
  Approved: "bg-green-50 text-green-700",
  Rejected: "bg-red-50 text-red-700",
  Allocated: "bg-emerald-50 text-emerald-700",
};
const EMPTY_ASSISTANCE_FORM = { category: "Other", reason: "", amountRequested: "", relatedDisaster: "", relatedShelter: "" };

// userRole here comes in lowercase ("citizen"/"authority"/"admin"/"volunteer");
// lib/fundPermissions.js keys its table on the backend's capitalized role names.
function toRoleKey(userRole) {
  const map = { citizen: "Citizen", authority: "Authority", admin: "Admin", volunteer: "Volunteer" };
  return map[userRole] || "Citizen";
}

function fmt(n) {
  if (n >= 100000) return "Rs " + (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "Rs " + (n / 1000).toFixed(0) + "K";
  return "Rs " + n;
}

function pct(raised, target) {
  if (!target) return 0;
  return Math.min(100, Math.round((raised / target) * 100));
}

// The backend only stores "<type> - <location>" via the populated disaster;
// pull the type back out for the category badge.
function disasterType(c) {
  return c.disasterLabel ? c.disasterLabel.split(" - ")[0] : null;
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

function ModalShell({ onClose, maxWidth = "480px", children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Create/edit a relief campaign - "Create relief fund campaign" / "Edit campaign".
// A campaign must belong to an ASDMA-Approved NGO, so this fetches the NGO
// list (and a disaster list, for the optional link) the first time it opens.
function CampaignFormModal({ open, mode, initial, token, onClose, onSaved, showToast }) {
  const [form, setForm] = useState(initial);
  const [ngos, setNgos] = useState([]);
  const [disasters, setDisasters] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial);
    api.ngos.list(token, { status: "Approved" }).then((res) => setNgos(res.data)).catch(() => {});
    api.disasters.list(token).then((res) => setDisasters(res.data)).catch(() => {});
  }, [open, initial, token]);

  if (!open) return null;

  async function submit() {
    if (!form.title.trim() || !form.target || (mode === "add" && !form.ngo)) {
      showToast("Title, NGO and target amount are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(), description: form.description, location: form.location,
        target: Number(form.target), deadline: form.deadline || undefined, bankDetails: form.bankDetails,
        relatedDisaster: form.relatedDisaster || undefined,
      };
      if (mode === "add") payload.ngo = form.ngo;
      const res = mode === "edit"
        ? await api.campaigns.update(token, form._id, payload)
        : await api.campaigns.create(token, payload);
      onSaved(adapt.campaign(res.data), mode);
      showToast(mode === "edit" ? "Campaign updated" : "Campaign created");
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
          <h3 className="text-base font-bold text-gray-900">{mode === "edit" ? "Edit Campaign" : "Create Campaign"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>
        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Title</label>
        <input className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        {mode === "add" && (
          <>
            <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">NGO (must be ASDMA-verified)</label>
            <select className={inputCls} value={form.ngo} onChange={e => setForm({ ...form, ngo: e.target.value })}>
              <option value="">Select an approved NGO...</option>
              {ngos.map(n => <option key={n._id} value={n._id}>{n.name}</option>)}
            </select>
          </>
        )}
        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Related Disaster (optional)</label>
        <select className={inputCls} value={form.relatedDisaster || ""} onChange={e => setForm({ ...form, relatedDisaster: e.target.value })}>
          <option value="">None</option>
          {disasters.map(d => <option key={d._id} value={d._id}>{d.type} - {d.location}</option>)}
        </select>
        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Description</label>
        <textarea rows={3} className={inputCls} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Location</label>
        <input className={inputCls} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Target (INR)</label>
            <input type="number" className={inputCls} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} />
          </div>
          <div>
            <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Deadline</label>
            <input type="date" className={inputCls} value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
          </div>
        </div>
        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Bank Details (shown to donors)</label>
        <textarea rows={2} className={inputCls} value={form.bankDetails} onChange={e => setForm({ ...form, bankDetails: e.target.value })} />
        <button onClick={submit} disabled={saving} className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-sm font-bold text-white transition-colors">
          {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Campaign"}
        </button>
      </div>
    </ModalShell>
  );
}

const CAMPAIGN_TABS = [
  { id: "details", label: "Details" },
  { id: "balance", label: "Balance" },
  { id: "utilization", label: "Utilization" },
  { id: "notify", label: "Notify" },
  { id: "audit", label: "Audit" },
];

// Full staff-side campaign management - approve/close/suspend/delete, fund
// balance + manual adjustment, utilization breakdown, donor notifications,
// and this campaign's activity log. Covers the rest of Phase 4's bullets.
function CampaignManageModal({ campaign, token, roleKey, currentUserId, onClose, onChange, onEdit, showToast }) {
  const [tab, setTab] = useState("details");
  const [balance, setBalance] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ amount: "", direction: "credit", notes: "" });
  const [utilization, setUtilization] = useState(null);
  const [notifyForm, setNotifyForm] = useState({ title: "", message: "" });
  const [audit, setAudit] = useState(null);

  const isOwner = campaign && campaign.createdBy === currentUserId;
  const canEdit = campaign && (getFundScope("editCampaign", roleKey) === SCOPE.FULL || (getFundScope("editCampaign", roleKey) === SCOPE.ASSIGNED && isOwner));
  const canApprove = hasFullFundAccess("approveCampaign", roleKey);
  const canClose = hasFullFundAccess("closeCampaign", roleKey);
  const canSuspend = hasFullFundAccess("suspendCampaign", roleKey);
  const canDelete = canClose; // same FULL (Admin-only) scope per campaignRoutes.js
  const canManageBalance = campaign && (getFundScope("manageFundBalance", roleKey) === SCOPE.FULL || (getFundScope("manageFundBalance", roleKey) === SCOPE.ASSIGNED && isOwner));
  const canNotify = campaign && (getFundScope("sendFundNotifications", roleKey) === SCOPE.FULL || (getFundScope("sendFundNotifications", roleKey) === SCOPE.ASSIGNED && isOwner));

  useEffect(() => {
    setTab("details"); setBalance(null); setUtilization(null); setAudit(null);
  }, [campaign && campaign._id]);

  useEffect(() => {
    if (!campaign) return;
    (async () => {
      try {
        if (tab === "balance" && balance === null) {
          const res = await api.funds.balance(token, campaign._id);
          setBalance(res.data);
        } else if (tab === "utilization" && utilization === null) {
          const res = await api.funds.utilization(token, campaign._id);
          setUtilization(res.data);
        } else if (tab === "audit" && audit === null) {
          const res = await api.funds.auditLogs(token, { campaign: campaign._id });
          setAudit(res.data);
        }
      } catch (err) {
        showToast(err.message, "error");
      }
    })();
  }, [tab, campaign && campaign._id]);

  if (!campaign) return null;

  async function doAdjust() {
    if (!adjustForm.amount) return showToast("Enter an amount", "error");
    try {
      await api.funds.adjustBalance(token, campaign._id, { amount: Number(adjustForm.amount), direction: adjustForm.direction, notes: adjustForm.notes });
      const res = await api.funds.balance(token, campaign._id);
      setBalance(res.data);
      setAdjustForm({ amount: "", direction: "credit", notes: "" });
      showToast("Balance adjusted");
    } catch (err) { showToast(err.message, "error"); }
  }

  async function doNotify() {
    if (!notifyForm.title.trim()) return showToast("Enter a notification title", "error");
    try {
      const res = await api.funds.notifyDonors(token, campaign._id, notifyForm);
      showToast(`Notified ${res.recipientCount} donor(s)`);
      setNotifyForm({ title: "", message: "" });
    } catch (err) { showToast(err.message, "error"); }
  }

  async function doApprove(decision) {
    try {
      const res = await api.campaigns.approve(token, campaign._id, { decision });
      onChange(adapt.campaign(res.data));
      showToast(`Campaign ${decision.toLowerCase()}`);
    } catch (err) { showToast(err.message, "error"); }
  }
  async function doClose(outcome) {
    try {
      const res = await api.campaigns.close(token, campaign._id, { outcome });
      onChange(adapt.campaign(res.data));
      showToast(`Campaign closed as ${outcome}`);
    } catch (err) { showToast(err.message, "error"); }
  }
  async function doSuspend() {
    try {
      const res = await api.campaigns.suspend(token, campaign._id, { reason: "Suspended from Fund Management" });
      onChange(adapt.campaign(res.data));
      showToast("Campaign suspended");
    } catch (err) { showToast(err.message, "error"); }
  }
  async function doDelete() {
    try {
      await api.campaigns.remove(token, campaign._id);
      showToast("Campaign deleted");
      onClose();
      onChange(null, campaign._id);
    } catch (err) { showToast(err.message, "error"); }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="640px">
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">{campaign.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{campaign.id} · {campaign.ngoName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>

        {campaign.approvalStatus !== "Approved" && (
          <div className={"mb-3 px-3 py-2 rounded-lg text-xs font-medium " + (campaign.approvalStatus === "Pending" ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-red-50 text-red-700 border border-red-100")}>
            Approval status: {campaign.approvalStatus}
            {canApprove && campaign.approvalStatus === "Pending" && (
              <span className="ml-3 inline-flex gap-2">
                <button onClick={() => doApprove("Approved")} className="underline hover:no-underline">Approve</button>
                <button onClick={() => doApprove("Rejected")} className="underline hover:no-underline">Reject</button>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 mb-4 border-b border-gray-100 overflow-x-auto">
          {CAMPAIGN_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={"px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors " + (tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "details" && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-400">Status</span><div className="font-semibold text-gray-800">{campaign.status}</div></div>
              <div><span className="text-gray-400">Target</span><div className="font-semibold text-gray-800">Rs {campaign.target}</div></div>
              <div><span className="text-gray-400">Raised</span><div className="font-semibold text-gray-800">Rs {campaign.raised} ({campaign.donors} donors)</div></div>
              <div><span className="text-gray-400">Deadline</span><div className="font-semibold text-gray-800">{campaign.deadline || "-"}</div></div>
            </div>
            <p className="text-xs text-gray-600">{campaign.description}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              {canEdit && <button onClick={() => onEdit(campaign)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"><Pencil className="h-3 w-3" />Edit</button>}
              {canSuspend && campaign.status === "Active" && <button onClick={doSuspend} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50"><Ban className="h-3 w-3" />Suspend</button>}
              {canClose && campaign.status === "Active" && (
                <>
                  <button onClick={() => doClose("Completed")} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-green-200 text-xs font-medium text-green-700 hover:bg-green-50"><CheckCircle className="h-3 w-3" />Close as Completed</button>
                  <button onClick={() => doClose("Cancelled")} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">Close as Cancelled</button>
                </>
              )}
              {canDelete && <button onClick={doDelete} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" />Delete</button>}
            </div>
          </div>
        )}

        {tab === "balance" && (
          <div className="space-y-3">
            {balance === null ? <p className="text-xs text-gray-400">Loading...</p> : (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100"><div className="text-xs text-gray-400">Credits</div><div className="font-bold text-green-600">Rs {balance.credits}</div></div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100"><div className="text-xs text-gray-400">Debits</div><div className="font-bold text-red-600">Rs {balance.debits}</div></div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100"><div className="text-xs text-gray-400">Balance</div><div className="font-bold text-gray-900">Rs {balance.balance}</div></div>
              </div>
            )}
            {canManageBalance && (
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
                <p className="text-xs font-semibold text-gray-500">Manual adjustment (reconciliation)</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" className={inputCls + " mb-0"} placeholder="Amount" value={adjustForm.amount} onChange={e => setAdjustForm({ ...adjustForm, amount: e.target.value })} />
                  <select className={inputCls + " mb-0"} value={adjustForm.direction} onChange={e => setAdjustForm({ ...adjustForm, direction: e.target.value })}>
                    <option value="credit">Credit (add)</option><option value="debit">Debit (deduct)</option>
                  </select>
                </div>
                <input className={inputCls + " mb-0"} placeholder="Notes (e.g. bank fee correction)" value={adjustForm.notes} onChange={e => setAdjustForm({ ...adjustForm, notes: e.target.value })} />
                <button onClick={doAdjust} className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white">Apply Adjustment</button>
              </div>
            )}
          </div>
        )}

        {tab === "utilization" && (
          utilization === null ? <p className="text-xs text-gray-400">Loading...</p> : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-3 text-center text-xs mb-2">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100"><div className="text-gray-400">Raised</div><div className="font-bold text-gray-900">Rs {utilization.credits ?? "-"}</div></div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100"><div className="text-gray-400">Utilized</div><div className="font-bold text-gray-900">Rs {utilization.debits ?? "-"}</div></div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100"><div className="text-gray-400">Balance</div><div className="font-bold text-gray-900">Rs {utilization.balance ?? "-"}</div></div>
              </div>
              {utilization.byType && utilization.byType.map(t => (
                <div key={t._id} className="flex justify-between text-xs p-2 rounded-lg bg-gray-50 border border-gray-100"><span className="text-gray-600">{t._id}</span><span className="font-semibold text-gray-800">Rs {t.total}</span></div>
              ))}
            </div>
          )
        )}

        {tab === "notify" && canNotify && (
          <div className="space-y-3">
            <input className={inputCls} placeholder="Notification title" value={notifyForm.title} onChange={e => setNotifyForm({ ...notifyForm, title: e.target.value })} />
            <textarea rows={3} className={inputCls} placeholder="Message (optional)" value={notifyForm.message} onChange={e => setNotifyForm({ ...notifyForm, message: e.target.value })} />
            <button onClick={doNotify} className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white flex items-center justify-center gap-2"><Send className="h-4 w-4" />Notify Donors</button>
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
    </ModalShell>
  );
}

function MisuseReportModal({ open, token, onClose, onSubmitted, showToast }) {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  async function submit() {
    if (!description.trim()) return showToast("Describe the concern first", "error");
    setSaving(true);
    try {
      const res = await api.funds.reportMisuse(token, { description: description.trim() });
      onSubmitted(res.data);
      showToast("Report submitted to ASDMA admins");
      setDescription("");
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
          <h3 className="text-base font-bold text-gray-900">Report Suspected Fund Misuse</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>
        <textarea rows={4} className={inputCls} placeholder="Describe what you noticed..." value={description} onChange={e => setDescription(e.target.value)} />
        <button onClick={submit} disabled={saving} className="w-full h-10 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-sm font-bold text-white">{saving ? "Submitting..." : "Submit Report"}</button>
      </div>
    </ModalShell>
  );
}

// File a new financial-assistance request - "Request financial assistance"
// (Admin/Authority/Citizen; Volunteer has no access to this action per
// fundPermissions.js, only to field-verifying one).
function AssistanceRequestFormModal({ open, token, onClose, onCreated, showToast }) {
  const [form, setForm] = useState(EMPTY_ASSISTANCE_FORM);
  const [disasters, setDisasters] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_ASSISTANCE_FORM);
    api.disasters.list(token).then((res) => setDisasters(res.data)).catch(() => {});
    api.shelters.list().then((res) => setShelters(res.data)).catch(() => {});
  }, [open, token]);

  if (!open) return null;

  async function submit() {
    if (!form.reason.trim() || !form.amountRequested) {
      showToast("Please describe why assistance is needed and the amount", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await api.assistanceRequests.create(token, {
        category: form.category,
        reason: form.reason.trim(),
        amountRequested: Number(form.amountRequested),
        relatedDisaster: form.relatedDisaster || undefined,
        relatedShelter: form.relatedShelter || undefined,
      });
      onCreated(adapt.assistanceRequest(res.data));
      showToast("Assistance request submitted");
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
          <div>
            <h3 className="text-base font-bold text-gray-900">Request Financial Assistance</h3>
            <p className="text-xs text-gray-500 mt-0.5">Ask for direct relief money for medical, housing or livelihood needs</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>

        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Category</label>
        <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {ASSISTANCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Amount Requested (Rs)</label>
        <input type="number" className={inputCls} placeholder="e.g. 15000" value={form.amountRequested} onChange={(e) => setForm({ ...form, amountRequested: e.target.value })} />

        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Related Disaster (optional)</label>
        <select className={inputCls} value={form.relatedDisaster} onChange={(e) => setForm({ ...form, relatedDisaster: e.target.value })}>
          <option value="">None</option>
          {disasters.map((d) => <option key={d._id} value={d._id}>{d.type} - {d.location}</option>)}
        </select>

        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Related Shelter (optional)</label>
        <select className={inputCls} value={form.relatedShelter} onChange={(e) => setForm({ ...form, relatedShelter: e.target.value })}>
          <option value="">None</option>
          {shelters.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>

        <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Reason</label>
        <textarea rows={3} className={inputCls} placeholder="Describe why assistance is needed..." value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />

        <button onClick={submit} disabled={saving} className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-sm font-bold text-white flex items-center justify-center gap-2">
          <HandCoins className="h-4 w-4" />{saving ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </ModalShell>
  );
}

// Reusable proof-document upload/delete widget - same real multipart-upload
// pattern as the disaster/shelter evidence managers built in earlier phases,
// but pointed at the new /assistance-requests/:id/documents/upload route
// (see backend/src/controllers/assistanceController.js for why that route
// had to be added: the original documents endpoint only accepted a JSON
// { url, label } body, not an actual file).
function AssistanceDocuments({ request, token, canUpload, canDelete, onChange, showToast }) {
  const [uploading, setUploading] = useState(false);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const res = await api.assistanceRequests.uploadDocumentFiles(token, request._id, files);
      onChange(adapt.assistanceRequest(res.data));
      showToast("Document(s) uploaded");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function remove(url) {
    try {
      const res = await api.assistanceRequests.deleteDocument(token, request._id, url);
      onChange(adapt.assistanceRequest(res.data));
      showToast("Document removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  return (
    <div className="space-y-2">
      {request.documents.length === 0 ? (
        <p className="text-xs text-gray-400">No documents attached yet.</p>
      ) : (
        <div className="space-y-1.5">
          {request.documents.map((d, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
              <a href={API_ORIGIN + d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline truncate">
                <FileText className="h-3.5 w-3.5 shrink-0" />{d.label || "Document"}
              </a>
              {canDelete && (
                <button onClick={() => remove(d.url)} className="text-red-500 hover:text-red-700 shrink-0 ml-2"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          ))}
        </div>
      )}
      {canUpload && (
        <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold cursor-pointer">
          <Upload className="h-3.5 w-3.5" />{uploading ? "Uploading..." : "Upload Proof (photo/PDF)"}
          <input type="file" multiple accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFiles} disabled={uploading} />
        </label>
      )}
    </div>
  );
}

// Staff/volunteer action modal for a single assistance request - the
// verify->approve->allocate pipeline. Tabs kept minimal (Details + Documents)
// since there's no per-request balance/notify/audit sub-workflow like a
// campaign has.
function AssistanceManageModal({ request, token, roleKey, campaigns, currentUserId, onClose, onChange, showToast }) {
  const [tab, setTab] = useState("details");
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [allocateForm, setAllocateForm] = useState({ amount: "", campaignId: "" });
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(null);
  const [allocateBalance, setAllocateBalance] = useState(null);

  useEffect(() => {
    setTab("details"); setNotes(""); setRejectReason(""); setAudit(null); setAllocateBalance(null);
    setAllocateForm({ amount: request ? String(request.amountRequested) : "", campaignId: request?.relatedCampaign || "" });
  }, [request && request._id]);

  useEffect(() => {
    if (!request) return;
    if (tab !== "audit" || audit !== null) return;
    (async () => {
      try {
        const res = await api.funds.auditLogs(token, { assistanceRequest: request._id });
        setAudit(res.data);
      } catch (err) {
        showToast(err.message, "error");
      }
    })();
  }, [tab, request && request._id]);

  useEffect(() => {
    if (!allocateForm.campaignId) { setAllocateBalance(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.funds.balance(token, allocateForm.campaignId);
        if (!cancelled) setAllocateBalance(res.data);
      } catch (err) {
        if (!cancelled) setAllocateBalance(null);
      }
    })();
    return () => { cancelled = true; };
  }, [allocateForm.campaignId]);

  if (!request) return null;

  const isVolunteer = roleKey === "Volunteer";
  const isStaff = roleKey === "Admin" || roleKey === "Authority";
  const canFieldVerify = isVolunteer && getFundScope("verifyAssistanceRequest", roleKey) === SCOPE.FIELD && request.status === "Pending";
  const canOfficeVerify = isStaff && hasFullFundAccess("verifyAssistanceRequest", roleKey) && ["Pending", "FieldVerified"].includes(request.status);
  const canApprove = isStaff && hasFullFundAccess("approveAssistance", roleKey) && ["Pending", "FieldVerified", "Verified"].includes(request.status);
  const canReject = isStaff && hasFullFundAccess("rejectAssistance", roleKey) && !["Rejected", "Allocated"].includes(request.status);
  const canAllocate = isStaff && hasFullFundAccess("allocateReliefMoney", roleKey) && request.status === "Approved";
  const canUploadDocs = canAccessFund("uploadProofDocuments", roleKey);
  const isRequestOwner = Boolean(currentUserId) && request.requestedBy === currentUserId;
  // Matches deleteAssistanceDocument in the backend controller: the
  // requester can delete documents on their own request, in addition to
  // Authority/Admin staff.
  const canDeleteDocs = isStaff || isRequestOwner;

  async function run(action, fn) {
    setBusy(true);
    try {
      const res = await fn();
      onChange(adapt.assistanceRequest(res.data));
      showToast(action);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="560px">
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">{request.id}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{request.requesterName} ({request.requesterRole}) · {request.category}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
        </div>

        <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mb-4 " + (ASSISTANCE_STATUS_COLORS[request.status] || "bg-gray-100 text-gray-600")}>{request.status}</span>

        <div className="flex items-center gap-1 mb-4 border-b border-gray-100">
          {["details", "documents", "audit"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={"px-3 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors " + (tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>{t}</button>
          ))}
        </div>

        {tab === "details" && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-400">Amount Requested</span><div className="font-semibold text-gray-800">Rs {request.amountRequested}</div></div>
              <div><span className="text-gray-400">Filed</span><div className="font-semibold text-gray-800">{request.createdAt}</div></div>
              {request.disasterLabel && <div><span className="text-gray-400">Disaster</span><div className="font-semibold text-gray-800">{request.disasterLabel}</div></div>}
              {request.shelterLabel && <div><span className="text-gray-400">Shelter</span><div className="font-semibold text-gray-800">{request.shelterLabel}</div></div>}
            </div>
            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3">{request.reason}</p>

            {request.fieldVerifiedByName && <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2">Field-verified by {request.fieldVerifiedByName}{request.fieldVerificationNotes ? `: ${request.fieldVerificationNotes}` : ""}</div>}
            {request.verifiedByName && <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-2">Office-verified by {request.verifiedByName}</div>}
            {request.status === "Rejected" && request.rejectionReason && <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2">Rejected: {request.rejectionReason}</div>}
            {request.status === "Allocated" && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2">Rs {request.allocatedAmount} allocated by {request.allocatedByName}</div>}

            {canFieldVerify && (
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
                <p className="text-xs font-semibold text-gray-500">Field verification (on-the-ground check)</p>
                <input className={inputCls + " mb-0"} placeholder="Notes from the field visit" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <button disabled={busy} onClick={() => run("Field verification recorded", () => api.assistanceRequests.fieldVerify(token, request._id, { notes }))} className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-xs font-semibold text-white">Mark Field-Verified</button>
              </div>
            )}

            {(canOfficeVerify || canApprove || canReject) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {canOfficeVerify && <button disabled={busy} onClick={() => run("Verified", () => api.assistanceRequests.verify(token, request._id))} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-indigo-200 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"><BadgeCheck className="h-3 w-3" />Office-Verify</button>}
                {canApprove && <button disabled={busy} onClick={() => run("Approved", () => api.assistanceRequests.approve(token, request._id, { notes }))} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-green-200 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-40"><CheckCircle className="h-3 w-3" />Approve</button>}
                {canReject && (
                  <div className="flex items-center gap-1.5">
                    <input className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-40" placeholder="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                    <button disabled={busy || !rejectReason.trim()} onClick={() => run("Rejected", () => api.assistanceRequests.reject(token, request._id, { reason: rejectReason }))} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"><XCircle className="h-3 w-3" />Reject</button>
                  </div>
                )}
              </div>
            )}

            {canAllocate && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 space-y-2">
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" />Allocate relief money</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" placeholder="Amount" value={allocateForm.amount} onChange={(e) => setAllocateForm({ ...allocateForm, amount: e.target.value })} />
                  <select className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" value={allocateForm.campaignId} onChange={(e) => setAllocateForm({ ...allocateForm, campaignId: e.target.value })}>
                    <option value="">Select campaign...</option>
                    {campaigns.filter((c) => c.status === "Active").map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
                  </select>
                </div>
                {allocateForm.campaignId && (
                  <p className="text-xs text-emerald-800">
                    {allocateBalance === null ? "Loading campaign balance..." : (
                      <>Campaign balance: <span className="font-semibold">Rs {allocateBalance.balance}</span> available{Number(allocateForm.amount) > allocateBalance.balance ? <span className="text-red-600 font-semibold"> — requested amount exceeds this</span> : ""}</>
                    )}
                  </p>
                )}
                <button
                  disabled={busy || !allocateForm.campaignId}
                  onClick={() => run("Relief money allocated", () => api.assistanceRequests.allocate(token, request._id, { amount: Number(allocateForm.amount) || undefined, campaignId: allocateForm.campaignId }))}
                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-xs font-semibold text-white"
                >
                  Allocate
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "documents" && (
          <AssistanceDocuments request={request} token={token} canUpload={canUploadDocs} canDelete={canDeleteDocs} onChange={onChange} showToast={showToast} />
        )}

        {tab === "audit" && (
          audit === null ? <p className="text-xs text-gray-400">Loading...</p> : audit.length === 0 ? <p className="text-xs text-gray-400">No activity logged yet.</p> : (
            <div className="space-y-1.5">
              {audit.map((a) => (
                <div key={a._id} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <span className="font-medium text-gray-700">{a.action.replace(/_/g, " ")}</span>
                  <span className="text-gray-400"> · {a.performedBy?.name || "system"} · {new Date(a.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </ModalShell>
  );
}

export default function DonationsView({ userRole, token, currentUserId, showToast }) {
  const roleKey = toRoleKey(userRole);
  const canGoAnonymous = canAccessFund("anonymousDonation", roleKey);
  const canVerify = hasFullFundAccess("verifyDonation", roleKey);
  const canDeleteDonation = roleKey === "Admin";
  const canCreateCampaign = hasFullFundAccess("createCampaign", roleKey);
  const isStaff = roleKey === "Admin" || roleKey === "Authority";

  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [donateTarget, setDonateTarget] = useState(null);
  const [amount, setAmount] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState(METHODS[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [step, setStep] = useState("form");
  const [submitting, setSubmitting] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [filterStatus, setFilterStatus] = useState("All");
  const [verifyingId, setVerifyingId] = useState(null);

  const [campaignForm, setCampaignForm] = useState({ open: false, mode: "add", initial: EMPTY_CAMPAIGN_FORM });
  const [manageCampaign, setManageCampaign] = useState(null);
  const [misuseOpen, setMisuseOpen] = useState(false);
  const [assistanceRequests, setAssistanceRequests] = useState([]);
  const [loadingAssistance, setLoadingAssistance] = useState(true);
  const [assistanceFilter, setAssistanceFilter] = useState("All");
  const [assistanceFormOpen, setAssistanceFormOpen] = useState(false);
  const [manageAssistance, setManageAssistance] = useState(null);
  const canRequestAssistance = canAccessFund("requestFinancialAssistance", roleKey);
  const canSeeAssistance = canAccessFund("requestFinancialAssistance", roleKey) || canAccessFund("verifyAssistanceRequest", roleKey);
  const [misuseReports, setMisuseReports] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [reportSummary, setReportSummary] = useState(null);

  function loadCampaigns() {
    if (!token) return;
    setLoadingCampaigns(true);
    api.campaigns
      .list(token, { status: "all" })
      .then((res) => setCampaigns(res.data.map(adapt.campaign)))
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setLoadingCampaigns(false));
  }

  function loadTransactions() {
    if (!token) return;
    const isStaff = roleKey === "Admin" || roleKey === "Authority";
    const fetcher = isStaff ? api.donations.list(token) : api.donations.mine(token);
    fetcher
      .then((res) => setTransactions(res.data.map(adapt.donation)))
      .catch((err) => showToast(err.message, "error"));
  }

  useEffect(() => {
    loadCampaigns();
    loadTransactions();
    if (isStaff) loadMisuseReports();
    if (canSeeAssistance) loadAssistanceRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = campaigns.filter(c => filterStatus === "All" || c.status === filterStatus);
  const active = campaigns.filter(c => c.status === "Active");
  const totalRaised = active.reduce((a, c) => a + c.raised, 0);
  const totalDonors = active.reduce((a, c) => a + c.donors, 0);
  const partnerNGOs = new Set(active.map(c => c.ngoId)).size;

  async function submitDonation() {
    if (!name.trim() || !email.trim() || (!amount && !customAmount)) return;
    const amt = Number(customAmount) || Number(amount);
    setSubmitting(true);
    try {
      await api.donations.create(token, {
        donorName: name,
        donorEmail: email,
        type: "Cash",
        amount: amt,
        paymentMethod: method,
        relatedCampaign: donateTarget._id,
        isAnonymous: canGoAnonymous ? isAnonymous : false,
      });
      setStep("success");
      loadCampaigns();
      loadTransactions();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyDonation(id) {
    setVerifyingId(id);
    try {
      await api.donations.verify(token, id);
      showToast("Donation verified", "success");
      loadTransactions();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setVerifyingId(null);
    }
  }

  async function changeDonationStatus(id, status) {
    try {
      await api.donations.updateStatus(token, id, { status });
      loadTransactions();
      showToast("Donation status updated");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function removeDonation(id) {
    try {
      await api.donations.remove(token, id);
      setTransactions(transactions.filter(t => t._id !== id));
      showToast("Donation record deleted");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function openCreateCampaign() {
    setCampaignForm({ open: true, mode: "add", initial: EMPTY_CAMPAIGN_FORM });
  }
  function openEditCampaign(c) {
    setManageCampaign(null);
    setCampaignForm({
      open: true, mode: "edit",
      initial: { _id: c._id, title: c.title, relatedDisaster: c.relatedDisaster || "", description: c.description, location: c.location, target: c.target, deadline: c.deadline, bankDetails: c.bankDetails },
    });
  }
  function handleCampaignSaved(row, mode) {
    if (mode === "edit") {
      setCampaigns(campaigns.map(c => c._id === row._id ? { ...c, ...row } : c));
    } else {
      setCampaigns([row, ...campaigns]);
    }
  }
  function handleCampaignChange(row, removedId) {
    if (row === null && removedId) {
      setCampaigns(campaigns.filter(c => c._id !== removedId));
      return;
    }
    setCampaigns(campaigns.map(c => c._id === row._id ? { ...c, ...row } : c));
    setManageCampaign((m) => (m && m._id === row._id ? { ...m, ...row } : m));
  }

  function loadMisuseReports() {
    if (!token) return;
    api.funds.misuseReports(token).then((res) => setMisuseReports(res.data)).catch(() => {});
  }

  function loadAssistanceRequests() {
    if (!token) return;
    setLoadingAssistance(true);
    api.assistanceRequests
      .list(token)
      .then((res) => setAssistanceRequests(res.data.map(adapt.assistanceRequest)))
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setLoadingAssistance(false));
  }
  function handleAssistanceCreated(row) {
    setAssistanceRequests([row, ...assistanceRequests]);
  }
  function handleAssistanceChange(row) {
    setAssistanceRequests(assistanceRequests.map((r) => (r._id === row._id ? row : r)));
    setManageAssistance((m) => (m && m._id === row._id ? row : m));
  }
  async function triageMisuseReport(id, status) {
    try {
      const res = await api.funds.updateMisuseReport(token, id, { status });
      setMisuseReports(misuseReports.map(r => r._id === id ? res.data : r));
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function toggleLedger() {
    if (!ledgerOpen && ledger === null) {
      api.funds.transactions(token).then((res) => setLedger(res.data)).catch((err) => showToast(err.message, "error"));
    }
    setLedgerOpen(!ledgerOpen);
  }

  async function loadFundReport() {
    try {
      const res = await api.funds.reports(token);
      setReportSummary(res.data);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function closeModal() {
    setDonateTarget(null);
    setStep("form");
    setAmount("");
    setCustomAmount("");
    setMethod(METHODS[0]);
    setName("");
    setEmail("");
    setIsAnonymous(false);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Heart, label: "Active Campaigns", value: active.length, color: "text-red-500", bg: "bg-red-50" },
          { icon: DollarSign, label: "Total Raised", value: fmt(totalRaised), color: "text-green-600", bg: "bg-green-50" },
          { icon: Users, label: "Total Donors", value: totalDonors.toLocaleString(), color: "text-blue-600", bg: "bg-blue-50" },
          { icon: Building2, label: "Partner NGOs", value: partnerNGOs, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className={"p-2.5 rounded-xl inline-flex mb-3 " + s.bg + " " + s.color}><s.icon className="h-4 w-4" /></div>
            <div className="text-xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Relief Fund Campaigns</h2>
            <p className="text-xs text-gray-400 mt-0.5">Verified disaster relief campaigns - donate to make an impact</p>
          </div>
          <div className="flex items-center gap-2">
            {canCreateCampaign && (
              <button onClick={openCreateCampaign} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
                <PlusCircle className="h-3.5 w-3.5" />Create Campaign
              </button>
            )}
            {["All", "Active", "Completed"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} className={"px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors " + (filterStatus === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {loadingCampaigns ? (
          <div className="text-center py-12 text-sm text-gray-400">Loading campaigns...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No campaigns to show.</div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {filtered.map(c => {
              const p = pct(c.raised, c.target);
              const dType = disasterType(c);
              const catColor = DISASTER_COLORS[dType] || "bg-gray-100 text-gray-600 border-gray-200";
              return (
                <div key={c._id} className={"border rounded-2xl p-5 transition-all hover:shadow-md " + (c.status === "Completed" ? "border-gray-100 opacity-75" : "border-gray-100 hover:border-blue-200")}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {dType && <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border " + catColor}>{dType}</span>}
                        {c.status === "Completed" && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Completed</span>}
                      </div>
                      <h3 className="text-sm font-bold text-gray-900">{c.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{c.ngoName} • {c.location}</p>
                      {isStaff && c.approvalStatus !== "Approved" && (
                        <span className={"inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold " + (c.approvalStatus === "Pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700")}>{c.approvalStatus}</span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 mb-4 leading-relaxed">{c.description}</p>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-bold text-gray-900">{fmt(c.raised)} raised</span>
                      <span className="text-gray-400">of {fmt(c.target)}</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-gray-100">
                      <div className={"h-2.5 rounded-full transition-all " + (p >= 100 ? "bg-green-500" : p >= 60 ? "bg-blue-500" : "bg-blue-400")} style={{ width: p + "%" }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>{p}% funded</span>
                      <span>{c.donors.toLocaleString()} donors{c.deadline ? " • Closes " + c.deadline : ""}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {c.status === "Active" && (
                      <button onClick={() => { setDonateTarget(c); setStep("form"); }} className="flex-1 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-1.5">
                        <Heart className="h-3.5 w-3.5" />Donate Now
                      </button>
                    )}
                    {c.status === "Completed" && <div className="flex-1 h-9 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold flex items-center justify-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" />Goal Reached</div>}
                    {isStaff && (
                      <button onClick={() => setManageCampaign(c)} className="h-9 px-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors" title="Manage">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {transactions.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Donation History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider text-left">
                {["ID", "Campaign", "Amount", "Method", "Date", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t._id} className="border-b border-gray-50 hover:bg-green-50/20">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{t.id}</td>
                    <td className="px-3 py-2.5 text-gray-800 font-medium">
                      {t.campaign}
                      {t.isAnonymous && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full align-middle">
                          <EyeOff className="h-2.5 w-2.5" />Anonymous
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-green-600">{fmt(t.amount)}</td>
                    <td className="px-3 py-2.5 text-gray-500">{t.method}</td>
                    <td className="px-3 py-2.5 text-gray-400">{t.date}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full"><CheckCircle className="h-3 w-3" />{t.status}</span>
                      {t.verified && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full align-middle">
                          <ShieldCheck className="h-2.5 w-2.5" />Verified
                        </span>
                      )}
                      {canVerify && (
                        <select value={t.status} onChange={e => changeDonationStatus(t._id, e.target.value)} className="ml-1.5 text-[10px] border border-gray-200 rounded-md px-1 py-0.5 align-middle">
                          {DONATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {canVerify && !t.verified && (
                        <button
                          onClick={() => verifyDonation(t._id)}
                          disabled={verifyingId === t._id}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40"
                        >
                          {verifyingId === t._id ? "Verifying..." : "Verify"}
                        </button>
                      )}
                      {canDeleteDonation && (
                        <button onClick={() => removeDonation(t._id)} className="ml-2 text-xs font-semibold text-red-500 hover:text-red-700">
                          <Trash2 className="h-3.5 w-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canSeeAssistance && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{roleKey === "Citizen" ? "My Assistance Requests" : "Financial Assistance Requests"}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{roleKey === "Citizen" ? "Relief money you've requested for medical, housing or livelihood needs" : "Direct relief money for medical, housing or livelihood needs"}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canRequestAssistance && (
                <button onClick={() => setAssistanceFormOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
                  <HandCoins className="h-3.5 w-3.5" />Request Assistance
                </button>
              )}
              {["All", "Pending", "FieldVerified", "Verified", "Approved", "Rejected", "Allocated"].map((s) => (
                <button key={s} onClick={() => setAssistanceFilter(s)} className={"px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors " + (assistanceFilter === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loadingAssistance ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading requests...</p>
          ) : (() => {
              const filteredAssistance = assistanceRequests.filter((r) => assistanceFilter === "All" || r.status === assistanceFilter);
              return filteredAssistance.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No assistance requests to show.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider text-left">
                      {["ID", "Requester", "Category", "Amount", "Filed", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {filteredAssistance.map((r) => (
                        <tr key={r._id} className="border-b border-gray-50 hover:bg-blue-50/20">
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.id}</td>
                          <td className="px-3 py-2.5 text-gray-800 font-medium">{r.requesterName}</td>
                          <td className="px-3 py-2.5 text-gray-500">{r.category}</td>
                          <td className="px-3 py-2.5 font-bold text-gray-800">Rs {r.amountRequested}</td>
                          <td className="px-3 py-2.5 text-gray-400">{r.createdAt}</td>
                          <td className="px-3 py-2.5"><span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold " + (ASSISTANCE_STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600")}>{r.status}</span></td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => setManageAssistance(r)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
                              <Paperclip className="h-3.5 w-3.5" />{r.documents.length > 0 ? `${r.documents.length} doc(s)` : "View"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
        </div>
      )}

      {isStaff && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Misuse Reports</h3>
              <p className="text-xs text-gray-400 mt-0.5">Concerns flagged about campaigns, donations or assistance requests</p>
            </div>
            <button onClick={() => setMisuseOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />Report Misuse
            </button>
          </div>
          {misuseReports === null ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : misuseReports.length === 0 ? (
            <p className="text-xs text-gray-400">No misuse reports on file.</p>
          ) : (
            <div className="space-y-1.5">
              {misuseReports.map(r => (
                <div key={r._id} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">{r.description}</span>
                    <span className={"px-2 py-0.5 rounded-full text-[10px] font-semibold " + (r.status === "Resolved" ? "bg-green-50 text-green-700" : r.status === "Dismissed" ? "bg-gray-100 text-gray-500" : r.status === "Reviewing" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700")}>{r.status}</span>
                  </div>
                  <div className="text-gray-400 mt-1">Reported by {r.reportedBy?.name || "someone"}</div>
                  {r.status !== "Resolved" && r.status !== "Dismissed" && (
                    <div className="flex gap-2 mt-1.5">
                      <button onClick={() => triageMisuseReport(r._id, "Reviewing")} className="text-blue-600 underline hover:no-underline">Mark Reviewing</button>
                      <button onClick={() => triageMisuseReport(r._id, "Resolved")} className="text-green-600 underline hover:no-underline">Resolve</button>
                      <button onClick={() => triageMisuseReport(r._id, "Dismissed")} className="text-gray-500 underline hover:no-underline">Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isStaff && (
        <div className="flex justify-end">
          <button onClick={() => setMisuseOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />Report Suspected Misuse
          </button>
        </div>
      )}

      {donateTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
            {step === "form" && (
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Donate to Campaign</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{donateTarget.title}</p>
                  </div>
                  <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl mb-5">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-bold text-gray-700">{fmt(donateTarget.raised)} raised of {fmt(donateTarget.target)}</span>
                    <span className="text-blue-600 font-bold">{pct(donateTarget.raised, donateTarget.target)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-blue-100">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: pct(donateTarget.raised, donateTarget.target) + "%" }} />
                  </div>
                </div>

                <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Your Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" placeholder="Full name" />

                <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" placeholder="email@example.com" />

                <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Select Amount (INR)</label>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {AMOUNTS.map(a => (
                    <button key={a} onClick={() => { setAmount(String(a)); setCustomAmount(""); }} className={"py-2 rounded-lg text-xs font-semibold border transition-colors " + (amount === String(a) && !customAmount ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
                      {a >= 1000 ? (a / 1000) + "K" : a}
                    </button>
                  ))}
                </div>
                <input type="number" value={customAmount} onChange={e => { setCustomAmount(e.target.value); setAmount(""); }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" placeholder="Or enter custom amount (Rs)" />

                <label className="block mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Payment Method</label>
                <div className="grid grid-cols-3 gap-2 mb-5">
                  {METHODS.map(m => (
                    <button key={m} onClick={() => setMethod(m)} className={"py-2 px-3 rounded-lg text-xs font-medium border transition-colors text-left " + (method === m ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}>
                      {m}
                    </button>
                  ))}
                </div>

                {donateTarget.bankDetails && (
                  <div className="text-xs text-gray-400 mb-4 p-3 bg-gray-50 rounded-lg">{donateTarget.bankDetails}</div>
                )}

                {canGoAnonymous && (
                  <label className="flex items-center gap-2 mb-5 text-xs text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <EyeOff className="h-3.5 w-3.5 text-gray-400" />
                    Donate anonymously (your name won't be shown publicly)
                  </label>
                )}

                <button onClick={submitDonation} disabled={submitting || !name || !email || (!amount && !customAmount)} className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2">
                  <Heart className="h-4 w-4" />
                  {submitting ? "Processing..." : "Donate Rs " + (customAmount || amount || "—")}
                </button>
              </div>
            )}

            {step === "success" && (
              <div className="p-8 text-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Thank You!</h3>
                <p className="text-sm text-gray-500 mb-2">Your donation of <strong className="text-green-600">Rs {customAmount || amount}</strong> has been received.</p>
                <p className="text-xs text-gray-400 mb-6">A receipt will be sent to {email}.</p>
                <button onClick={closeModal} className="h-10 px-6 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      {isStaff && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Fund Reports &amp; Transactions</h3>
              <p className="text-xs text-gray-400 mt-0.5">Money-movement ledger and an aggregate report across campaigns</p>
            </div>
            <div className="flex gap-2">
              <button onClick={toggleLedger} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold">
                {ledgerOpen ? "Hide Ledger" : "Monitor Transactions"}
              </button>
              <button onClick={loadFundReport} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold">
                Generate Report
              </button>
              <a href={api.funds.exportReportsUrl()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
                Export CSV
              </a>
            </div>
          </div>

          {ledgerOpen && (
            ledger === null ? <p className="text-xs text-gray-400">Loading...</p> : ledger.length === 0 ? <p className="text-xs text-gray-400">No transactions yet.</p> : (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider text-left">
                    {["Campaign", "Type", "Direction", "Amount", "Date"].map(h => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {ledger.map(t => (
                      <tr key={t._id} className="border-b border-gray-50">
                        <td className="px-2 py-2 text-gray-700">{t.relatedCampaign?.title || "-"}</td>
                        <td className="px-2 py-2 text-gray-500">{t.type}</td>
                        <td className="px-2 py-2"><span className={t.direction === "credit" ? "text-green-600" : "text-red-600"}>{t.direction}</span></td>
                        <td className="px-2 py-2 font-semibold text-gray-800">Rs {t.amount}</td>
                        <td className="px-2 py-2 text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {reportSummary && (
            <div className="grid sm:grid-cols-2 gap-2">
              {reportSummary.map(r => (
                <div key={r.campaign} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <div className="font-semibold text-gray-800">{r.title}</div>
                  <div className="text-gray-400 mt-0.5">Target Rs {r.target} · Raised Rs {r.credits} · Balance Rs {r.balance}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CampaignFormModal
        open={campaignForm.open} mode={campaignForm.mode} initial={campaignForm.initial} token={token}
        onClose={() => setCampaignForm({ ...campaignForm, open: false })}
        onSaved={handleCampaignSaved} showToast={showToast}
      />
      <CampaignManageModal
        campaign={manageCampaign} token={token} roleKey={roleKey} currentUserId={currentUserId}
        onClose={() => setManageCampaign(null)} onChange={handleCampaignChange} onEdit={openEditCampaign} showToast={showToast}
      />
      <MisuseReportModal
        open={misuseOpen} token={token} onClose={() => setMisuseOpen(false)}
        onSubmitted={(r) => setMisuseReports(misuseReports ? [r, ...misuseReports] : [r])} showToast={showToast}
      />
      <AssistanceRequestFormModal
        open={assistanceFormOpen} token={token}
        onClose={() => setAssistanceFormOpen(false)}
        onCreated={handleAssistanceCreated} showToast={showToast}
      />
      <AssistanceManageModal
        request={manageAssistance} token={token} roleKey={roleKey} campaigns={campaigns} currentUserId={currentUserId}
        onClose={() => setManageAssistance(null)} onChange={handleAssistanceChange} showToast={showToast}
      />
    </div>
  );
}
