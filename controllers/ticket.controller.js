const Ticket = require('../models/ticket.model');
const TicketStatus = require('../models/ticketStatus.model');
const TicketPriority = require('../models/ticketPriority.model');

// Create a new ticket
const createTicket = async (req, res) => {
    try {
      const { subject, description } = req.body;
      const customer = req.user._id; // Assuming req.user._id contains the authenticated customer ID
  
      // Find the default ticket status and priority
      const defaultStatus = await TicketStatus.findOne({ isDefault: true });
      const defaultPriority = await TicketPriority.findOne({ isDefault: true });
  
      if (!defaultStatus || !defaultPriority) {
        return res.status(400).json({ message: 'Default ticket status or priority not found' });
      }
  
      const newTicket = new Ticket({
        subject,
        description,
        customer,
        status: defaultStatus._id,
        priority: defaultPriority._id
      });
  
      const savedTicket = await newTicket.save();
      res.status(201).json(savedTicket);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

// Get all tickets for a customer
const getCustomerTickets = async (req, res) => {
    try {
      const customer = req.user._id; // Assuming req.user._id contains the authenticated customer ID
      const tickets = await Ticket.find({ customer })
        .populate('status', 'name')  // Populate the status field, including only the name
        .populate('priority', 'name') // Populate the priority field, including only the name
        .populate('comments.author', 'username'); 
  
      res.status(200).json(tickets);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
  

// Update ticket status (admin/agent)
const updateTicketStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;

    const updatedTicket = await Ticket.findByIdAndUpdate(
      ticketId,
      { status },
      { new: true }
    );

    if (!updatedTicket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.status(200).json(updatedTicket);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Add comment to a ticket (customer and admin/agent)
const addTicketComment = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { content } = req.body;
    const author = req.user._id; // Assuming req.user._id contains the authenticated user ID

    const updatedTicket = await Ticket.findByIdAndUpdate(
      ticketId,
      {
        $push: {
          comments: { author, content }
        }
      },
      { new: true }
    );

    if (!updatedTicket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.status(200).json(updatedTicket);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a ticket (admin/agent)
const deleteTicket = async (req, res) => {
    try {
      const { ticketId } = req.params;
  
      const deletedTicket = await Ticket.findByIdAndDelete(ticketId);
  
      if (!deletedTicket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
  
      res.status(200).json({ message: 'Ticket deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  // Get all tickets (admin/agent)
const getAllTickets = async (req, res) => {
    try {
      const tickets = await Ticket.find()
        .populate('status', 'name')  // Populate the status field with the name
        .populate('priority', 'name') // Populate the priority field with the name
        .populate('comments.author', 'username'); // Populate the author field in comments with the name
  
      res.status(200).json(tickets);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
  

module.exports = {
  createTicket,
  getCustomerTickets,
  updateTicketStatus,
  addTicketComment,
  deleteTicket,
  getAllTickets
};
