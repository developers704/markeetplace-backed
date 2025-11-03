const express = require('express');
const {
    submitContactForm,
    createDropdownOption,
    getAllContacts,
    deleteContact,
    deleteDropdownOption,
    getAllDropdownOptions
} = require('../controllers/contact.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');

const router = express.Router();

// Route to handle contact form submission
router.post('/', submitContactForm);

// Route to create a new dropdown option
router.post('/dropdown', authMiddleware, checkSuperuserOrPermission('Contact', 'Create'), adminLogger(), createDropdownOption);

// Route to get all dropdown options
router.get('/dropdown', getAllDropdownOptions);

// Route to get all contact form submissions (protected access)
router.get('/', authMiddleware, checkSuperuserOrPermission('Contact', 'View'), getAllContacts);

// Route to delete a contact form submission by ID (superuser or users with 'Delete' permission on 'Contact' page)
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Contact', 'Delete'), adminLogger(), deleteContact);

// Route to delete a dropdown option by ID
router.delete('/dropdown/:id', authMiddleware, checkSuperuserOrPermission('Contact', 'Delete'), adminLogger(), deleteDropdownOption);


module.exports = router;
