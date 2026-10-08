<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
use App\Core\Validator;
use App\Models\Costo;
use App\Models\Cotizacion;
use App\Models\Cultivo;
use App\Models\Lote;
use App\Models\Siembra;
use App\Models\TipoCambio;
use App\Services\CalculoException;
use App\Services\CalculoMargen;
use PDOException;

final class SiembraController extends Controller
{
    // #region  ====> constantes <=========
    // Retencion que se descuenta al precio. Hoy es 0: el precio de pizarra ya
    // es neto de retencion (ver contrato, GET /api/siembras/{id}/margen).
    // cultivos.retencion_pct se usara cuando haya un precio FOB.
    private const RETENCION_APLICADA = '0.00';

    private const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
    // #endregion

    // #region --> los distintos  metodos HTTP(CRUD) <----

    /** @return array<string, mixed> usuario autenticado (sin password_hash) */
    private function usuario(): array
    {
        return Auth::usuarioActual($this->request);
    }

    // GET /api/siembras?campania_id=&lote_id=
    // Los dos filtros son opcionales y combinables. Las siembras cuelgan de
    // un lote con dueno: se listan solo las del usuario autenticado.
    public function index(): void
    {
        $uid = (int) $this->usuario()['id'];

        $campaniaId = $this->filtroEntero('campania_id');
        $loteId = $this->filtroEntero('lote_id');

        $this->json(Siembra::listar($campaniaId, $loteId, $uid));
    }

    // GET /api/siembras/{id}
    public function show(int $id): void
    {
        $uid = (int) $this->usuario()['id'];

        $this->json($this->siembraOError($id, $uid));
    }

    // POST /api/siembras
    // { "campania_id", "lote_id", "cultivo_id", "ha_sembradas", "fecha_siembra", "variedad"?, "rinde_esperado"? }
    // El lote_id tiene que ser de un establecimiento del usuario -- se chequea
    // ANTES de insertar, si no cualquiera podria colgarle una siembra a un
    // lote ajeno solo adivinando su id (mismo criterio que LoteController::store()).
    public function store(): void
    {
        $uid = (int) $this->usuario()['id'];
        $valores = $this->validarCuerpo();

        $this->loteOError($valores[1], $uid);

        try {
            $id = Siembra::crear(...$valores);
        } catch (PDOException $e) {
            throw $this->traducirErrorBD($e);
        }

        $this->creado(Siembra::buscarDeUsuario($id, $uid), "/api/siembras/{$id}");
    }

    // PUT/api/siembras/{id}
    // Reemplazo completo: el cliente manda siempre los cinco obligatorios.
    // Se busca ANTES con siembraOError() porque actualizar() devuelve
    // rowCount() > 0, y MySQL cuenta 0 filas si los valores no cambiaron:
    // no sirve para detectar el 404. Si el lote_id cambia, el lote NUEVO
    // tambien se valida -- si no, un usuario podria "mudar" una siembra a un
    // lote ajeno.
    public function update(int $id): void
    {
        $uid = (int) $this->usuario()['id'];

        $siembra = $this->siembraOError($id, $uid);
        $valores = $this->validarCuerpo();

        if ($valores[1] !== (int) $siembra['lote_id']) {
            $this->loteOError($valores[1], $uid);
        }

        try {
            Siembra::actualizar($id, ...$valores);
        } catch (PDOException $e) {
           throw $this->traducirErrorBD($e);
        }

        $this->json(Siembra::buscarDeUsuario($id, $uid));
    }

    // DELETE /api/siembras/{id}
    // Ojo: los costos de la siembra se borran en cascada (fk_costos_siembra).
    public function destroy(int $id): void
    {
        $uid = (int) $this->usuario()['id'];

        $this->siembraOError($id, $uid);
        Siembra::eliminar($id);

        $this->sinContenido();
    }
    // #endregion

    // #region ====> margen()
    
