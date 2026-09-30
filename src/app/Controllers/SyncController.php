<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
use App\Models\TipoCambio;

// POST /api/sync/cotizaciones (README raiz, seccion "Sync de cotizaciones").
// Unico endpoint de la API que le habla a un servicio externo -- todo lo
// demas solo habla con MySQL. Por eso la unica responsabilidad nueva de este
// controller (ademas de las de siempre) es no dejar que una falla de red
// tire abajo el resto de la app: cualquier problema contactando la API se
// traduce a 502, nunca a un 500 sin controlar.
final class SyncController extends Controller
{
    private const URL_DOLARES = 'https://dolarapi.com/v1/dolares';

    // Requiere sesion como cualquier otra ruta protegida, pero -- igual que
    // Campanias -- no filtra nada por usuario: sincronizar cotizaciones no es
    // un dato de un usuario puntual, es data compartida por toda la app.
    public function cotizaciones(): void
    {
        Auth::usuarioActual($this->request);

        $dolares = $this->obtenerDolares();

        $tiposCambioInsertados = [];
        $yaExistian = [];

        foreach ($dolares as $fila) {
            if (!isset($fila['casa'], $fila['venta'], $fila['fechaActualizacion'])) {
                continue; // forma inesperada en una fila puntual: se ignora, no rompe el resto del sync
            }

            $tipo = (string) $fila['casa'];
            $valor = (float) $fila['venta'];
            $fecha = self::fechaLocal((string) $fila['fechaActualizacion']);

            if (TipoCambio::existeEnFecha($fecha, $tipo)) {
                $yaExistian[] = "{$tipo} {$fecha}";
                continue;
            }

            TipoCambio::crear($fecha, $tipo, $valor);
            $tiposCambioInsertados[] = [
                'tipo' => $tipo,
                'fecha' => $fecha,
                'valor' => number_format($valor, 4, '.', ''),
            ];
        }

        // Sin fuente de cotizacion de granos conectada todavia (ver
        // App\Models\Cotizacion): "si la fuente de granos elegida esta
        // disponible" del contrato, hoy no lo esta -- este array queda vacio
        // hasta que se elija e integre una.
        $cotizacionesInsertadas = [];

        $this->json([
            'tipos_cambio_insertados' => $tiposCambioInsertados,
            'cotizaciones_insertadas' => $cotizacionesInsertadas,
            'ya_existian' => $yaExistian,
        ]);
    }

    /**
     * GET a dolarapi.com con timeout corto. Cualquier falla (timeout, DNS,
     * conexion rechazada, JSON invalido, forma inesperada) se traduce al
     * mismo 502 del contrato -- al que llama no le importa CUAL fue el
     * problema de red, solo que la fuente externa no respondio.
     *
     * @return list<array<string, mixed>>
     */
    private function obtenerDolares(): array
    {
        $contexto = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 5,
                'header' => "Accept: application/json\r\n",
                'ignore_errors' => true,
            ],
        ]);

        $cuerpo = @file_get_contents(self::URL_DOLARES, false, $contexto);

        if ($cuerpo === false) {
            throw new ApiException(502, 'No se pudo contactar la API de cotizaciones.');
        }

        try {
            $datos = json_decode($cuerpo, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new ApiException(502, 'No se pudo contactar la API de cotizaciones.', previa: $e);
        }

        if (!is_array($datos)) {
            throw new ApiException(502, 'No se pudo contactar la API de cotizaciones.');
        }

        return $datos;
    }

    // "fechaActualizacion" viene en UTC ("...Z"): sin convertir a hora local
    // el corte de dia podria caer un dia antes/despues del que corresponde en
    // Argentina (UTC-3), y `fecha` es la clave que usa el UNIQUE de la tabla.
    private static function fechaLocal(string $fechaIso): string
    {
        return (new \DateTimeImmutable($fechaIso))
            ->setTimezone(new \DateTimeZone('America/Argentina/Buenos_Aires'))
            ->format('Y-m-d');
    }
}
