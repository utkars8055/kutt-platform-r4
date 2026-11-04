// Vercel serverless entry point for the existing Express application.
// server/server.js exports the app and does not bind a listening socket on Vercel.
module.exports = require("../server/server");
