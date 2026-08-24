/**
 * Core "AI Risk Engine" prediction logic.
 *
 * This is the piece that actually turns raw signals (ground-condition
 * factors, a related RiskZone's score, and/or citizen report volume) into
 * the six things the product spec asks a prediction to output:
 *   riskScore, riskLevel, predictedDisaster (disasterType), affectedAreas,
 *   confidence, recommendedAction.
 *
 * Kept as a pure module (no DB access) so it's easy to unit-test and so the
 * controller stays a thin HTTP/DB layer around it.
 */

// Recognized factor keys and how "bad" (0-100, higher = more dangerous)
// each one is expected to be reported on. Any subset may be supplied.
const KNOWN_FACTORS = [
  "rainfall",
  "riverLevel",
  "populationDensity",
  "infrastructureVulnerability",
  "historicalIncidents",
  "soilSaturation",
];

/**
 * Clamp a number into [min, max].
 */
function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

/**
 * Weighted-average score (0-100) from whichever recognized factors were
 * supplied. Weights come from AiRiskSettings.weights (a Map) and are
 * re-normalized over just the factors present, so partial input still
 * produces a sensible score instead of silently under-weighting.
 *
 * Returns null if no recognized factor was supplied.
 */
function scoreFromFactors(factors, weights) {
  if (!factors || typeof factors !== "object") return null;

  const present = KNOWN_FACTORS.filter((f) => typeof factors[f] === "number" && Number.isFinite(factors[f]));
  if (present.length === 0) return null;

  const totalWeight = present.reduce((sum, f) => sum + (Number(weights.get(f)) || 0), 0);
  if (totalWeight <= 0) {
    // No configured weights for any supplied factor - fall back to a plain average.
    const avg = present.reduce((sum, f) => sum + clamp(factors[f]), 0) / present.length;
    return clamp(avg);
  }

  const weighted = present.reduce((sum, f) => sum + clamp(factors[f]) * (Number(weights.get(f)) || 0), 0);
  return clamp(weighted / totalWeight);
}

/**
 * Derives the riskLevel label from a numeric score using the Admin-configured
 * thresholds (same bands RiskZone uses), so a prediction and a zone with the
 * same score always agree on the label.
 */
function levelFromScore(score, thresholds) {
  const { low = 25, medium = 50, high = 75, critical = 90 } = thresholds || {};
  if (score >= critical) return "Critical";
  if (score >= high) return "High";
  if (score >= medium) return "Medium";
  if (score >= low) return "Low";
  return "Low";
}

/**
 * Confidence (0-100): how much we trust the score we just produced.
 * Grows with (a) how many of the known factors were actually supplied,
 * (b) whether the estimate is anchored to an existing monitored RiskZone,
 * and (c) supporting citizen ground reports. Capped so a fully-manual,
 * single-factor guess never looks as trustworthy as a well-evidenced one.
 */
function computeConfidence({ factorCount, usedRelatedZone, sourceReportCount = 0, autoConfirmAboveScore, riskScore }) {
  let confidence = 40; // baseline for "the model produced *something*"

  confidence += Math.min(factorCount, KNOWN_FACTORS.length) * 8; // up to +48 for all 6 factors
  if (usedRelatedZone) confidence += 10; // anchored to a live, monitored zone
  confidence += Math.min(sourceReportCount, 5) * 2; // up to +10 for corroborating citizen reports

  // Very high computed scores that clear the admin's auto-confirm bar are,
  // by definition, ones the system is configured to trust most.
  if (autoConfirmAboveScore && riskScore >= autoConfirmAboveScore) confidence += 5;

  return Math.round(clamp(confidence, 5, 99));
}