    // GET /api/siembras/{id}/margen
    // Solo orquesta: lee con los Models, convierte monedas y delega TODAS las
    // cuentas en CalculoMargen. No guarda nada. Un unico try: cualquier
    // CalculoException, venga de donde venga, sale como 422; las ApiException
    // propias (404/422) lo atraviesan sin tocarse.
    public function margen(int $id): void
    {
        $uid = (int) $this->usuario()['id'];

        $siembra = $this->siembraOError($id, $uid);
        $cultivoId = (int) $siembra['cultivo_id'];
        $cultivo = Cultivo::porId($cultivoId);
        $hoy = $this->hoy();
        $cotizacion = $this->cotizacionOError($cultivoId, $hoy);

        try {
            $precioUsd = $this->precioEnUsd($cotizacion);
            $tcHoy = $this->tipoCambioOficialOError($hoy);
            $detalle = $this->detalleCostos(Costo::porSiembra($id));
            $resultado = CalculoMargen::calcular(
                $siembra['ha_sembradas'],
                $siembra['rinde_esperado'],
                $cultivo['unidad'],
                $precioUsd,
                self::RETENCION_APLICADA,
                array_column($detalle, 'importe_usd')
            );
            $respuesta = $this->armarRespuesta($siembra, $cultivo, $cotizacion, $tcHoy, $detalle, $resultado);
        } catch (CalculoException $e) {
            throw new ApiException(422, $e->getMessage(), previa: $e);
        }

        $this->json($respuesta);
    }
    // #endregion

    // #region ----> Funciones privadas <------
    /**
     * Lee un filtro entero opcional de la query string.
     * No vino o vino vacio -> null (filtro no aplicado).
     * Vino y no es solo digitos -> 422.
     */
    private function filtroEntero(string $nombre): ?int
    {
        $valor = $this->request->query($nombre);

        if ($valor === null || $valor === '') {
            return null;
        }
        if (!ctype_digit((string) $valor)) {
            throw ApiException::validacion([$nombre => 'Tiene que ser un numero entero.']);
        }

        return (int) $valor;
    }

    /**
     * Busca la siembra (scopeada al usuario) o corta con 404. La usan show,
     * update, destroy y margen.
     *
     * @return array<string, mixed>
     */
    private function siembraOError(int $id, int $usuarioId): array
    {
        $siembra = Siembra::buscarDeUsuario($id, $usuarioId);

        if ($siembra === null) {
            throw new ApiException(404, 'Siembra no encontrada.');
        }

        return $siembra;
    }

    /**
     * Confirma que el lote sea del usuario o corta con 422 -- mismo status y
     * mismo mensaje tanto si el lote no existe como si es de otro usuario
     * (no se distingue, ni en el codigo ni en el texto: no hay que revelar
     * que un id "existe pero no es tuyo"). Mantiene el contrato original de
     * POST /api/siembras, donde una referencia invalida ya daba 422 (ver
     * traducirErrorBD) -- esto solo adelanta el chequeo de lote_id para que
     * tambien cubra la pertenencia, no solo la existencia. La usan store
     * (lote_id nuevo) y update (si el lote_id cambia).
     */
    private function loteOError(int $loteId, int $usuarioId): void
    {
        if (Lote::buscarDeUsuario($loteId, $usuarioId) === null) {
            throw ApiException::validacion(['lote_id' => 'No existe.']);
        }
    }

    /**
     * Pasos comunes a store() y update(): normalizar, validar forma (schema),
     * validar fecha real y convertir tipos. El orden del array devuelto es
     * EXACTAMENTE el de los parametros de Siembra::crear() (y de
     * actualizar() despues del id), por eso se puede usar ...$valores.
     *
     * @return array{0: int, 1: int, 2: int, 3: float, 4: string, 5: ?string, 6: ?float}
     *         [campania_id, lote_id, cultivo_id, ha_sembradas, fecha_siembra, variedad, rinde_esperado]
     */
    private function validarCuerpo(): array
    {
        $datos = $this->prepararDatos($this->request->json());
        Validator::validar('siembras', $datos);

        // El schema solo chequea la FORMA (AAAA-MM-DD); "2026-13-45" pasa.
        [$anio, $mes, $dia] = array_map('intval', explode('-', $datos['fecha_siembra']));
        if (!checkdate($mes, $dia, $anio)) {
            throw ApiException::validacion(['fecha_siembra' => 'Fecha invalida.']);
        }

        return [
            (int) $datos['campania_id'],
            (int) $datos['lote_id'],
            (int) $datos['cultivo_id'],
            (float) $datos['ha_sembradas'],
            $datos['fecha_siembra'],
            $datos['variedad'] ?? null,
            isset($datos['rinde_esperado']) ? (float) $datos['rinde_esperado'] : null,
        ];
    }

