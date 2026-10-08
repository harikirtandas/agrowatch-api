<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ApiException;
use App\Core\Controller;
use App\Core\Validator;
use App\Models\Usuario;
use PDOException;

final class UsuarioController extends Controller
{
    // POST /api/usuarios   { "nombre", "apellido", "email", "password" }
    // Sin token en la respuesta: el frontend (registro_parte_1.js) hace
    // login aparte despues de crear la cuenta.
    public function store(): void
    {
        [$nombre, $apellido, $email, $password] = $this->validarCuerpo();

        try {
            $id = Usuario::crear($nombre, $apellido, $email, $password);
        } catch (PDOException $e) {
            throw $this->traducirErrorBD($e);
        }

        $this->creado(Usuario::buscar($id), "/api/usuarios/{$id}");
    }

    /**
     * @return array{0: string, 1: string, 2: string, 3: string} [nombre, apellido, email, password]
     */
    private function validarCuerpo(): array
    {
        $datos = $this->request->json();
        foreach (['nombre', 'apellido', 'email'] as $campo) {
            if (array_key_exists($campo, $datos)) {
                $datos[$campo] = trim((string) $datos[$campo]);
            }
        }

        Validator::validar('usuarios', $datos);

        return [$datos['nombre'], $datos['apellido'], $datos['email'], $datos['password']];
    }

    /**
     * SQLSTATE 23000, codigo MySQL 1062: choca con el UNIQUE de email.
     */
    private function traducirErrorBD(PDOException $e): \Throwable
    {
        $codigoMysql = (int) ($e->errorInfo[1] ?? 0);

        if ($codigoMysql === 1062) {
            return new ApiException(409, 'Ya existe una cuenta con ese email.');
        }

        return $e;
    }
}
