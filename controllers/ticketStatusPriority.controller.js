const TicketStatus = require('../models/ticketStatus.model');
const TicketPriority = require('../models/ticketPriority.model');
const Ticket = require('../models/ticket.model'); // Ensure this is the correct path to your Ticket model



// Create a new ticket status
const createTicketStatus = async (req, res) => {
  try {
    const { name, description, isDefault = false } = req.body;

    // Check for duplicate ticket status name
    const existingStatus = await TicketStatus.findOne({ name });
    if (existingStatus) {
      return res.status(400).json({ message: 'Ticket status with this name already exists' });
    }

    // If the new status is marked as default, unset the previous default status
    if (isDefault) {
      await TicketStatus.updateMany({ isDefault: true }, { isDefault: false });
    }

    const ticketStatus = new TicketStatus({ name, description, isDefault });
    await ticketStatus.save();
    res.status(201).json(ticketStatus);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all ticket statuses
const getAllTicketStatuses = async (req, res) => {
  try {
    const ticketStatuses = await TicketStatus.find();
    res.status(200).json(ticketStatuses);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Create a new ticket priority
const createTicketPriority = async (req, res) => {
    try {
      const { name, description, isDefault = false } = req.body;
  
      // Check for duplicate ticket priority name
      const existingPriority = await TicketPriority.findOne({ name });
      if (existingPriority) {
        return res.status(400).json({ message: 'Ticket priority with this name already exists' });
      }
  
      // If the new priority is marked as default, unset the previous default priority
      if (isDefault) {
        await TicketPriority.updateMany({ isDefault: true }, { isDefault: false });
      }
  
      const ticketPriority = new TicketPriority({ name, description, isDefault });
      await ticketPriority.save();
      res.status(201).json(ticketPriority);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
  
  // Get all ticket priorities
  const getAllTicketPriorities = async (req, res) => {
    try {
      const ticketPriorities = await TicketPriority.find();
      res.status(200).json(ticketPriorities);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  // Delete a ticket status
const deleteTicketStatus = async (req, res) => {
    try {
      const { id } = req.params;
  
      // Check if the ticket status is being used by any tickets
      const ticketsWithStatus = await Ticket.countDocuments({ status: id });
      if (ticketsWithStatus > 0) {
        return res.status(400).json({ message: 'Cannot delete ticket status as it is being used by tickets' });
      }
  
      const deletedStatus = await TicketStatus.findByIdAndDelete(id);
      if (!deletedStatus) {
        return res.status(404).json({ message: 'Ticket status not found' });
      }
  
      res.status(200).json({ message: 'Ticket status deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  // Delete a ticket priority
const deleteTicketPriority = async (req, res) => {
    try {
      const { id } = req.params;
  
      // Check if the ticket priority is being used by any tickets
      const ticketsWithPriority = await Ticket.countDocuments({ priority: id });
      if (ticketsWithPriority > 0) {
        return res.status(400).json({ message: 'Cannot delete ticket priority as it is being used by tickets' });
      }
  
      const deletedPriority = await TicketPriority.findByIdAndDelete(id);
      if (!deletedPriority) {
        return res.status(404).json({ message: 'Ticket priority not found' });
      }
  
      res.status(200).json({ message: 'Ticket priority deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };



module.exports = {
  createTicketStatus,
  getAllTicketStatuses,
  createTicketPriority,
  getAllTicketPriorities,
  deleteTicketStatus,
  deleteTicketPriority
};