    /**
     * Normaliza antes de validar: recorta espacios de "variedad" y, si queda
     * vacia, la trata como si no hubiera venido (null).
     *
     * @param array<string, mixed> $datos
     * @return array<string, mixed>
     */
    private function prepararDatos(array $datos): array
    {
        if (isset($datos['variedad']) && is_string($datos['variedad'])) {
            $variedad = trim($datos['variedad']);
            $datos['variedad'] = $variedad === '' ? null : $variedad;
        }

        return $datos;
    }

    /**
     * Traduce las dos PDOException esperadas y deja subir cualquier otra (500).
     * SQLSTATE 23000 es comun a FK y UNIQUE, asi que se distingue por el
     * codigo propio de MySQL en errorInfo[1]: 1452 = FK rota, 1062 = duplicado.
     */
    private function traducirErrorBD(PDOException $e): \Throwable
    {
        $codigoMysql = (int) ($e->errorInfo[1] ?? 0);

        if ($codigoMysql === 1452) {
            $mensaje = $e->getMessage();
            foreach (['campania_id', 'lote_id', 'cultivo_id'] as $campo) {
                if (str_contains($mensaje, "`{$campo}`")) {
                    return ApiException::validacion([$campo => 'No existe.']);
                }
            }
            return ApiException::validacion(['referencia' => 'Campania, lote o cultivo inexistente.']);
        }

        if ($codigoMysql === 1062) {
            return new ApiException(409, 'Ya existe una siembra con ese cultivo para este lote en esta campana.');
        }

        return $e;
    }
    // #endregion

    // #region ====> Auxiliares de margen() <======
    
