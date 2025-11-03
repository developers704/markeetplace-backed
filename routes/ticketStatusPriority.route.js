const express = require('express');
const router = express.Router();
const { createTicketStatus, getAllTicketStatuses,createTicketPriority, getAllTicketPriorities, deleteTicketPriority, deleteTicketStatus } = require('../controllers/ticketStatusPriority.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');

// Create a new ticket status (admin/superuser only)
router.post('/ticketStatus/', checkSuperuserOrPermission('TicketStatus', 'Create'), createTicketStatus);

// Get all ticket statuses
router.get('/ticketStatus/', getAllTicketStatuses);

// Delete a ticket status (admin/superuser only)
router.delete('/ticketStatus/:id', checkSuperuserOrPermission('TicketStatus', 'Delete'), deleteTicketStatus);

// Create a new ticket priority (admin/superuser only)
router.post('/ticketPriority/', checkSuperuserOrPermission('TicketPriority', 'Create'), createTicketPriority);

// Get all ticket priorities
router.get('/ticketPriority/', getAllTicketPriorities);


// Delete a ticket priority (admin/superuser only)
router.delete('/ticketPriority/:id', checkSuperuserOrPermission('TicketPriority', 'Delete'), deleteTicketPriority);

module.exports = router;
