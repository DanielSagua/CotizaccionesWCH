const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middlewares/auth');
const { requireAnyRole } = require('../../middlewares/roles');
const controller = require('./solicitudes.controller');

router.get('/solicitudes', requireAuth, controller.list);

router.get('/solicitudes/nueva', requireAuth, requireAnyRole(['VENDEDOR', 'JEFE', 'ADMIN']), controller.viewNew);
router.post('/solicitudes', requireAuth, requireAnyRole(['VENDEDOR', 'JEFE', 'ADMIN']), controller.create);

router.get('/solicitudes/:id/editar', requireAuth, controller.viewEdit);
router.post('/solicitudes/:id/editar', requireAuth, controller.update);

router.post('/solicitudes/:id/asignar', requireAuth, requireAnyRole(['JEFE', 'ADMIN']), controller.assign);
router.post('/solicitudes/:id/estado', requireAuth, requireAnyRole(['ANALISTA', 'JEFE', 'ADMIN']), controller.changeStatus);

// 👇 comentarios (cualquiera que pueda ver la solicitud)
router.post('/solicitudes/:id/comentarios', requireAuth, controller.addComment);

router.get('/solicitudes/export.csv', requireAuth, requireAnyRole(['JEFE','ADMIN']), controller.exportCsv);

router.get('/solicitudes/:id', requireAuth, controller.detail);

module.exports = router;
