const mongoose = require("mongoose");

// Singleton document holding AI Risk Engine configuration. Backs the
// Admin-only "Configure risk thresholds", "Configure risk weights",
// "Add/manage disaster types", "Manage AI settings", and "Manage AI data
// sources" rows of the AI Risk Engine permission table.
const aiRiskSettingsSchema = new mongoose.Schema(
  {
    // Score bands (0-100) used to derive a RiskZone/Disaster's riskLevel
    // label from its numeric aiRiskScore.
    thresholds: {
      low: { type: Number, default: 25 },
      medium: { type: Number, default: 50 },
      high: { type: Number, default: 75 },
      critical: { type: Number, default: 90 },
    },
    // Factor -> weight (0-1) used when computing an aiRiskScore. Kept as a
    // free-form map so new factors can be added without a migration.
    weights: {
      type: Map,
      of: Number,
      default: () => ({
        rainfall: 0.25,
        riverLevel: 0.2,
        populationDensity: 0.2,
        infrastructureVulnerability: 0.15,
        historicalIncidents: 0.1,
        soilSaturation: 0.1,
      }),
    },
    disasterTypes: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          category: { type: String, trim: true, default: "" },
          active: { type: Boolean, default: true },
        },
      ],
      default: () => [
        { name: "Flood", category: "Hydrological" },
        { name: "Earthquake", category: "Geological" },
        { name: "Cyclone", category: "Meteorological" },
        { name: "Landslide", category: "Geological" },
        { name: "Fire", category: "Man-made" },
      ],
    },
    dataSources: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          type: { type: String, trim: true, default: "" }, // e.g. "Weather API", "Seismograph feed"
          endpoint: { type: String, trim: true, default: "" },
          enabled: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    // Free-form general AI settings (model version, auto-confirm threshold, etc.)
    general: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ modelVersion: "v1", autoConfirmAboveScore: 90, alertsEnabled: true }),
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

aiRiskSettingsSchema.set("toObject", { virtuals: true });
aiRiskSettingsSchema.set("toJSON", { virtuals: true });

/**
 * Returns the single settings document, creating it with defaults on first
 * use so callers never have to null-check.
 */
aiRiskSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model("AiRiskSettings", aiRiskSettingsSchema);
