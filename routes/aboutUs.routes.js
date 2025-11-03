// routes/aboutUsRoutes.js
const express = require('express');
const router = express.Router();
const aboutUsController = require('../controllers/aboutUS.controller'); // Apne controller ka sahi path dein

// POST /api/aboutus - Create a new About Us entry
router.post('/', aboutUsController.createAboutUs);

// GET /api/aboutus - Get all About Us entries
router.get('/', aboutUsController.getAllAboutUs);

// GET /api/aboutus/:id - Get a single About Us entry by ID
router.get('/:id', aboutUsController.getAboutUsById);

// PUT /api/aboutus/:id - Update an About Us entry by ID
router.put('/:id', aboutUsController.updateAboutUs);

// DELETE /api/aboutus/:id - Delete an About Us entry by ID
router.delete('/:id', aboutUsController.deleteAboutUs);

module.exports = router;
