--
-- PostgreSQL database dump
--

\restrict byHCXaM1APwYOPoPKh2KRp7SCY1t8Fr81KjjHuIBNk9nZTwxLr61jGUU09b6QId

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

-- Started on 2026-09-14 23:53:24

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 4 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- TOC entry 5150 (class 0 OID 0)
-- Dependencies: 4
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 239 (class 1255 OID 25023)
-- Name: registrar_entrada(character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.registrar_entrada(p_placa character varying, p_codigo_espacio character varying, p_nombre_usuario character varying) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_vehiculo_id INTEGER;
    v_espacio_id INTEGER;
    v_tarifa_id INTEGER;
    v_usuario_id INTEGER;
    v_estadia_id INTEGER;
    v_estado_espacio VARCHAR(20);
BEGIN

    -- Buscar vehículo
    SELECT vehiculo_id
    INTO v_vehiculo_id
    FROM vehiculos
    WHERE placa = p_placa;

    IF v_vehiculo_id IS NULL THEN
        RAISE EXCEPTION 'El vehículo con placa % no existe.', p_placa;
    END IF;


    -- Buscar espacio
    SELECT espacio_id, estado
    INTO v_espacio_id, v_estado_espacio
    FROM espacios
    WHERE codigo = p_codigo_espacio;

    IF v_espacio_id IS NULL THEN
        RAISE EXCEPTION 'El espacio % no existe.', p_codigo_espacio;
    END IF;


    -- Verificar que esté disponible
    IF v_estado_espacio <> 'DISPONIBLE' THEN
        RAISE EXCEPTION 'El espacio % no está disponible. Estado actual: %',
            p_codigo_espacio,
            v_estado_espacio;
    END IF;


    -- Buscar tarifa activa según el tipo de vehículo
    SELECT t.tarifa_id
    INTO v_tarifa_id
    FROM tarifas t
    JOIN vehiculos v
        ON v.tipo_vehiculo_id = t.tipo_vehiculo_id
    WHERE v.vehiculo_id = v_vehiculo_id
      AND t.activa = TRUE
    ORDER BY t.tarifa_id
    LIMIT 1;

    IF v_tarifa_id IS NULL THEN
        RAISE EXCEPTION 'No existe una tarifa activa para el vehículo %.',
            p_placa;
    END IF;


    -- Buscar usuario
    SELECT usuario_id
    INTO v_usuario_id
    FROM usuarios
    WHERE nombre_usuario = p_nombre_usuario
      AND activo = TRUE;

    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo.',
            p_nombre_usuario;
    END IF;


    -- Verificar que el vehículo no tenga una estadía activa
    IF EXISTS (
        SELECT 1
        FROM estadias
        WHERE vehiculo_id = v_vehiculo_id
          AND estado = 'ACTIVA'
    ) THEN
        RAISE EXCEPTION 'El vehículo % ya tiene una estadía activa.',
            p_placa;
    END IF;


    -- Crear estadía
    INSERT INTO estadias (
        vehiculo_id,
        espacio_id,
        tarifa_id,
        usuario_id,
        fecha_entrada,
        estado
    )
    VALUES (
        v_vehiculo_id,
        v_espacio_id,
        v_tarifa_id,
        v_usuario_id,
        CURRENT_TIMESTAMP,
        'ACTIVA'
    )
    RETURNING estadia_id INTO v_estadia_id;


    -- Marcar espacio como ocupado
    UPDATE espacios
    SET estado = 'OCUPADO'
    WHERE espacio_id = v_espacio_id;


    RETURN v_estadia_id;

END;
$$;


ALTER FUNCTION public.registrar_entrada(p_placa character varying, p_codigo_espacio character varying, p_nombre_usuario character varying) OWNER TO postgres;

--
-- TOC entry 251 (class 1255 OID 25024)
-- Name: registrar_salida(integer, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.registrar_salida(p_estadia_id integer, p_metodo_pago character varying) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_fecha_entrada TIMESTAMP;
    v_fecha_salida TIMESTAMP;
    v_duracion_minutos INTEGER;
    v_horas INTEGER;
    v_precio_hora NUMERIC(10,2);
    v_total NUMERIC(10,2);
    v_espacio_id INTEGER;
    v_metodo_pago_id INTEGER;
    v_estado VARCHAR(20);
BEGIN

    -- Buscar la estadía
    SELECT
        fecha_entrada,
        espacio_id,
        estado
    INTO
        v_fecha_entrada,
        v_espacio_id,
        v_estado
    FROM estadias
    WHERE estadia_id = p_estadia_id;

    IF v_fecha_entrada IS NULL THEN
        RAISE EXCEPTION 'La estadía % no existe.', p_estadia_id;
    END IF;


    -- Verificar que esté activa
    IF v_estado <> 'ACTIVA' THEN
        RAISE EXCEPTION 'La estadía % no está activa.', p_estadia_id;
    END IF;


    -- Buscar método de pago
    SELECT metodo_pago_id
    INTO v_metodo_pago_id
    FROM metodos_pago
    WHERE LOWER(nombre) = LOWER(p_metodo_pago);

    IF v_metodo_pago_id IS NULL THEN
        RAISE EXCEPTION 'El método de pago "%" no existe.', p_metodo_pago;
    END IF;


    -- Fecha y hora de salida
    v_fecha_salida := CURRENT_TIMESTAMP;


    -- Calcular duración en minutos
    v_duracion_minutos :=
        FLOOR(
            EXTRACT(EPOCH FROM (v_fecha_salida - v_fecha_entrada)) / 60
        );


    -- Obtener tarifa
    SELECT t.precio_hora
    INTO v_precio_hora
    FROM tarifas t
    JOIN estadias e
        ON e.tarifa_id = t.tarifa_id
    WHERE e.estadia_id = p_estadia_id;


    IF v_precio_hora IS NULL THEN
        RAISE EXCEPTION 'No se encontró la tarifa de la estadía %.',
            p_estadia_id;
    END IF;


    -- Calcular horas cobrables.
    -- Cada fracción de hora se cobra como una hora completa.
    v_horas := CEIL(v_duracion_minutos / 60.0);


    -- Garantizar mínimo una hora
    IF v_horas < 1 THEN
        v_horas := 1;
    END IF;


    -- Calcular total
    v_total := v_horas * v_precio_hora;


    -- Actualizar estadía
    UPDATE estadias
    SET
        fecha_salida = v_fecha_salida,
        duracion_minutos = v_duracion_minutos,
        total = v_total,
        estado = 'FINALIZADA'
    WHERE estadia_id = p_estadia_id;


    -- Liberar espacio
    UPDATE espacios
    SET estado = 'DISPONIBLE'
    WHERE espacio_id = v_espacio_id;


    -- Registrar pago
    INSERT INTO pagos (
        estadia_id,
        metodo_pago_id,
        monto,
        fecha_pago
    )
    VALUES (
        p_estadia_id,
        v_metodo_pago_id,
        v_total,
        v_fecha_salida
    );


    RETURN v_total;

END;
$$;


ALTER FUNCTION public.registrar_salida(p_estadia_id integer, p_metodo_pago character varying) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 220 (class 1259 OID 24824)
-- Name: clientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clientes (
    cliente_id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    telefono character varying(20),
    correo character varying(150),
    fecha_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.clientes OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 24823)
-- Name: clientes_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.clientes ALTER COLUMN cliente_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.clientes_cliente_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 228 (class 1259 OID 24880)
-- Name: espacios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.espacios (
    espacio_id integer NOT NULL,
    zona_id integer NOT NULL,
    codigo character varying(10) NOT NULL,
    tipo_vehiculo_id integer NOT NULL,
    estado character varying(20) DEFAULT 'DISPONIBLE'::character varying NOT NULL,
    CONSTRAINT chk_espacio_estado CHECK (((estado)::text = ANY ((ARRAY['DISPONIBLE'::character varying, 'OCUPADO'::character varying, 'MANTENIMIENTO'::character varying])::text[])))
);


ALTER TABLE public.espacios OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 24879)
-- Name: espacios_espacio_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.espacios ALTER COLUMN espacio_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.espacios_espacio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 236 (class 1259 OID 24951)
-- Name: estadias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.estadias (
    estadia_id integer NOT NULL,
    vehiculo_id integer NOT NULL,
    espacio_id integer NOT NULL,
    tarifa_id integer NOT NULL,
    usuario_id integer NOT NULL,
    fecha_entrada timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_salida timestamp without time zone,
    duracion_minutos integer,
    total numeric(10,2),
    estado character varying(20) DEFAULT 'ACTIVA'::character varying NOT NULL,
    CONSTRAINT chk_estadia_duracion CHECK (((duracion_minutos IS NULL) OR (duracion_minutos >= 0))),
    CONSTRAINT chk_estadia_estado CHECK (((estado)::text = ANY ((ARRAY['ACTIVA'::character varying, 'FINALIZADA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT chk_estadia_fechas CHECK (((fecha_salida IS NULL) OR (fecha_salida >= fecha_entrada))),
    CONSTRAINT chk_estadia_total CHECK (((total IS NULL) OR (total >= (0)::numeric)))
);


ALTER TABLE public.estadias OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 24950)
-- Name: estadias_estadia_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.estadias ALTER COLUMN estadia_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.estadias_estadia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 234 (class 1259 OID 24941)
-- Name: metodos_pago; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.metodos_pago (
    metodo_pago_id integer NOT NULL,
    nombre character varying(50) NOT NULL
);


ALTER TABLE public.metodos_pago OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 24940)
-- Name: metodos_pago_metodo_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.metodos_pago ALTER COLUMN metodo_pago_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.metodos_pago_metodo_pago_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 238 (class 1259 OID 24990)
-- Name: pagos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagos (
    pago_id integer NOT NULL,
    estadia_id integer NOT NULL,
    metodo_pago_id integer NOT NULL,
    monto numeric(10,2) NOT NULL,
    fecha_pago timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_pago_monto CHECK ((monto > (0)::numeric))
);


ALTER TABLE public.pagos OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 24989)
-- Name: pagos_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.pagos ALTER COLUMN pago_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pagos_pago_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 230 (class 1259 OID 24905)
-- Name: tarifas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tarifas (
    tarifa_id integer NOT NULL,
    tipo_vehiculo_id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    precio_hora numeric(10,2) NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_tarifa_precio CHECK ((precio_hora > (0)::numeric))
);


ALTER TABLE public.tarifas OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 24904)
-- Name: tarifas_tarifa_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.tarifas ALTER COLUMN tarifa_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tarifas_tarifa_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 222 (class 1259 OID 24837)
-- Name: tipos_vehiculo; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tipos_vehiculo (
    tipo_vehiculo_id integer NOT NULL,
    nombre character varying(50) NOT NULL,
    descripcion character varying(200)
);


ALTER TABLE public.tipos_vehiculo OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 24836)
-- Name: tipos_vehiculo_tipo_vehiculo_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.tipos_vehiculo ALTER COLUMN tipo_vehiculo_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tipos_vehiculo_tipo_vehiculo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 232 (class 1259 OID 24923)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    usuario_id integer NOT NULL,
    nombre_usuario character varying(50) NOT NULL,
    nombre_completo character varying(150) NOT NULL,
    correo character varying(150),
    rol character varying(30) DEFAULT 'OPERADOR'::character varying NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_usuario_rol CHECK (((rol)::text = ANY ((ARRAY['ADMINISTRADOR'::character varying, 'OPERADOR'::character varying])::text[])))
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 24922)
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.usuarios ALTER COLUMN usuario_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.usuarios_usuario_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 224 (class 1259 OID 24847)
-- Name: vehiculos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehiculos (
    vehiculo_id integer NOT NULL,
    cliente_id integer NOT NULL,
    tipo_vehiculo_id integer NOT NULL,
    placa character varying(15) NOT NULL,
    marca character varying(50),
    modelo character varying(50),
    anio integer,
    CONSTRAINT chk_vehiculo_anio CHECK (((anio IS NULL) OR ((anio >= 1900) AND (anio <= 2100))))
);


