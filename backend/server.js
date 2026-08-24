require("dotenv").config();
const validateEnv = require("./src/config/validateEnv");

validateEnv();

const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Suraksha backend running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
});

process.on("unhandledRejection", (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  process.exit(1);
});
