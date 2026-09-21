-- Este script solo corre en el PRIMER arranque del volumen mysql-data
-- (docker-entrypoint-initdb.d se ejecuta una unica vez, cuando /var/lib/mysql
-- esta vacio). Para reaplicarlo hace falta recrear el volumen: make fresh
--
-- Schema real de AgroWatchOut (iteracion 2 del modelo de datos), en
-- reemplazo del schema del vertical slice demo (usuarios/tokens/notas) del
-- template. Se conserva `tokens` (capa de auth del template, sin cambios).
-- Para sumar tablas mas adelante sin perder datos: archivos .sql numerados
-- (02-..., 03-...) aplicados con: make db-import FILE=docker/mysql/init/0N-....sql

CREATE TABLE IF NOT EXISTS usuarios (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre        VARCHAR(60)   NOT NULL,
    apellido      VARCHAR(60)   NOT NULL,
    email         VARCHAR(120)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tokens (
    token      CHAR(64)     PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    expira_en  DATETIME     NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS establecimientos (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    localidad  VARCHAR(100) NOT NULL,
    provincia  VARCHAR(60)  NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla puente: el usuario no es dueno del establecimiento, accede con un rol
-- (un agronomo asesora establecimientos ajenos; un dueno comparte el suyo).
CREATE TABLE IF NOT EXISTS usuario_establecimiento (
    usuario_id         INT UNSIGNED NOT NULL,
    establecimiento_id INT UNSIGNED NOT NULL,
    rol                ENUM('dueno', 'asesor') NOT NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, establecimiento_id),
    CONSTRAINT fk_usuario_establecimiento_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_usuario_establecimiento_establecimiento FOREIGN KEY (establecimiento_id) REFERENCES establecimientos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lotes (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    establecimiento_id  INT UNSIGNED  NOT NULL,
    nombre              VARCHAR(60)   NOT NULL,
    ha_totales          DECIMAL(10,2) NOT NULL,
    ha_efectivas        DECIMAL(10,2) NOT NULL,
    lat                 DECIMAL(10,7) NULL,
    lng                 DECIMAL(10,7) NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lotes_establecimiento FOREIGN KEY (establecimiento_id) REFERENCES establecimientos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campanias (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre        VARCHAR(30) NOT NULL,
    fecha_inicio  DATE        NOT NULL,
    fecha_fin     DATE        NOT NULL,
    cerrada       TINYINT(1)  NOT NULL DEFAULT 0,
    created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catalogo de especies, casi estatico.
CREATE TABLE IF NOT EXISTS cultivos (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(60)  NOT NULL,
    unidad         VARCHAR(10)  NOT NULL,
    simbolo_api    VARCHAR(20)  NOT NULL,
    retencion_pct  DECIMAL(5,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla central del modelo: cruce de campania, lote y cultivo.
CREATE TABLE IF NOT EXISTS siembras (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campania_id     INT UNSIGNED  NOT NULL,
    lote_id         INT UNSIGNED  NOT NULL,
    cultivo_id      INT UNSIGNED  NOT NULL,
    ha_sembradas    DECIMAL(10,2) NOT NULL,
    fecha_siembra   DATE          NOT NULL,
    variedad        VARCHAR(60)   NULL,
    rinde_esperado  DECIMAL(10,2) NULL,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_siembras_campania_lote_cultivo (campania_id, lote_id, cultivo_id),
    CONSTRAINT fk_siembras_campania FOREIGN KEY (campania_id) REFERENCES campanias(id),
    CONSTRAINT fk_siembras_lote FOREIGN KEY (lote_id) REFERENCES lotes(id),
    CONSTRAINT fk_siembras_cultivo FOREIGN KEY (cultivo_id) REFERENCES cultivos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Una fila por gasto, no una columna por tipo de insumo.
CREATE TABLE IF NOT EXISTS costos (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    siembra_id       INT UNSIGNED   NOT NULL,
    categoria        ENUM('semilla', 'fertilizante', 'herbicida', 'maquinaria', 'labor', 'flete', 'otro') NOT NULL,
    descripcion      VARCHAR(120)   NOT NULL,
    cantidad         DECIMAL(10,2)  NOT NULL,
    unidad           VARCHAR(10)    NOT NULL,
    precio_unitario  DECIMAL(14,2)  NOT NULL,
    moneda           CHAR(3)        NOT NULL,
    fecha            DATE           NOT NULL,
    created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_costos_siembra FOREIGN KEY (siembra_id) REFERENCES siembras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Serie temporal de precios de granos, alimentada desde una API externa.
-- Insertar, nunca sobrescribir: el historico es lo que grafica el margen.
CREATE TABLE IF NOT EXISTS cotizaciones (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cultivo_id  INT UNSIGNED  NOT NULL,
    fecha       DATE          NOT NULL,
    precio      DECIMAL(14,2) NOT NULL,
    moneda      CHAR(3)       NOT NULL,
    mercado     VARCHAR(40)   NOT NULL,
    fuente      VARCHAR(60)   NOT NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cotizaciones_cultivo_fecha_mercado (cultivo_id, fecha, mercado),
    CONSTRAINT fk_cotizaciones_cultivo FOREIGN KEY (cultivo_id) REFERENCES cultivos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cotizacion del dolar por dia, alimentada desde una API externa. Sin FK:
-- se consulta por fecha para convertir un costo o un precio de moneda.
CREATE TABLE IF NOT EXISTS tipos_cambio (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    fecha       DATE          NOT NULL,
    tipo        VARCHAR(20)   NOT NULL,
    valor       DECIMAL(14,4) NOT NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tipos_cambio_fecha_tipo (fecha, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuario demo: email demo@demo.test / password "secret".
-- El hash es password_hash('secret', PASSWORD_DEFAULT) (bcrypt, cost 12).
INSERT INTO usuarios (nombre, apellido, email, password_hash) VALUES
    ('Usuario', 'Demo', 'demo@demo.test', '$2y$12$eNWn12PjjgzIRk7LvzdyLeOgIeb070nMD5IpAJthQQBMMU97eobNK');

-- Catalogo de cultivos.
INSERT INTO cultivos (nombre, unidad, simbolo_api, retencion_pct) VALUES
    ('Soja', 'tn', 'soja', 33.00),
    ('Trigo', 'tn', 'trigo', 12.00),
    ('Maiz', 'tn', 'maiz', 12.00),
    ('Girasol', 'tn', 'girasol', 7.00);

INSERT INTO establecimientos (nombre, localidad, provincia) VALUES
    ('La Esperanza', 'Coronel Suarez', 'Buenos Aires');

INSERT INTO usuario_establecimiento (usuario_id, establecimiento_id, rol) VALUES
    (1, 1, 'dueno');

INSERT INTO lotes (establecimiento_id, nombre, ha_totales, ha_efectivas, lat, lng) VALUES
    (1, 'Lote 1', 85.50, 80.00, -37.4525000, -61.9333000),
    (1, 'Lote 4', 62.00, 58.30, -37.4601000, -61.9420000);
