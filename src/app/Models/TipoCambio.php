<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

// Cotizacion del dolar por dia (tabla `tipos_cambio`, sin FK: se consulta por
// fecha para convertir un costo en USD a ARS). Los dos metodos de aca son los
// que necesita el Sync (POST /api/sync/cotizaciones, ver SyncController):
// chequear si una fecha+tipo ya esta cargada ANTES de insertar (el UNIQUE de
// la tabla no alcanza solo porque el sync quiere reportar "ya_existian" en la
// respuesta, no solo evitar el error) e insertar la que falte.

final class TipoCambio
{
    public static function existeEnFecha(string $fecha, string $tipo): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT 1 FROM tipos_cambio WHERE fecha = :fecha AND tipo = :tipo'
        );
        $stmt->execute(['fecha' => $fecha, 'tipo' => $tipo]);

        return $stmt->fetch() !== false;
    }

    public static function crear(string $fecha, string $tipo, float $valor): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO tipos_cambio (fecha, tipo, valor, created_at)
             VALUES (:fecha, :tipo, :valor, NOW())'
        );
        $stmt->execute(['fecha' => $fecha, 'tipo' => $tipo, 'valor' => $valor]);

        return (int) Database::connection()->lastInsertId();
    }

    
// El margen usa oficialHasta(): el dolar oficial vigente a una fecha, para
// convertir a ARS los costos cargados en USD (ver SiembraController::margen()).
public static function oficialHasta(string $fecha): ?array
{
    $stmt = Database::connection()->prepare(
        'SELECT valor, fecha
        FROM tipos_cambio
        WHERE tipo = :tipo AND fecha <= :fecha
        ORDER BY fecha DESC
        LIMIT 1'
    );
    $stmt->execute(['tipo' => 'oficial', 'fecha' => $fecha]);

    $fila = $stmt->fetch();

    return $fila === false ? null : $fila;
}
}