    /** Fecha de hoy en Argentina (AAAA-MM-DD). margen() la pide una sola vez. */
    private function hoy(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone(self::ZONA_HORARIA)))->format('Y-m-d');
    }

    /**
     * La cotizacion vigente del cultivo o corta con 422.
     *
     * @return array<string, mixed>
     */
    private function cotizacionOError(int $cultivoId, string $hoy): array
    {
        $cotizacion = Cotizacion::vigente($cultivoId, $hoy);

        if ($cotizacion === null) {
            throw new ApiException(422, 'No hay cotizacion cargada para este cultivo.');
        }

        return $cotizacion;
    }

    /**
     * El dolar oficial vigente a una fecha o corta con 422. Un solo lugar para
     * el mensaje: lo usan el precio, los costos en pesos y los campos *_ars.
     *
     * @return array<string, mixed>
     */
    private function tipoCambioOficialOError(string $fecha): array
    {
        $tc = TipoCambio::oficialHasta($fecha);

        if ($tc === null) {
            throw new ApiException(422, 'No hay tipo de cambio oficial cargado para esta fecha.');
        }

        return $tc;
    }

    /**
     * Precio de la cotizacion en USD: si ya viene en USD se usa tal cual; si
     * viene en pesos se pasa a USD con el dolar de la fecha de la cotizacion.
     *
     * @param array<string, mixed> $cotizacion
     */
    private function precioEnUsd(array $cotizacion): string
    {
        return match ($cotizacion['moneda']) {
            'USD' => $cotizacion['precio'],
            'ARS' => CalculoMargen::aUsd(
                $cotizacion['precio'],
                $this->tipoCambioOficialOError($cotizacion['fecha'])['valor']
            ),
            default => throw new CalculoException('Moneda desconocida.'),
        };
    }

    /**
     * Arma detalle_costos: una linea por costo, del mas viejo al mas nuevo (por
     * id). Cada costo en pesos usa el dolar oficial de SU fecha; como varios
     * costos comparten fecha, cada fecha se consulta una sola vez.
     *
     * @param list<array<string, mixed>> $costos
     * @return list<array<string, mixed>>
     */
    private function detalleCostos(array $costos): array
    {
        usort($costos, fn (array $a, array $b): int => $a['id'] <=> $b['id']);

        $tcPorFecha = [];
        $detalle = [];

        foreach ($costos as $costo) {
            $tc = null;
            if ($costo['moneda'] === 'ARS') {
                $tcPorFecha[$costo['fecha']] ??= $this->tipoCambioOficialOError($costo['fecha']);
                $tc = $tcPorFecha[$costo['fecha']];
            }
            $detalle[] = $this->lineaDetalle($costo, $tc);
        }

        return $detalle;
    }

    /**
     * Una linea de detalle_costos. La cuenta la hace CalculoMargen.
     *
     * @param array<string, mixed> $costo
     * @param array<string, mixed>|null $tc dolar de la fecha del costo; null si el costo esta en USD
     * @return array<string, mixed>
     */
    private function lineaDetalle(array $costo, ?array $tc): array
    {
        $linea = CalculoMargen::convertirCosto(
            $costo['cantidad'],
            $costo['precio_unitario'],
            $costo['moneda'],
            $tc['valor'] ?? null
        );

        return [
            'id' => $costo['id'],
            'categoria' => $costo['categoria'],
            'moneda' => $costo['moneda'],
            'importe_original' => $linea['importe_original'],
            'tipo_cambio' => $tc === null ? null : ['valor' => $tc['valor'], 'fecha' => $tc['fecha']],
            'importe_usd' => $linea['importe_usd'],
        ];
    }

    /**
     * El JSON del contrato. No calcula nada: junta lo que ya viene calculado.
     *
     * @param array<string, mixed> $siembra
     * @param array<string, mixed> $cultivo
     * @param array<string, mixed> $cotizacion
     * @param array<string, mixed> $tcHoy
     * @param list<array<string, mixed>> $detalle
     * @param array<string, mixed> $resultado salida de CalculoMargen::calcular()
     * @return array<string, mixed>
     */
    private function armarRespuesta(
        array $siembra,
        array $cultivo,
        array $cotizacion,
        array $tcHoy,
        array $detalle,
        array $resultado
    ): array {
        return [
            'siembra_id' => $siembra['id'],
            'ha_sembradas' => $siembra['ha_sembradas'],
            'moneda_calculo' => 'USD',
            'cotizacion_vigente' => [
                'precio' => $cotizacion['precio'],
                'moneda' => $cotizacion['moneda'],
                'fecha' => $cotizacion['fecha'],
                'mercado' => $cotizacion['mercado'],
            ],
            'retencion_aplicada_pct' => self::RETENCION_APLICADA,
            'precio_neto_usd' => ['por_unidad' => $resultado['precio_neto'], 'unidad' => $cultivo['unidad']],
            'tipo_cambio_usado' => ['tipo' => 'oficial', 'valor' => $tcHoy['valor'], 'fecha' => $tcHoy['fecha']],
            'costo_total_usd' => $resultado['costo_total'],
            'costo_por_ha_usd' => $resultado['costo_ha'],
            'ingreso_esperado_usd' => $resultado['ingreso'],
            'margen_bruto_usd' => $resultado['margen'],
            'margen_pct' => $resultado['margen_pct'],
            'rinde_indiferencia_kg_ha' => $resultado['rinde_indiferencia'],
            'semaforo' => $resultado['semaforo'],
            ...$this->importesEnPesos($resultado, $tcHoy['valor']),
            'detalle_costos' => $detalle,
        ];
    }

    /**
     * Los cuatro campos *_ars del contrato, solo para mostrar: el importe en
     * USD ya calculado por el dolar oficial de hoy.
     *
     * @param array<string, mixed> $resultado
     * @return array<string, string>
     */
    private function importesEnPesos(array $resultado, string $tc): array
    {
        return [
            'costo_total_ars' => CalculoMargen::aPesos($resultado['costo_total'], $tc),
            'costo_por_ha_ars' => CalculoMargen::aPesos($resultado['costo_ha'], $tc),
            'ingreso_esperado_ars' => CalculoMargen::aPesos($resultado['ingreso'], $tc),
            'margen_bruto_ars' => CalculoMargen::aPesos($resultado['margen'], $tc),
        ];
    }

    // #endregion
}