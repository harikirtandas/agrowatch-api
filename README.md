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

## API AgroWatchOut — endpoints y contratos (dominio real)

> **Diseño, todavía sin implementar.** Esta sección documenta los endpoints y
> los contratos JSON que va a exponer el dominio real (`docker/mysql/init/01-schema.sql`),
> para guiar la implementación de Controllers/Models. El backend que corre hoy
> sigue siendo el slice demo de la tabla arriba (`Ping`/`Auth`/`Nota`) — nótese
> que `NotaController` ya quedó roto porque la tabla `notas` no existe más en
> el schema; se borra junto con el resto del slice demo cuando se implemente
> esto (ver "Arrancar un proyecto real").
>
> Convenciones para todos los endpoints de esta sección (ya vigentes en el
> slice demo, se mantienen): todo bajo `/api`, JSON en request/response,
> escritura protegida con `Authorization: Bearer <token>`, y errores con la
> forma `{ "error": { "status", "mensaje", "errores"? } }`. Códigos: `200`
> lectura, `201` alta (+ header `Location`), `204` baja o `PUT` sin cuerpo de
> vuelta, `400` body JSON inválido, `401` sin token / token vencido, `404`
> recurso inexistente (o fuera del alcance del usuario), `409` violación de
> `UNIQUE`, `422` validación semántica (campo obligatorio, FK inexistente).

### Tabla de rutas

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| `GET` | `/api/establecimientos` | sí | establecimientos del usuario logueado |
| `POST` | `/api/establecimientos` | sí | crea uno y vincula al usuario como `dueno` |
| `GET` | `/api/establecimientos/{id:\d+}` | sí | uno, si el usuario tiene vínculo |
| `PUT` | `/api/establecimientos/{id:\d+}` | sí | reemplaza (solo `dueno`) |
| `DELETE` | `/api/establecimientos/{id:\d+}` | sí | borra (solo `dueno`) -> 204 |
| `GET` | `/api/lotes?establecimiento_id=` | sí | lotes de ese establecimiento |
| `POST` | `/api/lotes` | sí | crea un lote (solo `dueno`) |
| `GET` | `/api/lotes/{id:\d+}` | sí | uno |
| `PUT` | `/api/lotes/{id:\d+}` | sí | reemplaza (solo `dueno`) |
| `DELETE` | `/api/lotes/{id:\d+}` | sí | borra (solo `dueno`) -> 204 |
| `GET` | `/api/campanias` | sí | todas las campañas |
| `POST` | `/api/campanias` | sí | crea una campaña |
| `GET` | `/api/campanias/{id:\d+}` | sí | una |
| `PUT` | `/api/campanias/{id:\d+}` | sí | reemplaza (incluye cerrarla con `cerrada: true`) |
| `DELETE` | `/api/campanias/{id:\d+}` | sí | borra -> 409 si tiene siembras |
| `GET` | `/api/cultivos` | no | catálogo completo (solo lectura) |
| `GET` | `/api/cultivos/{id:\d+}` | no | uno del catálogo |
| `GET` | `/api/siembras?campania_id=&lote_id=` | sí | siembras, filtros opcionales combinables |
| `POST` | `/api/siembras` | sí | crea una siembra -> 409 si ya existe esa combinación |
| `GET` | `/api/siembras/{id:\d+}` | sí | una, con nombres de lote/cultivo/campaña embebidos |
| `PUT` | `/api/siembras/{id:\d+}` | sí | reemplaza |
| `DELETE` | `/api/siembras/{id:\d+}` | sí | borra -> 204 (cascada a `costos`) |
| `GET` | `/api/siembras/{id:\d+}/costos` | sí | costos cargados a esa siembra |
| `POST` | `/api/siembras/{id:\d+}/costos` | sí | carga un costo -> 201 + `Location: /api/costos/{id}` |
| `PUT` | `/api/costos/{id:\d+}` | sí | reemplaza |
| `DELETE` | `/api/costos/{id:\d+}` | sí | borra -> 204 |
| `GET` | `/api/siembras/{id:\d+}/margen` | sí | costo total, margen y color del semáforo (no persiste nada) |
| `POST` | `/api/sync/cotizaciones` | sí | trae dólar (y cotización de granos) de la API externa |

Rutas literales antes que paramétricas con el mismo prefijo (ej.
`/api/siembras/{id}/margen` antes que un eventual `/api/siembras/{id}` genérico
si se llegaran a anidar más sub-recursos), igual que ya exige el Router.

### Auth (contratos actualizados con `apellido`)

`POST /api/auth/login`

```json
// request
{ "email": "demo@demo.test", "password": "secret" }

// 200
{
  "token": "3f9e2c...",
  "expira": "2026-09-28 12:00:00",
  "usuario": {
    "id": 1, "nombre": "Usuario", "apellido": "Demo",
    "email": "demo@demo.test",
    "created_at": "2026-09-21 10:00:00", "updated_at": "2026-09-21 10:00:00"
  }
}

// 401
{ "error": { "status": 401, "mensaje": "Email o contrasena incorrectos." } }
```

