<?php

declare(strict_types=1);

// config simple, sin secretos: las credenciales de DB siguen viniendo por
// environment del compose (ver App\Core\Database), no de este archivo.
return [
    'nombre' => 'php-api-docker-starter-apache-mysql',

    // con debug en true, las excepciones no controladas responden 500 con el
    // mensaje real y el archivo/linea; en false, un 500 generico sin filtrar nada.
    'debug' => (bool) (getenv('APP_DEBUG') ?: false),

    // origen permitido para CORS. En desarrollo '*' alcanza; en produccion se
    // pone el dominio del frontend (una sola URL, no lista). Se lee de env para
    // no tocar codigo entre entornos.
    'cors_origin' => getenv('CORS_ORIGIN') ?: '*',

    // vida del token de sesion que emite App\Core\Auth::login(), en horas.
    // Vencimiento absoluto desde el login (no se extiende con el uso): a las
    // 2hs el token deja de ser valido sin importar si hubo actividad, y la
    // proxima request protegida corta con 401 (el cliente ya lo maneja:
    // usuarioLogueado() en web/js/global.js hace logout + redirect a login).
    'token_ttl_horas' => (int) (getenv('TOKEN_TTL_HORAS') ?: 2),
];