ALTER TABLE public.vehiculos OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 24846)
-- Name: vehiculos_vehiculo_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vehiculos ALTER COLUMN vehiculo_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vehiculos_vehiculo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 24870)
-- Name: zonas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.zonas (
    zona_id integer NOT NULL,
    nombre character varying(50) NOT NULL,
    descripcion character varying(200)
);


ALTER TABLE public.zonas OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 24869)
-- Name: zonas_zona_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.zonas ALTER COLUMN zona_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.zonas_zona_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 5126 (class 0 OID 24824)
-- Dependencies: 220
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clientes (cliente_id, nombre, apellido, telefono, correo, fecha_registro) FROM stdin;
1	José	Hernández	9999-1001	jose.h@example.com	2026-09-14 23:34:16.363838
2	María	Gómez	9999-1002	maria.g@example.com	2026-09-14 23:34:16.363838
3	Carlos	Rodríguez	9999-1003	carlos.r@example.com	2026-09-14 23:34:16.363838
4	Ana	Martínez	9999-1004	ana.m@example.com	2026-09-14 23:34:16.363838
5	Luis	Flores	9999-1005	luis.f@example.com	2026-09-14 23:34:16.363838
6	Sofía	Castillo	9999-1006	sofia.c@example.com	2026-09-14 23:34:16.363838
7	Daniel	Pineda	9999-1007	daniel.p@example.com	2026-09-14 23:34:16.363838
8	Laura	Mejía	9999-1008	laura.m@example.com	2026-09-14 23:34:16.363838
9	Miguel	Torres	9999-1009	miguel.t@example.com	2026-09-14 23:34:16.363838
10	Andrea	Rivera	9999-1010	andrea.r@example.com	2026-09-14 23:34:16.363838
\.


