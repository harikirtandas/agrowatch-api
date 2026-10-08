<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Auth;
use App\Core\Controller;
use App\Core\Validator;
use App\Models\Costo;
use App\Models\Siembra;

final class CostoController extends Controller
{
    /** @return array<string, mixed> usuario autenticado (sin password_hash) */
    private function usuario(): array
    {
        return Auth::usuarioActual($this->request);
    }

    // ====>>>>>>>>>> GET /api/siembras/{id}/costos ==========================
    // Aca el {id} de la URL es el de la SIEMBRA. Lista vacia [] tambien es 200.
    public function index(int $siembraId): void
    {
        $uid = (int) $this->usuario()['id'];
        $this->siembraOError($siembraId, $uid);
        $this->json(Costo::porSiembra($siembraId));
    }

    //========================== POST /api/siembras/{id}/costos ==========================
    // { "categoria", "descripcion", "cantidad", "unidad", "precio_unitario", "moneda", "fecha" }
    // Se comprueba la siembra ANTES de validar el body: si el padre de la URL no existe, no tiene sentido mirar el resto.
    // No hay try/catch: la tabla costos no tiene UNIQUE y su unica FK (siembra_id) ya se chequeo arriba.
    public function store(int $siembraId): void
    {
        $uid = (int) $this->usuario()['id'];

        $this->siembraOError($siembraId, $uid);
        $valores = $this->validarCuerpo();
        $id = Costo::crear($siembraId, ...$valores);

        $this-> creado(Costo::buscarDeUsuario($id, $uid), "/api/costos/{$id}");
    }

    // ========================== PUT /api/costos/{id} ==========================
    // Aca el {id} de la URL es el del COSTO. Reemplazo completo: el cliente manda siempre los siete campos.
    // Se busca ANTES con costoOError() porque actualizar() devuelve rowCount() > 0,
    // y MySQL cuenta 0 filas si los valores no cambiaron: no sirve para detectar el 404.
    public function update(int $costoId): void
    {
        $uid = (int) $this->usuario()['id'];

        $this->costoOError($costoId, $uid);
        $valores = $this->validarCuerpo();

        Costo::actualizar($costoId, ...$valores);

        $this->json(Costo::buscarDeUsuario($costoId, $uid));
    }

    //  ========================== DELETE /api/costos/{id}  ==========================

    public function destroy(int $costoId): void
    {
        $uid = (int) $this->usuario()['id'];

        $this->costoOError($costoId, $uid);
        Costo::eliminar($costoId);

        $this->sinContenido();
    }

    //  ==========================  Metodo Privados(propios)  ==========================
    private function siembraOError(int $siembraId, int $usuarioId): array
    {
        $siembra = Siembra::buscarDeUsuario($siembraId, $usuarioId);
        if ($siembra === null){
            throw new ApiException(404, 'Siembra no encontrada.');
        }
        return $siembra;
    }

    private function costoOError(int $costoId, int $usuarioId): array
    {
        $costo = Costo::buscarDeUsuario($costoId, $usuarioId);
        if ($costo === null){
            throw new ApiException (404, 'Costo no encontrado.');
        }
        return $costo;
    }

    private function validarCuerpo(): array
    {
        $datos = $this->prepararDatos($this->request->json());
        Validator::validar('costos', $datos);

        // El schema solo chequea la FORMA (AAAA-MM-DD); "2026-13-45" pasa.
        [$anio, $mes, $dia] = array_map('intval', explode('-', $datos['fecha']));
        if (!checkdate($mes, $dia, $anio)) {
            throw ApiException::validacion(['fecha' => 'Fecha invalida.']);
        }

        return [
            $datos['categoria'],
            $datos['descripcion'],
            (float) $datos['cantidad'],
            $datos['unidad'],
            (float) $datos['precio_unitario'],
            $datos['moneda'],
            $datos['fecha'],
        ];
    }

    private function prepararDatos(array $datos): array
    {
        foreach (['descripcion', 'unidad'] as $campo) {
            if (isset($datos[$campo]) && is_string($datos[$campo])) {
                $datos[$campo] = trim($datos[$campo]);
            }
        }

        return $datos;
    }
}