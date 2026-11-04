const domain = require("./domain.queries");
const visit = require("./visit.queries");
const link = require("./link.queries");
const user = require("./user.queries");
const host = require("./host.queries");
const preview = require("./preview.queries");
const event = require("./event.queries");
const linkSettings = require("./link-settings.queries");

module.exports = {
  domain,
  host,
  preview,
  event,
  link,
  linkSettings,
  user,
  visit
};
