<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
use App\Models\Establecimiento;

// ---------------------------------------------------------------------------
// MATERIAL DE ESTUDIO. Vive en planning/ para leerse en grupo -- NO esta
// enchufada al router todavia (src/public/index.php ya tiene las rutas de
// /api/establecimientos apuntando a "EstablecimientoController@...", pero la
// clase real todavia no existe en src/app/Controllers/). Cuando el equipo
// entienda este archivo, se copia/adapta a
// src/app/Controllers/EstablecimientoController.php. Ver el README de esta
// carpeta para el flujo completo request -> response.
//
// Comparar con src/app/Controllers/NotaController.php: exactamente la misma
// forma (index/show/store/update/destroy, un metodo privado usuario() para
// no repetir Auth::usuarioActual(), un validarCuerpo() al final). Lo unico
// que cambia es el nombre de los campos y que update()/destroy() ademas
// chequean el campo `rol` antes de escribir -- ver el comentario ahi abajo.
// ---------------------------------------------------------------------------
final class EstablecimientoController extends Controller
{
    /** @return array<string, mixed> usuario autenticado (sin password_hash) */
    private function usuario(): array
    {
        return Auth::usuarioActual($this->request);
    }

    // GET /api/establecimientos
    // Lista TODOS los establecimientos del usuario, sea dueno o asesor. No
    // hay paginacion en este contrato (ver README raiz) -- un usuario real
    // maneja unos pocos establecimientos, no miles.
    public function index(): void
    {
        $uid = (int) $this->usuario()['id'];
        $this->json(Establecimiento::delUsuario($uid));
    }

    // GET /api/establecimientos/{id}
    public function show(int $id): void
    {
        $uid = (int) $this->usuario()['id'];
        $establecimiento = Establecimiento::buscarDeUsuario($id, $uid);

        if ($establecimiento === null) {
            throw new ApiException(404, 'Establecimiento no encontrado.');
        }

        $this->json($establecimiento);
    }

    // POST /api/establecimientos   { "nombre", "localidad", "provincia" }
    // Dos escrituras en dos tablas distintas (establecimientos +
    // usuario_establecimiento), pero UNA sola operacion HTTP: quien crea el
    // establecimiento queda vinculado como 'dueno' automaticamente, no hace
    // falta un segundo request para eso.
    public function store(): void
    {
        $uid = (int) $this->usuario()['id'];
        [$nombre, $localidad, $provincia] = $this->validarCuerpo();

        $id = Establecimiento::crear($nombre, $localidad, $provincia);
        Establecimiento::vincularUsuario($id, $uid, 'dueno');

        // se relee de la base (en vez de armar el array a mano con los
        // valores que ya tenemos) para que la respuesta incluya exactamente
        // lo que quedo guardado -- created_at/updated_at con la hora real de
        // MySQL, no una que calculemos nosotros en PHP.
        $this->creado(Establecimiento::buscarDeUsuario($id, $uid), "/api/establecimientos/{$id}");
    }

    // PUT /api/establecimientos/{id}   { "nombre", "localidad", "provincia" }
    public function update(int $id): void
    {
        $uid = (int) $this->usuario()['id'];
        $establecimiento = Establecimiento::buscarDeUsuario($id, $uid);

        if ($establecimiento === null) {
            throw new ApiException(404, 'Establecimiento no encontrado.');
        }

        // el README (seccion Establecimientos) dice "reemplaza (solo dueno)":
        // un asesor puede VER el establecimiento (ya paso el chequeo de
        // arriba) pero no modificarlo. 403 no esta en la lista de codigos de
        // la convencion general (400/401/404/409/422) porque la mayoria de
        // los endpoints no tienen roles -- Establecimientos es el unico caso
        // de esta iteracion con mas de un rol por recurso, asi que es el
        // unico que necesita distinguir "no es tuyo" (404) de "es tuyo pero
        // no podes escribirlo" (403).
        if ($establecimiento['rol'] !== 'dueno') {
            throw new ApiException(403, 'Solo el dueno puede modificar este establecimiento.');
        }

        [$nombre, $localidad, $provincia] = $this->validarCuerpo();
        Establecimiento::actualizar($id, $nombre, $localidad, $provincia);

        $this->json(Establecimiento::buscarDeUsuario($id, $uid));
    }

    // DELETE /api/establecimientos/{id}
    public function destroy(int $id): void
    {
        $uid = (int) $this->usuario()['id'];
        $establecimiento = Establecimiento::buscarDeUsuario($id, $uid);

        if ($establecimiento === null) {
            throw new ApiException(404, 'Establecimiento no encontrado.');
        }
        if ($establecimiento['rol'] !== 'dueno') {
            throw new ApiException(403, 'Solo el dueno puede borrar este establecimiento.');
        }

        Establecimiento::eliminar($id);
        $this->sinContenido();
    }

    /**
     * Mismo patron que NotaController::validarCuerpo(): junta los tres
     * campos del body, valida todos ANTES de tirar la excepcion (para que el
     * 422 devuelva todos los errores juntos en vez de uno a la vez -- mejor
     * experiencia para quien consume la API, no tiene que hacer prueba y
     * error campo por campo).
     *
     * @return array{0: string, 1: string, 2: string} [nombre, localidad, provincia]
     */
    private function validarCuerpo(): array
    {
        $nombre = trim((string) $this->request->input('nombre', ''));
        $localidad = trim((string) $this->request->input('localidad', ''));
        $provincia = trim((string) $this->request->input('provincia', ''));

        $errores = [];
        if ($nombre === '') {
            $errores['nombre'] = 'Requerido.';
        }
        if ($localidad === '') {
            $errores['localidad'] = 'Requerido.';
        }
        if ($provincia === '') {
            $errores['provincia'] = 'Requerido.';
        }
        if ($errores !== []) {
            throw ApiException::validacion($errores);
        }

        return [$nombre, $localidad, $provincia];
    }
}
