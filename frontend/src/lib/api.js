// Thin fetch client for the Suraksha backend (see aapdasetu-backend/README.md).
//
// Base URL comes from VITE_API_URL - set it in frontend/.env (copy from
// frontend/.env.example). There is no built-in fallback: a missing env var
// should surface as a clear error at startup, not a silent guess at the
// backend's address.
if (!import.meta.env.VITE_API_URL) {
  throw new Error(
    "VITE_API_URL is not set. Copy frontend/.env.example to frontend/.env and set it to your backend's API URL."
  );
}

const API_BASE = import.meta.env.VITE_API_URL.replace(/\/$/, "");

// The backend returns uploaded-file URLs as paths relative to its own origin
// (e.g. "/uploads/disasters/xyz.jpg"), not the API base (which has /api on
// the end). Strip that off so <img src={API_ORIGIN + url}> resolves correctly.
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

function qs(params) {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries).toString();
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Network-level failure (backend not running, CORS, offline, etc.)
    throw new Error(
      `Couldn't reach the API at ${API_BASE}. Is the backend running? (${err.message})`
    );
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty/non-JSON body */
  }

  if (!res.ok || !json || json.success === false) {
    const message = (json && json.message) || `Request failed with status ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return json;
}

// Real multipart/form-data upload (for endpoints backed by multer, e.g.
// disaster/shelter/news image routes). Deliberately does NOT set
// Content-Type - the browser needs to set it itself (with the multipart
// boundary) for the backend's multer middleware to parse req.files.
async function uploadRequest(path, { method = "POST", token, files, fieldName = "images" } = {}) {
  const formData = new FormData();
  for (const file of files) formData.append(fieldName, file);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: formData });
  } catch (err) {
    throw new Error(
      `Couldn't reach the API at ${API_BASE}. Is the backend running? (${err.message})`
    );
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty/non-JSON body */
  }

  if (!res.ok || !json || json.success === false) {
    const message = (json && json.message) || `Upload failed with status ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return json;
}

export const api = {
  auth: {
    register: (payload) => request("/auth/register", { method: "POST", body: payload }),
    login: (payload) => request("/auth/login", { method: "POST", body: payload }),
    me: (token) => request("/auth/me", { token }),
    updateMe: (token, payload) => request("/auth/me", { method: "PUT", token, body: payload }),
    updatePassword: (token, payload) =>
      request("/auth/me/password", { method: "PUT", token, body: payload }),
  },
  disasters: {
    list: (token, params) => request(`/disasters${qs(params)}`, { token }),
    getById: (token, id) => request(`/disasters/${id}`, { token }),
    create: (token, payload) => request("/disasters", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/disasters/${id}`, { method: "PUT", token, body: payload }),
    updateStatus: (token, id, payload) =>
      request(`/disasters/${id}/status`, { method: "PATCH", token, body: payload }),
    remove: (token, id) => request(`/disasters/${id}`, { method: "DELETE", token }),
    // Incident workflow actions - see backend/src/config/incidentPermissions.js
    verify: (token, id) => request(`/disasters/${id}/verify`, { method: "PATCH", token }),
    reject: (token, id, payload) =>
      request(`/disasters/${id}/reject`, { method: "PATCH", token, body: payload }),
    changePriority: (token, id, payload) =>
      request(`/disasters/${id}/priority`, { method: "PATCH", token, body: payload }),
    assignAuthority: (token, id, payload) =>
      request(`/disasters/${id}/assign-authority`, { method: "PATCH", token, body: payload }),
    assignVolunteer: (token, id, payload) =>
      request(`/disasters/${id}/assign-volunteer`, { method: "PATCH", token, body: payload }),
    assignNgo: (token, id, payload) =>
      request(`/disasters/${id}/assign-ngo`, { method: "PATCH", token, body: payload }),
    addNote: (token, id, payload) =>
      request(`/disasters/${id}/notes`, { method: "POST", token, body: payload }),
    requestResponse: (token, id, payload) =>
      request(`/disasters/${id}/request-response`, { method: "POST", token, body: payload }),
    createResponseTask: (token, id, payload) =>
      request(`/disasters/${id}/response-task`, { method: "POST", token, body: payload }),
    coordinate: (token, id, payload) =>
      request(`/disasters/${id}/coordinate`, { method: "PATCH", token, body: payload }),
    escalate: (token, id, payload) =>
      request(`/disasters/${id}/escalate`, { method: "PATCH", token, body: payload }),
    resolve: (token, id, payload) =>
      request(`/disasters/${id}/resolve`, { method: "PATCH", token, body: payload }),
    reopen: (token, id, payload) =>
      request(`/disasters/${id}/reopen`, { method: "PATCH", token, body: payload }),
    history: (token, id) => request(`/disasters/${id}/history`, { token }),
    auditLogs: (token, params) => request(`/disasters/audit-logs${qs(params)}`, { token }),
    // Evidence photos/videos - multipart upload (field "images", max 5), see
    // backend/src/middleware/uploadMiddleware.js. deleteImage takes the exact
    // URL string as returned in a disaster's `images` array.
    uploadImages: (token, id, files) =>
      uploadRequest(`/disasters/${id}/images`, { token, files, fieldName: "images" }),
    deleteImage: (token, id, imageUrl) =>
      request(`/disasters/${id}/images`, { method: "DELETE", token, body: { imageUrl } }),
  },
  shelters: {
    list: (params) => request(`/shelters${qs(params)}`),
    getById: (id) => request(`/shelters/${id}`),
    create: (token, payload) => request("/shelters", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/shelters/${id}`, { method: "PUT", token, body: payload }),
    updateOccupancy: (token, id, payload) =>
      request(`/shelters/${id}/occupancy`, { method: "PATCH", token, body: payload }),
    approve: (token, id, decision) =>
      request(`/shelters/${id}/approve`, { method: "PATCH", token, body: { decision } }),
    requestDeletion: (token, id, reason) =>
      request(`/shelters/${id}/request-delete`, { method: "POST", token, body: { reason } }),
    remove: (token, id) => request(`/shelters/${id}`, { method: "DELETE", token }),
    stats: (token) => request(`/shelters/stats/summary`, { token }),
    // Images - same multipart pattern as disasters, field "images", max 5.
    uploadImages: (token, id, files) =>
      uploadRequest(`/shelters/${id}/images`, { token, files, fieldName: "images" }),
    deleteImage: (token, id, imageUrl) =>
      request(`/shelters/${id}/images`, { method: "DELETE", token, body: { imageUrl } }),
    // Citizen self-service: "which shelter am I assigned/checked in to"
    myStatus: (token) => request(`/shelters/me/status`, { token }),
    // Occupants: assign / check-in / check-out / transfer
    getOccupants: (token, id, params) => request(`/shelters/${id}/occupants${qs(params)}`, { token }),
    assignCitizen: (token, id, payload) =>
      request(`/shelters/${id}/assign`, { method: "POST", token, body: payload }),
    checkIn: (token, id, payload) =>
      request(`/shelters/${id}/checkin`, { method: "POST", token, body: payload }),
    checkOut: (token, id, payload) =>
      request(`/shelters/${id}/checkout`, { method: "POST", token, body: payload }),
    transferCitizen: (token, id, payload) =>
      request(`/shelters/${id}/transfer`, { method: "POST", token, body: payload }),
    // Supplies (food/water/medical)
    getResources: (token, id, params) => request(`/shelters/${id}/resources${qs(params)}`, { token }),
    addResource: (token, id, payload) =>
      request(`/shelters/${id}/resources`, { method: "POST", token, body: payload }),
    updateResource: (token, id, resourceId, payload) =>
      request(`/shelters/${id}/resources/${resourceId}`, { method: "PATCH", token, body: payload }),
    // Facilities (bedding/food/water/medical availability flags)
    updateFacilities: (token, id, payload) =>
      request(`/shelters/${id}/facilities`, { method: "PATCH", token, body: payload }),
    // Volunteers
    assignVolunteer: (token, id, volunteerId) =>
      request(`/shelters/${id}/volunteers/${volunteerId}/assign`, { method: "PATCH", token }),
    getVolunteers: (token, id) => request(`/shelters/${id}/volunteers`, { token }),
    // Shelter-scoped volunteer tasks
    getTasks: (token, id) => request(`/shelters/${id}/tasks`, { token }),
    createTask: (token, id, payload) =>
      request(`/shelters/${id}/tasks`, { method: "POST", token, body: payload }),
    // Problems
    getProblems: (token, id, params) => request(`/shelters/${id}/problems${qs(params)}`, { token }),
    reportProblem: (token, id, payload) =>
      request(`/shelters/${id}/problems`, { method: "POST", token, body: payload }),
    resolveProblem: (token, id, problemId, payload) =>
      request(`/shelters/${id}/problems/${problemId}/resolve`, { method: "PATCH", token, body: payload }),
    // Alerts
    sendAlert: (token, id, payload) =>
      request(`/shelters/${id}/alerts`, { method: "POST", token, body: payload }),
    // Audit / history
    getAudit: (token, id) => request(`/shelters/${id}/audit`, { token }),
  },
  resources: {
    list: (token, params) => request(`/resources${qs(params)}`, { token }),
    create: (token, payload) => request("/resources", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/resources/${id}`, { method: "PUT", token, body: payload }),
    adjustQuantity: (token, id, payload) =>
      request(`/resources/${id}/quantity`, { method: "PATCH", token, body: payload }),
    remove: (token, id) => request(`/resources/${id}`, { method: "DELETE", token }),
  },
  volunteers: {
    list: (token, params) => request(`/volunteers${qs(params)}`, { token }),
    me: (token) => request("/volunteers/me", { token }),
    register: (token, payload) => request("/volunteers", { method: "POST", token, body: payload }),
    updateMe: (token, payload) =>
      request("/volunteers/me", { method: "PUT", token, body: payload }),
    updateStatus: (token, id, payload) =>
      request(`/volunteers/${id}/status`, { method: "PATCH", token, body: payload }),
    assign: (token, id, payload) =>
      request(`/volunteers/${id}/assign`, { method: "PATCH", token, body: payload }),
    remove: (token, id) => request(`/volunteers/${id}`, { method: "DELETE", token }),
  },
  teams: {
    list: (token, params) => request(`/teams${qs(params)}`, { token }),
    mine: (token) => request("/teams/me", { token }),
    getById: (token, id) => request(`/teams/${id}`, { token }),
    create: (token, payload) => request("/teams", { method: "POST", token, body: payload }),
    update: (token, id, payload) => request(`/teams/${id}`, { method: "PUT", token, body: payload }),
    remove: (token, id) => request(`/teams/${id}`, { method: "DELETE", token }),
    addMembers: (token, id, members) =>
      request(`/teams/${id}/members`, { method: "POST", token, body: { members } }),
    removeMember: (token, id, volunteerId) =>
      request(`/teams/${id}/members/${volunteerId}`, { method: "DELETE", token }),
    notify: (token, id, payload) => request(`/teams/${id}/notify`, { method: "POST", token, body: payload }),
  },
  tasks: {
    list: (token, params) => request(`/tasks${qs(params)}`, { token }),
    mine: (token) => request("/tasks/me", { token }),
    create: (token, payload) => request("/tasks", { method: "POST", token, body: payload }),
    update: (token, id, payload) => request(`/tasks/${id}`, { method: "PUT", token, body: payload }),
    updateStatus: (token, id, payload) =>
      request(`/tasks/${id}/status`, { method: "PATCH", token, body: payload }),
    remove: (token, id) => request(`/tasks/${id}`, { method: "DELETE", token }),
  },
  donations: {
    list: (token, params) => request(`/donations${qs(params)}`, { token }),
    mine: (token) => request("/donations/me", { token }),
    create: (token, payload) => request("/donations", { method: "POST", token, body: payload }),
    updateStatus: (token, id, payload) =>
      request(`/donations/${id}/status`, { method: "PATCH", token, body: payload }),
    verify: (token, id) => request(`/donations/${id}/verify`, { method: "PATCH", token }),
  },
  alerts: {
    list: (params) => request(`/alerts${qs(params)}`),
    create: (token, payload) => request("/alerts", { method: "POST", token, body: payload }),
    deactivate: (token, id) => request(`/alerts/${id}/deactivate`, { method: "PATCH", token }),
    remove: (token, id) => request(`/alerts/${id}`, { method: "DELETE", token }),
  },
  users: {
    list: (token) => request("/users", { token }),
    updateRole: (token, id, payload) =>
      request(`/users/${id}/role`, { method: "PATCH", token, body: payload }),
    updateStatus: (token, id, payload) =>
      request(`/users/${id}/status`, { method: "PATCH", token, body: payload }),
    remove: (token, id) => request(`/users/${id}`, { method: "DELETE", token }),
  },
  dashboard: {
    summary: (token) => request("/dashboard/summary", { token }),
    trends: (token) => request("/dashboard/trends", { token }),
  },
  notifications: {
    list: (token) => request("/notifications", { token }),
    unreadCount: (token) => request("/notifications/unread-count", { token }),
    markRead: (token, id) => request(`/notifications/${id}/read`, { method: "PATCH", token }),
    markAllRead: (token) => request("/notifications/read-all", { method: "PATCH", token }),
    // Authority/Admin only - backend enforces this too (see notificationRoutes.js)
    remove: (token, id) => request(`/notifications/${id}`, { method: "DELETE", token }),
  },
  contacts: {
    // Public - no auth required to view
    list: () => request("/contacts"),
    create: (token, payload) => request("/contacts", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/contacts/${id}`, { method: "PUT", token, body: payload }),
    remove: (token, id) => request(`/contacts/${id}`, { method: "DELETE", token }),
  },
  ngos: {
    list: (token, params) => request(`/ngos${qs(params)}`, { token }),
    getById: (token, id) => request(`/ngos/${id}`, { token }),
    register: (token, payload) => request("/ngos", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/ngos/${id}`, { method: "PUT", token, body: payload }),
    updateStatus: (token, id, payload) =>
      request(`/ngos/${id}/status`, { method: "PATCH", token, body: payload }),
    deactivate: (token, id, payload) =>
      request(`/ngos/${id}/deactivate`, { method: "PATCH", token, body: payload }),
    suspend: (token, id, payload) =>
      request(`/ngos/${id}/suspend`, { method: "PATCH", token, body: payload }),
    unsuspend: (token, id) => request(`/ngos/${id}/unsuspend`, { method: "PATCH", token }),
    verifyDocuments: (token, id, payload) =>
      request(`/ngos/${id}/verify-documents`, { method: "PATCH", token, body: payload }),
    verifyIdentity: (token, id, payload) =>
      request(`/ngos/${id}/verify-identity`, { method: "PATCH", token, body: payload }),
    assign: (token, id, payload) =>
      request(`/ngos/${id}/assign`, { method: "PATCH", token, body: payload }),
    updateServices: (token, id, payload) =>
      request(`/ngos/${id}/services`, { method: "PUT", token, body: payload }),
    getAudit: (token, id) => request(`/ngos/${id}/audit`, { token }),
    remove: (token, id) => request(`/ngos/${id}`, { method: "DELETE", token }),
  },
  campaigns: {
    list: (token, params) => request(`/campaigns${qs(params)}`, { token }),
    getById: (token, id) => request(`/campaigns/${id}`, { token }),
    create: (token, payload) => request("/campaigns", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/campaigns/${id}`, { method: "PUT", token, body: payload }),
    approve: (token, id, payload) =>
      request(`/campaigns/${id}/approve`, { method: "PATCH", token, body: payload }),
    close: (token, id, payload) =>
      request(`/campaigns/${id}/close`, { method: "PATCH", token, body: payload }),
    suspend: (token, id, payload) =>
      request(`/campaigns/${id}/suspend`, { method: "PATCH", token, body: payload }),
    remove: (token, id) => request(`/campaigns/${id}`, { method: "DELETE", token }),
  },
  // Financial assistance requests - see lib/fundPermissions.js for which role can call which
  assistanceRequests: {
    list: (token, params) => request(`/assistance-requests${qs(params)}`, { token }),
    getById: (token, id) => request(`/assistance-requests/${id}`, { token }),
    create: (token, payload) => request("/assistance-requests", { method: "POST", token, body: payload }),
    uploadDocuments: (token, id, payload) =>
      request(`/assistance-requests/${id}/documents`, { method: "POST", token, body: payload }),
    // Real file upload (multipart/form-data) - backend addition made
    // alongside this UI, see backend/src/controllers/assistanceController.js
    uploadDocumentFiles: (token, id, files) =>
      uploadRequest(`/assistance-requests/${id}/documents/upload`, { token, files, fieldName: "documents" }),
    deleteDocument: (token, id, url) =>
      request(`/assistance-requests/${id}/documents`, { method: "DELETE", token, body: { url } }),
    fieldVerify: (token, id, payload) =>
      request(`/assistance-requests/${id}/field-verify`, { method: "PATCH", token, body: payload }),
    verify: (token, id) => request(`/assistance-requests/${id}/verify`, { method: "PATCH", token }),
    approve: (token, id, payload) =>
      request(`/assistance-requests/${id}/approve`, { method: "PATCH", token, body: payload }),
    reject: (token, id, payload) =>
      request(`/assistance-requests/${id}/reject`, { method: "PATCH", token, body: payload }),
    allocate: (token, id, payload) =>
      request(`/assistance-requests/${id}/allocate`, { method: "PATCH", token, body: payload }),
  },
  // Fund balance / utilization / transactions / reports / misuse - see lib/fundPermissions.js
  funds: {
    balance: (token, campaignId) => request(`/funds/campaigns/${campaignId}/balance`, { token }),
    adjustBalance: (token, campaignId, payload) =>
      request(`/funds/campaigns/${campaignId}/adjust`, { method: "POST", token, body: payload }),
    utilization: (token, campaignId) => request(`/funds/campaigns/${campaignId}/utilization`, { token }),
    transactions: (token, params) => request(`/funds/transactions${qs(params)}`, { token }),
    reports: (token, params) => request(`/funds/reports${qs(params)}`, { token }),
    exportReportsUrl: (params) => `${API_BASE}/funds/reports/export${qs(params)}`,
    notifyDonors: (token, campaignId, payload) =>
      request(`/funds/campaigns/${campaignId}/notify`, { method: "POST", token, body: payload }),
    reportMisuse: (token, payload) =>
      request("/funds/misuse-reports", { method: "POST", token, body: payload }),
    misuseReports: (token, params) => request(`/funds/misuse-reports${qs(params)}`, { token }),
    updateMisuseReport: (token, id, payload) =>
      request(`/funds/misuse-reports/${id}`, { method: "PATCH", token, body: payload }),
    auditLogs: (token, params) => request(`/funds/audit${qs(params)}`, { token }),
  },
  // Map / risk module - see lib/mapPermissions.js for which role can call which
  // of these, and with what scope. The backend re-enforces every one of these
  // rules server-side (backend/src/config/mapPermissions.js) - the frontend
  // checks are for UI gating only, never trust them alone.
  map: {
    live: (token) => request("/map/live", { token }),
    overallRisk: (token) => request("/map/overall-risk", { token }),
    layers: (token) => request("/map/layers", { token }),
    weather: (token, params) => request(`/map/weather${qs(params)}`, { token }),
    disasterRiskScore: (token, disasterId) => request(`/map/disasters/${disasterId}/risk-score`, { token }),
    overrideDisasterRiskScore: (token, disasterId, payload) =>
      request(`/map/disasters/${disasterId}/risk-score/override`, { method: "PATCH", token, body: payload }),
    sendAlert: (token, payload) => request("/map/alerts", { method: "POST", token, body: payload }),
    report: (token) => request("/map/report", { token }),
    analytics: (token) => request("/map/analytics", { token }),
    history: (token, params) => request(`/map/history${qs(params)}`, { token }),
  },
  riskZones: {
    list: (token, params) => request(`/map/risk-zones${qs(params)}`, { token }),
    getById: (token, id) => request(`/map/risk-zones/${id}`, { token }),
    create: (token, payload) => request("/map/risk-zones", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/map/risk-zones/${id}`, { method: "PUT", token, body: payload }),
    remove: (token, id) => request(`/map/risk-zones/${id}`, { method: "DELETE", token }),
    override: (token, id, payload) =>
      request(`/map/risk-zones/${id}/override`, { method: "PATCH", token, body: payload }),
  },
  evacuationRoutes: {
    list: (token, params) => request(`/map/evacuation-routes${qs(params)}`, { token }),
    getById: (token, id) => request(`/map/evacuation-routes/${id}`, { token }),
    create: (token, payload) => request("/map/evacuation-routes", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/map/evacuation-routes/${id}`, { method: "PUT", token, body: payload }),
    markEvacuated: (token, id) =>
      request(`/map/evacuation-routes/${id}/mark-evacuated`, { method: "PATCH", token }),
    remove: (token, id) => request(`/map/evacuation-routes/${id}`, { method: "DELETE", token }),
  },
  news: {
    list: (token, params) => request(`/news${qs(params)}`, { token }),
    getById: (token, id) => request(`/news/${id}`, { token }),
    create: (token, payload) => request("/news", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/news/${id}`, { method: "PUT", token, body: payload }),
    remove: (token, id) => request(`/news/${id}`, { method: "DELETE", token }),
    assign: (token, id, payload) =>
      request(`/news/${id}/assign`, { method: "PATCH", token, body: payload }),
    submit: (token, id) => request(`/news/${id}/submit`, { method: "PATCH", token }),
    approve: (token, id) => request(`/news/${id}/approve`, { method: "PATCH", token }),
    reject: (token, id, payload) =>
      request(`/news/${id}/reject`, { method: "PATCH", token, body: payload }),
    publish: (token, id) => request(`/news/${id}/publish`, { method: "PATCH", token }),
    verify: (token, id) => request(`/news/${id}/verify`, { method: "PATCH", token }),
    addUpdate: (token, id, payload) =>
      request(`/news/${id}/updates`, { method: "POST", token, body: payload }),
    reviewUpdate: (token, id, updateId, payload) =>
      request(`/news/${id}/updates/${updateId}`, { method: "PATCH", token, body: payload }),
    uploadMedia: (token, id, files) =>
      uploadRequest(`/news/${id}/media`, { token, files, fieldName: "files" }),
    deleteMedia: (token, id, url) =>
      request(`/news/${id}/media`, { method: "DELETE", token, body: { url } }),
    addSource: (token, id, payload) =>
      request(`/news/${id}/sources`, { method: "POST", token, body: payload }),
    removeSource: (token, id, sourceId) =>
      request(`/news/${id}/sources/${sourceId}`, { method: "DELETE", token }),
    report: (token, id, payload) =>
      request(`/news/${id}/report`, { method: "POST", token, body: payload }),
    reviewReport: (token, id, reportId, payload) =>
      request(`/news/${id}/reports/${reportId}`, { method: "PATCH", token, body: payload }),
    sendEmergency: (token, id) => request(`/news/${id}/emergency`, { method: "PATCH", token }),
    schedule: (token, id, payload) =>
      request(`/news/${id}/schedule`, { method: "PATCH", token, body: payload }),
    stats: (token) => request("/news/stats/summary", { token }),
    getAudit: (token, id) => request(`/news/${id}/audit`, { token }),
  },
  newsCategories: {
    list: (token) => request("/news-categories", { token }),
    create: (token, payload) =>
      request("/news-categories", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/news-categories/${id}`, { method: "PUT", token, body: payload }),
    remove: (token, id) => request(`/news-categories/${id}`, { method: "DELETE", token }),
  },
  newsSources: {
    list: (token) => request("/news-sources", { token }),
    create: (token, payload) =>
      request("/news-sources", { method: "POST", token, body: payload }),
    update: (token, id, payload) =>
      request(`/news-sources/${id}`, { method: "PUT", token, body: payload }),
    remove: (token, id) => request(`/news-sources/${id}`, { method: "DELETE", token }),
  },
  roadBlocks: {
    list: (token, params) => request(`/map/road-blocks${qs(params)}`, { token }),
    getById: (token, id) => request(`/map/road-blocks/${id}`, { token }),
    report: (token, payload) => request("/map/road-blocks", { method: "POST", token, body: payload }),
    confirm: (token, id) => request(`/map/road-blocks/${id}/confirm`, { method: "PATCH", token }),
    clear: (token, id) => request(`/map/road-blocks/${id}/clear`, { method: "PATCH", token }),
    remove: (token, id) => request(`/map/road-blocks/${id}`, { method: "DELETE", token }),
  },
  // AI Risk Engine - see backend/src/controllers/aiRiskController.js and
  // config/aiRiskPermissions.js. Settings rows (§3.14 Admin-only) wired in
  // Phase 9; view-only endpoints and AI workflow actions wired in Phase 10.
  aiRisk: {
    getThresholds: (token) => request("/ai-risk/settings/thresholds", { token }),
    updateThresholds: (token, payload) =>
      request("/ai-risk/settings/thresholds", { method: "PUT", token, body: payload }),
    getWeights: (token) => request("/ai-risk/settings/weights", { token }),
    updateWeights: (token, payload) =>
      request("/ai-risk/settings/weights", { method: "PUT", token, body: payload }),
    getDisasterTypes: (token) => request("/ai-risk/settings/disaster-types", { token }),
    addDisasterType: (token, payload) =>
      request("/ai-risk/settings/disaster-types", { method: "POST", token, body: payload }),
    updateDisasterType: (token, name, payload) =>
      request(`/ai-risk/settings/disaster-types/${encodeURIComponent(name)}`, { method: "PUT", token, body: payload }),
    removeDisasterType: (token, name) =>
      request(`/ai-risk/settings/disaster-types/${encodeURIComponent(name)}`, { method: "DELETE", token }),
    getSettings: (token) => request("/ai-risk/settings/general", { token }),
    updateSettings: (token, payload) =>
      request("/ai-risk/settings/general", { method: "PUT", token, body: payload }),
    getDataSources: (token) => request("/ai-risk/settings/data-sources", { token }),
    addDataSource: (token, payload) =>
      request("/ai-risk/settings/data-sources", { method: "POST", token, body: payload }),
    updateDataSource: (token, id, payload) =>
      request(`/ai-risk/settings/data-sources/${id}`, { method: "PUT", token, body: payload }),
    removeDataSource: (token, id) =>
      request(`/ai-risk/settings/data-sources/${id}`, { method: "DELETE", token }),
    // --- Views ---
    getOverallRisk: (token) => request("/ai-risk/overall", { token }),
    getRiskScore: (token, params) => request(`/ai-risk/risk-score${qs(params)}`, { token }),
    getRiskFactors: (token) => request("/ai-risk/factors", { token }),
    getAffectedAreas: (token) => request("/ai-risk/affected-areas", { token }),
    getPopulationAtRisk: (token) => request("/ai-risk/population-at-risk", { token }),
    getShelterRecommendations: (token, params) =>
      request(`/ai-risk/shelter-recommendations${qs(params)}`, { token }),
    getEvacuationRecommendations: (token) => request("/ai-risk/evacuation-recommendations", { token }),
    getResourcePredictions: (token) => request("/ai-risk/resource-predictions", { token }),
    getResourceShortages: (token) => request("/ai-risk/resource-shortages", { token }),
    getAiAccuracy: (token) => request("/ai-risk/accuracy", { token }),
    getAuditLogs: (token, params) => request(`/ai-risk/audit-logs${qs(params)}`, { token }),
    // --- Predictions ---
    getPredictionHistory: (token, params) => request(`/ai-risk/predictions/history${qs(params)}`, { token }),
    listPredictions: (token, params) => request(`/ai-risk/predictions${qs(params)}`, { token }),
    generateAssessment: (token, payload) =>
      request("/ai-risk/predictions", { method: "POST", token, body: payload }),
    approvePrediction: (token, id) =>
      request(`/ai-risk/predictions/${id}/approve`, { method: "PATCH", token }),
    confirmPrediction: (token, id, payload) =>
      request(`/ai-risk/predictions/${id}/confirm`, { method: "PATCH", token, body: payload }),
    analyzeCitizenReports: (token, id, reportIds) =>
      request(`/ai-risk/predictions/${id}/analyze-reports`, { method: "POST", token, body: { reportIds } }),
    recordOutcome: (token, id, outcome) =>
      request(`/ai-risk/predictions/${id}/outcome`, { method: "PATCH", token, body: { outcome } }),
    // --- Ground conditions ---
    getGroundConditions: (token, params) => request(`/ai-risk/ground-conditions${qs(params)}`, { token }),
    reportGroundCondition: (token, payload) =>
      request("/ai-risk/ground-conditions", { method: "POST", token, body: payload }),
  },
};

// Maps the backend's role strings onto the lowercase role keys the UI uses.
export const ROLE_TO_KEY = { Citizen: "citizen", Authority: "authority", Volunteer: "volunteer", Admin: "admin" };
export const KEY_TO_ROLE = { citizen: "Citizen", authority: "Authority", volunteer: "Volunteer", admin: "Admin" };

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return new Date(dateStr).toLocaleDateString();
}

// Adapters translate backend documents into the flat row shapes the existing
// UI components (tables, cards) already render, so the JSX below barely has
// to change. Each adapted row keeps the backend `_id` around (for API calls)
// alongside the human-friendly `id` the UI displays.
// Turns an array that may be raw ObjectId strings (list endpoints, not
// populated) or populated ref documents (detail endpoint) into a uniform
// { _id, label } shape. label is null when the item wasn't populated.
function ngoRefList(arr, labelFn) {
  return (arr || []).map((item) => {
    if (item && typeof item === "object" && item._id) {
      return { _id: item._id, label: labelFn(item) };
    }
    return { _id: item, label: null };
  });
}

export const adapt = {
  disaster: (d) => ({
    _id: d._id,
    id: d.disasterId || d._id,
    type: d.type,
    location: d.location,
    lat: d.coordinates?.lat,
    lng: d.coordinates?.lng,
    severity: d.severity,
    reportedBy: d.reportedByName || "Unknown",
    date: d.createdAt ? new Date(d.createdAt).toLocaleString() : "-",
    createdAt: d.createdAt,
    status: d.status,
    team: d.team || "Unassigned",
    images: d.images || [],
  }),
  shelter: (s) => ({
    _id: s._id,
    id: s.shelterId || s._id,
    name: s.name,
    location: s.location,
    lat: s.coordinates?.lat,
    lng: s.coordinates?.lng,
    capacity: s.capacity,
    occupancy: s.currentOccupancy,
    // Backend statuses are Active/Full/Closed; the UI's badge styling expects
    // Available/Almost Full/Full, so nudge "Active" -> "Available" for display.
    status: s.status === "Active" ? "Available" : s.status,
    contact: s.contactPhone || s.contactPerson || "-",
    contactPerson: s.contactPerson || "",
    contactPhone: s.contactPhone || "",
    images: s.images || [],
    approvalStatus: s.approvalStatus || "Approved",
    managedBy: s.managedBy?._id || s.managedBy || null,
    managedByName: s.managedBy?.name || "",
    deletionRequested: !!s.deletionRequested,
    // Populated on list/detail reads as { _id, disasterId, type, location };
    // raw ObjectId string if the endpoint didn't populate it; null if unset.
    relatedDisaster: s.relatedDisaster && typeof s.relatedDisaster === "object"
      ? { _id: s.relatedDisaster._id, id: s.relatedDisaster.disasterId, type: s.relatedDisaster.type, location: s.relatedDisaster.location }
      : (s.relatedDisaster || null),
    resources: {
      food: !!s.resources?.food,
      water: !!s.resources?.water,
      medical: !!s.resources?.medical,
      bedding: !!s.resources?.bedding,
    },
  }),
  resource: (r) => ({
    _id: r._id,
    id: r.resourceId || r._id,
    name: r.name,
    category: r.category,
    available: r.quantity,
    // The backend tracks a low-stock threshold rather than a "required" target;
    // it's the closest analogue for the existing available/required progress bar.
    required: r.lowStockThreshold,
    unit: r.unit || "units",
    notes: r.notes || "",
    status: r.status,
  }),
  volunteer: (v) => ({
    _id: v._id,
    id: v.volunteerId || v._id,
    userId: v.user?._id || v.user || null,
    name: v.user?.name || "Unknown",
    email: v.user?.email || "",
    phone: v.user?.phone || "",
    skills: Array.isArray(v.skills) ? v.skills.join(", ") : v.skills || "",
    skillsArray: Array.isArray(v.skills) ? v.skills : [],
    district: v.district || "",
    availability: v.availability || "Available",
    status: v.status,
    ngo: v.ngo || null,
    notes: v.notes || "",
    createdAt: v.createdAt,
    // Populated ref objects from the backend (or null) -> a simple
    // { _id, label } shape the assign UI can select against and display.
    assignedDisaster: v.assignedDisaster
      ? { _id: v.assignedDisaster._id, label: `${v.assignedDisaster.type || ""} - ${v.assignedDisaster.location || ""}`.trim() }
      : null,
    assignedShelter: v.assignedShelter
      ? { _id: v.assignedShelter._id, label: v.assignedShelter.name || v.assignedShelter.shelterId || "" }
      : null,
  }),
  team: (t) => ({
    _id: t._id,
    id: t.teamId || t._id,
    name: t.name,
    description: t.description || "",
    district: t.district || "",
    status: t.status || "Active",
    notes: t.notes || "",
    createdAt: t.createdAt,
    leader: t.leader
      ? { _id: t.leader._id, name: t.leader.user?.name || "Unknown", volunteerId: t.leader.volunteerId }
      : null,
    members: Array.isArray(t.members)
      ? t.members.map((m) =>
          m && typeof m === "object"
            ? { _id: m._id, name: m.user?.name || "Unknown", email: m.user?.email || "", skills: Array.isArray(m.skills) ? m.skills.join(", ") : "" }
            : { _id: m, name: "Unknown" }
        )
      : [],
    assignedDisaster: t.assignedDisaster
      ? { _id: t.assignedDisaster._id, label: `${t.assignedDisaster.type || ""} - ${t.assignedDisaster.location || ""}`.trim() }
      : null,
    assignedShelter: t.assignedShelter
      ? { _id: t.assignedShelter._id, label: t.assignedShelter.name || t.assignedShelter.shelterId || "" }
      : null,
    createdByName: t.createdBy?.name || "",
  }),
  task: (t) => ({
    _id: t._id,
    id: t.taskId || t._id,
    disaster: t.relatedDisaster
      ? `${t.relatedDisaster.type} - ${t.relatedDisaster.location}`
      : t.relatedShelter
      ? t.relatedShelter.name
      : "General",
    task: t.title,
    status: t.status,
    uploaded: false, // no backend equivalent field; tracked client-side only
  }),
  user: (u) => ({
    _id: u._id,
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
  }),
  alert: (a) => ({
    _id: a._id,
    id: a.alertId || a._id,
    title: a.title,
    type: a.type,
    location: a.location,
    priority: a.priority,
    time: a.createdAt ? timeAgo(a.createdAt) : "-",
    desc: a.description || "",
  }),
  contact: (c) => ({
    _id: c._id,
    id: c._id,
    name: c.name,
    number: c.number,
    category: c.category,
    order: c.order || 0,
  }),
  ngo: (n) => ({
    _id: n._id,
    id: n.ngoId || n._id,
    name: n.name,
    type: n.type,
    registrationNumber: n.registrationNumber,
    areaOfOperation: n.areaOfOperation || "",
    activities: n.activities || "",
    contactPhone: n.contactPhone || "",
    contactEmail: n.contactEmail || "",
    website: n.website || "",
    bankName: n.bankName || "",
    ifsc: n.ifsc || "",
    accountNumber: n.accountNumber || "",
    documents: n.documents || [],
    status: n.status,
    reviewNotes: n.reviewNotes || "",
    registeredBy: n.registeredBy?.name || "",
    campaignCount: n.campaignCount || 0,
    totalRaised: n.totalRaised || 0,
    totalDonors: n.totalDonors || 0,
    createdAt: n.createdAt,
    // --- Lifecycle/trust + assignment fields (mainly used by the staff
    // manage modal - list endpoints send raw ids, getById sends populated
    // docs; ngoRefList() handles either shape). ---
    isActive: n.isActive !== undefined ? n.isActive : true,
    suspended: !!n.suspended,
    suspendedReason: n.suspendedReason || "",
    documentsVerified: !!n.documentsVerified,
    identityVerified: !!n.identityVerified,
    services: n.services || [],
    assignedAuthorities: ngoRefList(n.assignedAuthorities, (a) => a.name),
    assignedDisasters: ngoRefList(n.assignedDisasters, (d) => `${d.type || ""} - ${d.location || ""}`.trim()),
    assignedShelters: ngoRefList(n.assignedShelters, (s) => s.name || s.shelterId || ""),
    assignedAreas: n.assignedAreas || [],
  }),
  donation: (d) => ({
    _id: d._id,
    id: d.donationId || d._id,
    campaign: d.relatedCampaign?.title || "General Fund",
    donorName: d.donorName,
    amount: d.amount || 0,
    method: d.paymentMethod || "-",
    date: d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-IN") : "-",
    status: d.status,
    isAnonymous: Boolean(d.isAnonymous),
    verified: Boolean(d.verified),
  }),
  campaign: (c) => ({
    _id: c._id,
    id: c.campaignId || c._id,
    title: c.title,
    ngoId: c.ngo?._id || c.ngo,
    ngoName: c.ngo?.name || "Unknown NGO",
    relatedDisaster: c.relatedDisaster?._id || c.relatedDisaster || null,
    disasterLabel: c.relatedDisaster
      ? `${c.relatedDisaster.type} - ${c.relatedDisaster.location}`
      : "",
    description: c.description || "",
    location: c.location || "",
    target: c.target || 0,
    raised: c.raised || 0,
    donors: c.donors || 0,
    deadline: c.deadline ? new Date(c.deadline).toLocaleDateString() : "",
    bankDetails: c.bankDetails || "",
    status: c.status,
    approvalStatus: c.approvalStatus || "Approved",
    createdBy: c.createdBy?._id || c.createdBy || null,
  }),
  assistanceRequest: (r) => ({
    _id: r._id,
    id: r.requestId || r._id,
    requestedBy: r.requestedBy?._id || r.requestedBy,
    requesterName: r.requestedBy?.name || "Unknown",
    requesterRole: r.requestedBy?.role || "",
    relatedDisaster: r.relatedDisaster?._id || r.relatedDisaster || null,
    disasterLabel: r.relatedDisaster ? `${r.relatedDisaster.type} - ${r.relatedDisaster.location}` : "",
    relatedShelter: r.relatedShelter?._id || r.relatedShelter || null,
    shelterLabel: r.relatedShelter?.name || "",
    relatedCampaign: r.relatedCampaign?._id || r.relatedCampaign || null,
    campaignLabel: r.relatedCampaign?.title || "",
    category: r.category || "Other",
    reason: r.reason || "",
    amountRequested: r.amountRequested || 0,
    documents: r.documents || [],
    status: r.status,
    fieldVerifiedByName: r.fieldVerifiedBy?.name || "",
    fieldVerificationNotes: r.fieldVerificationNotes || "",
    verifiedByName: r.verifiedBy?.name || "",
    decisionByName: r.decisionBy?.name || "",
    decisionNotes: r.decisionNotes || "",
    rejectionReason: r.rejectionReason || "",
    allocatedAmount: r.allocatedAmount || 0,
    allocatedByName: r.allocatedBy?.name || "",
    createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "-",
  }),
  news: (n) => ({
    _id: n._id,
    id: n.newsId || n._id,
    headline: n.headline,
    summary: n.summary || "",
    content: n.content || "",
    category: n.category?.name || "General",
    categoryId: n.category?._id || n.category,
    region: n.region,
    tags: n.tags || [],
    status: n.status,
    urgent: Boolean(n.isEmergency),
    verified: Boolean(n.verified),
    verifiedByName: n.verifiedBy?.name || "",
    source: n.createdBy?.name || "Suraksha Staff",
    time: n.publishedAt ? timeAgo(n.publishedAt) : n.createdAt ? timeAgo(n.createdAt) : "-",
    createdAt: n.createdAt,
    createdBy: n.createdBy?._id || n.createdBy || null,
    createdByName: n.createdBy?.name || "",
    assignedTo: n.assignedTo?._id || n.assignedTo || null,
    assignedToName: n.assignedTo?.name || "",
    images: (n.images || []).map((i) => ({ url: i.url, uploadedBy: i.uploadedBy?._id || i.uploadedBy })),
    documents: (n.documents || []).map((d) => ({ url: d.url, name: d.name, uploadedBy: d.uploadedBy?._id || d.uploadedBy })),
    sources: (n.sources || []).map((s) => ({ _id: s._id, name: s.name, url: s.url || "" })),
    disasterUpdates: (n.disasterUpdates || []).map((u) => ({
      _id: u._id,
      text: u.text,
      addedByRole: u.addedByRole,
      addedByName: u.addedBy?.name || "",
      status: u.status,
      createdAt: u.createdAt,
    })),
    reports: (n.reports || []).map((r) => ({
      _id: r._id,
      reason: r.reason,
      status: r.status,
      reportedByName: r.reportedBy?.name || "",
      createdAt: r.createdAt,
    })),
    rejectionReason: n.rejectionReason || "",
    scheduledFor: n.scheduledFor || null,
    publishedAt: n.publishedAt || null,
    views: n.views || 0,
    link: "#",
  }),
  newsCategory: (c) => ({
    _id: c._id,
    id: c._id,
    name: c.name,
    slug: c.slug,
    description: c.description || "",
    active: c.active !== false,
  }),
  newsSource: (s) => ({
    _id: s._id,
    id: s._id,
    name: s.name,
    url: s.url || "",
    type: s.type || "Other",
    active: s.active !== false,
  }),
  riskZone: (z) => ({
    _id: z._id,
    id: z.zoneId || z._id,
    name: z.name,
    district: z.district || "",
    lat: z.center?.lat,
    lng: z.center?.lng,
    radiusMeters: z.radiusMeters || 2000,
    riskLevel: z.riskLevel,
    aiRiskScore: z.aiRiskScore,
    // Present only when the backend returned the full document (Admin/
    // Authority/full scopes) - Citizen/Volunteer "area"/"assigned" scopes
    // get a stripped object without `override`, so this stays undefined.
    override: z.override || null,
    effectiveScore: z.effectiveScore ?? z.aiRiskScore,
    estimatedPopulation: z.estimatedPopulation || 0,
    relatedDisaster: z.relatedDisaster || null,
    assignedTo: z.assignedTo?._id || z.assignedTo || null,
    status: z.status || "Active",
    createdAt: z.createdAt,
  }),
  evacuationRoute: (r) => ({
    _id: r._id,
    id: r.routeId || r._id,
    name: r.name,
    district: r.district || "",
    from: r.from || { label: "", lat: null, lng: null },
    to: r.to || { label: "", lat: null, lng: null },
    path: r.path || [],
    status: r.status || "Active",
    areaEvacuated: !!r.areaEvacuated,
    evacuatedAt: r.evacuatedAt || null,
    relatedDisaster: r.relatedDisaster || null,
    notes: r.notes || "",
    createdAt: r.createdAt,
  }),
  roadBlock: (b) => ({
    _id: b._id,
    id: b.blockId || b._id,
    location: b.location,
    district: b.district || "",
    lat: b.coordinates?.lat,
    lng: b.coordinates?.lng,
    reason: b.reason || "Other",
    description: b.description || "",
    status: b.status || "Reported",
    reportedBy: b.reportedBy?.name || "",
    confirmedBy: b.confirmedBy?.name || "",
    clearedBy: b.clearedBy?.name || "",
    createdAt: b.createdAt,
  }),
  aiPrediction: (p) => ({
    _id: p._id,
    id: p.predictionId || p._id,
    disasterType: p.disasterType,
    district: p.district || "",
    riskScore: p.riskScore ?? 0,
    confidence: p.confidence ?? 0,
    status: p.status || "Pending",
    outcome: p.outcome || "Unknown",
    affectedAreas: p.affectedAreas || [],
    populationAtRisk: p.populationAtRisk || 0,
    relatedDisaster: p.relatedDisaster?._id || p.relatedDisaster || null,
    relatedRiskZone: p.relatedRiskZone?._id || p.relatedRiskZone || null,
    generatedByName: p.generatedBy?.name || "",
    approvedByName: p.approvedBy?.name || "",
    confirmedByName: p.confirmedBy?.name || "",
    createdAt: p.createdAt,
  }),
  groundConditionReport: (r) => ({
    _id: r._id,
    id: r.reportId || r._id,
    district: r.district || "",
    location: r.location || "",
    disasterType: r.disasterType || "",
    condition: r.condition,
    severity: r.severity || "",
    images: r.images || [],
    relatedPrediction: r.relatedPrediction || null,
    reportedByName: r.reportedBy?.name || "",
    reportedByRole: r.reportedByRole || "",
    createdAt: r.createdAt,
  }),
};