--
-- TOC entry 5134 (class 0 OID 24880)
-- Dependencies: 228
-- Data for Name: espacios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.espacios (espacio_id, zona_id, codigo, tipo_vehiculo_id, estado) FROM stdin;
1	1	A-01	2	DISPONIBLE
2	1	A-02	2	DISPONIBLE
3	1	A-03	2	DISPONIBLE
6	2	B-01	3	DISPONIBLE
7	2	B-02	3	DISPONIBLE
8	2	B-03	3	DISPONIBLE
9	2	B-04	4	DISPONIBLE
10	2	B-05	4	DISPONIBLE
11	3	C-01	1	DISPONIBLE
12	3	C-02	1	DISPONIBLE
14	3	C-04	1	DISPONIBLE
15	3	C-05	1	DISPONIBLE
4	1	A-04	2	OCUPADO
13	3	C-03	1	OCUPADO
5	1	A-05	2	DISPONIBLE
\.


--
-- TOC entry 5142 (class 0 OID 24951)
-- Dependencies: 236
-- Data for Name: estadias; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.estadias (estadia_id, vehiculo_id, espacio_id, tarifa_id, usuario_id, fecha_entrada, fecha_salida, duracion_minutos, total, estado) FROM stdin;
1	6	1	1	2	2026-09-10 08:15:00	2026-09-10 11:15:00	180	75.00	FINALIZADA
2	5	2	1	2	2026-09-10 13:30:00	2026-09-10 16:30:00	180	75.00	FINALIZADA
3	8	6	4	3	2026-09-11 09:00:00	2026-09-11 13:00:00	240	120.00	FINALIZADA
4	2	11	3	2	2026-09-12 10:00:00	2026-09-12 12:00:00	120	30.00	FINALIZADA
5	4	3	1	3	2026-09-12 14:20:00	2026-09-12 19:20:00	300	150.00	FINALIZADA
6	1	12	3	2	2026-09-13 08:30:00	2026-09-13 11:30:00	180	45.00	FINALIZADA
7	6	4	1	2	2026-09-14 18:30:00	\N	\N	\N	ACTIVA
8	1	13	3	3	2026-09-14 20:15:00	\N	\N	\N	ACTIVA
9	5	5	1	2	2026-09-14 23:39:34.960512	2026-09-14 23:41:12.675547	1	25.00	FINALIZADA
\.


