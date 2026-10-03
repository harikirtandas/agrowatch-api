<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Models\Campania;
use App\Core\ApiException;

final class CampaniaController extends Controller
{   
     // GET /api/campanias
    // Lista TODAS las las campanias
    public function index(): void
    {
        Auth::usuarioActual($this->request); //exigimos login, si no se autoriza Error: 401

        $this->json(Campania::todas());
    }

    // GET /api/campanias/{id}
    // Lista una campania por id
     public function show(int $id): void
     {

        Auth::usuarioActual($this->request);

        $campania = Campania::buscar($id);

        if($campania === null){
            throw new ApiException(404, 'Campania no encontrada.');
        }
         
        $this->json($campania);
     }

}