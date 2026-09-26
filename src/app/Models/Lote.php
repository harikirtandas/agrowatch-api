<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Lote
{
    /**
     * Todos los lotes de un establecimiento puntual, pero SOLO si el usuario
     * tiene un vinculo con ese establecimiento (cualquier rol). `lotes` no
     * cuelga de `usuario_establecimiento` directo -- cuelga de
     * `establecimientos` -- asi que el chequeo de pertenencia necesita un
     * JOIN doble (lotes -> establecimientos -> usuario_establecimiento), no
     * uno simple. El campo `rol` viaja embebido en cada fila por el mismo
     * motivo que en Establecimiento::delUsuario: el frontend lo necesita
     * para decidir si muestra el boton de editar/borrar.
     *
     * Si el establecimiento no existe o no es del usuario, el INNER JOIN no
     * devuelve filas y el resultado es [] en los dos casos -- a proposito,
     * misma convencion que Establecimiento::buscarDeUsuario, para no
     * confirmarle a un atacante que un id "existe pero no es tuyo".
     *
     * @return list<array<string, mixed>>
     */
    public static function delEstablecimiento(int $establecimientoId, int $usuarioId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT l.id, l.establecimiento_id, l.nombre, l.ha_totales, l.ha_efectivas,
                    l.lat, l.lng, ue.rol, l.created_at, l.updated_at
             FROM lotes l
             INNER JOIN establecimientos e ON e.id = l.establecimiento_id
             INNER JOIN usuario_establecimiento ue ON ue.establecimiento_id = e.id
             WHERE l.establecimiento_id = :estId AND ue.usuario_id = :uid
             ORDER BY l.id DESC'
        );
        $stmt->execute(['estId' => $establecimientoId, 'uid' => $usuarioId]);

        return $stmt->fetchAll();
    }

    /**
     * Un lote puntual, pero SOLO si el usuario tiene vinculo con el
     * establecimiento al que pertenece (mismo JOIN doble que
     * delEstablecimiento, filtrado por l.id en vez de l.establecimiento_id --
     * asi no hace falta que el caller sepa a que establecimiento pertenece el
     * lote, el JOIN lo resuelve solo subiendo desde la fila).
     *
     * Si el lote no existe o es de un establecimiento ajeno, devuelve null en
     * los dos casos -- misma convencion que Establecimiento::buscarDeUsuario,
     * para no confirmarle a un atacante que un id "existe pero no es tuyo".
     *
     * @return array<string, mixed>|null
     */
    public static function buscarDeUsuario(int $id, int $usuarioId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT l.id, l.establecimiento_id, l.nombre, l.ha_totales, l.ha_efectivas,
                    l.lat, l.lng, ue.rol, l.created_at, l.updated_at
             FROM lotes l
             INNER JOIN establecimientos e ON e.id = l.establecimiento_id
             INNER JOIN usuario_establecimiento ue ON ue.establecimiento_id = e.id
             WHERE l.id = :id AND ue.usuario_id = :uid'
        );
        $stmt->execute(['id' => $id, 'uid' => $usuarioId]);

        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }

    /**
     * Solo inserta la fila de `lotes`. NO valida que el establecimiento sea
     * del usuario -- eso lo hace el controller ANTES de llamar a este metodo,
     * con Establecimiento::buscarDeUsuario(). Misma convencion que
     * Establecimiento::actualizar(): el chequeo de pertenencia vive una sola
     * vez, en el controller, no repetido en cada metodo del modelo.
     */
    public static function crear(
        int $establecimientoId,
        string $nombre,
        float $haTotales,
        float $haEfectivas,
        ?float $lat,
        ?float $lng
    ): int {
        $stmt = Database::connection()->prepare(
            'INSERT INTO lotes (establecimiento_id, nombre, ha_totales, ha_efectivas, lat, lng, created_at, updated_at)
             VALUES (:estId, :nombre, :haTotales, :haEfectivas, :lat, :lng, NOW(), NOW())'
        );
        $stmt->execute([
            'estId' => $establecimientoId,
            'nombre' => $nombre,
            'haTotales' => $haTotales,
            'haEfectivas' => $haEfectivas,
            'lat' => $lat,
            'lng' => $lng,
        ]);

        return (int) Database::connection()->lastInsertId();
    }

    /**
     * Actualiza por id, sin volver a filtrar por usuario/rol aca adentro --
     * el controller ya lo chequeo antes de llamar (buscarDeUsuario() +
     * comparar `rol`). No toca establecimiento_id: un lote no cambia de
     * establecimiento por este metodo.
     */
    public static function actualizar(
        int $id,
        string $nombre,
        float $haTotales,
        float $haEfectivas,
        ?float $lat,
        ?float $lng
    ): bool {
        $stmt = Database::connection()->prepare(
            'UPDATE lotes
             SET nombre = :nombre, ha_totales = :haTotales, ha_efectivas = :haEfectivas,
                 lat = :lat, lng = :lng, updated_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([
            'nombre' => $nombre,
            'haTotales' => $haTotales,
            'haEfectivas' => $haEfectivas,
            'lat' => $lat,
            'lng' => $lng,
            'id' => $id,
        ]);

        return $stmt->rowCount() > 0;
    }

    public static function eliminar(int $id): bool
    {
        $stmt = Database::connection()->prepare('DELETE FROM lotes WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->rowCount() > 0;
    }
}
