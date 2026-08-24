const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const openapiSpec = YAML.load(path.join(__dirname, "docs", "openapi.yaml"));

const { apiLimiter, authLimiter } = require("./middleware/rateLimiter");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const disasterRoutes = require("./routes/disasterRoutes");
const alertRoutes = require("./routes/alertRoutes");
const shelterRoutes = require("./routes/shelterRoutes");
const volunteerRoutes = require("./routes/volunteerRoutes");
const teamRoutes = require("./routes/teamRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const taskRoutes = require("./routes/taskRoutes");
const donationRoutes = require("./routes/donationRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const emergencyContactRoutes = require("./routes/emergencyContactRoutes");
const ngoRoutes = require("./routes/ngoRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const assistanceRoutes = require("./routes/assistanceRoutes");
const fundRoutes = require("./routes/fundRoutes");
const newsRoutes = require("./routes/newsRoutes");
const newsCategoryRoutes = require("./routes/newsCategoryRoutes");
const newsSourceRoutes = require("./routes/newsSourceRoutes");
const mapRoutes = require("./routes/mapRoutes");
const aiRiskRoutes = require("./routes/aiRiskRoutes");
const riskZoneRoutes = require("./routes/riskZoneRoutes");
const evacuationRouteRoutes = require("./routes/evacuationRouteRoutes");
const roadBlockRoutes = require("./routes/roadBlockRoutes");

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize()); // strip $ and . operators from user input to block NoSQL injection
app.use(hpp()); // guard against HTTP parameter pollution on query strings

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Serve uploaded disaster/shelter photos. Helmet's default same-origin resource
// policy would otherwise block a frontend on a different origin from loading
// these as <img> tags, so relax it for this one static route only.
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "..", "uploads"))
);

// Rate limiting - stricter on auth endpoints (brute force), general cap elsewhere
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Suraksha API is running" });
});

// API documentation (Swagger UI + raw OpenAPI spec)
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: "Suraksha API Docs" }));
app.get("/api/docs.json", (req, res) => res.json(openapiSpec));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/disasters", disasterRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/shelters", shelterRoutes);
app.use("/api/volunteers", volunteerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/contacts", emergencyContactRoutes);
app.use("/api/ngos", ngoRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/assistance-requests", assistanceRoutes);
app.use("/api/funds", fundRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/news-categories", newsCategoryRoutes);
app.use("/api/news-sources", newsSourceRoutes);
app.use("/api/map", mapRoutes);
app.use("/api/ai-risk", aiRiskRoutes);
app.use("/api/map/risk-zones", riskZoneRoutes);
app.use("/api/map/evacuation-routes", evacuationRouteRoutes);
app.use("/api/map/road-blocks", roadBlockRoutes);

// Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
