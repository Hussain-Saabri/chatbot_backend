import { healthCheck} from '../controllers/healthController.js';

router.get('/health', healthCheck);
export default router;