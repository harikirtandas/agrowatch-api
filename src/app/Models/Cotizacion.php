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
    
    /**
     * La cotizacion mas reciente de un cultivo con fecha <= :hoy, o null si no
     * hay ninguna. NO busca la fecha exacta a proposito: no hay precio cargado
     * todos los dias (fin de semana, feriado, o un dia sin datos), asi que vale
     * la ultima conocida hasta esa fecha.
     *
     * El `id DESC` desempata si hay dos mercados cargados el mismo dia: gana la
     * ultima fila insertada. No filtra por moneda: devuelve `moneda` y el
     * controller convierte si viene en ARS.
     *
     * Devuelve exactamente las 4 columnas del contrato (campo
     * `cotizacion_vigente` de GET /api/siembras/{id}/margen), para no filtrar
     * campos de mas a la respuesta. `precio` viaja como string (DECIMAL con
     * EMULATE_PREPARES en false) -- no se castea aca, lo usa el Service.
     *
     * null significa "no hay ninguna cargada"; el controller lo traduce al 422
     * "No hay cotizacion cargada para este cultivo." del contrato.
     *
     * @return array<string, mixed>|null
     */
    public static function vigente(int $cultivoId, string $hoy): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT precio, moneda, fecha, mercado
             FROM cotizaciones
             WHERE cultivo_id = :cultivoId AND fecha <= :hoy
             ORDER BY fecha DESC, id DESC
             LIMIT 1'
        );
        $stmt->execute(['cultivoId' => $cultivoId, 'hoy' => $hoy]);

        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }
}
