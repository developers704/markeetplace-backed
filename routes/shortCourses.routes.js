const express = require("express");
const router = express.Router();
const controller  = require("../controllers/shortCourses.controller");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/", authMiddleware, controller.getShortCourses);

module.exports = router;
