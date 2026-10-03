<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Models\Campania;

final class CampaniaController extends Controller
{
    public function index(): void
    {
        Auth::usuarioActual($this->request); //exigimos login, si no se autoriza Error: 401

        $this->json(Campania::todas());
    }


}