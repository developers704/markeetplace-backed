const express = require('express');
const router = express.Router();
const { createTicket, getCustomerTickets, updateTicketStatus, addTicketComment, deleteTicket, getAllTickets } = require('../controllers/ticket.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');

// Customer routes
router.post('/', createTicket);
router.get('/', getCustomerTickets);
router.post('/:ticketId/comments', addTicketComment);

// Admin/Agent routes
router.get('/admin', checkSuperuserOrPermission('Tickets', 'View'), getAllTickets);
router.put('/:ticketId/status', checkSuperuserOrPermission('Tickets', 'Update'), updateTicketStatus);
router.post('/:ticketId/comments', checkSuperuserOrPermission('Tickets', 'Create'), addTicketComment);
router.delete('/:ticketId', checkSuperuserOrPermission('Tickets', 'Delete'), deleteTicket);

module.exports = router;