// Short, human-readable guidance keyed by riskLevel, refined per disaster
// type where the action genuinely differs. "Default" covers any disaster
// type an Admin has added that isn't listed explicitly.
const ACTION_LIBRARY = {
  Critical: {
    Flood: "Issue immediate evacuation order for the affected area, open all designated shelters, and close/reroute roads below the flood line.",
    Cyclone: "Issue immediate evacuation order for coastal/low-lying zones, activate all shelters, and suspend transport and outdoor gatherings.",
    Earthquake: "Activate search-and-rescue teams, open shelters for structurally unsafe buildings, and inspect critical infrastructure immediately.",
    Landslide: "Evacuate slopes and areas below the risk zone immediately and close access roads until a geotechnical inspection is complete.",
    Fire: "Evacuate the affected area immediately, dispatch fire and medical response, and establish a safety perimeter.",
    default: "Evacuate the affected area immediately, activate emergency shelters, and dispatch response teams without delay.",
  },
  High: {
    Flood: "Pre-position evacuation routes and shelters, advise at-risk residents to prepare to move, and monitor river levels continuously.",
    Cyclone: "Issue a public advisory to prepare for evacuation, pre-stage shelters and supplies, and monitor the storm track closely.",
    Earthquake: "Alert emergency response teams to stand by, inspect vulnerable structures, and brief the public on aftershock safety.",
    Landslide: "Restrict access to the slope area, alert nearby residents, and schedule an urgent geotechnical inspection.",
    Fire: "Pre-position fire crews near the affected area and advise nearby residents to prepare for possible evacuation.",
    default: "Alert response teams to stand by, pre-position resources near the affected area, and issue a public safety advisory.",
  },
  Medium: {
    default: "Increase monitoring frequency in the affected area, notify local Authority users, and verify shelter/resource readiness.",
  },
  Low: {
    default: "Continue routine monitoring; no immediate action required beyond logging the assessment.",
  },
};

function recommendAction(riskLevel, disasterType) {
  const byLevel = ACTION_LIBRARY[riskLevel] || ACTION_LIBRARY.Medium;
  return byLevel[disasterType] || byLevel.default;
}

/**
 * Main entry point. Produces the full prediction payload described by the
 * product spec from whatever inputs the caller has available.
 *
 * @param {Object} input
 * @param {string} input.disasterType
 * @param {string} [input.district]
 * @param {Object} [input.factors] - raw 0-100 factor readings (rainfall, riverLevel, ...)
 * @param {number} [input.relatedZoneScore] - effectiveScore of a linked RiskZone, if any
 * @param {string[]} [input.affectedAreas]
 * @param {number} [input.sourceReportCount] - number of citizen reports this draws on
 * @param {Object} settings - the AiRiskSettings singleton (weights, thresholds, general)
 */
function predictRisk(input, settings) {
  const { disasterType, district, factors, relatedZoneScore, affectedAreas = [], sourceReportCount = 0 } = input;

  const factorScore = scoreFromFactors(factors, settings.weights);
  const hasFactorScore = factorScore !== null;
  const hasZoneScore = typeof relatedZoneScore === "number" && Number.isFinite(relatedZoneScore);

  let riskScore;
  if (hasFactorScore && hasZoneScore) {
    // Blend live factor readings with the zone's own tracked score, weighted
    // slightly toward fresh factor data since that's what changed just now.
    riskScore = clamp(factorScore * 0.6 + relatedZoneScore * 0.4);
  } else if (hasFactorScore) {
    riskScore = factorScore;
  } else if (hasZoneScore) {
    riskScore = clamp(relatedZoneScore);
  } else {
    riskScore = 50; // neutral default when no signal was supplied at all
  }
  riskScore = Math.round(riskScore);

  const riskLevel = levelFromScore(riskScore, settings.thresholds);

  const factorCount = factors ? KNOWN_FACTORS.filter((f) => typeof factors[f] === "number").length : 0;
  const confidence = computeConfidence({
    factorCount,
    usedRelatedZone: hasZoneScore,
    sourceReportCount,
    autoConfirmAboveScore: settings.general && settings.general.autoConfirmAboveScore,
    riskScore,
  });

  const recommendedAction = recommendAction(riskLevel, disasterType);

  return {
    disasterType,
    district: district || "",
    riskScore,
    riskLevel,
    confidence,
    affectedAreas,
    recommendedAction,
  };
}

module.exports = {
  KNOWN_FACTORS,
  scoreFromFactors,
  levelFromScore,
  computeConfidence,
  recommendAction,
  predictRisk,
};
