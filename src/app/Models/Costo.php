<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Costo
{
    public static function porSiembra(int $siembraId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, siembra_id, categoria, descripcion, cantidad, unidad,
                    precio_unitario, moneda, fecha, created_at, updated_at
             FROM costos
             WHERE siembra_id = :siembraId
             ORDER BY id DESC'
        );
        $stmt->execute(['siembraId' => $siembraId]);

        return $stmt->fetchAll();
    }

    /**
     * Un costo puntual, pero SOLO si el usuario tiene vinculo con el
     * establecimiento de la siembra a la que pertenece (costos -> siembras
     * -> lotes -> establecimientos -> usuario_establecimiento). Hace falta
     * este join largo porque PUT/DELETE /api/costos/{id} no traen el
     * siembra_id en la URL para apoyarse en un chequeo ya hecho.
     *
     * @return array<string, mixed>|null
     */
    public static function buscarDeUsuario(int $id, int $usuarioId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT co.id, co.siembra_id, co.categoria, co.descripcion, co.cantidad, co.unidad,
                    co.precio_unitario, co.moneda, co.fecha, co.created_at, co.updated_at
             FROM costos co
             INNER JOIN siembras s ON s.id = co.siembra_id
             INNER JOIN lotes l ON l.id = s.lote_id
             INNER JOIN establecimientos est ON est.id = l.establecimiento_id
             INNER JOIN usuario_establecimiento ue ON ue.establecimiento_id = est.id
             WHERE co.id = :id AND ue.usuario_id = :usuarioId'
        );
        $stmt->execute(['id' => $id, 'usuarioId' => $usuarioId]);

        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }

    public static function crear(
    int $siembraId,
    string $categoria,
    string $descripcion,
    float $cantidad,
    string $unidad,
    float $precioUnitario,
    string $moneda,
    string $fecha): int
    {
        $stmt = Database::connection()->prepare(
        'INSERT INTO costos (siembra_id, categoria, descripcion, cantidad, unidad, precio_unitario, moneda, fecha, created_at, updated_at)
         VALUES (:siembraId, :categoria, :descripcion, :cantidad, :unidad, :precioUnitario, :moneda, :fecha, NOW(), NOW())');

         $stmt->execute([
            'siembraId'      => $siembraId,
            'categoria'      => $categoria,
            'descripcion'    => $descripcion,
            'cantidad'       => $cantidad,
            'unidad'         => $unidad,
            'precioUnitario' => $precioUnitario,
            'moneda'         => $moneda,
            'fecha'          => $fecha,
            ]);

        return (int) Database::connection()->lastInsertId();
    }

        public static function actualizar(
        int $id,
        string $categoria,
        string $descripcion,
        float $cantidad,
        string $unidad,
        float $precioUnitario,
        string $moneda,
        string $fecha
    ): bool {
        $stmt = Database::connection()->prepare(
            'UPDATE costos
             SET categoria = :categoria, descripcion = :descripcion, cantidad = :cantidad,
                 unidad = :unidad, precio_unitario = :precioUnitario, moneda = :moneda,
                 fecha = :fecha, updated_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([
            'categoria'      => $categoria,
            'descripcion'    => $descripcion,
            'cantidad'       => $cantidad,
            'unidad'         => $unidad,
            'precioUnitario' => $precioUnitario,
            'moneda'         => $moneda,
            'fecha'          => $fecha,
            'id'             => $id,
        ]);

        return $stmt->rowCount() > 0;
    }

    public static function eliminar(int $id): bool
    {
        $stmt = Database::connection()->prepare('DELETE FROM costos WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->rowCount() > 0;
    }
}   