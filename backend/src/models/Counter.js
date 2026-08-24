const mongoose = require("mongoose");

/**
 * Generic atomic counter collection used to generate human-friendly,
 * sequential IDs (DR-1001, AL-301, TK-901, ...) without relying on
 * countDocuments(), which is NOT safe under concurrent inserts.
 *
 * Each document is keyed by a counter name (e.g. "disasterId") and holds
 * the last-issued sequence number. Incrementing is done with a single
 * atomic findOneAndUpdate($inc) call, so even if many documents are being
 * created at the same time (e.g. Promise.all / seed scripts), every caller
 * is guaranteed to receive a unique, strictly increasing number - MongoDB
 * serializes concurrent updates to the same document.
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // counter name, e.g. "disasterId"
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);
