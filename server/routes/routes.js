const { Router } = require("express");

const helpers = require("./../handlers/helpers.handler");
const locals = require("./../handlers/locals.handler");
const renders = require("./renders.routes");
const domains = require("./domain.routes");
const health = require("./health.routes");
const link = require("./link.routes");
const user = require("./user.routes");
const auth = require("./auth.routes");
const settings = require("./settings.routes");

const renderRouter = Router();
renderRouter.use(renders);

const apiRouter = Router();
apiRouter.use(locals.noLayout);
apiRouter.use("/domains", domains);
apiRouter.use("/health", health);
apiRouter.use("/links", link);
apiRouter.use("/users", user);
apiRouter.use("/auth", auth);
apiRouter.use("/settings", settings);

module.exports = {
  api: apiRouter,
  render: renderRouter,
};
