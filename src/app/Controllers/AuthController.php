<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\Validator;

// slice demo (auth). El patron login -> token -> requests con Bearer es el que
// todo proyecto de este starter necesita; lo que se descarta es el detalle de
// los campos, no el flujo.
final class AuthController extends Controller
{
    // POST /api/auth/login  { "email": "...", "password": "..." }
    public function login(): void
    {
        $datos = $this->request->json();
        if (array_key_exists('email', $datos)) {
            $datos['email'] = trim((string) $datos['email']);
        }

        Validator::validar('auth.login', $datos);

        $this->json(Auth::login($datos['email'], (string) $datos['password']));
    }

    // GET /api/auth/me  (protegida) -> devuelve el usuario dueno del token.
    public function me(): void
    {
        $this->json(['usuario' => Auth::usuarioActual($this->request)]);
    }

    // POST /api/auth/logout  (protegida) -> invalida el token actual.
    public function logout(): void
    {
        Auth::usuarioActual($this->request); // 401 si el token ya no sirve
        Auth::logout($this->request);
        $this->sinContenido();
    }
}
