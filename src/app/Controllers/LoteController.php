<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
use App\Core\Validator;
use App\Models\Establecimiento;
use App\Models\Lote;

final class LoteController extends Controller
{
    /** @return array<string, mixed> usuario autenticado (sin password_hash) */
    private function usuario(): array
    {
        return Auth::usuarioActual($this->request);
    }

    // GET /api/lotes?establecimiento_id=
    // A diferencia de /api/establecimientos, aca el filtro es obligatorio: no
    // existe un "todos los lotes de todos mis establecimientos" en este
    // contrato (ver README raiz, seccion Lotes) -- siempre se pide acotado a
    // un establecimiento puntual.
    public function index(): void
    {
        $establecimientoId = $this->request->query('establecimiento_id');

        if ($establecimientoId === null || $establecimientoId === '' || !ctype_digit((string) $establecimientoId)) {
            throw ApiException::validacion(['establecimiento_id' => 'Requerido.']);
        }

        $uid = (int) $this->usuario()['id'];
        $this->json(Lote::delEstablecimiento((int) $establecimientoId, $uid));
    }

    // GET /api/lotes/{id}
    public function show(int $id): void
    {
        $uid = (int) $this->usuario()['id'];
        $lote = Lote::buscarDeUsuario($id, $uid);

        if ($lote === null) {
            throw new ApiException(404, 'Lote no encontrado.');
        }

        $this->json($lote);
    }

    // POST /api/lotes   { "establecimiento_id", "nombre", "ha_totales", "ha_efectivas", "lat"?, "lng"? }
    // A diferencia de POST /api/establecimientos (que crea el padre), aca el
    // establecimiento ya existe: hay que probar que es del usuario ANTES de
    // insertar el lote, si no cualquiera podria colgarle un lote a un
    // establecimiento ajeno solo adivinando su id. Solo dueno, no asesor --
    // mismo criterio que PUT/DELETE /api/establecimientos: un asesor puede
    // VER pero no modificar la estructura del establecimiento que asesora.
    public function store(): void
    {
        $uid = (int) $this->usuario()['id'];
        [$establecimientoId, $nombre, $haTotales, $haEfectivas, $lat, $lng] = $this->validarCuerpo();

        $establecimiento = Establecimiento::buscarDeUsuario($establecimientoId, $uid);
        if ($establecimiento === null) {
            throw new ApiException(404, 'Establecimiento no encontrado.');
        }
        if ($establecimiento['rol'] !== 'dueno') {
            throw new ApiException(403, 'Solo el dueno puede crear lotes en este establecimiento.');
        }

        $id = Lote::crear($establecimientoId, $nombre, $haTotales, $haEfectivas, $lat, $lng);

        $this->creado(Lote::buscarDeUsuario($id, $uid), "/api/lotes/{$id}");
    }

    // PUT /api/lotes/{id}   { "nombre", "ha_totales", "ha_efectivas", "lat"?, "lng"? }
    // El establecimiento_id NO se puede reasignar por aca -- el lote queda
    // pegado al establecimiento con el que se creo. Mudar un lote de
    // establecimiento es una operacion distinta (y mas delicada, exigiria
    // validar el rol en el establecimiento DESTINO tambien), fuera del
    // alcance de este contrato.
    public function update(int $id): void
    {
        $uid = (int) $this->usuario()['id'];
        $lote = Lote::buscarDeUsuario($id, $uid);

        if ($lote === null) {
            throw new ApiException(404, 'Lote no encontrado.');
        }
        if ($lote['rol'] !== 'dueno') {
            throw new ApiException(403, 'Solo el dueno puede modificar este lote.');
        }

        [$nombre, $haTotales, $haEfectivas, $lat, $lng] = $this->validarCamposLote();
        Lote::actualizar($id, $nombre, $haTotales, $haEfectivas, $lat, $lng);

        $this->json(Lote::buscarDeUsuario($id, $uid));
    }

    // DELETE /api/lotes/{id}
    public function destroy(int $id): void
    {
        $uid = (int) $this->usuario()['id'];
        $lote = Lote::buscarDeUsuario($id, $uid);

        if ($lote === null) {
            throw new ApiException(404, 'Lote no encontrado.');
        }
        if ($lote['rol'] !== 'dueno') {
            throw new ApiException(403, 'Solo el dueno puede borrar este lote.');
        }

        Lote::eliminar($id);
        $this->sinContenido();
    }

    /**
     * @return array{0: int, 1: string, 2: float, 3: float, 4: ?float, 5: ?float}
     *         [establecimiento_id, nombre, ha_totales, ha_efectivas, lat, lng]
     */
    private function validarCuerpo(): array
    {
        $datos = $this->prepararDatos($this->request->json());
        Validator::validar('lotes.store', $datos);

        return [
            (int) $datos['establecimiento_id'],
            $datos['nombre'],
            (float) $datos['ha_totales'],
            (float) $datos['ha_efectivas'],
            isset($datos['lat']) ? (float) $datos['lat'] : null,
            isset($datos['lng']) ? (float) $datos['lng'] : null,
        ];
    }

    /**
     * Campos comunes a store() y update() -- todo menos establecimiento_id,
     * que store() valida aparte (update() no lo toca, ver comentario arriba).
     *
     * @return array{0: string, 1: float, 2: float, 3: ?float, 4: ?float}
     *         [nombre, ha_totales, ha_efectivas, lat, lng]
     */
    private function validarCamposLote(): array
    {
        $datos = $this->prepararDatos($this->request->json());
        Validator::validar('lotes.update', $datos);

        return [
            $datos['nombre'],
            (float) $datos['ha_totales'],
            (float) $datos['ha_efectivas'],
            isset($datos['lat']) ? (float) $datos['lat'] : null,
            isset($datos['lng']) ? (float) $datos['lng'] : null,
        ];
    }

    /**
     * @param array<string, mixed> $datos
     * @return array<string, mixed>
     */
    private function prepararDatos(array $datos): array
    {
        if (array_key_exists('nombre', $datos)) {
            $datos['nombre'] = trim((string) $datos['nombre']);
        }

        return $datos;
    }
}
