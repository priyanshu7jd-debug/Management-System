// Fails startup loudly and immediately if required configuration is missing,
// instead of letting the app boot with silent fallback values that mask a
// misconfigured deployment (e.g. an open CORS policy or a guessable JWT
// expiry). Every var here has no in-code default on purpose - set it in
// backend/.env (see backend/.env.example).
const REQUIRED_ENV_VARS = [
  "PORT",
  "NODE_ENV",
  "MONGO_URI",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "CLIENT_URL",
];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key] || process.env[key].trim() === "");

  if (missing.length > 0) {
    console.error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        "Copy backend/.env.example to backend/.env and fill in every value before starting the server."
    );
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 16) {
    console.error("JWT_SECRET is too short. Use a long, random secret (at least 16 characters).");
    process.exit(1);
  }
}

module.exports = validateEnv;
