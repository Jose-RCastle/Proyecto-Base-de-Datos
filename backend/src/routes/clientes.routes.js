import { Router } from 'express';
import pool from '../config/database.js';
const router = Router();
router.get('/', async (_req, res, next) => { try { const { rows } = await pool.query('SELECT cliente_id, nombre, apellido, telefono, correo, fecha_registro FROM clientes ORDER BY apellido, nombre'); res.json(rows); } catch (error) { next(error); } });
export default router;
