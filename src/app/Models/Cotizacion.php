<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

// Serie historica de precios de granos (tabla `cotizaciones`, insertar nunca
// pisar -- ver 01-schema.sql). Mismos dos metodos que TipoCambio y por el
// mismo motivo: son los que necesita el Sync para no duplicar una fila que ya
// esta y reportarla en "ya_existian".
//
// El Sync de esta iteracion (SyncController::cotizaciones()) todavia NO llama
// a crear() -- no hay una fuente de cotizacion de granos elegida/conectada
// (el contrato dice "si la fuente de granos elegida esta disponible", y hoy
// no hay ninguna), asi que `cotizaciones_insertadas` siempre viaja `[]`. Este
// modelo queda listo para cuando se conecte una.
final class Cotizacion
{
    public static function existeEnFecha(int $cultivoId, string $fecha, string $mercado): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT 1 FROM cotizaciones WHERE cultivo_id = :cultivoId AND fecha = :fecha AND mercado = :mercado'
        );
        $stmt->execute(['cultivoId' => $cultivoId, 'fecha' => $fecha, 'mercado' => $mercado]);

        return $stmt->fetch() !== false;
    }

    public static function crear(
        int $cultivoId,
        string $fecha,
        float $precio,
        string $moneda,
        string $mercado,
        string $fuente
    ): int {
        $stmt = Database::connection()->prepare(
            'INSERT INTO cotizaciones (cultivo_id, fecha, precio, moneda, mercado, fuente, created_at)
             VALUES (:cultivoId, :fecha, :precio, :moneda, :mercado, :fuente, NOW())'
        );
        $stmt->execute([
            'cultivoId' => $cultivoId,
            'fecha' => $fecha,
            'precio' => $precio,
            'moneda' => $moneda,
            'mercado' => $mercado,
            'fuente' => $fuente,
        ]);

        return (int) Database::connection()->lastInsertId();
    }
}
