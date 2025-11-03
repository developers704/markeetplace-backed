const express = require('express');
const router = express.Router();
const {
    createDealOfTheDay,
    getAllDealsOfTheDay,
    updateDealOfTheDay,
    deleteDealOfTheDay,
    getActiveDealsOfTheDay
} = require('../controllers/dealOfTheDay.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');


router.post('/', authMiddleware, checkSuperuserOrPermission('Deal of the Day', 'Create'), adminLogger(), createDealOfTheDay);
router.get('/', authMiddleware, checkSuperuserOrPermission('Deal of the Day', 'View'), getAllDealsOfTheDay);
router.get('/active', getActiveDealsOfTheDay);
router.put('/:id', authMiddleware, checkSuperuserOrPermission('Deal of the Day', 'Update'), adminLogger(), updateDealOfTheDay);
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Deal of the Day', 'Delete'), adminLogger(), deleteDealOfTheDay);

module.exports = router;