--
-- TOC entry 5140 (class 0 OID 24941)
-- Dependencies: 234
-- Data for Name: metodos_pago; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.metodos_pago (metodo_pago_id, nombre) FROM stdin;
1	Efectivo
2	Tarjeta
3	Transferencia
\.


--
-- TOC entry 5144 (class 0 OID 24990)
-- Dependencies: 238
-- Data for Name: pagos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagos (pago_id, estadia_id, metodo_pago_id, monto, fecha_pago) FROM stdin;
1	1	1	75.00	2026-09-10 11:15:00
2	2	1	75.00	2026-09-10 16:30:00
3	3	1	120.00	2026-09-11 13:00:00
4	4	1	30.00	2026-09-12 12:00:00
5	5	1	150.00	2026-09-12 19:20:00
6	6	1	45.00	2026-09-13 11:30:00
7	9	2	25.00	2026-09-14 23:41:12.675547
\.


--
-- TOC entry 5136 (class 0 OID 24905)
-- Dependencies: 230
-- Data for Name: tarifas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tarifas (tarifa_id, tipo_vehiculo_id, nombre, precio_hora, activa) FROM stdin;
1	2	Tarifa Automóvil	25.00	t
2	4	Tarifa Pickup	30.00	t
3	1	Tarifa Motocicleta	15.00	t
4	3	Tarifa Camioneta	30.00	t
\.


