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

    public static function buscar(int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, siembra_id, categoria, descripcion, cantidad, unidad,
                    precio_unitario, moneda, fecha, created_at, updated_at
            FROM costos
            WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);

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
}   