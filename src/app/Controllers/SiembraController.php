<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
use App\Core\Validator;  
use App\Models\Siembra;
use PDOException;

final class SiembraController extends Controller
{
    // GET /api/siembras?campania_id=&lote_id=
    // Los dos filtros son opcionales y combinables. Las siembras son
    // compartidas por todos los usuarios logueados (ver Siembra.php), asi que
    // se llama al guard pero NO se guarda el id del usuario.
    public function index(): void
    {
        Auth::usuarioActual($this->request);

        $campaniaId = $this->filtroEntero('campania_id');
        $loteId = $this->filtroEntero('lote_id');

        $this->json(Siembra::listar($campaniaId, $loteId));
    }

    // GET /api/siembras/{id}
    public function show(int $id): void
    {
        Auth::usuarioActual($this->request);

        $this->json($this->siembraOError($id));
    }

    // POST /api/siembras
    // { "campania_id", "lote_id", "cultivo_id", "ha_sembradas", "fecha_siembra", "variedad"?, "rinde_esperado"? }
    public function store(): void
    {
        Auth::usuarioActual($this->request);

        $valores = $this->validarCuerpo();

        try {
            $id = Siembra::crear(...$valores);
        } catch (PDOException $e) {
            throw $this->traducirErrorBD($e);
        }

        $this->creado(Siembra::buscar($id), "/api/siembras/{$id}");
    }

    // PUT/api/siembras/{id}
    // Reemplazo completo: el cliente manda siempre los cinco obligatorios.
    // Se busca ANTES con siembraOError() porque actualizar() devuelve
    // rowCount() > 0, y MySQL cuenta 0 filas si los valores no cambiaron:
    // no sirve para detectar el 404.
    public function update(int $id): void
    {
        Auth::usuarioActual($this->request);

        $this->siembraOError($id);
        $valores = $this->validarCuerpo();

        try {
            Siembra::actualizar($id, ...$valores);
        } catch (PDOException $e) {
           throw $this->traducirErrorBD($e);
        }

        $this->json(Siembra::buscar($id));
    }

    // DELETE /api/siembras/{id}
    // Ojo: los costos de la siembra se borran en cascada (fk_costos_siembra).
    public function destroy(int $id): void
    {
        Auth::usuarioActual($this->request);

        $this->siembraOError($id);
        Siembra::eliminar($id);

        $this->sinContenido();
    }

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
     * Busca la siembra o corta con 404. La usan show, update y destroy.
     *
     * @return array<string, mixed>
     */
    private function siembraOError(int $id): array
    {
        $siembra = Siembra::buscar($id);

        if ($siembra === null) {
            throw new ApiException(404, 'Siembra no encontrada.');
        }

        return $siembra;
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
}