<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
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
}
