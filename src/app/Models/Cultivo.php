<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Cultivo
{
    /**
     * @return list<array<string, mixed>>
     */
    public static function listar(): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, nombre, unidad, simbolo_api, retencion_pct
             FROM cultivos'
        );
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function porId(int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, nombre, unidad, simbolo_api, retencion_pct
             FROM cultivos
             WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);

        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }
}
