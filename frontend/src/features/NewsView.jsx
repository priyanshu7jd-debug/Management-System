import React, { useState, useEffect, useRef } from "react";
import {
  Newspaper, Clock, MapPin, ExternalLink, ChevronDown, ChevronUp, Search, RefreshCw, Bell,
  PenSquare, ShieldCheck, X, Upload, Loader2, Trash2, CheckCircle, XCircle, Send, CalendarClock,
  UserCog, Link2, FileText, MessageSquareWarning, History, Settings2, Image as ImageIcon, Flag,
} from "lucide-react";
import { api, adapt, API_ORIGIN } from "../lib/api";

const REGIONS = ["All Assam", "Guwahati", "Kamrup", "Nalbari", "Silchar", "Jorhat", "Dhubri", "Karbi Anglong"];

const CATEGORY_COLORS = {
  Flood: "bg-blue-50 text-blue-700 border-blue-200",
  Earthquake: "bg-orange-50 text-orange-700 border-orange-200",
  Cyclone: "bg-purple-50 text-purple-700 border-purple-200",
  Landslide: "bg-amber-50 text-amber-700 border-amber-200",
  Fire: "bg-red-50 text-red-700 border-red-200",
  Government: "bg-green-50 text-green-700 border-green-200",
  Tsunami: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const STATUS_BADGE = {
  Draft: "bg-gray-100 text-gray-600 border-gray-200",
  "Pending Approval": "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-blue-50 text-blue-700 border-blue-200",
  Published: "bg-green-50 text-green-700 border-green-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Archived: "bg-gray-100 text-gray-500 border-gray-200",
};

const NEWS_STATUSES = ["Draft", "Pending Approval", "Approved", "Published", "Rejected", "Archived"];

const inputCls = "w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors";
const btnPrimary = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40";
const btnGhost = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40";

const EMPTY_FORM = { headline: "", summary: "", content: "", category: "", region: "", tags: "", isEmergency: false };

function ModalShell({ onClose, maxWidth = "640px", children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Badge({ className, children }) {
  return <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border " + className}>{children}</span>;
}

export default function NewsView({ token, userRole, currentUserId, users = [], showToast }) {
  const isAdmin = userRole === "admin";
  const isAuthority = userRole === "authority";
  const isVolunteer = userRole === "volunteer";
  const isStaff = isAdmin || isAuthority;

  const [view, setView] = useState("browse"); // browse | manage | directory

  // ---- Public / browse feed (Citizen, Volunteer, and staff's "Public Feed") ----
  const [news, setNews] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [region, setRegion] = useState("All Assam");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  function loadBrowse() {
    if (!token) return;
    setLoading(true);
    Promise.all([
      api.news.list(token, { status: "Published" }),
      api.newsCategories.list(token),
    ])
      .then(([newsRes, catRes]) => {
        setNews(newsRes.data.map(adapt.news));
        setCategories(catRes.data.map(adapt.newsCategory));
        setLastRefresh(new Date());
      })
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadBrowse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const categoryNames = ["All", ...categories.map((c) => c.name)];
  const filtered = news.filter((n) => {
    const matchCat = category === "All" || n.category === category;
    const matchRegion = region === "All Assam" || n.region === region || n.region === "Assam";
    const matchSearch = !search || n.headline.toLowerCase().includes(search.toLowerCase()) || n.summary.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchRegion && matchSearch;
  });
  const urgent = filtered.filter((n) => n.urgent);
  const regular = filtered.filter((n) => !n.urgent);

  function patchLocalNews(updatedFull) {
    const a = adapt.news(updatedFull);
    setNews((list) => list.map((n) => (n._id === a._id ? a : n)));
  }

  async function reportProblem(newsId, reason) {
    try {
      await api.news.report(token, newsId, { reason });
      showToast("Report submitted, thank you");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function addFieldUpdate(newsId, text) {
    try {
      const res = await api.news.addUpdate(token, newsId, { text });
      patchLocalNews(res.data);
      showToast(isVolunteer ? "Update submitted for review" : "Update added");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ---- Staff: Manage Newsroom ----
  const [manageNews, setManageNews] = useState([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageStatus, setManageStatus] = useState("All");
  const [mineOnly, setMineOnly] = useState(false);
  const [stats, setStats] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [manageItem, setManageItem] = useState(null);

  function loadManage() {
    if (!token || !isStaff) return;
    setManageLoading(true);
    const params = {};
    if (manageStatus !== "All") params.status = manageStatus;
    if (mineOnly) params.mine = "true";
    Promise.all([
      api.news.list(token, params),
      categories.length ? Promise.resolve({ data: categories.map((c) => ({ _id: c._id, name: c.name })) }) : api.newsCategories.list(token),
      api.news.stats(token).catch(() => null),
    ])
      .then(([newsRes, catRes, statsRes]) => {
        setManageNews(newsRes.data.map(adapt.news));
        if (!categories.length && catRes.data) setCategories(catRes.data.map(adapt.newsCategory));
        if (statsRes) setStats(statsRes.data);
      })
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setManageLoading(false));
  }

  useEffect(() => {
    if (view === "manage") loadManage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, manageStatus, mineOnly, token]);

  useEffect(() => {
    if (categories.length > 0 && !form.category) setForm((f) => ({ ...f, category: categories[0]._id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  async function createDraft() {
    if (!form.headline.trim() || !form.content.trim() || !form.category || !form.region.trim()) return;
    setSubmitting(true);
    try {
      await api.news.create(token, {
        headline: form.headline,
        summary: form.summary,
        content: form.content,
        category: form.category,
        region: form.region,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        isEmergency: form.isEmergency,
      });
      showToast("Draft created");
      setForm({ ...EMPTY_FORM, category: categories[0]?._id || "" });
      setShowCompose(false);
      loadManage();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function onManageChanged(updatedFull) {
    const a = adapt.news(updatedFull);
    setManageNews((list) => list.map((n) => (n._id === a._id ? a : n)));
  }

  function onManageDeleted(id) {
    setManageNews((list) => list.filter((n) => n._id !== id));
    setManageItem(null);
  }

  return (
    <div className="space-y-5">
      {isStaff && (
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "browse", label: "Public Feed" },
            { id: "manage", label: "Manage Newsroom" },
            ...(isAdmin ? [{ id: "directory", label: "Categories & Sources" }] : []),
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={"px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors " + (view === t.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {view === "browse" && (
        <BrowseFeed
          news={filtered}
          urgent={urgent}
          regular={regular}
          loading={loading}
          categoryNames={categoryNames}
          category={category}
          setCategory={setCategory}
          region={region}
          setRegion={setRegion}
          search={search}
          setSearch={setSearch}
          expanded={expanded}
          setExpanded={setExpanded}
          lastRefresh={lastRefresh}
          load={loadBrowse}
          isVolunteer={isVolunteer}
          canReport={true}
          onReport={reportProblem}
          onAddUpdate={isVolunteer ? addFieldUpdate : null}
        />
      )}

      {view === "manage" && isStaff && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Newsroom</h2>
              <p className="text-xs text-gray-400 mt-0.5">Draft, review, approve and publish disaster news</p>
            </div>
            <button onClick={() => setShowCompose((s) => !s)} className={btnPrimary}>
              <PenSquare className="h-3.5 w-3.5" />{showCompose ? "Close" : "New Draft"}
            </button>
          </div>

          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
              <StatChip label="Total" value={stats.total} />
              <StatChip label="Emergency" value={stats.emergencyCount} />
              <StatChip label="Verified" value={stats.verifiedCount} />
              {["Pending Approval", "Published"].map((s) => (
                <StatChip key={s} label={s} value={(stats.byStatus.find((b) => b._id === s) || {}).count || 0} />
              ))}
            </div>
          )}

          {showCompose && (
            <div className="mb-5 p-4 border border-blue-100 bg-blue-50/40 rounded-xl">
              <p className="text-xs font-semibold text-gray-700 mb-3">Draft a new news item (starts as Draft, not published)</p>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <label className="block mb-3">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Headline *</span>
                  <input className={inputCls} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Short, clear headline" />
                </label>
                <label className="block mb-3">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Category *</span>
                  <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="block mb-3">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Region *</span>
                  <input className={inputCls} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. Guwahati" />
                </label>
                <label className="block mb-3">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Tags (comma separated)</span>
                  <input className={inputCls} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="flood, relief" />
                </label>
              </div>
              <label className="block mb-3">
                <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Summary</span>
                <textarea rows={2} className={inputCls} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="One or two line summary" />
              </label>
              <label className="block mb-3">
                <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Content *</span>
                <textarea rows={4} className={inputCls} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Full article content" />
              </label>
              <label className="flex items-center gap-2 mb-4">
                <input type="checkbox" checked={form.isEmergency} onChange={(e) => setForm({ ...form, isEmergency: e.target.checked })} />
                <span className="text-xs font-semibold text-gray-600">Mark as emergency / breaking</span>
              </label>
              <button
                onClick={createDraft}
                disabled={submitting || !form.headline.trim() || !form.content.trim() || !form.category || !form.region.trim()}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-sm font-bold text-white transition-colors"
              >
                <ShieldCheck className="h-4 w-4" />{submitting ? "Saving..." : "Save Draft"}
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {["All", ...NEWS_STATUSES].map((s) => (
              <button key={s} onClick={() => setManageStatus(s)} className={"px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors " + (manageStatus === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
                {s}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-2">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
              Mine (created or assigned)
            </label>
            <RefreshCw className="h-3.5 w-3.5 text-blue-500 cursor-pointer ml-auto" onClick={loadManage} />
          </div>

          {manageLoading ? (
            <div className="text-center py-12 text-sm text-gray-400">Loading...</div>
          ) : manageNews.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Newspaper className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No news items for this filter.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {manageNews.map((n) => (
                <div key={n._id} className="flex items-center justify-between gap-3 p-3 border border-gray-100 rounded-lg hover:border-blue-200">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={STATUS_BADGE[n.status] || "bg-gray-100 text-gray-600 border-gray-200"}>{n.status}</Badge>
                      {n.urgent && <Badge className="bg-red-500 text-white border-red-500">URGENT</Badge>}
                      {n.verified && <Badge className="bg-green-50 text-green-700 border-green-200">VERIFIED</Badge>}
                      <span className="text-[10px] text-gray-400">{n.id}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{n.headline}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {n.category} • {n.region} • {n.createdByName || "-"}{n.assignedToName ? ` → ${n.assignedToName}` : ""}
                    </p>
                  </div>
                  <button onClick={() => setManageItem(n)} className={btnGhost + " shrink-0"}>Manage</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "directory" && isAdmin && (
        <DirectoryPanel token={token} showToast={showToast} categories={categories} setCategories={setCategories} />
      )}

      {manageItem && (
        <NewsManageModal
          newsRow={manageItem}
          token={token}
          isAdmin={isAdmin}
          isAuthority={isAuthority}
          currentUserId={currentUserId}
          users={users}
          categories={categories}
          onClose={() => setManageItem(null)}
          onChange={onManageChanged}
          onDeleted={onManageDeleted}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public / browse feed - used by Citizen, Volunteer, and staff's "Public Feed"
// ---------------------------------------------------------------------------
function BrowseFeed({ news, urgent, regular, loading, categoryNames, category, setCategory, region, setRegion, search, setSearch, expanded, setExpanded, lastRefresh, load, isVolunteer, onReport, onAddUpdate }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-base font-bold text-gray-900">Latest Disaster News</h2>
          <p className="text-xs text-gray-400 mt-0.5">Real-time disaster updates for Assam and Northeast India</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw className="h-3.5 w-3.5 text-blue-500 cursor-pointer" onClick={load} />
          <span>Updated: {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search news..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
        </div>
        <select value={region} onChange={e => setRegion(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
          {REGIONS.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {categoryNames.map(c => (
          <button key={c} onClick={() => setCategory(c)} className={"px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors " + (category === c ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading...</div>
      ) : (
        <>
          {urgent.length > 0 && (
            <div className="mb-5 p-4 bg-red-50 border border-red-100 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-4 w-4 text-red-500 animate-pulse" />
                <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Breaking News</span>
              </div>
              <div className="space-y-3">
                {urgent.map(n => (
                  <NewsCard key={n._id} news={n} expanded={expanded === n._id} onToggle={() => setExpanded(expanded === n._id ? null : n._id)} isVolunteer={isVolunteer} onReport={onReport} onAddUpdate={onAddUpdate} />
                ))}
              </div>
            </div>
          )}

          {news.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Newspaper className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No news found for the selected filters.</p>
            </div>
          )}

          <div className="space-y-3">
            {regular.map(n => (
              <NewsCard key={n._id} news={n} expanded={expanded === n._id} onToggle={() => setExpanded(expanded === n._id ? null : n._id)} isVolunteer={isVolunteer} onReport={onReport} onAddUpdate={onAddUpdate} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NewsCard({ news, expanded, onToggle, isVolunteer, onReport, onAddUpdate }) {
  const catColor = CATEGORY_COLORS[news.category] || "bg-gray-100 text-gray-600 border-gray-200";
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const approvedUpdates = (news.disasterUpdates || []).filter((u) => u.status === "Approved");

  return (
    <div className={"border rounded-xl overflow-hidden transition-all " + (news.urgent ? "border-red-200 bg-white" : "border-gray-100 bg-white hover:border-blue-200")}>
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border " + catColor}>{news.category}</span>
            {news.urgent && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">URGENT</span>}
            {news.verified && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">VERIFIED</span>}
          </div>
          <button className="text-gray-400 hover:text-gray-600 shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-2">{news.headline}</h3>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><Newspaper className="h-3 w-3" />{news.source}</span>
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{news.region}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{news.time}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50">
          <p className="text-sm text-gray-600 leading-relaxed pt-3 mb-3">{news.summary || news.content}</p>

          {news.images.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {news.images.map((img) => (
                <img key={img.url} src={API_ORIGIN + img.url} alt="" className="aspect-square object-cover rounded-lg border border-gray-100" />
              ))}
            </div>
          )}

          {news.sources.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Official sources</p>
              <div className="flex flex-wrap gap-2">
                {news.sources.map((s) => (
                  <span key={s._id} className="inline-flex items-center gap-1 text-[11px] text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">
                    <Link2 className="h-3 w-3" />{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.name}</a> : s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {approvedUpdates.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Field updates</p>
              <div className="space-y-1.5">
                {approvedUpdates.map((u) => (
                  <p key={u._id} className="text-xs text-gray-600"><span className="font-semibold">{u.addedByName || u.addedByRole}:</span> {u.text}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={(e) => { e.stopPropagation(); setReportOpen((s) => !s); }} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 font-medium">
              <Flag className="h-3 w-3" />Report a problem
            </button>
            {onAddUpdate && (
              <button onClick={(e) => { e.stopPropagation(); setUpdateOpen((s) => !s); }} className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:underline font-medium">
                <MessageSquareWarning className="h-3 w-3" />Add field update
              </button>
            )}
          </div>

          {reportOpen && (
            <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <input className={inputCls} placeholder="What's wrong with this item?" value={reportReason} onChange={(e) => setReportReason(e.target.value)} />
              <button
                className={btnPrimary}
                disabled={!reportReason.trim()}
                onClick={() => { onReport(news._id, reportReason); setReportReason(""); setReportOpen(false); }}
              >Submit</button>
            </div>
          )}
          {updateOpen && onAddUpdate && (
            <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <input className={inputCls} placeholder="Ground report (submitted for review)" value={updateText} onChange={(e) => setUpdateText(e.target.value)} />
              <button
                className={btnPrimary}
                disabled={!updateText.trim()}
                onClick={() => { onAddUpdate(news._id, updateText); setUpdateText(""); setUpdateOpen(false); }}
              >Submit</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage modal - full staff workflow on one news item
// ---------------------------------------------------------------------------
const MANAGE_TABS = [
  { id: "workflow", label: "Workflow" },
  { id: "details", label: "Details" },
  { id: "media", label: "Media" },
  { id: "sources", label: "Sources" },
  { id: "updates", label: "Updates" },
  { id: "reports", label: "Reports" },
  { id: "audit", label: "Audit" },
];

function NewsManageModal({ newsRow, token, isAdmin, isAuthority, currentUserId, users, categories, onClose, onChange, onDeleted, showToast }) {
  const [tab, setTab] = useState("workflow");
  const [item, setItem] = useState(newsRow);
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const canManage = item && (isAdmin || (isAuthority && item.assignedTo === currentUserId));
  const authorityUsers = users.filter((u) => u.role === "Authority");

  useEffect(() => {
    setTab("workflow");
    setAudit(null);
    setEditForm(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsRow && newsRow._id]);

  useEffect(() => {
    if (!newsRow) return;
    setLoading(true);
    api.news.getById(token, newsRow._id)
      .then((res) => setItem(adapt.news(res.data)))
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsRow && newsRow._id]);

  useEffect(() => {
    if (tab !== "audit" || !item || audit !== null) return;
    api.news.getAudit(token, item._id).then((res) => setAudit(res.data)).catch((err) => showToast(err.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, item && item._id]);

  function refresh(res) {
    const a = adapt.news(res.data);
    setItem(a);
    onChange(res.data);
    return a;
  }

  async function run(action, ...args) {
    try {
      const res = await action(token, item._id, ...args);
      refresh(res);
      showToast("Updated");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this news item permanently?")) return;
    try {
      await api.news.remove(token, item._id);
      showToast("News item deleted");
      onDeleted(item._id);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  if (!item) return null;

  return (
    <ModalShell onClose={onClose} maxWidth="700px">
      <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge className={STATUS_BADGE[item.status] || "bg-gray-100 text-gray-600 border-gray-200"}>{item.status}</Badge>
            {item.urgent && <Badge className="bg-red-500 text-white border-red-500">URGENT</Badge>}
            {item.verified && <Badge className="bg-green-50 text-green-700 border-green-200">VERIFIED</Badge>}
            <span className="text-[11px] text-gray-400">{item.id}</span>
          </div>
          <h3 className="text-sm font-bold text-gray-900 truncate">{item.headline}</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 pt-3">
        {MANAGE_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={"px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors " + (tab === t.id ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100")}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-center py-8 text-sm text-gray-400">Loading...</div>
        ) : (
          <>
            {tab === "workflow" && (
              <WorkflowTab item={item} canManage={canManage} isAdmin={isAdmin} authorityUsers={authorityUsers} run={run} onDelete={isAdmin ? handleDelete : null} />
            )}
            {tab === "details" && (
              <DetailsTab item={item} canManage={canManage} categories={categories} editForm={editForm} setEditForm={setEditForm} run={run} />
            )}
            {tab === "media" && <MediaTab item={item} token={token} newsId={item._id} onChange={refresh} showToast={showToast} />}
            {tab === "sources" && <SourcesTab item={item} run={run} />}
            {tab === "updates" && <UpdatesTab item={item} run={run} />}
            {tab === "reports" && <ReportsTab item={item} run={run} />}
            {tab === "audit" && <AuditTab audit={audit} />}
          </>
        )}
      </div>
    </ModalShell>
  );
}

function WorkflowTab({ item, canManage, isAdmin, authorityUsers, run, onDelete }) {
  const [rejectReason, setRejectReason] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [assignTo, setAssignTo] = useState(item.assignedTo || "");

  return (
    <div className="space-y-5">
      {item.rejectionReason && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
          <span className="font-semibold">Rejection reason: </span>{item.rejectionReason}
        </div>
      )}
      {item.scheduledFor && (
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5" />Scheduled to publish {new Date(item.scheduledFor).toLocaleString("en-IN")}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Actions</p>
        <div className="flex flex-wrap gap-2">
          {canManage && ["Draft", "Rejected"].includes(item.status) && (
            <button className={btnGhost} onClick={() => run(api.news.submit)}><Send className="h-3.5 w-3.5" />Submit for Approval</button>
          )}
          {isAdmin && item.status === "Pending Approval" && (
            <button className={btnPrimary} onClick={() => run(api.news.approve)}><CheckCircle className="h-3.5 w-3.5" />Approve</button>
          )}
          {canManage && ["Draft", "Approved"].includes(item.status) && (
            <button className={btnPrimary} onClick={() => run(api.news.publish)}><ShieldCheck className="h-3.5 w-3.5" />Publish</button>
          )}
          {!item.verified && (
            <button className={btnGhost} onClick={() => run(api.news.verify)}><CheckCircle className="h-3.5 w-3.5" />Mark Verified</button>
          )}
          <button className={btnGhost + " !text-red-600 !border-red-200"} onClick={() => run(api.news.sendEmergency)}><Bell className="h-3.5 w-3.5" />Send as Emergency</button>
          {onDelete && (
            <button className={btnGhost + " !text-red-600 !border-red-200"} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" />Delete</button>
          )}
        </div>
      </div>

      {isAdmin && item.status === "Pending Approval" && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Reject with reason</p>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Why is this being rejected?" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <button className={btnGhost + " !text-red-600 !border-red-200"} disabled={!rejectReason.trim()} onClick={() => { run(api.news.reject, { reason: rejectReason }); setRejectReason(""); }}>
              <XCircle className="h-3.5 w-3.5" />Reject
            </button>
          </div>
        </div>
      )}

      {canManage && ["Draft", "Approved"].includes(item.status) && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Schedule publication</p>
          <p className="text-[11px] text-gray-400 mb-2">{isAdmin ? "Any future time." : "Authority accounts can schedule up to 72 hours ahead."}</p>
          <div className="flex gap-2">
            <input type="datetime-local" className={inputCls} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            <button className={btnGhost} disabled={!scheduleAt} onClick={() => run(api.news.schedule, { scheduledFor: new Date(scheduleAt).toISOString() })}>
              <CalendarClock className="h-3.5 w-3.5" />Schedule
            </button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Assign responsible Authority</p>
          <div className="flex gap-2">
            <select className={inputCls} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Unassigned</option>
              {authorityUsers.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
            <button className={btnGhost} onClick={() => run(api.news.assign, { assignedTo: assignTo || null })}>
              <UserCog className="h-3.5 w-3.5" />Assign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailsTab({ item, canManage, categories, editForm, setEditForm, run }) {
  const form = editForm || {
    headline: item.headline, summary: item.summary, content: item.content,
    category: item.categoryId, region: item.region, tags: (item.tags || []).join(", "),
  };
  const set = (patch) => setEditForm({ ...form, ...patch });

  if (!canManage) {
    return (
      <div className="space-y-3 text-sm">
        <p><span className="font-semibold text-gray-700">Headline:</span> {item.headline}</p>
        <p><span className="font-semibold text-gray-700">Summary:</span> {item.summary || "-"}</p>
        <p><span className="font-semibold text-gray-700">Content:</span> {item.content}</p>
        <p><span className="font-semibold text-gray-700">Category:</span> {item.category} <span className="font-semibold text-gray-700 ml-3">Region:</span> {item.region}</p>
        <p className="text-[11px] text-gray-400">Only an Admin, or the Authority assigned to this item, can edit it.</p>
      </div>
    );
  }

  return (
    <div>
      <label className="block mb-3">
        <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Headline</span>
        <input className={inputCls} value={form.headline} onChange={(e) => set({ headline: e.target.value })} />
      </label>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <label className="block mb-3">
          <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Category</span>
          <select className={inputCls} value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block mb-3">
          <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Region</span>
          <input className={inputCls} value={form.region} onChange={(e) => set({ region: e.target.value })} />
        </label>
      </div>
      <label className="block mb-3">
        <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Tags (comma separated)</span>
        <input className={inputCls} value={form.tags} onChange={(e) => set({ tags: e.target.value })} />
      </label>
      <label className="block mb-3">
        <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Summary</span>
        <textarea rows={2} className={inputCls} value={form.summary} onChange={(e) => set({ summary: e.target.value })} />
      </label>
      <label className="block mb-4">
        <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Content</span>
        <textarea rows={5} className={inputCls} value={form.content} onChange={(e) => set({ content: e.target.value })} />
      </label>
      <button
        className={btnPrimary}
        onClick={() => run(api.news.update, {
          headline: form.headline, summary: form.summary, content: form.content,
          category: form.category, region: form.region,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        })}
      >Save Changes</button>
    </div>
  );
}

function MediaTab({ item, token, newsId, onChange, showToast }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const res = await api.news.uploadMedia(token, newsId, files);
      onChange(res);
      showToast("Media uploaded");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(url) {
    try {
      const res = await api.news.deleteMedia(token, newsId, url);
      onChange(res);
      showToast("File removed");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Images</p>
      {item.images.length === 0 && <p className="text-xs text-gray-400 mb-3">No images uploaded yet.</p>}
      {item.images.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {item.images.map((img) => (
            <div key={img.url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
              <img src={API_ORIGIN + img.url} alt="" className="w-full h-full object-cover" />
              <button onClick={() => handleDelete(img.url)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Documents</p>
      {item.documents.length === 0 && <p className="text-xs text-gray-400 mb-3">No documents uploaded yet.</p>}
      {item.documents.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {item.documents.map((d) => (
            <div key={d.url} className="flex items-center justify-between gap-2 text-xs border border-gray-100 rounded-lg px-3 py-2">
              <a href={API_ORIGIN + d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline truncate"><FileText className="h-3.5 w-3.5 shrink-0" />{d.name || d.url}</a>
              <button onClick={() => handleDelete(d.url)} className="text-gray-400 hover:text-red-600 shrink-0"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
      <button onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading} className={btnGhost}>
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" /> : <Upload className="h-3.5 w-3.5 text-blue-500" />}
        {uploading ? "Uploading..." : "Upload Files"}
      </button>
      <p className="text-[10px] text-gray-400 mt-1.5">Up to 5 files per upload.</p>
    </div>
  );
}

function SourcesTab({ item, run }) {
  const [form, setForm] = useState({ name: "", url: "" });
  return (
    <div>
      {item.sources.length === 0 && <p className="text-xs text-gray-400 mb-3">No official sources attached yet.</p>}
      <div className="space-y-1.5 mb-4">
        {item.sources.map((s) => (
          <div key={s._id} className="flex items-center justify-between gap-2 text-xs border border-gray-100 rounded-lg px-3 py-2">
            <span className="flex items-center gap-1.5 truncate"><Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />{s.name}{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline ml-1">(link)</a> : null}</span>
            <button onClick={() => run(api.news.removeSource, s._id)} className="text-gray-400 hover:text-red-600 shrink-0"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-2 mb-2">
        <input className={inputCls} placeholder="Source name (e.g. ASDMA)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={inputCls} placeholder="URL (optional)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
      </div>
      <button className={btnGhost} disabled={!form.name.trim()} onClick={() => { run(api.news.addSource, form); setForm({ name: "", url: "" }); }}>Add Source</button>
    </div>
  );
}

function UpdatesTab({ item, run }) {
  const [text, setText] = useState("");
  return (
    <div>
      {item.disasterUpdates.length === 0 && <p className="text-xs text-gray-400 mb-3">No disaster updates yet.</p>}
      <div className="space-y-2 mb-4">
        {item.disasterUpdates.map((u) => (
          <div key={u._id} className="border border-gray-100 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-gray-700">{u.addedByName || u.addedByRole}</span>
              <Badge className={u.status === "Approved" ? "bg-green-50 text-green-700 border-green-200" : u.status === "Pending" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-500 border-gray-200"}>{u.status}</Badge>
            </div>
            <p className="text-xs text-gray-600">{u.text}</p>
            {u.status === "Pending" && (
              <div className="flex gap-2 mt-2">
                <button className={btnGhost} onClick={() => run(api.news.reviewUpdate, u._id, { status: "Approved" })}><CheckCircle className="h-3.5 w-3.5" />Approve</button>
                <button className={btnGhost + " !text-red-600 !border-red-200"} onClick={() => run(api.news.reviewUpdate, u._id, { status: "Dismissed" })}><XCircle className="h-3.5 w-3.5" />Dismiss</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Add an update (auto-approved)" value={text} onChange={(e) => setText(e.target.value)} />
        <button className={btnGhost} disabled={!text.trim()} onClick={() => { run(api.news.addUpdate, { text }); setText(""); }}>Add</button>
      </div>
    </div>
  );
}

function ReportsTab({ item, run }) {
  return (
    <div>
      {item.reports.length === 0 && <p className="text-xs text-gray-400">No reports on this item.</p>}
      <div className="space-y-2">
        {item.reports.map((r) => (
          <div key={r._id} className="border border-gray-100 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-gray-700">{r.reportedByName || "User"}</span>
              <Badge className={r.status === "Open" ? "bg-amber-50 text-amber-700 border-amber-200" : r.status === "Reviewed" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-500 border-gray-200"}>{r.status}</Badge>
            </div>
            <p className="text-xs text-gray-600 mb-1">{r.reason}</p>
            {r.status === "Open" && (
              <div className="flex gap-2 mt-1">
                <button className={btnGhost} onClick={() => run(api.news.reviewReport, r._id, { status: "Reviewed" })}>Mark Reviewed</button>
                <button className={btnGhost} onClick={() => run(api.news.reviewReport, r._id, { status: "Dismissed" })}>Dismiss</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab({ audit }) {
  if (audit === null) return <div className="text-center py-8 text-sm text-gray-400">Loading...</div>;
  if (audit.length === 0) return <p className="text-xs text-gray-400">No audit entries yet.</p>;
  return (
    <div className="space-y-2">
      {audit.map((a, i) => (
        <div key={a._id || i} className="flex items-start gap-2 text-xs border-b border-gray-50 pb-2">
          <History className="h-3.5 w-3.5 text-gray-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-gray-700"><span className="font-semibold">{a.action}</span> {a.byRole ? `— ${a.byRole}` : ""}</p>
            {a.note && <p className="text-gray-400">{a.note}</p>}
            <p className="text-[10px] text-gray-300">{a.createdAt ? new Date(a.createdAt).toLocaleString("en-IN") : ""}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin-only: Categories & Sources directory
// ---------------------------------------------------------------------------
function DirectoryPanel({ token, showToast, categories, setCategories }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [srcForm, setSrcForm] = useState({ name: "", url: "", type: "Government" });

  function load() {
    setLoading(true);
    Promise.all([api.newsCategories.list(token), api.newsSources.list(token)])
      .then(([catRes, srcRes]) => {
        setCategories(catRes.data.map(adapt.newsCategory));
        setSources(srcRes.data.map(adapt.newsSource));
      })
      .catch((err) => showToast(err.message, "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function addCategory() {
    if (!catForm.name.trim()) return;
    try {
      await api.newsCategories.create(token, catForm);
      setCatForm({ name: "", description: "" });
      load();
    } catch (err) { showToast(err.message, "error"); }
  }
  async function toggleCategory(c) {
    try { await api.newsCategories.update(token, c._id, { active: !c.active }); load(); }
    catch (err) { showToast(err.message, "error"); }
  }
  async function removeCategory(c) {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try { await api.newsCategories.remove(token, c._id); load(); }
    catch (err) { showToast(err.message, "error"); }
  }

  async function addSource() {
    if (!srcForm.name.trim()) return;
    try {
      await api.newsSources.create(token, srcForm);
      setSrcForm({ name: "", url: "", type: "Government" });
      load();
    } catch (err) { showToast(err.message, "error"); }
  }
  async function toggleSource(s) {
    try { await api.newsSources.update(token, s._id, { active: !s.active }); load(); }
    catch (err) { showToast(err.message, "error"); }
  }
  async function removeSourceDir(s) {
    if (!window.confirm(`Delete source "${s.name}"?`)) return;
    try { await api.newsSources.remove(token, s._id); load(); }
    catch (err) { showToast(err.message, "error"); }
  }

  if (loading) return <div className="text-center py-12 text-sm text-gray-400">Loading...</div>;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2"><Settings2 className="h-4 w-4 text-blue-500" />News Categories</h3>
        <p className="text-xs text-gray-400 mb-4">Admin-managed taxonomy used across the newsroom.</p>
        <div className="space-y-1.5 mb-4">
          {categories.map((c) => (
            <div key={c._id} className="flex items-center justify-between gap-2 text-xs border border-gray-100 rounded-lg px-3 py-2">
              <span className={"font-medium " + (c.active ? "text-gray-800" : "text-gray-400 line-through")}>{c.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggleCategory(c)} className="text-[11px] text-blue-600 hover:underline">{c.active ? "Deactivate" : "Activate"}</button>
                <button onClick={() => removeCategory(c)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Category name" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
          <button className={btnGhost} onClick={addCategory} disabled={!catForm.name.trim()}>Add</button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-blue-500" />Source Directory</h3>
        <p className="text-xs text-gray-400 mb-4">Official sources (ASDMA, IMD, PIB...) available when citing news.</p>
        <div className="space-y-1.5 mb-4">
          {sources.map((s) => (
            <div key={s._id} className="flex items-center justify-between gap-2 text-xs border border-gray-100 rounded-lg px-3 py-2">
              <span className={"font-medium " + (s.active ? "text-gray-800" : "text-gray-400 line-through")}>{s.name} <span className="text-gray-400">({s.type})</span></span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggleSource(s)} className="text-[11px] text-blue-600 hover:underline">{s.active ? "Deactivate" : "Activate"}</button>
                <button onClick={() => removeSourceDir(s)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input className={inputCls} placeholder="Source name" value={srcForm.name} onChange={(e) => setSrcForm({ ...srcForm, name: e.target.value })} />
          <select className={inputCls} value={srcForm.type} onChange={(e) => setSrcForm({ ...srcForm, type: e.target.value })}>
            {["Government", "NGO", "Media", "International", "Other"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="URL (optional)" value={srcForm.url} onChange={(e) => setSrcForm({ ...srcForm, url: e.target.value })} />
          <button className={btnGhost} onClick={addSource} disabled={!srcForm.name.trim()}>Add</button>
        </div>
      </div>
    </div>
  );
}
