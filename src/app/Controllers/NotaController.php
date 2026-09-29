<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
use App\Core\Validator;
use App\Models\Nota;
use PDOException;

// slice demo: CRUD completo de "notas" de un usuario. Cada endpoint esta
// protegido por token y solo ve/toca las notas del usuario dueno del token.
// Sirve como referencia de los 5 verbos, los codigos de estado y el filtrado
// por usuario. Descartable.
final class NotaController extends Controller
{
    /** @return array<string, mixed> usuario autenticado */
    private function usuario(): array
    {
        return Auth::usuarioActual($this->request);
    }

    // GET /api/notas
    public function index(): void
    {
        $uid = (int) $this->usuario()['id'];
        $this->json(['datos' => Nota::delUsuario($uid)]);
    }

    // GET /api/notas/{id}
    public function show(int $id): void
    {
        $uid = (int) $this->usuario()['id'];
        $nota = Nota::buscarDeUsuario($id, $uid);

        if ($nota === null) {
            throw new ApiException(404, 'Nota no encontrada.');
        }

        $this->json($nota);
    }

    // POST /api/notas   { "titulo": "...", "cuerpo": "..." }
    public function store(): void
    {
        $uid = (int) $this->usuario()['id'];
        [$titulo, $cuerpo] = $this->validarCuerpo();

        $id = Nota::crear($uid, $titulo, $cuerpo);

        $this->creado(Nota::buscarDeUsuario($id, $uid), "/api/notas/{$id}");
    }

    // PUT /api/notas/{id}   { "titulo": "...", "cuerpo": "..." }
    public function update(int $id): void
    {
        $uid = (int) $this->usuario()['id'];

        if (Nota::buscarDeUsuario($id, $uid) === null) {
            throw new ApiException(404, 'Nota no encontrada.');
        }

        [$titulo, $cuerpo] = $this->validarCuerpo();
        Nota::actualizar($id, $uid, $titulo, $cuerpo);

        $this->json(Nota::buscarDeUsuario($id, $uid));
    }

    // DELETE /api/notas/{id}
    public function destroy(int $id): void
    {
        $uid = (int) $this->usuario()['id'];

        if (!Nota::eliminar($id, $uid)) {
            throw new ApiException(404, 'Nota no encontrada.');
        }

        $this->sinContenido();
    }

    /**
     * @return array{0: string, 1: string} [titulo, cuerpo] ya validados
     */
    private function validarCuerpo(): array
    {
        $datos = $this->request->json();
        if (array_key_exists('titulo', $datos)) {
            $datos['titulo'] = trim((string) $datos['titulo']);
        }
        if (array_key_exists('cuerpo', $datos)) {
            $datos['cuerpo'] = trim((string) $datos['cuerpo']);
        }

        Validator::validar('notas', $datos);

        return [$datos['titulo'], $datos['cuerpo'] ?? ''];
    }
}