--
-- TOC entry 5128 (class 0 OID 24837)
-- Dependencies: 222
-- Data for Name: tipos_vehiculo; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tipos_vehiculo (tipo_vehiculo_id, nombre, descripcion) FROM stdin;
1	Motocicleta	Vehículos de dos ruedas
2	Automóvil	Vehículos particulares
3	Camioneta	Vehículos tipo SUV o camioneta
4	Pickup	Vehículos tipo pickup
\.


--
-- TOC entry 5138 (class 0 OID 24923)
-- Dependencies: 232
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (usuario_id, nombre_usuario, nombre_completo, correo, rol, activo) FROM stdin;
1	admin	Administrador del Sistema	admin@parkcontrol.com	ADMINISTRADOR	t
2	operador1	Carlos Martínez	carlos@parkcontrol.com	OPERADOR	t
3	operador2	Ana López	ana@parkcontrol.com	OPERADOR	t
\.


--
-- TOC entry 5130 (class 0 OID 24847)
-- Dependencies: 224
-- Data for Name: vehiculos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vehiculos (vehiculo_id, cliente_id, tipo_vehiculo_id, placa, marca, modelo, anio) FROM stdin;
1	7	1	HGG-7890	Yamaha	FZ25	2023
2	4	1	HDD-4567	Honda	CB190R	2022
3	9	2	HJJ-9012	Mazda	3	2021
4	6	2	HFF-6789	Hyundai	Elantra	2020
5	2	2	HBB-2145	Honda	Civic	2021
6	1	2	HAA-1023	Toyota	Corolla	2022
7	8	3	HII-8901	Kia	Sportage	2022
8	3	3	HCC-3345	Toyota	RAV4	2023
9	10	4	HKK-1122	Toyota	Hilux	2023
10	5	4	HEE-5678	Ford	Ranger	2024
\.


--
-- TOC entry 5132 (class 0 OID 24870)
-- Dependencies: 226
-- Data for Name: zonas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.zonas (zona_id, nombre, descripcion) FROM stdin;
1	Zona A	Área principal del parqueo
2	Zona B	Área lateral del parqueo
3	Zona C	Área de motocicletas y vehículos pequeños
\.


--
-- TOC entry 5151 (class 0 OID 0)
-- Dependencies: 219
-- Name: clientes_cliente_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clientes_cliente_id_seq', 10, true);


--
-- TOC entry 5152 (class 0 OID 0)
-- Dependencies: 227
-- Name: espacios_espacio_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.espacios_espacio_id_seq', 15, true);


--
-- TOC entry 5153 (class 0 OID 0)
-- Dependencies: 235
-- Name: estadias_estadia_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.estadias_estadia_id_seq', 9, true);


--
-- TOC entry 5154 (class 0 OID 0)
-- Dependencies: 233
-- Name: metodos_pago_metodo_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.metodos_pago_metodo_pago_id_seq', 3, true);


--
-- TOC entry 5155 (class 0 OID 0)
-- Dependencies: 237
-- Name: pagos_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagos_pago_id_seq', 7, true);


--
-- TOC entry 5156 (class 0 OID 0)
-- Dependencies: 229
-- Name: tarifas_tarifa_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tarifas_tarifa_id_seq', 4, true);


--
-- TOC entry 5157 (class 0 OID 0)
-- Dependencies: 221
-- Name: tipos_vehiculo_tipo_vehiculo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tipos_vehiculo_tipo_vehiculo_id_seq', 4, true);


