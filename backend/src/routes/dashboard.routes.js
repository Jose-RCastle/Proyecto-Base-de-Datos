import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [resumen, activas, recientes, pagos] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total_espacios, COUNT(*) FILTER (WHERE estado = 'OCUPADO') AS ocupados, COUNT(*) FILTER (WHERE estado = 'DISPONIBLE') AS disponibles, ROUND(COUNT(*) FILTER (WHERE estado = 'OCUPADO') * 100.0 / NULLIF(COUNT(*), 0), 2) AS porcentaje_ocupacion, COALESCE((SELECT SUM(monto) FROM pagos), 0) AS ingresos_totales FROM espacios`),
      pool.query(`SELECT e.estadia_id, v.placa, z.nombre AS zona, s.codigo AS espacio, e.fecha_entrada FROM estadias e JOIN vehiculos v ON v.vehiculo_id = e.vehiculo_id JOIN espacios s ON s.espacio_id = e.espacio_id JOIN zonas z ON z.zona_id = s.zona_id WHERE e.estado = 'ACTIVA' ORDER BY e.fecha_entrada DESC`),
      pool.query(`SELECT e.estadia_id, c.nombre || ' ' || c.apellido AS cliente, v.placa, s.codigo AS espacio, e.fecha_entrada, e.fecha_salida, e.total, e.estado FROM estadias e JOIN vehiculos v ON v.vehiculo_id = e.vehiculo_id JOIN clientes c ON c.cliente_id = v.cliente_id JOIN espacios s ON s.espacio_id = e.espacio_id ORDER BY e.fecha_entrada DESC LIMIT 8`),
      pool.query(`SELECT p.pago_id, p.estadia_id, mp.nombre AS metodo_pago, p.monto, p.fecha_pago FROM pagos p JOIN metodos_pago mp ON mp.metodo_pago_id = p.metodo_pago_id ORDER BY p.fecha_pago DESC LIMIT 8`)
    ]);
    res.json({ resumen: resumen.rows[0], estadias_activas: activas.rows, ultimas_estadias: recientes.rows, ultimos_pagos: pagos.rows });
  } catch (error) { next(error); }
});

export default router;
