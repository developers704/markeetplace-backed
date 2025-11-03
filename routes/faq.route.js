const express = require('express');
const { createFAQ, getFAQs, updateFAQ, deleteFAQ} = require('../controllers/faq.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');


const router = express.Router();

// Route to create a FAQ (superuser or users with 'Create' permission on 'FAQ' page)
router.post('/', authMiddleware, checkSuperuserOrPermission('FAQ', 'Create'), adminLogger(), createFAQ);

// Route to get all FAQs (superuser or users with 'View' permission on 'FAQ' page)
router.get('/', authMiddleware, checkSuperuserOrPermission('FAQ', 'View'), getFAQs);

// Route to get all FAQs (public access)
router.get('/public', getFAQs);

// Route to update a FAQ (superuser or users with 'Update' permission on 'FAQ' page)
router.patch('/:id', authMiddleware, checkSuperuserOrPermission('FAQ', 'Update'), adminLogger(), updateFAQ);

// Route to delete a FAQ (superuser or users with 'Delete' permission on 'FAQ' page)
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('FAQ', 'Delete'), adminLogger(), deleteFAQ);


module.exports = router;
