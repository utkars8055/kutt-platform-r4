const query = require("./queries");
const utils = require("./utils");
const env = require("./env");

// check and delete links 30 secoonds
setInterval(function () {
  query.link.batchRemove({ expire_in: ["<", utils.dateToUTC(new Date())] }).catch();
}, 30_000);

// Prune a bounded batch of detailed click/ad diagnostics once an hour.
// Set the corresponding retention days to 0 to disable cleanup for that table.
setInterval(function () {
  query.event.cleanupOldEvents(
    env.CLICK_EVENT_RETENTION_DAYS,
    env.AD_EVENT_RETENTION_DAYS,
    10000
  ).catch(error => console.error("Could not clean old analytics events:", error.message));
}, 60 * 60 * 1000);
