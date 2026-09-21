# php-api-docker-starter-apache-mysql-cliente-js

- Hermano de `php-api-docker-starter-apache-mysql`, del que sale este repo.
  **Backend, Docker y `app/Core/` identicos, sin cambios.** La unica diferencia
  es `src/public/js/api.js`: en el hermano es parte del slice demo descartable;
  aca es el entregable principal, pensado para quedarse y estudiarse, no para
  tirarse. `public/js/app.js` (el cliente de notas que lo usa) si es
  reemplazable, igual que en el hermano.
- `api.js` expone `get/post/put/patch/del` + `login(email, password)` (loguea,
  guarda el token, devuelve el usuario) + `logout()` (avisa al backend Y borra
  el token local aunque esa llamada falle, en un `finally`) + `haySesion()`.
  Comentado linea por linea en espanol explicando el porque de cada decision
  (por que el token vive en memoria Y en localStorage a la vez, por que el
  header Authorization se manda siempre y no solo en rutas "que se sabe" son
  protegidas, por que `.errores` puede venir null). No tocar el nivel de
  detalle de esos comentarios al editar el archivo — es material de estudio.
- `app.js` demuestra las 8 funciones con login/logout + CRUD de notas,
  incluyendo edicion inline por fila con `PATCH` (el backend registra PATCH y
  PUT contra el mismo metodo `NotaController::update()` — reemplazo completo,
  no un merge parcial de campos; igual hay que mandar `titulo` y `cuerpo` los
  dos, aunque el verbo sea PATCH). Ver `docker-compose.yml` no cambia entre
  ambos repos: sin problema de aislamiento de tests como en la familia Laravel
  (este starter no trae ningun framework de testing).

- Hermano API de `php-mvc-docker-starter-apache-mysql`. **El andamiaje Docker es
  identico** (Dockerfile, `docker/apache/000-default.conf`, `docker/php/php.ini`,
  `docker-compose.yml`, `Makefile`, `.gitignore`): no se toca. Toda la diferencia
  vive en `src/`.
- **Diferencia con el hermano MVC**: no hay capa de `Views`. `Controller` no tiene
  `render()`, tiene `json()`/`creado()`/`sinContenido()`. El `Router` suma
  `put()`/`patch()`/`delete()`, method override (`X-HTTP-Method-Override` o
  `?_method=` sobre POST) y responde 404/405 como JSON en vez de `require` de una
  vista. Se agregan `Request`, `ApiException` y `Auth` en `Core/`.
- **Solo `src/public/` es DocumentRoot.** `app/`, `config/` y `vendor/` quedan un
  nivel arriba, fuera del alcance de Apache por URL.
- **`make install` es obligatorio antes del primer arranque**: sin
  `vendor/autoload.php` (que solo genera `composer install`) el `require` de
  `src/public/index.php` explota. `composer.json` no tiene dependencias reales:
  `install` solo genera el autoloader PSR-4.
- `composer.json` vive en `src/composer.json`, **no en la raiz**: el bind mount es
  `./src:/var/www/html`, `vendor/` tiene que quedar dentro de `src/`.
- **Mayusculas en dirs que mapean namespace**: `Core/`, `Controllers/`, `Models/`
  con inicial mayuscula (PSR-4 `App\ -> app/`); `config/`, `public/css`,
  `public/js` en minuscula. En Mac el FS es case-insensitive y el contenedor
  Debian no: un mismatch de case anda en local y rompe en el contenedor.
- **Las rutas se registran solo en `src/public/index.php`**, con
  `$router->get/post/put/patch/delete(...)` y `$router->dispatch()`. Literales
  antes que parametricas con el mismo prefijo, o quedan inalcanzables. Todo bajo
  `/api`; el frontend estatico (`index.html`, `css/`, `js/`) lo sirve Apache
  directo gracias a las condiciones `-f`/`-d` del `.htaccess`.
- **`.htaccess` reinyecta el header `Authorization`** como `HTTP_AUTHORIZATION`
  via `mod_rewrite` (Apache lo descarta antes de PHP). `Request::bearerToken()`
  depende de eso; en un hosting sin `.htaccess` hay que resolverlo aparte.
- **CORS**: se setea en `src/public/index.php` para toda respuesta y el preflight
  `OPTIONS` se contesta ahi con 204, antes del router. Origen desde `CORS_ORIGIN`.
- **Manejo de errores central**: `set_exception_handler` en `index.php`.
  `ApiException` lleva su `status` (y opcional `errores` de validacion) y se
  traduce a `{ "error": { ... } }`. Cualquier otra excepcion es 500; con
  `APP_DEBUG=1` incluye `error.debug`.
- **`App\Core\Database::connection()`**: identico al hermano MVC — singleton
  estatico, credenciales con `getenv()` **nunca `$_ENV`** (`variables_order` no
  siempre trae `E`), `ERRMODE_EXCEPTION`, `FETCH_ASSOC`, `EMULATE_PREPARES` en
  false. No se toca.
- **Auth**: token opaco (64 hex, `random_bytes`) guardado en la tabla `tokens`
  con vencimiento. NO es JWT: mas facil de explicar y revocar, y sirve para
  cliente JS y para Android. `Auth::usuarioActual($request)` es el guard que se
  llama al principio de cada endpoint protegido.
- **PSR-4 no autocarga funciones, solo clases.** Si hacen falta helpers globales,
  van en `src/app/Core/helpers.php` declarado en la seccion `"files"` de
  `composer.json`.
- Todo comando (composer, php) corre via `docker compose exec app ...`,
  `make shell` o `make composer CMD="..."`. No hay PHP en el host a proposito.
- El Dockerfile **no agrega `USER`**: Apache arranca como root para bindear el
  puerto 80 y baja los workers a `www-data` solo. Los build args `UID`/`GID`
  remapean `www-data` con `usermod`/`groupmod`. (Heredado del hermano, sin cambios.)
- **Vertical slice demo, descartable como conjunto — CON UNA EXCEPCION**:
  `PingController` (ping + health/db), `AuthController` + `Auth`/`Usuario`/
  `Token` (login por token), `NotaController` + `Nota` (CRUD con los 5 verbos,
  filtrado por usuario), el schema `01-schema.sql` (`usuarios`/`tokens`/`notas`
  + usuario demo `demo@demo.test`/`secret`) y `public/index.html` +
  `public/js/app.js` + `public/css/*`. Prueba de punta a punta Apache + PHP +
  router + MySQL + autoloader + auth. En un proyecto real se borra todo eso;
  se conserva `app/Core/` **y `public/js/api.js`** (ver bullets de arriba) —
  a diferencia de `php-api-docker-starter-apache-mysql`, donde todo `js/`
  entra en el paquete descartable.