--
-- TOC entry 5158 (class 0 OID 0)
-- Dependencies: 231
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuarios_usuario_id_seq', 3, true);


--
-- TOC entry 5159 (class 0 OID 0)
-- Dependencies: 223
-- Name: vehiculos_vehiculo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vehiculos_vehiculo_id_seq', 10, true);


--
-- TOC entry 5160 (class 0 OID 0)
-- Dependencies: 225
-- Name: zonas_zona_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.zonas_zona_id_seq', 3, true);


--
-- TOC entry 4921 (class 2606 OID 24833)
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (cliente_id);


--
-- TOC entry 4939 (class 2606 OID 24891)
-- Name: espacios espacios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT espacios_pkey PRIMARY KEY (espacio_id);


--
-- TOC entry 4957 (class 2606 OID 24968)
-- Name: estadias estadias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estadias
    ADD CONSTRAINT estadias_pkey PRIMARY KEY (estadia_id);


--
-- TOC entry 4953 (class 2606 OID 24947)
-- Name: metodos_pago metodos_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.metodos_pago
    ADD CONSTRAINT metodos_pago_pkey PRIMARY KEY (metodo_pago_id);


--
-- TOC entry 4964 (class 2606 OID 25001)
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (pago_id);


--
-- TOC entry 4945 (class 2606 OID 24916)
-- Name: tarifas tarifas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_pkey PRIMARY KEY (tarifa_id);


--
-- TOC entry 4925 (class 2606 OID 24843)
-- Name: tipos_vehiculo tipos_vehiculo_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tipos_vehiculo
    ADD CONSTRAINT tipos_vehiculo_pkey PRIMARY KEY (tipo_vehiculo_id);


--
-- TOC entry 4923 (class 2606 OID 24835)
-- Name: clientes uq_cliente_correo; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT uq_cliente_correo UNIQUE (correo);


--
-- TOC entry 4943 (class 2606 OID 24893)
-- Name: espacios uq_espacio_codigo; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT uq_espacio_codigo UNIQUE (codigo);


--
-- TOC entry 4955 (class 2606 OID 24949)
-- Name: metodos_pago uq_metodo_pago_nombre; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.metodos_pago
    ADD CONSTRAINT uq_metodo_pago_nombre UNIQUE (nombre);


--
-- TOC entry 4966 (class 2606 OID 25003)
-- Name: pagos uq_pago_estadia; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT uq_pago_estadia UNIQUE (estadia_id);


--
-- TOC entry 4927 (class 2606 OID 24845)
-- Name: tipos_vehiculo uq_tipo_vehiculo_nombre; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tipos_vehiculo
    ADD CONSTRAINT uq_tipo_vehiculo_nombre UNIQUE (nombre);


--
-- TOC entry 4947 (class 2606 OID 24939)
-- Name: usuarios uq_usuario_correo; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT uq_usuario_correo UNIQUE (correo);


--
-- TOC entry 4949 (class 2606 OID 24937)
-- Name: usuarios uq_usuario_nombre; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT uq_usuario_nombre UNIQUE (nombre_usuario);


--
-- TOC entry 4931 (class 2606 OID 24858)
-- Name: vehiculos uq_vehiculo_placa; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT uq_vehiculo_placa UNIQUE (placa);


--
-- TOC entry 4935 (class 2606 OID 24878)
-- Name: zonas uq_zona_nombre; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.zonas
    ADD CONSTRAINT uq_zona_nombre UNIQUE (nombre);


--
-- TOC entry 4951 (class 2606 OID 24935)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (usuario_id);


--
-- TOC entry 4933 (class 2606 OID 24856)
-- Name: vehiculos vehiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_pkey PRIMARY KEY (vehiculo_id);


--
-- TOC entry 4937 (class 2606 OID 24876)
-- Name: zonas zonas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.zonas
    ADD CONSTRAINT zonas_pkey PRIMARY KEY (zona_id);


--
-- TOC entry 4940 (class 1259 OID 25017)
-- Name: idx_espacios_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_espacios_estado ON public.espacios USING btree (estado);


