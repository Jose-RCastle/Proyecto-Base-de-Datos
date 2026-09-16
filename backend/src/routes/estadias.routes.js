import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

const historial = `
    SELECT
        e.estadia_id,
        e.vehiculo_id,
        COALESCE(c.nombre || ' ' || c.apellido, 'Sin cliente') AS cliente,
        v.placa,
        tv.nombre AS tipo_vehiculo,
        z.nombre AS zona,
        s.codigo AS espacio,
        e.fecha_entrada,
        e.fecha_salida,
        e.duracion_minutos,
        t.precio_hora,
        e.total,
        e.estado,
        u.nombre_completo AS operador
    FROM estadias e
    JOIN vehiculos v
        ON v.vehiculo_id = e.vehiculo_id
    LEFT JOIN clientes c
        ON c.cliente_id = v.cliente_id
    JOIN tipos_vehiculo tv
        ON tv.tipo_vehiculo_id = v.tipo_vehiculo_id
    JOIN espacios s
        ON s.espacio_id = e.espacio_id
    JOIN zonas z
        ON z.zona_id = s.zona_id
    JOIN tarifas t
        ON t.tarifa_id = e.tarifa_id
    JOIN usuarios u
        ON u.usuario_id = e.usuario_id
`;

/*
 * HISTORIAL DE ESTADÍAS
 *
 * Soporta:
 *   ?periodo=hoy
 *   ?periodo=ayer
 *   ?fecha=2026-09-14
 *   ?desde=2026-09-10&hasta=2026-09-14
 *   sin parámetros = todas
 */
router.get('/', async (req, res, next) => {
    try {
        const values = [];
        const conditions = [];

        if (req.query.periodo === 'hoy') {
            conditions.push(`e.fecha_entrada::date = CURRENT_DATE`);
        }

        else if (req.query.periodo === 'ayer') {
            conditions.push(`e.fecha_entrada::date = CURRENT_DATE - 1`);
        }

        else if (req.query.fecha) {
            values.push(req.query.fecha);
            conditions.push(`e.fecha_entrada::date = $${values.length}`);
        }

        else {
            if (req.query.desde) {
                values.push(req.query.desde);
                conditions.push(`e.fecha_entrada::date >= $${values.length}`);
            }

            if (req.query.hasta) {
                values.push(req.query.hasta);
                conditions.push(`e.fecha_entrada::date <= $${values.length}`);
            }
        }

        const where = conditions.length
            ? ` WHERE ${conditions.join(' AND ')}`
            : '';

        const query = `
            ${historial}
            ${where}
            ORDER BY e.fecha_entrada DESC
        `;

        const { rows } = await pool.query(query, values);

        res.json(rows);

    } catch (error) {
        next(error);
    }
});


/*
 * ESTADÍAS ACTIVAS
 */
router.get('/activas', async (_req, res, next) => {
    try {
        const { rows } = await pool.query(`
            ${historial}
            WHERE e.estado = 'ACTIVA'
            ORDER BY e.fecha_entrada DESC
        `);

        res.json(rows);

    } catch (error) {
        next(error);
    }
});


/*
 * REGISTRAR ENTRADA
 */
router.post('/entrada', async (req, res, next) => {

    const {
        placa,
        codigo_espacio,
        nombre_usuario
    } = req.body;

    if (
        ![placa, codigo_espacio, nombre_usuario]
            .every(v => typeof v === 'string' && v.trim())
    ) {
        return res.status(400).json({
            error: 'Vehículo, espacio y usuario son obligatorios.'
        });
    }

    try {

        const { rows } = await pool.query(
            `
            SELECT registrar_entrada($1, $2, $3) AS estadia_id
            `,
            [
                placa.trim(),
                codigo_espacio.trim(),
                nombre_usuario.trim()
            ]
        );

        const ticket = await pool.query(
            `
            ${historial}
            WHERE e.estadia_id = $1
            `,
            [rows[0].estadia_id]
        );

        res.status(201).json({
            message: 'Entrada registrada correctamente.',
            ...ticket.rows[0]
        });

    } catch (error) {
        next(error);
    }
});


/*
 * REGISTRAR SALIDA
 */
router.post('/salida', async (req, res, next) => {

    const {
        estadia_id,
        metodo_pago
    } = req.body;

    if (
        !Number.isInteger(Number(estadia_id)) ||
        !metodo_pago?.trim()
    ) {
        return res.status(400).json({
            error: 'Seleccione una estadía activa y un método de pago.'
        });
    }

    try {

        await pool.query(
            `
            SELECT registrar_salida($1, $2) AS total
            `,
            [
                Number(estadia_id),
                metodo_pago.trim()
            ]
        );

        const ticket = await pool.query(
            `
            ${historial}
            WHERE e.estadia_id = $1
            `,
            [Number(estadia_id)]
        );

        res.json({
            message: 'Salida registrada correctamente.',
            metodo_pago: metodo_pago.trim(),
            ...ticket.rows[0]
        });

    } catch (error) {
        next(error);
    }
});


export default router;