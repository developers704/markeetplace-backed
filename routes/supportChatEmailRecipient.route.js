const express = require('express');
const {
  listRecipients,
  setRecipients,
  toggleRecipient,
  deleteRecipient,
} = require('../controllers/supportChatEmailRecipient.controller');

const router = express.Router();

router.post('/create', setRecipients);
router.get('/get', listRecipients);
router.patch('/:id/toggle', toggleRecipient);
router.delete('/:id', deleteRecipient);

module.exports = router;
