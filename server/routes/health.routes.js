const { Router } = require("express");

const router = Router();

router.get("/", (_, res) => res.send("OK"));
router.get("/version", (_, res) => res.json({ name: "Kutt", version: require("../../package.json").version, build: require("../env").BUILD_VERSION }));

module.exports = router;
