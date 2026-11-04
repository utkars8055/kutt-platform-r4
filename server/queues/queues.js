const Queue = require("bull");
const path = require("node:path");

const env = require("../env");

const redis = {
  port: env.REDIS_PORT,
  host: env.REDIS_HOST,
  db: env.REDIS_DB,
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD })
};

let visit;

if (env.REDIS_ENABLED) {
  visit = new Queue("visit", { redis });
  visit.clean(5000, "completed");
  visit.process(6, path.resolve(__dirname, "visit.js"));
  visit.on("completed", job => job.remove());
  
  // TODO: handler error
  // visit.on("error", function (error) {
  //   console.log("error");
  // });
} else {
  const visitProcessor = require(path.resolve(__dirname, "visit.js"));
  visit = {
    add(data) {
      // Match Bull Queue's Promise-returning add() API so callers can
      // handle visit failures without crashing the redirect request.
      return Promise.resolve().then(() => visitProcessor({ data }));
    }
  }
}



module.exports = { 
  visit,
}