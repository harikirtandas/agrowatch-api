<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Campania
{
    public static function todas(): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, nombre, fecha_inicio, fecha_fin, cerrada, created_at, updated_at
            FROM campanias'
        );
        $stmt->execute();

        return $stmt->fetchAll();
    }

    public static function buscar(int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, nombre, fecha_inicio, fecha_fin, cerrada, created_at, updated_at
            FROM campanias
            WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);

        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }
        
     public static function crear(string $nombre, string $fechaInicio, string $fechaFin): int
     {
        $stmt = Database::connection()->prepare(
        'INSERT INTO campanias (nombre, fecha_inicio, fecha_fin, created_at, updated_at)
         VALUES (:nombre, :fechaInicio, :fechaFin, NOW(), NOW())');

        $stmt->execute([
        'nombre'      => $nombre,
        'fechaInicio' => $fechaInicio,
        'fechaFin'    => $fechaFin,
    ]);
     
        return (int) Database::connection()->lastInsertId();
    }

    public static function actualizar(int $id, string $nombre, string $fechaInicio, string $fechaFin, bool $cerrada): bool
    {
        $stmt = Database::connection()->prepare(
        'UPDATE campanias
         SET nombre = :nombre, fecha_inicio = :fechaInicio, fecha_fin = :fechaFin, cerrada = :cerrada,
         updated_at = NOW()
         WHERE id = :id');
        $stmt->execute([
        'id'          => $id,
        'nombre'      => $nombre,
        'fechaInicio' => $fechaInicio,
        'fechaFin'    => $fechaFin,
        'cerrada'     => $cerrada ? 1 : 0
        ]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Cuenta cuantas siembras referencian esta campania. Lo usa
     * CampaniaController::destroy() para decidir el 409: una campania con
     * siembras asociadas NO se puede borrar (se cierra, no se borra). Devuelve
     * un entero (0 si no tiene ninguna), no las filas -- por eso COUNT(*) +
     * fetchColumn() en vez de un SELECT normal con fetchAll().
     */
    public static function contarSiembras(int $id): int
    {
    $stmt = Database::connection()->prepare(
            'SELECT COUNT(*) FROM siembras WHERE campania_id = :id'
            );
    $stmt->execute(['id' => $id]);

    return (int) $stmt->fetchColumn();
    }

    public static function eliminar(int $id): bool
    {
        $stmt = Database::connection()->prepare('DELETE FROM campanias WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->rowCount() > 0;
    }


}
