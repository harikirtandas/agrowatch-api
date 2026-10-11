<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Establecimiento
{
    /**
     * Todos los establecimientos a los que el usuario tiene acceso, con
     * CUALQUIER rol (dueno o asesor). El campo `rol` viaja embebido en cada
     * fila porque el contrato de GET /api/establecimientos lo pide (ver
     * README raiz del repo, seccion "Establecimientos") -- el frontend lo
     * necesita para decidir si muestra el boton de editar/borrar.
     *
     * @return list<array<string, mixed>>
     */
    public static function delUsuario(int $usuarioId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT e.id, e.nombre, e.localidad, e.provincia, e.lat, e.lng, ue.rol,
                    e.created_at, e.updated_at
             FROM establecimientos e
             INNER JOIN usuario_establecimiento ue ON ue.establecimiento_id = e.id
             WHERE ue.usuario_id = :uid
             ORDER BY e.id DESC'
        );
        $stmt->execute(['uid' => $usuarioId]);

        return $stmt->fetchAll();
    }

    /**
     * Un establecimiento puntual, pero SOLO si el usuario tiene un vinculo
     * con el (cualquier rol) -- el INNER JOIN hace ese filtro solo. Si el
     * establecimiento existe pero es de otro usuario, esto devuelve null
     * exactamente igual que si el id no existiera en la tabla. Es a
     * proposito: el controller traduce null -> 404 sin distinguir un caso
     * del otro, para no confirmarle a un atacante que un id "existe pero no
     * es tuyo" (misma convencion que el resto de la API, ver README raiz).
     *
     * @return array<string, mixed>|null
     */
    public static function buscarDeUsuario(int $id, int $usuarioId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT e.id, e.nombre, e.localidad, e.provincia, e.lat, e.lng, ue.rol,
                    e.created_at, e.updated_at
             FROM establecimientos e
             INNER JOIN usuario_establecimiento ue ON ue.establecimiento_id = e.id
             WHERE e.id = :id AND ue.usuario_id = :uid'
        );
        $stmt->execute(['id' => $id, 'uid' => $usuarioId]);

        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }

    /**
     * Solo inserta la fila de `establecimientos`. A proposito NO vincula al
     * usuario -- eso es un segundo INSERT, en otra tabla, con su propio
     * metodo (vincularUsuario). Se separan en dos metodos en vez de uno solo
     * porque cada uno mapea 1:1 a un INSERT en una tabla del schema: si el
     * dia de manana alguien necesita crear un establecimiento sin vincular a
     * nadie todavia (ej. un alta administrativa), el metodo ya existe suelto.
     */
    public static function crear(
        string $nombre,
        string $localidad,
        string $provincia,
        ?float $lat,
        ?float $lng
    ): int {
        $stmt = Database::connection()->prepare(
            'INSERT INTO establecimientos (nombre, localidad, provincia, lat, lng, created_at, updated_at)
             VALUES (:nombre, :localidad, :provincia, :lat, :lng, NOW(), NOW())'
        );
        $stmt->execute([
            'nombre' => $nombre,
            'localidad' => $localidad,
            'provincia' => $provincia,
            'lat' => $lat,
            'lng' => $lng,
        ]);

        return (int) Database::connection()->lastInsertId();
    }

    /**
     * Vincula un usuario a un establecimiento con un rol puntual. Quien crea
     * el establecimiento (POST /api/establecimientos) queda vinculado como
     * 'dueno' -- ver EstablecimientoController::store() en esta misma
     * carpeta. Un 'asesor' se vincularia con este mismo metodo pero desde
     * otro flujo (ej. un futuro POST /api/establecimientos/{id}/asesores,
     * fuera del alcance de este contrato).
     */
    public static function vincularUsuario(int $establecimientoId, int $usuarioId, string $rol): void
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO usuario_establecimiento (usuario_id, establecimiento_id, rol, created_at)
             VALUES (:uid, :eid, :rol, NOW())'
        );
        $stmt->execute(['uid' => $usuarioId, 'eid' => $establecimientoId, 'rol' => $rol]);
    }

    /**
     * Actualiza por id, sin volver a filtrar por usuario/rol aca adentro.
     * El chequeo de "es tuyo Y sos dueno" ya lo hizo el controller ANTES de
     * llamar a este metodo (con buscarDeUsuario() + comparar el campo
     * `rol`), asi que repetirlo en el UPDATE seria
     * redundante -- pero repetirlo es una defensa valida contra el dia que
     * alguien agregue una ruta nueva y se olvide de chequear antes de
     * escribir. Discutido en el README de esta carpeta: las dos formas son
     * correctas, lo importante es elegir UNA por feature y no mezclarlas.
     */
    public static function actualizar(
        int $id,
        string $nombre,
        string $localidad,
        string $provincia,
        ?float $lat,
        ?float $lng
    ): bool {
        $stmt = Database::connection()->prepare(
            'UPDATE establecimientos
             SET nombre = :nombre, localidad = :localidad, provincia = :provincia,
                 lat = :lat, lng = :lng, updated_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([
            'nombre' => $nombre,
            'localidad' => $localidad,
            'provincia' => $provincia,
            'lat' => $lat,
            'lng' => $lng,
            'id' => $id,
        ]);

        return $stmt->rowCount() > 0;
    }

    public static function eliminar(int $id): bool
    {
        $stmt = Database::connection()->prepare('DELETE FROM establecimientos WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->rowCount() > 0;
    }
}
