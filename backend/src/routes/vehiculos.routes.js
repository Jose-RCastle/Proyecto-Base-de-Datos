import { Router } from 'express';
import pool from '../config/database.js';
const router = Router();
router.get('/', async (_req, res, next) => { try { const { rows } = await pool.query(`SELECT v.vehiculo_id, v.placa, c.nombre || ' ' || c.apellido AS cliente, tv.nombre AS tipo_vehiculo, v.marca, v.modelo, v.anio FROM vehiculos v JOIN clientes c ON c.cliente_id = v.cliente_id JOIN tipos_vehiculo tv ON tv.tipo_vehiculo_id = v.tipo_vehiculo_id ORDER BY v.placa`); res.json(rows); } catch (error) { next(error); } });
export default router;
