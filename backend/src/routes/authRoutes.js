const express = require("express");
const {
  registerUser,
  loginUser,
  getMe,
  updateMe,
  updatePassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { registerRules, loginRules, updateMeRules, updatePasswordRules } = require("../validators/authValidators");

const router = express.Router();

router.post("/register", registerRules, registerUser);
router.post("/login", loginRules, loginUser);
router.get("/me", protect, getMe);
router.put("/me", protect, updateMeRules, updateMe);
router.put("/me/password", protect, updatePasswordRules, updatePassword);

module.exports = router;