--
-- TOC entry 4941 (class 1259 OID 25016)
-- Name: idx_espacios_zona; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_espacios_zona ON public.espacios USING btree (zona_id);


--
-- TOC entry 4958 (class 1259 OID 25019)
-- Name: idx_estadias_espacio; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estadias_espacio ON public.estadias USING btree (espacio_id);


--
-- TOC entry 4959 (class 1259 OID 25020)
-- Name: idx_estadias_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estadias_estado ON public.estadias USING btree (estado);


--
-- TOC entry 4960 (class 1259 OID 25021)
-- Name: idx_estadias_fecha_entrada; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estadias_fecha_entrada ON public.estadias USING btree (fecha_entrada);


--
-- TOC entry 4961 (class 1259 OID 25018)
-- Name: idx_estadias_vehiculo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estadias_vehiculo ON public.estadias USING btree (vehiculo_id);


--
-- TOC entry 4962 (class 1259 OID 25022)
-- Name: idx_pagos_fecha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagos_fecha ON public.pagos USING btree (fecha_pago);


--
-- TOC entry 4928 (class 1259 OID 25014)
-- Name: idx_vehiculos_cliente; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehiculos_cliente ON public.vehiculos USING btree (cliente_id);


--
-- TOC entry 4929 (class 1259 OID 25015)
-- Name: idx_vehiculos_tipo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehiculos_tipo ON public.vehiculos USING btree (tipo_vehiculo_id);


--
-- TOC entry 4969 (class 2606 OID 24899)
-- Name: espacios fk_espacio_tipo; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT fk_espacio_tipo FOREIGN KEY (tipo_vehiculo_id) REFERENCES public.tipos_vehiculo(tipo_vehiculo_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4970 (class 2606 OID 24894)
-- Name: espacios fk_espacio_zona; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT fk_espacio_zona FOREIGN KEY (zona_id) REFERENCES public.zonas(zona_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4972 (class 2606 OID 24974)
-- Name: estadias fk_estadia_espacio; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estadias
    ADD CONSTRAINT fk_estadia_espacio FOREIGN KEY (espacio_id) REFERENCES public.espacios(espacio_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4973 (class 2606 OID 24979)
-- Name: estadias fk_estadia_tarifa; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estadias
    ADD CONSTRAINT fk_estadia_tarifa FOREIGN KEY (tarifa_id) REFERENCES public.tarifas(tarifa_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4974 (class 2606 OID 24984)
-- Name: estadias fk_estadia_usuario; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estadias
    ADD CONSTRAINT fk_estadia_usuario FOREIGN KEY (usuario_id) REFERENCES public.usuarios(usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4975 (class 2606 OID 24969)
-- Name: estadias fk_estadia_vehiculo; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estadias
    ADD CONSTRAINT fk_estadia_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(vehiculo_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4976 (class 2606 OID 25004)
-- Name: pagos fk_pago_estadia; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT fk_pago_estadia FOREIGN KEY (estadia_id) REFERENCES public.estadias(estadia_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4977 (class 2606 OID 25009)
-- Name: pagos fk_pago_metodo; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT fk_pago_metodo FOREIGN KEY (metodo_pago_id) REFERENCES public.metodos_pago(metodo_pago_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4971 (class 2606 OID 24917)
-- Name: tarifas fk_tarifa_tipo; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT fk_tarifa_tipo FOREIGN KEY (tipo_vehiculo_id) REFERENCES public.tipos_vehiculo(tipo_vehiculo_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4967 (class 2606 OID 24859)
-- Name: vehiculos fk_vehiculo_cliente; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT fk_vehiculo_cliente FOREIGN KEY (cliente_id) REFERENCES public.clientes(cliente_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4968 (class 2606 OID 24864)
-- Name: vehiculos fk_vehiculo_tipo; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT fk_vehiculo_tipo FOREIGN KEY (tipo_vehiculo_id) REFERENCES public.tipos_vehiculo(tipo_vehiculo_id) ON UPDATE CASCADE ON DELETE RESTRICT;


-- Completed on 2026-09-14 23:53:24

--
-- PostgreSQL database dump complete
--

\unrestrict byHCXaM1APwYOPoPKh2KRp7SCY1t8Fr81KjjHuIBNk9nZTwxLr61jGUU09b6QId

