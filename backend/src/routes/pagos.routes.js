import { Router } from 'express';
import pool from '../config/database.js';
const router = Router();
router.get('/', async (_req, res, next) => { try { const { rows } = await pool.query(`SELECT p.pago_id, p.estadia_id, v.placa, mp.nombre AS metodo_pago, p.monto, p.fecha_pago FROM pagos p JOIN estadias e ON e.estadia_id=p.estadia_id JOIN vehiculos v ON v.vehiculo_id=e.vehiculo_id JOIN metodos_pago mp ON mp.metodo_pago_id = p.metodo_pago_id ORDER BY p.fecha_pago DESC`); res.json(rows); } catch (error) { next(error); } });
export default router;
