const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");

// Protect routes - verify JWT and attach user to req
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        res.status(401);
        throw new Error("User not found");
      }

      if (req.user.status === "Blocked") {
        res.status(403);
        throw new Error("Account is blocked. Contact an administrator.");
      }

      return next();
    } catch (error) {
      res.status(401);
      throw new Error("Not authorized, token invalid or expired");
    }
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token provided");
  }
});

// Like `protect`, but never rejects the request - just attaches req.user
// when a valid token is present, and leaves it undefined otherwise. For
// routes that are genuinely public (e.g. GET /api/shelters) but still want
// to tailor the response for a logged-in caller (e.g. showing an Authority
// their own Pending shelters) without forcing a login.
const attachUserIfPresent = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer")) return next();

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (user && user.status !== "Blocked") req.user = user;
  } catch (error) {
    // Invalid/expired token on an optional-auth route - proceed as anonymous
    // rather than failing the request.
  }
  next();
});

// Restrict access to specific roles, e.g. authorize("Admin", "Authority")
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403);
      throw new Error(`Role '${req.user ? req.user.role : "unknown"}' is not authorized for this action`);
    }
    next();
  };
};

module.exports = { protect, attachUserIfPresent, authorize };
