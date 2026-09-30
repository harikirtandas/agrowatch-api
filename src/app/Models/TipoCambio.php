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
//
// OJO: el metodo que el calculo de margen va a necesitar ("el tipo de cambio
// vigente para tal fecha") todavia no esta aca -- eso es parte del Modelo que
// arma Marcos en la Fase 2 (ver planning/roadmap.txt), este archivo solo
// cubre lo que le hace falta al Sync de la Fase 3.
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
}
