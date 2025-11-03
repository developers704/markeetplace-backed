const express = require('express');
const router = express.Router();
const { performSearch } = require('../controllers/search.controller');

router.get('/', performSearch);

module.exports = router;
