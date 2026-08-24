const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// All uploads live outside src/, at the project root: <root>/uploads/<subfolder>
const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file (images)
const MAX_NEWS_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file (news images + documents)
const MAX_FILES = 5; // per upload request

// Make sure the destination folders exist before multer tries to write into them
["disasters", "shelters", "news", "assistance"].forEach((folder) => {
  fs.mkdirSync(path.join(UPLOAD_ROOT, folder), { recursive: true });
});

const makeStorage = (subfolder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(UPLOAD_ROOT, subfolder));
    },
    filename: (req, file, cb) => {
      // Never trust the original filename - generate a random, collision-safe one
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
      cb(null, uniqueName);
    },
  });

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    const err = new Error("Only JPEG, PNG, WEBP or GIF images are allowed");
    err.statusCode = 400;
    return cb(err);
  }
  cb(null, true);
};

// News accepts images AND documents (PDF/Word) in the same upload - "Upload
// images/documents" is a single permission in the matrix.
const newsFileFilter = (req, file, cb) => {
  if (![...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_DOCUMENT_MIME_TYPES].includes(file.mimetype)) {
    const err = new Error("Only JPEG, PNG, WEBP, GIF images or PDF/Word documents are allowed");
    err.statusCode = 400;
    return cb(err);
  }
  cb(null, true);
};

const buildUploader = (subfolder) =>
  multer({
    storage: makeStorage(subfolder),
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  });

// One uploader per module, so disaster evidence and shelter photos never mix folders
const disasterImageUpload = buildUploader("disasters");
const shelterImageUpload = buildUploader("shelters");
const newsMediaUpload = multer({
  storage: makeStorage("news"),
  fileFilter: newsFileFilter,
  limits: { fileSize: MAX_NEWS_FILE_SIZE, files: MAX_FILES },
});

// Assistance-request "proof documents" - the backend's documents endpoint
// (POST /assistance-requests/:id/documents) only ever accepted a JSON
// { documents: [{ url, label }] } body, i.e. it assumed the caller already
// had a hosted URL. There was no generic "upload a file, get a URL back"
// route anywhere, so a citizen filing a request from the UI had no real way
// to attach proof. This reuses the same image+document filter as news
// uploads (JPEG/PNG/WEBP/GIF or PDF/Word) so photos of receipts/ID as well
// as PDF/Word documents are both accepted.
const assistanceDocumentUpload = multer({
  storage: makeStorage("assistance"),
  fileFilter: newsFileFilter,
  limits: { fileSize: MAX_NEWS_FILE_SIZE, files: MAX_FILES },
});

module.exports = {
  disasterImageUpload,
  shelterImageUpload,
  newsMediaUpload,
  assistanceDocumentUpload,
  UPLOAD_ROOT,
  MAX_FILES,
  MAX_FILE_SIZE,
  MAX_NEWS_FILE_SIZE,
  ALLOWED_DOCUMENT_MIME_TYPES,
};
