<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Models\Campania;
use App\Core\ApiException;
use App\Core\Validator;

final class CampaniaController extends Controller
{   
    // GET /api/campanias
    // Lista TODAS las campanias. No se filtran por usuario: son compartidas por
    // todos los usuarios logueados, asi que se llama al guard solo para exigir
    // sesion, sin guardar el id del usuario.
    public function index(): void
    {
        Auth::usuarioActual($this->request); //exigimos login, si no se autoriza Error: 401

        $this->json(Campania::todas());
    }

    // GET /api/campanias/{id}
    // Una campania puntual por id, o 404 si no existe.
     public function show(int $id): void
     {

        Auth::usuarioActual($this->request);

        $campania = Campania::buscar($id);

        if($campania === null){
            throw new ApiException(404, 'Campania no encontrada.');
        }
         
        $this->json($campania);
     }
    // POST /api/campanias   { "nombre", "fecha_inicio", "fecha_fin" }
    // Crea una campania. "cerrada" no viene en el body: arranca en false sola por
    // el DEFAULT de la tabla. Responde 201 + Location al recurso recien creado.
    public function store(): void
    {
        Auth::usuarioActual($this->request);

        [$nombre, $fechaInicio, $fechaFin] = $this->validarCuerpo();
        
        $id = Campania::crear($nombre, $fechaInicio, $fechaFin); 

        $this->creado(Campania::buscar($id), "/api/campanias/{$id}");
    }
    /**
    * Lee el body, normaliza (trim del nombre), valida contra el schema y
    * devuelve [nombre, fecha_inicio, fecha_fin] listo para Campania::crear().
    */
    private function validarCuerpo(): array
    {
        $datos = $this->request->json();
            if (array_key_exists('nombre', $datos)) {
                 $datos['nombre'] = trim((string) $datos['nombre']);
            }
    

        Validator::validar('campanias', $datos);

        return [$datos['nombre'], $datos['fecha_inicio'], $datos['fecha_fin']];
    }
}   