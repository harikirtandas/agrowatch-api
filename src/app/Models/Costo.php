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

}