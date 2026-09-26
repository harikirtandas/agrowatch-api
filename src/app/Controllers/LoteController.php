<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
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

    /**
     * @return array{0: int, 1: string, 2: float, 3: float, 4: ?float, 5: ?float}
     *         [establecimiento_id, nombre, ha_totales, ha_efectivas, lat, lng]
     */
    private function validarCuerpo(): array
    {
        $establecimientoId = $this->request->input('establecimiento_id');
        $nombre = trim((string) $this->request->input('nombre', ''));
        $haTotales = $this->request->input('ha_totales');
        $haEfectivas = $this->request->input('ha_efectivas');
        $lat = $this->request->input('lat');
        $lng = $this->request->input('lng');

        $errores = [];
        if (!is_int($establecimientoId) && !ctype_digit((string) $establecimientoId)) {
            $errores['establecimiento_id'] = 'Requerido.';
        }
        if ($nombre === '') {
            $errores['nombre'] = 'Requerido.';
        }
        if (!is_int($haTotales) && !is_float($haTotales)) {
            $errores['ha_totales'] = 'Requerido, tiene que ser numerico.';
        }
        if (!is_int($haEfectivas) && !is_float($haEfectivas)) {
            $errores['ha_efectivas'] = 'Requerido, tiene que ser numerico.';
        }
        if ($lat !== null && !is_int($lat) && !is_float($lat)) {
            $errores['lat'] = 'Tiene que ser numerico.';
        }
        if ($lng !== null && !is_int($lng) && !is_float($lng)) {
            $errores['lng'] = 'Tiene que ser numerico.';
        }
        if ($errores !== []) {
            throw ApiException::validacion($errores);
        }

        return [
            (int) $establecimientoId,
            $nombre,
            (float) $haTotales,
            (float) $haEfectivas,
            $lat === null ? null : (float) $lat,
            $lng === null ? null : (float) $lng,
        ];
    }
}