`GET /api/auth/me` -> 200, mismo objeto `usuario` de arriba (sin `password_hash`).

### Establecimientos

`GET /api/establecimientos` -> 200

```json
[
  {
    "id": 1, "nombre": "La Esperanza", "localidad": "Coronel Suarez",
    "provincia": "Buenos Aires", "rol": "dueno",
    "created_at": "2026-09-21 10:00:00", "updated_at": "2026-09-21 10:00:00"
  }
]
```

`POST /api/establecimientos`

```json
// request
{ "nombre": "La Esperanza", "localidad": "Coronel Suarez", "provincia": "Buenos Aires" }

// 201 + Location: /api/establecimientos/1
{
  "id": 1, "nombre": "La Esperanza", "localidad": "Coronel Suarez",
  "provincia": "Buenos Aires", "rol": "dueno",
  "created_at": "2026-09-21 10:00:00", "updated_at": "2026-09-21 10:00:00"
}

// 422 (falta un campo)
{ "error": { "status": 422, "mensaje": "Datos invalidos.", "errores": { "nombre": "Requerido" } } }
```

`GET/PUT /api/establecimientos/{id}` devuelven la misma forma. `DELETE` -> 204.
`404` si el establecimiento no existe o el usuario no tiene fila en
`usuario_establecimiento` para ese id (no se distingue de "no existe": no hay
que filtrar si el establecimiento existe pero es ajeno).

### Lotes

`GET /api/lotes?establecimiento_id=1` -> 200

```json
[
  {
    "id": 1, "establecimiento_id": 1, "nombre": "Lote 1",
    "ha_totales": "85.50", "ha_efectivas": "80.00",
    "lat": "-37.4525000", "lng": "-61.9333000",
    "created_at": "2026-09-21 10:00:00", "updated_at": "2026-09-21 10:00:00"
  }
]
```

Sin `?establecimiento_id=` -> `422 { "errores": { "establecimiento_id": "Requerido" } }`.

`POST /api/lotes`

```json
// request
{ "establecimiento_id": 1, "nombre": "Lote 4", "ha_totales": 62.0, "ha_efectivas": 58.3, "lat": -37.4601, "lng": -61.9420 }

// 201 + Location: /api/lotes/2
```

`lat`/`lng` opcionales (`null` si no vienen). `POST` solo lo puede hacer el
`dueno` del establecimiento (`403` si el usuario es `asesor`); `404` si el
`establecimiento_id` no existe o no es del usuario, misma convencion que
Establecimientos (no se distingue "no existe" de "no es tuyo"). `GET/PUT /{id}`
misma forma, `DELETE` -> 204. `PUT`/`DELETE` tambien son solo `dueno` (`403`
si `asesor`); `PUT` no admite reasignar `establecimiento_id` -- un lote no
cambia de establecimiento por este endpoint.

### Campañas

`GET /api/campanias` -> 200

```json
[
  { "id": 1, "nombre": "2026/27", "fecha_inicio": "2026-09-01", "fecha_fin": "2027-03-31", "cerrada": false, "created_at": "...", "updated_at": "..." }
]
```

`POST /api/campanias`

```json
// request
{ "nombre": "2026/27", "fecha_inicio": "2026-09-01", "fecha_fin": "2027-03-31" }
```

`cerrada` arranca en `false`; se cierra con `PUT { ..., "cerrada": true }`.
`DELETE` -> `409 { "error": { "status": 409, "mensaje": "La campana tiene siembras asociadas." } }`
si `siembras` referencia esa campaña (FK sin `ON DELETE CASCADE` a propósito:
cerrar, no borrar, es la operación esperada sobre una campaña con datos).

### Cultivos (catálogo, solo lectura)

`GET /api/cultivos` -> 200

```json
[
  { "id": 1, "nombre": "Soja", "unidad": "tn", "simbolo_api": "soja", "retencion_pct": "33.00" },
  { "id": 2, "nombre": "Trigo", "unidad": "tn", "simbolo_api": "trigo", "retencion_pct": "12.00" }
]
```

Sin `POST`/`PUT`/`DELETE` en esta iteración: el catálogo se carga por seed
(`01-schema.sql`) y se edita a mano si hace falta.

### Siembras

`GET /api/siembras?campania_id=1&lote_id=2` -> 200 (ambos filtros opcionales,
se pueden combinar o usar el endpoint sin ninguno)

