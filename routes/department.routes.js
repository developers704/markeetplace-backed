const express = require('express');
const router = express.Router();
const controller = require('../controllers/department.controller');
const authMiddleware = require('../middlewares/authMiddleware');


router.post('/', authMiddleware, controller.createDepartment);
router.post('/bulk-delete', authMiddleware, controller.bulkDeleteDepartments);
router.get('/', controller.getAllDepartments);
router.get('/:id', controller.getDepartmentById);
router.put('/:id', authMiddleware, controller.updateDepartment);
router.delete('/:id', authMiddleware, controller.deleteDepartment);

module.exports = router;
