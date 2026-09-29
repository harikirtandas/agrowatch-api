// api.js — wrapper de fetch para consumir la API REST de este starter.
//
// Qué resuelve, en una frase: centraliza las tres cosas que siempre hay que
// repetir a mano cuando consumís una API con fetch puro:
//   1) mandar el token de sesión en cada request que lo necesite,
//   2) convertir la respuesta de error del backend en algo que tu código
//      pueda leer sin parsear JSON a mano en cada catch,
//   3) guardar/borrar el token cuando el usuario entra o sale.
//
// No hay nada de "magia" de framework acá: es el mismo patrón que usarías en
// cualquier proyecto real con fetch. Está pensado para leerse de arriba a
// abajo, así que los comentarios explican el POR QUÉ de cada decisión, no
// solo el QUÉ (eso ya lo dice el código).

const API = (() => {
    // La API corre en su propio contenedor/puerto (servicio `app` del
    // docker-compose), separado del servidor que sirve este HTML (servicio
    // `web`) a propósito: backend y frontend deben poder ejecutarse y
    // deployarse de forma independiente, y la única comunicación entre
    // ambos debe ser HTTP contra la API. Por eso cada página define
    // `window.API_BASE_URL` en un <script> ANTES de cargar este archivo, y
    // acá solo caemos a la ruta relativa '/api' como fallback si por algún
    // motivo esa variable no está.
    const BASE_URL = window.API_BASE_URL || '/api';

    // Clave que usamos en localStorage. La sacamos a una constante para no
    // repetir el string 'token' suelto en cinco lugares distintos y arriesgar
    // un typo que rompa la sesión en silencio.
    const CLAVE_TOKEN = 'token';

    // El token vive en dos lugares a la vez:
    //   - localStorage: sobrevive a un F5 o a cerrar y volver a abrir la pestaña.
    //   - esta variable en memoria: para no leer localStorage en cada request.
    // Al cargar el script, se inicializa con lo que haya quedado guardado de
    // una sesión anterior (si hay, el usuario sigue "logueado" al recargar).
    let token = localStorage.getItem(CLAVE_TOKEN);

    // Guarda o borra el token, en memoria y en localStorage a la vez, para que
    // nunca queden desincronizados entre sí. Pasar null/undefined cierra la
    // sesión del lado del cliente.
    function guardarToken(nuevoToken) {
        token = nuevoToken || null;
        if (token) {
            localStorage.setItem(CLAVE_TOKEN, token);
        } else {
            localStorage.removeItem(CLAVE_TOKEN);
        }
    }

    // -------------------------------------------------------------------
    // request(): el corazón del wrapper. Arma y manda el fetch, y traduce
    // la respuesta a algo fácil de usar. get/post/put/patch/del de más abajo
    // son solo atajos que le fijan el verbo — nunca llames a request()
    // directo desde afuera de este archivo.
    //
    // Parámetros:
    //   metodo  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    //   ruta    path relativo a /api, ej: '/notas' o '/notas/3'
    //   body    objeto a mandar como JSON (opcional; se ignora en GET/DELETE)
    //
    // Devuelve una Promise que resuelve con el JSON ya parseado (o null si
    // la respuesta fue 204 No Content, típico de un DELETE exitoso).
    //
    // Si la respuesta no es 2xx, la Promise se RECHAZA con un Error que trae
    // dos propiedades extra pegadas encima:
    //   error.status   el código HTTP (401, 404, 422, 500, ...)
    //   error.errores  objeto { campo: "mensaje" } SOLO si el backend mandó
    //                  errores de validación (422); en cualquier otro caso
    //                  queda en null.
    // -------------------------------------------------------------------
    async function request(metodo, ruta, body) {
        const headers = {
            'Content-Type': 'application/json',
        };

        // Si hay sesión iniciada, mandamos el token en TODAS las requests,
        // no solo en las que "sabemos" que son protegidas. Al backend no le
        // molesta recibir un Authorization de más en una ruta pública (lo
        // ignora) — y así esta función no tiene que saber cuáles endpoints
        // necesitan auth y cuáles no: esa decisión ya la toma el backend.
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const opciones = { method: metodo, headers };

        // GET y DELETE normalmente no llevan body. Si no nos pasaron uno
        // (body === undefined), directamente no lo agregamos a las opciones:
        // fetch no manda un body vacío raro, simplemente no hay body.
        if (body !== undefined) {
            opciones.body = JSON.stringify(body);
        }

        const respuesta = await fetch(BASE_URL + ruta, opciones);

        // 204 No Content: no hay body que parsear (lo devuelve, por ejemplo,
        // un DELETE exitoso — ver NotaController::destroy() en el backend).
        // Si intentáramos leerlo como JSON igual, fallaría — cortamos acá.
        if (respuesta.status === 204) {
            return null;
        }

        // .json() puede fallar si el body no es JSON válido — por ejemplo,
        // si algo intermedio (Apache, un proxy) devolvió HTML de error en
        // vez de pasar por nuestro backend. El .catch(() => null) evita que
        // ESE fallo tape el error "real" que armamos más abajo.
        const datos = await respuesta.json().catch(() => null);

        // response.ok es true para códigos 200-299. Cualquier otra cosa la
        // tratamos como error, sea que lo haya armado nuestro backend o que
        // ni siquiera haya llegado a PHP (por ejemplo, un 502 de Apache).
        if (!respuesta.ok) {
            // Este starter siempre devuelve los errores con esta forma
            // (ver App\Core\ApiException y el set_exception_handler de
            // public/index.php en el backend):
            //
            //   { "error": { "status": 422, "mensaje": "...", "errores": {...} } }
            //
            // "errores" (plural) solo viene en validaciones (422) y es un
            // objeto { nombreDelCampo: "mensaje de ese campo" }. En el resto
            // de los errores (401, 404, 500) no viene, por eso el `|| null`.
            const mensaje = datos?.error?.mensaje || `Error HTTP ${respuesta.status}`;
            const error = new Error(mensaje);
            error.status = respuesta.status;
            error.errores = datos?.error?.errores || null;
            throw error;
        }

        return datos;
    }

    // ---- atajos por verbo HTTP ------------------------------------------
    // "delete" es palabra reservada en JavaScript, por eso el atajo se llama
    // del() y no delete() — mismo motivo por el que el backend PHP tiene un
    // método destroy() en vez de delete().

    const get = (ruta) => request('GET', ruta);
    const post = (ruta, body) => request('POST', ruta, body);
    const put = (ruta, body) => request('PUT', ruta, body);
    const patch = (ruta, body) => request('PATCH', ruta, body);
    const del = (ruta) => request('DELETE', ruta);

    // ---- sesión ----------------------------------------------------------

    // Inicia sesión contra POST /api/auth/login, guarda el token si el login
    // sale bien, y devuelve el usuario autenticado (así quien llama no tiene
    // que volver a pedirlo con un GET /auth/me aparte).
    //
    // Si el login falla (401 credenciales inválidas, 422 campos vacíos), esta
    // función NO atrapa el error — lo deja pasar tal cual lo arma request(),
    // para que quien la llama decida qué mostrarle al usuario. Por eso en
    // app.js el llamado a login() está dentro de un try/catch.
    async function login(email, password) {
        const respuesta = await post('/auth/login', { email, password });
        guardarToken(respuesta.token);
        return respuesta.usuario;
    }

    // Cierra la sesión. Avisa al backend (POST /auth/logout invalida el
    // token del lado del servidor, borrando la fila en la tabla `tokens`) y,
    // pase lo que pase con esa llamada, borra el token local.
    //
    // El try/catch/finally acá es a propósito: si el aviso al servidor falla
    // (se cortó la red, el token ya había vencido y el servidor ya lo había
    // borrado solo, etc.) igual queremos que el cliente "olvide" la sesión —
    // no tendría sentido dejar a alguien trabado con una sesión rota porque
    // el logout no pudo avisarle al servidor.
    async function logout() {
        try {
            await post('/auth/logout');
        } catch (error) {
            // Ignorado a propósito, ver comentario de arriba.
        } finally {
            guardarToken(null);
        }
    }

    // true si hay un token guardado localmente. OJO: esto NO garantiza que
    // el token siga siendo válido del lado del servidor (puede haber
    // vencido, o haberse invalidado desde otra pestaña). Para saber si
    // sigue sirviendo, hay que usarlo de verdad — por eso app.js, al
    // arrancar, hace un GET /auth/me y recién ahí decide si mostrar la
    // sesión o pedir login de nuevo.
    const haySesion = () => !!token;

    // ---- lo único que este módulo expone hacia afuera --------------------
    return { get, post, put, patch, del, login, logout, haySesion };
})();
