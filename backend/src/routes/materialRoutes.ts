import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as ctrl from '../controllers/materialController';

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:materialId', asyncHandler(ctrl.getOne));
router.put('/:materialId', asyncHandler(ctrl.update));
router.delete('/:materialId', asyncHandler(ctrl.remove));

export default router;