```json
[
  {
    "id": 1, "campania_id": 1, "lote_id": 1, "cultivo_id": 1,
    "cultivo_nombre": "Soja", "lote_nombre": "Lote 1", "campania_nombre": "2026/27",
    "ha_sembradas": "78.00", "fecha_siembra": "2026-10-15",
    "variedad": "DM 53i53", "rinde_esperado": "3200.00",
    "created_at": "...", "updated_at": "..."
  }
]
```

`cultivo_nombre`/`lote_nombre`/`campania_nombre` son campos derivados de un
`JOIN`, solo de lectura — no se mandan en el `POST`/`PUT`.

`POST /api/siembras`

```json
// request
{ "campania_id": 1, "lote_id": 1, "cultivo_id": 1, "ha_sembradas": 78.0, "fecha_siembra": "2026-10-15", "variedad": "DM 53i53", "rinde_esperado": 3200 }

// 409 (ya existe esa combinacion campania+lote+cultivo)
{ "error": { "status": 409, "mensaje": "Ya existe una siembra con ese cultivo para este lote en esta campana." } }
```

`GET/PUT /{id}` misma forma que el `GET` de lista (con los `_nombre`
derivados en el `GET`, sin ellos en el `PUT`). `DELETE` -> 204, borra en
cascada los `costos` de esa siembra.

### Costos

`GET /api/siembras/1/costos` -> 200

```json
[
  {
    "id": 1, "siembra_id": 1, "categoria": "semilla",
    "descripcion": "DM 53i53, bolsa 40kg", "cantidad": "2.00", "unidad": "bolsa",
    "precio_unitario": "45000.00", "moneda": "ARS", "fecha": "2026-10-10",
    "created_at": "...", "updated_at": "..."
  }
]
```

`POST /api/siembras/1/costos`

```json
// request
{ "categoria": "fertilizante", "descripcion": "Urea", "cantidad": 150, "unidad": "kg", "precio_unitario": 950.50, "moneda": "ARS", "fecha": "2026-10-12" }

// 201 + Location: /api/costos/2
```

`categoria` valida contra el `ENUM` de la tabla (`semilla`, `fertilizante`,
`herbicida`, `maquinaria`, `labor`, `flete`, `otro`); otro valor -> `422`.
`moneda` valida `ARS`/`USD`. `PUT /api/costos/{id}` misma forma, `DELETE` -> 204.

### Margen (calculado, no persiste nada)

`GET /api/siembras/1/margen` -> 200

```json
{
  "siembra_id": 1,
  "ha_sembradas": "78.00",
  "costo_total_ars": "8235000.00",
  "costo_por_ha_ars": "105576.92",
  "cotizacion_vigente": { "precio": "380.50", "moneda": "USD", "fecha": "2026-09-20", "mercado": "Chicago" },
  "tipo_cambio_usado": { "tipo": "oficial", "valor": "1050.0000", "fecha": "2026-09-20" },
  "precio_neto_retencion_ars": { "por_unidad": "0.00", "nota": "precio x (1 - retencion_pct/100), convertido a ARS con el tipo de cambio" },
  "rinde_indiferencia_kg_ha": "2450.30",
  "ingreso_esperado_ars": "12480000.00",
  "margen_bruto_ars": "4245000.00",
  "semaforo": "verde",
  "detalle_costos": [
    { "id": 1, "categoria": "semilla", "moneda": "ARS", "importe_original": "90000.00", "importe_ars": "90000.00" }
  ]
}
```

`semaforo` sale de `margen_bruto_ars / ingreso_esperado_ars`: `verde` si
`>= 0.20`, `amarillo` si está entre `0` y `0.20`, `rojo` si `<= 0` (umbrales a
ajustar durante la implementación, no son parte fija del contrato). `422` si
no hay ninguna fila en `cotizaciones` con `fecha <= hoy` para el cultivo de la
siembra (`{ "error": { "status": 422, "mensaje": "No hay cotizacion cargada para este cultivo." } }`),
o si falta el `tipo_cambio` correspondiente a alguna fecha de costo en USD.

### Sync de cotizaciones (integración cloud)

`POST /api/sync/cotizaciones` -> 200

```json
{
  "tipos_cambio_insertados": [
    { "tipo": "oficial", "fecha": "2026-09-21", "valor": "1052.5000" },
    { "tipo": "blue", "fecha": "2026-09-21", "valor": "1210.0000" }
  ],
  "cotizaciones_insertadas": [],
  "ya_existian": ["oficial 2026-09-21", "mep 2026-09-21"]
}
```

Trae `tipos_cambio` desde `https://dolarapi.com/v1/dolares` (sin API key) y,
si la fuente de granos elegida está disponible, `cotizaciones`. Inserta solo
lo que falta (respeta los `UNIQUE`, nunca actualiza una fila existente). Si la
API externa no responde o corta la conexión -> `502 { "error": { "status": 502, "mensaje": "No se pudo contactar la API de cotizaciones." } }`,
sin romper el resto de la aplicación.

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
