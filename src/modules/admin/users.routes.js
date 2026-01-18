const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middlewares/auth');
const { requireAnyRole } = require('../../middlewares/roles');
const controller = require('./users.controller');

// todo admin-only
router.get('/admin/users', requireAuth, requireAnyRole(['ADMIN']), controller.list);
router.get('/admin/users/nuevo', requireAuth, requireAnyRole(['ADMIN']), controller.viewNew);
router.post('/admin/users', requireAuth, requireAnyRole(['ADMIN']), controller.create);

router.get('/admin/users/:id/editar', requireAuth, requireAnyRole(['ADMIN']), controller.viewEdit);
router.post('/admin/users/:id/editar', requireAuth, requireAnyRole(['ADMIN']), controller.update);

router.post('/admin/users/:id/toggle', requireAuth, requireAnyRole(['ADMIN']), controller.toggleEstado);
router.post('/admin/users/:id/reset-pass', requireAuth, requireAnyRole(['ADMIN']), controller.resetPass);

module.exports = router;
