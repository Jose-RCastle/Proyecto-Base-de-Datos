import { Router } from 'express';
import pool from '../config/database.js';
const router = Router();
const consulta = (sql) => async (_req, res, next) => { try { const { rows } = await pool.query(sql); res.json(rows); } catch (error) { next(error); } };

router.get('/ocupacion', consulta(`SELECT COUNT(*) AS total_espacios, COUNT(*) FILTER (WHERE estado = 'OCUPADO') AS ocupados, COUNT(*) FILTER (WHERE estado = 'DISPONIBLE') AS disponibles, ROUND(COUNT(*) FILTER (WHERE estado = 'OCUPADO') * 100.0 / NULLIF(COUNT(*), 0), 2) AS porcentaje_ocupacion FROM espacios`));
router.get('/ingresos', consulta(`SELECT COUNT(*) AS cantidad_pagos, COALESCE(SUM(monto), 0) AS ingresos_totales, COALESCE(AVG(monto), 0) AS promedio_por_pago, COALESCE(MIN(monto), 0) AS pago_minimo, COALESCE(MAX(monto), 0) AS pago_maximo FROM pagos`));
router.get('/ingresos-metodo', consulta(`SELECT mp.nombre AS metodo_pago, COUNT(p.pago_id) AS cantidad_pagos, COALESCE(SUM(p.monto), 0) AS ingresos_totales FROM metodos_pago mp LEFT JOIN pagos p ON p.metodo_pago_id = mp.metodo_pago_id GROUP BY mp.metodo_pago_id, mp.nombre ORDER BY ingresos_totales DESC`));
router.get('/vehiculos-tipo', consulta(`SELECT tv.nombre AS tipo_vehiculo, COUNT(v.vehiculo_id) AS cantidad_vehiculos FROM tipos_vehiculo tv LEFT JOIN vehiculos v ON v.tipo_vehiculo_id = tv.tipo_vehiculo_id GROUP BY tv.tipo_vehiculo_id, tv.nombre ORDER BY tv.nombre`));
router.get('/estadias-estado', consulta(`SELECT estado, COUNT(*) AS cantidad_estadias FROM estadias GROUP BY estado ORDER BY estado`));
router.get('/ingresos-mes', async (req, res, next) => {
    const mes = typeof req.query.mes === 'string' ? req.query.mes : '';

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return res.status(400).json({ error: 'El mes debe tener el formato AAAA-MM.' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT DATE(fecha_pago) AS fecha, COUNT(*) AS cantidad_pagos, COALESCE(SUM(monto), 0) AS ingresos_totales
             FROM pagos
             WHERE fecha_pago >= $1::date
               AND fecha_pago < $1::date + INTERVAL '1 month'
             GROUP BY DATE(fecha_pago)
             ORDER BY fecha DESC`,
            [`${mes}-01`]
        );

        res.json(rows);
    } catch (error) {
        next(error);
    }
});
router.get('/historial', consulta(`SELECT e.estadia_id, COALESCE(c.nombre || ' ' || c.apellido, 'Sin cliente') AS cliente, v.placa, tv.nombre AS tipo_vehiculo, z.nombre AS zona, s.codigo AS espacio, e.fecha_entrada, e.fecha_salida, e.duracion_minutos, t.precio_hora, e.total, e.estado, u.nombre_completo AS operador FROM estadias e JOIN vehiculos v ON v.vehiculo_id=e.vehiculo_id LEFT JOIN clientes c ON c.cliente_id=v.cliente_id JOIN tipos_vehiculo tv ON tv.tipo_vehiculo_id=v.tipo_vehiculo_id JOIN espacios s ON s.espacio_id=e.espacio_id JOIN zonas z ON z.zona_id=s.zona_id JOIN tarifas t ON t.tarifa_id=e.tarifa_id JOIN usuarios u ON u.usuario_id=e.usuario_id ORDER BY e.fecha_entrada DESC`));
export default router;
