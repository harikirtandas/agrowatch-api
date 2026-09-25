<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Controller;
use App\Models\Cultivo;

final class CultivoController extends Controller
{
    // GET /api/cultivos
    // Lista TODOS los cultivos
    public function index(): void
    {
        $this->json(Cultivo::listar());
    }

    // GET /api/cultivos/{id}
    // Lista un cultivo por id
    public function show(int $id): void
    {
        $cultivo = Cultivo::porId($id);

        if ($cultivo === null) {
            throw new ApiException(404, 'Cultivo no encontrado.');
        }

        $this->json($cultivo);
    }
}
