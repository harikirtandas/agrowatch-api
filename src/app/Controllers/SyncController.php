<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
use App\Models\Cotizacion;
use App\Models\Cultivo;
use App\Models\TipoCambio;

// POST /api/sync/cotizaciones (README raiz, seccion "Sync de cotizaciones").
// Dos endpoints externos independientes: dolarapi.com (dolares) y granos.ar
// (cotizacion de granos). Por eso la responsabilidad extra de este
// controller (ademas de las de siempre) es no dejar que una falla de red
// tire abajo el resto de la app: si UNA fuente falla, la otra igual se
// sincroniza -- solo se corta con 502 si fallan las DOS.
final class SyncController extends Controller
{
    private const URL_DOLARES = 'https://dolarapi.com/v1/dolares';
    private const URL_GRANOS = 'https://granosar.lfcaucino.workers.dev/api/v1/pizarra';
    private const MERCADO_GRANOS = 'pizarra_rosario';
    private const FUENTE_GRANOS = 'granos.ar (Consiagro / BCR Rosario)';

    // Requiere sesion como cualquier otra ruta protegida, pero -- igual que
    // Campanias -- no filtra nada por usuario: sincronizar cotizaciones no es
    // un dato de un usuario puntual, es data compartida por toda la app.
    public function cotizaciones(): void
    {
        Auth::usuarioActual($this->request);

        $fuentesConError = [];

        try {
            [$tiposCambioInsertados, $yaExistianDolares] = $this->procesarDolares($this->obtenerDolares());
        } catch (ApiException) {
            $tiposCambioInsertados = [];
            $yaExistianDolares = [];
            $fuentesConError[] = 'dolarapi.com';
        }

        try {
            [$cotizacionesInsertadas, $yaExistianGranos] = $this->procesarGranos($this->obtenerGranos());
        } catch (ApiException) {
            $cotizacionesInsertadas = [];
            $yaExistianGranos = [];
            $fuentesConError[] = 'granos.ar';
        }

        if (count($fuentesConError) === 2) {
            throw new ApiException(502, 'No se pudo contactar ninguna API de cotizaciones.');
        }

        $this->json([
            'tipos_cambio_insertados' => $tiposCambioInsertados,
            'cotizaciones_insertadas' => $cotizacionesInsertadas,
            'ya_existian' => [...$yaExistianDolares, ...$yaExistianGranos],
            'fuentes_con_error' => $fuentesConError,
        ]);
    }

    /**
     * Inserta los tipos de cambio nuevos de un array crudo de dolarapi.com.
     *
     * @param list<array<string, mixed>> $dolares
     * @return array{0: list<array<string, string>>, 1: list<string>}
     */
    private function procesarDolares(array $dolares): array
    {
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

        return [$tiposCambioInsertados, $yaExistian];
    }

    /**
     * Inserta las cotizaciones de granos nuevas a partir del payload de
     * granos.ar (GET /api/v1/pizarra). Solo se cargan los cultivos que ya
     * existen en nuestro catalogo (mapeados por `cultivos.simbolo_api`); una
     * clave que no matchea ningun cultivo se ignora, mismo criterio
     * defensivo que procesarDolares().
     *
     * @param array{fecha: string, granos: array<string, array<string, mixed>>} $datosGranos
     * @return array{0: list<array<string, string>>, 1: list<string>}
     */
    private function procesarGranos(array $datosGranos): array
    {
        $cultivoIdPorSimbolo = [];
        foreach (Cultivo::listar() as $cultivo) {
            $cultivoIdPorSimbolo[$cultivo['simbolo_api']] = (int) $cultivo['id'];
        }

        $fecha = $datosGranos['fecha'];
        $cotizacionesInsertadas = [];
        $yaExistian = [];

        foreach ($datosGranos['granos'] as $simbolo => $datoGrano) {
            if (!isset($cultivoIdPorSimbolo[$simbolo], $datoGrano['usd_tn'])) {
                continue; // grano que no tenemos en el catalogo o forma inesperada
            }

            $cultivoId = $cultivoIdPorSimbolo[$simbolo];
            $precio = (float) $datoGrano['usd_tn'];

            if (Cotizacion::existeEnFecha($cultivoId, $fecha, self::MERCADO_GRANOS)) {
                $yaExistian[] = "{$simbolo} {$fecha}";
                continue;
            }

            Cotizacion::crear($cultivoId, $fecha, $precio, 'USD', self::MERCADO_GRANOS, self::FUENTE_GRANOS);
            $cotizacionesInsertadas[] = [
                'cultivo' => $simbolo,
                'fecha' => $fecha,
                'precio' => number_format($precio, 2, '.', ''),
                'moneda' => 'USD',
                'mercado' => self::MERCADO_GRANOS,
            ];
        }

        return [$cotizacionesInsertadas, $yaExistian];
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

    /**
     * GET a granos.ar con el mismo patron que obtenerDolares(): timeout
     * corto, cualquier falla colapsa al mismo 502 generico. Devuelve solo
     * `data` (no el sobre `meta`/`data` completo), ya validado con la forma
     * minima que necesita procesarGranos().
     *
     * @return array{fecha: string, granos: array<string, array<string, mixed>>}
     */
    private function obtenerGranos(): array
    {
        $contexto = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 5,
                'header' => "Accept: application/json\r\n",
                'ignore_errors' => true,
            ],
        ]);

        $cuerpo = @file_get_contents(self::URL_GRANOS, false, $contexto);

        if ($cuerpo === false) {
            throw new ApiException(502, 'No se pudo contactar la API de cotizaciones.');
        }

        try {
            $datos = json_decode($cuerpo, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new ApiException(502, 'No se pudo contactar la API de cotizaciones.', previa: $e);
        }

        if (!is_array($datos) || !isset($datos['data']['granos'], $datos['data']['fecha'])) {
            throw new ApiException(502, 'No se pudo contactar la API de cotizaciones.');
        }

        return $datos['data'];
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
