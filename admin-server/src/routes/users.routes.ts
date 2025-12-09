import { Router } from 'express';
import { createUser, getUser, getUsers } from '../controllers/users.controller';

const router = Router();

router.post('/', createUser);
router.get('/', getUsers);
router.get('/:id', getUser);

export default router;