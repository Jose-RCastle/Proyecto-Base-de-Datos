import { Router } from 'express';
import pool from '../config/database.js';
const router = Router();
router.get('/', async (_req, res, next) => { try { const { rows } = await pool.query(`SELECT e.espacio_id, e.codigo, z.nombre AS zona, tv.nombre AS tipo_vehiculo, e.estado FROM espacios e JOIN zonas z ON z.zona_id = e.zona_id JOIN tipos_vehiculo tv ON tv.tipo_vehiculo_id = e.tipo_vehiculo_id ORDER BY z.nombre, e.codigo`); res.json(rows); } catch (error) { next(error); } });
export default router;
