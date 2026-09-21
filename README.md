# php-api-docker-starter-apache-mysql-cliente-js

Plantilla de GitHub para arrancar una **API REST en PHP plano** (sin framework,
sin librerias externas) dockerizada, con **Apache + mod_php + MySQL 8**, en
cualquier maquina, con un solo comando — igual que
[`php-api-docker-starter-apache-mysql`](../php-api-docker-starter-apache-mysql),
del que sale este repo. Backend, Docker y `app/Core/` son **identicos, sin
ningun cambio**.

**La diferencia es el frontend.** En el hermano original, `public/index.html`
y `public/js/*` son parte del "slice demo descartable" — sirven para probar
que todo funciona de punta a punta, y en un proyecto real se borran enteros.
Acá es al reves: `public/js/api.js` es el entregable principal del repo, un
wrapper de `fetch` completo y comentado linea por linea para **estudiar como
se consume una API REST desde JavaScript puro** — sesion con token Bearer en
`localStorage`, `login()`/`logout()`, los cinco verbos, y manejo de errores
segun el formato exacto que devuelve el backend (`error.mensaje`,
`error.errores`). Pensado para quedarse y ser la base de proyectos reales, no
para tirarse.

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (o Docker Engine + Compose plugin) corriendo.
- [GitHub CLI](https://cli.github.com/) (`gh`) para crear proyectos nuevos desde la terminal. Alternativa: boton **"Use this template"** en GitHub.

## Crear un proyecto nuevo desde este template

```bash
gh repo create mi-api --template harikirtandas/php-api-docker-starter-apache-mysql-cliente-js --private --clone
cd mi-api
make install
```

Al terminar:

- API + cliente JS -> **http://localhost:8080**
- Adminer (cliente web de MySQL) -> **http://localhost:8081**

`make install` es **obligatorio** antes del primer arranque: sin `vendor/` no
existe el autoloader de Composer y el proyecto no corre con solo
`docker compose up`.

## Arquitectura

Un solo contenedor de aplicacion (`php:8.4-apache`, mod_php) mas MySQL y Adminer:

| Servicio | Imagen | Rol |
|---|---|---|
| `app` | build propio, `php:8.4-apache` | Apache y PHP en el mismo proceso. Publica `APP_PORT` (default 8080). |
| `mysql` | `mysql:8` | Base de datos, volumen persistente `mysql-data` + healthcheck. |
| `adminer` | `adminer` | Cliente web de MySQL, publica `ADMINER_PORT` (default 8081). |

`./src` se monta como bind mount en `app`: `src/public` es el docroot (unico
directorio que Apache expone por URL), el resto queda fuera.

## Estructura de `src/`

```
src/
├── app/
│   ├── Core/
│   │   ├── Router.php         # router propio: verbos, parametros {id:\d+}, method override, 404/405 JSON
│   │   ├── Controller.php     # base: json(), creado(), sinContenido()
│   │   ├── Request.php        # body JSON, query params, Bearer token
│   │   ├── ApiException.php   # excepcion HTTP con status + errores de validacion
│   │   ├── Auth.php           # login -> token opaco en tabla `tokens`; usuarioActual()
│   │   └── Database.php       # PDO singleton (getenv, ERRMODE_EXCEPTION, FETCH_ASSOC)
│   ├── Controllers/           # PingController, AuthController, NotaController  (slice demo)
│   └── Models/                # Usuario, Token, Nota  (slice demo)
├── config/app.php             # debug, cors_origin, token_ttl_horas
└── public/
    ├── .htaccess              # front controller + fix del header Authorization
    ├── index.php              # UNICO lugar donde se arma la tabla de rutas
    ├── index.html             # pantalla de login + CRUD de notas
    ├── css/app.css
    └── js/
        ├── api.js             # EL ENTREGABLE: wrapper de fetch, comentado a fondo
        └── app.js             # cliente demo que usa api.js (este si es reemplazable)
```

## El backend: vertical slice, igual que en el hermano (descartable)

El backend (`Ping`, `Auth`, `Nota` en Controllers/Models, la tabla de
`notas`/`usuarios`/`tokens` del schema) es el mismo vertical slice demo del
repo original, sin cambios: sirve para probar que Apache + PHP + router +
MySQL + auth funcionan juntos, y en un proyecto real se reemplaza por el
dominio propio. Lo que se conserva siempre es `app/Core/`.

**La excepcion es `public/js/api.js`**: ese archivo esta pensado para
quedarse tal cual (o extendido) en cualquier proyecto que arranque desde este
template, sea cual sea el dominio real — el patron login/token/fetch no
cambia aunque cambien los endpoints. `app.js` (el que arma la pantalla de
notas) si es descartable, como en el hermano.

| Metodo | Ruta | Auth | Que hace |
|---|---|---|---|
| `GET` | `/api/ping` | no | `{ "pong": true, "hora": ... }` |
| `GET` | `/api/health/db` | no | `SELECT 1` contra MySQL |
| `POST` | `/api/auth/login` | no | `{ email, password }` -> `{ token, expira, usuario }` |
| `GET` | `/api/auth/me` | si | usuario dueno del token |
| `POST` | `/api/auth/logout` | si | invalida el token |
| `GET` | `/api/notas` | si | lista las notas del usuario |
| `POST` | `/api/notas` | si | `{ titulo, cuerpo }` -> 201 + `Location` |
| `GET` | `/api/notas/{id}` | si | una nota |
| `PUT` / `PATCH` | `/api/notas/{id}` | si | reemplaza -> 200 (mismo handler para los dos verbos, ver "Rutas") |
| `DELETE` | `/api/notas/{id}` | si | -> 204 |

Usuario demo: **`demo@demo.test` / `secret`**.

## El cliente JS (`public/js/api.js`) — el foco de este starter

`api.js` es un wrapper de `fetch` de ~150 lineas, comentado en espanol
explicando el porque de cada decision (no solo el que), pensado para
estudiar como se consume una API REST desde JavaScript puro sin ningun
framework de por medio. Expone:

```js
API.get(ruta)              // GET
API.post(ruta, body)       // POST
API.put(ruta, body)        // PUT
API.patch(ruta, body)      // PATCH
API.del(ruta)              // DELETE ("delete" es palabra reservada en JS)

API.login(email, password) // POST /auth/login, guarda el token, devuelve el usuario
API.logout()                // POST /auth/logout + borra el token local pase lo que pase
API.haySesion()             // true si hay un token guardado (no garantiza que siga vigente)
```

Detalles de diseno que vale la pena leer directo del codigo fuente (estan
comentados ahi mismo, no repetidos aca):
- El token se guarda en `localStorage` Y en una variable en memoria a la vez.
- El header `Authorization` se manda en **todas** las requests si hay sesion,
  no solo en las que "se sabe" que son protegidas — esa decision la toma el
  backend, no el cliente.
- Los errores HTTP (status >= 400) se convierten en un `Error` de JS normal,
  con `.status` (codigo HTTP) y `.errores` (objeto de validacion, solo en
  422) pegados encima — para poder hacer `try { await API.post(...) } catch
  (e) { ... e.message, e.errores ... }` sin parsear el JSON de error a mano
  en cada lugar donde se usa.
- `logout()` nunca deja tirado un token roto: si el aviso al servidor falla,
  borra igual el token local en el `finally`.

`public/js/app.js` (el cliente demo de notas) usa las ocho funciones de
arriba para armar login, logout, listar, crear, editar (con `PATCH`, inline
en cada fila) y borrar notas — sirve de ejemplo de uso, pero **es
reemplazable entero**, a diferencia de `api.js`.

### Probar con curl

```bash
# login
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@demo.test","password":"secret"}' | php -r 'echo json_decode(file_get_contents("php://stdin"))->token;')

# listar notas
curl -s localhost:8080/api/notas -H "Authorization: Bearer $TOKEN"

# crear
curl -s -X POST localhost:8080/api/notas \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"titulo":"Hola","cuerpo":"desde curl"}' -i

# borrar
curl -s -X DELETE localhost:8080/api/notas/3 -H "Authorization: Bearer $TOKEN" -i
```

## Rutas

El router (`App\Core\Router`) se registra en `src/public/index.php` con
`$router->get(...)`, `->post(...)`, `->put(...)`, `->patch(...)`, `->delete(...)`
y se despacha con `$router->dispatch()`.

### Sintaxis de parametros

| Path registrado | Que matchea | Que recibe el metodo |
|---|---|---|
| `/api/notas` | Solo ese literal | Nada |
| `/api/notas/{id}` | Cualquier segmento no vacio sin `/` | `string $id` |
| `/api/notas/{id:\d+}` | Solo digitos | `int $id` (casteado) |
| `/api/cat/{slug}/notas/{id:\d+}` | Varios parametros | `string $slug, int $id`, en orden |

**El orden de registro importa**: la primera ruta cuyo path y metodo coinciden
gana. Las rutas literales van **antes** que las parametricas con el mismo
prefijo (`/api/notas/export` antes que `/api/notas/{id}`).

### Verbos y method override

Ademas de GET/POST hay `PUT`, `PATCH` y `DELETE`. Un cliente o proxy que solo
sepa mandar POST puede simular los otros con:

- header `X-HTTP-Method-Override: PUT`, o
- query string `?_method=PUT`

sobre un POST. Solo se acepta el override sobre POST.

### 404 vs 405

- Ninguna ruta matchea el path -> **404** JSON.
- El path matchea pero con otro metodo -> **405** JSON + header `Allow`.

## Respuestas y errores

Los controladores extienden `App\Core\Controller`:

```php
$this->json($datos);                       // 200
$this->json($datos, 200);
$this->creado($datos, "/api/notas/12");    // 201 + Location
$this->sinContenido();                     // 204
```

Para cortar con un error, tiran `App\Core\ApiException` (la captura el front
controller y la vuelve JSON):

```php
throw new ApiException(404, 'Nota no encontrada.');
throw ApiException::validacion(['email' => 'Formato invalido']);  // 422
```

Forma de la respuesta de error:

```json
{ "error": { "status": 422, "mensaje": "Datos invalidos.", "errores": { "email": "Formato invalido" } } }
```

Con `APP_DEBUG=1`, un 500 no controlado incluye `error.debug` con la excepcion,
el mensaje y el archivo:linea. En `0`, solo un mensaje generico.

## Autenticacion

`App\Core\Auth`:

- `Auth::login($email, $password)` valida contra `usuarios.password_hash`
  (`password_verify`), inserta un token aleatorio de 64 hex en `tokens` con
  vencimiento (`token_ttl_horas`, default 7 dias) y lo devuelve.
- En cada request protegida: `Auth::usuarioActual($this->request)` resuelve el
  header `Authorization: Bearer <token>` o corta con 401.
- `Auth::logout($request)` borra la fila del token.

Es token opaco en tabla, no JWT: mas facil de explicar y de revocar, y sirve
igual para un cliente JS y para una app Android que consuma la misma API.

> El header `Authorization` lo suele descartar Apache antes de que PHP lo vea.
> El `.htaccess` de este starter lo reinyecta como `HTTP_AUTHORIZATION` via
> `mod_rewrite` — si moves el proyecto a un hosting sin `.htaccess`, hay que
> resolver eso aparte.

## CORS

`src/public/index.php` manda los headers CORS en toda respuesta y contesta el
preflight `OPTIONS` con 204. El origen permitido sale de `CORS_ORIGIN` (default
`*` para desarrollo; en produccion, el dominio del frontend).

## Configuracion (`.env` en la raiz, no en `src/`)

```bash
APP_PORT=8080
ADMINER_PORT=8081
DB_DATABASE=app
DB_USERNAME=app
DB_PASSWORD=secret
APP_DEBUG=1
CORS_ORIGIN=*
TOKEN_TTL_HORAS=168
```

`App\Core\Database::connection()` lee `DB_*` con `getenv()` dentro del
contenedor (docker-compose las inyecta como `environment:`), no hace falta
editar codigo.

## Comandos (Makefile)

| Comando | Que hace |
|---|---|
| `make install` | Instala Composer si hace falta y levanta los tres contenedores. Una sola vez por proyecto. |
| `make up` / `make down` | Levanta / apaga. `down` **no borra datos**. |
| `make restart` | Reinicia sin rebuildear. |
| `make shell` | `bash` dentro del contenedor `app`. |
| `make db-shell` | Cliente `mysql` conectado a la base del proyecto. |
| `make logs` | Sigue los logs. |
| `make db-import FILE=x.sql` | Aplica un `.sql` a la base ya corriendo, sin recrear el volumen. |
| `make fresh` | Borra `mysql-data` y reaplica `docker/mysql/init/*.sql`. Pide confirmacion. |
| `make composer CMD="require x/y"` | Composer dentro del contenedor. |

## Agregar tablas sin perder datos

`docker/mysql/init/*.sql` solo corre en el primer arranque del volumen. Para
sumar una tabla a un proyecto con datos ya cargados:

1. Guardar el archivo numerado: `docker/mysql/init/02-nombre.sql` (con
   `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE`).
2. `make db-import FILE=docker/mysql/init/02-nombre.sql`

## Arrancar un proyecto real

1. `gh repo create mi-api --template harikirtandas/php-api-docker-starter-apache-mysql-cliente-js --private --clone && cd mi-api`
2. Reemplazar `docker/mysql/init/01-schema.sql` por el schema real.
3. Borrar el slice demo del backend: `Ping`/`Auth`/`Nota` en `Controllers/` y
   `Models/` (`Auth` solo si el proyecto no usa login; si lo usa, adaptar
   `Usuario`/`Token` a las tablas reales), y las rutas del slice en
   `src/public/index.php`.
4. Conservar todo `app/Core/` **y `public/js/api.js`** — el wrapper de fetch
   no depende del dominio (notas, usuarios, lo que sea), solo de la forma
   de las respuestas (`{ error: { mensaje, errores } }`) y del flujo de auth
   (Bearer + login/logout), que es igual para cualquier endpoint que agregues.
5. Reemplazar `public/index.html` + `public/js/app.js` + `public/css/app.css`
   por la pantalla real, usando las funciones de `api.js` (`API.get`,
   `API.post`, `API.login`, etc.) igual que hace el `app.js` de este starter.
6. `make install`.
