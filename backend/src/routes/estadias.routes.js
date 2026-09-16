import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

// `datetime-local` sends a local timestamp without a timezone.  Validate its
// shape here so PostgreSQL receives an unambiguous timestamp while leaving the
// operational validations and billing rules to the stored functions.
const timestampWithoutTimezone = value => {
    if (typeof value !== 'string') return null;

    const match = value.trim().match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
    );

    if (!match) return null;

    const [, year, month, day, hour, minute, second = '00'] = match;
    const parsed = new Date(
        Number(year), Number(month) - 1, Number(day),
        Number(hour), Number(minute), Number(second)
    );

    if (
        parsed.getFullYear() !== Number(year) ||
        parsed.getMonth() !== Number(month) - 1 ||
        parsed.getDate() !== Number(day) ||
        parsed.getHours() !== Number(hour) ||
        parsed.getMinutes() !== Number(minute) ||
        parsed.getSeconds() !== Number(second)
    ) return null;

    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
};

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
        nombre_usuario,
        fecha_entrada
    } = req.body;
    const fechaEntrada = timestampWithoutTimezone(fecha_entrada);

    if (
        ![placa, codigo_espacio, nombre_usuario]
            .every(v => typeof v === 'string' && v.trim())
        || !fechaEntrada
    ) {
        return res.status(400).json({
            error: 'Vehículo, espacio, usuario operador y fecha de entrada válidos son obligatorios.'
        });
    }

    try {

        const { rows } = await pool.query(
            `
            SELECT registrar_entrada($1, $2, $3, $4) AS estadia_id
            `,
            [
                placa.trim(),
                codigo_espacio.trim(),
                nombre_usuario.trim(),
                fechaEntrada
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
        metodo_pago,
        fecha_salida
    } = req.body;
    const fechaSalida = timestampWithoutTimezone(fecha_salida);

    if (
        !Number.isInteger(Number(estadia_id)) ||
        !metodo_pago?.trim() ||
        !fechaSalida
    ) {
        return res.status(400).json({
            error: 'Seleccione una estadía activa, un método de pago y una fecha de salida válida.'
        });
    }

    try {

        await pool.query(
            `
            SELECT registrar_salida($1, $2, $3) AS total
            `,
            [
                Number(estadia_id),
                metodo_pago.trim(),
                fechaSalida
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
