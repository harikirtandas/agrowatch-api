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
}
