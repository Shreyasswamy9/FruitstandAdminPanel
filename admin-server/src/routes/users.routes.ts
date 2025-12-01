import { Router } from 'express';
import { createUser, getUsers } from '../controllers/users.controller';

const router = Router();

router.post('/', createUser);
router.get('/:id', getUsers);

export default router;