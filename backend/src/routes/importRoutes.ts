import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as ctrl from '../controllers/importController';

const router = Router();

router.post('/preview', asyncHandler(ctrl.preview));
router.post('/pdf/preview', ctrl.pdfUpload.single('file'), asyncHandler(ctrl.pdfPreview));
router.post('/materials', asyncHandler(ctrl.saveMaterial));
router.get('/:importId', asyncHandler(ctrl.getOne));

export default router;
