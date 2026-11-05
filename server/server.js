const env = require("./env");

const cookieParser = require("cookie-parser");
const passport = require("passport");
const express = require("express");
const session = require("cookie-session");
const helmet = require("helmet");
const path = require("node:path");
const { engine } = require("express-handlebars");
const Handlebars = require("handlebars");

const helpers = require("./handlers/helpers.handler");
const renders = require("./handlers/renders.handler");
const asyncHandler = require("./utils/asyncHandler");
const locals = require("./handlers/locals.handler");
const links = require("./handlers/links.handler");
const routes = require("./routes");
const utils = require("./utils");


// run the cron jobs
// the app might be running in cluster mode (multiple instances) so run the cron job only on one cluster (the first one)
// NODE_APP_INSTANCE variable is added by pm2 automatically, if you're using something else to cluster your app, then make sure to set this variable
if (!process.env.VERCEL && env.NODE_APP_INSTANCE === 0) {
  require("./cron");
}

// intialize passport authentication library
require("./passport");

// create express app
const app = express();

// this tells the express app that it's running behind a proxy server
// and thus it should get the IP address from the proxy server
if (env.TRUST_PROXY) {
  app.set("trust proxy", true);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// use cookie sessions only when OIDC is enabled
// because only OIDC is using it
if (env.OIDC_ENABLED) {
  app.use(session({
    keys: [env.JWT_SECRET],
    maxAge: 1000 * 60 * 60 * 24 * 7, // expire after seven days
  }));
}

// serve static
app.use("/images", express.static("custom/images"));
app.use("/css", express.static("custom/css", { extensions: ["css"] }));
app.use(express.static("static"));

app.use(passport.initialize());
app.use(locals.isHTML);
app.use(locals.config);

// template engine / serve html

const customViewsPath = path.join(__dirname, "../custom/views");
const defaultViewsPath = path.join(__dirname, "views");
const viewsDirectories = [customViewsPath, defaultViewsPath];
app.set("views", viewsDirectories);

const customLayoutPath = path.join(customViewsPath, "layout.hbs");
const layoutsDirectory = require("node:fs").existsSync(customLayoutPath)
  ? customViewsPath
  : defaultViewsPath;
const partialsDirectories = [
  path.join(customViewsPath, "partials"),
  path.join(defaultViewsPath, "partials"),
].filter(directory => require("node:fs").existsSync(directory));

utils.registerHandlebarsHelpers();
app.engine("hbs", engine({
  extname: ".hbs",
  defaultLayout: "layout",
  layoutsDir: layoutsDirectory,
  partialsDir: partialsDirectories,
  handlebars: Handlebars,
}));
app.set("view engine", "hbs");

// if is custom domain, redirect to the set homepage
app.use(asyncHandler(links.redirectCustomDomainHomepage));

// render html pages
app.use("/", routes.render);

// handle api requests
app.use("/api/v2", routes.api);
app.use("/api", routes.api);

// Finally, resolve human redirects and social crawler metadata.
// Keep crawler fetches out of the human redirect rate limit.
const redirectRateLimit = helpers.rateLimit({
  window: 60,
  limit: 6000,
  includePath: false,
});
app.head("/:id", redirectRateLimit, asyncHandler(links.redirect));
app.get("/:id", redirectRateLimit, asyncHandler(links.redirect));

// 404 pages that don't exist
app.get("*", renders.notFound);

// handle errors coming from above routes
app.use(helpers.error);
  
// Vercel invokes this Express app as a serverless function. Keep the
// traditional listener for BotKeep / VPS / Docker deployments.
if (require.main === module && !process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(`> Ready on http://localhost:${env.PORT}`);
  });
}

module.exports = app;
