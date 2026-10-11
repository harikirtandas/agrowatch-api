-- Mismas columnas y mismo tipo que ya usa `lotes.lat`/`lotes.lng` (ver
-- 01-schema.sql): el frontend ya mandaba estos campos al crear/editar un
-- establecimiento (registro_parte_2.js, configuracion.js), pero el backend
-- los descartaba en silencio porque la columna no existia. Opcionales (un
-- establecimiento sin ubicacion marcada sigue siendo valido).
--
-- Sin IF NOT EXISTS a proposito: es sintaxis de MariaDB, no de MySQL (Oracle)
-- -- este docker-compose usa la imagen `mysql:8`, que la rechaza con un
-- error de sintaxis. No hace falta igual: los scripts de
-- docker-entrypoint-initdb.d/ solo corren una vez, al crear el volumen desde
-- cero.
ALTER TABLE establecimientos
    ADD COLUMN lat DECIMAL(10,7) NULL AFTER provincia,
    ADD COLUMN lng DECIMAL(10,7) NULL AFTER lat;
