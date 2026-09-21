// app.js — cliente demo que usa api.js. Todo pasa por fetch + async/await vía
// el objeto API y actualiza el DOM sin recargar la página. Reemplazable
// entero en un proyecto real (a diferencia de api.js, que sí conviene
// conservar como base).

const $ = (sel) => document.querySelector(sel);

// --- estado de la API (endpoints públicos, sin auth) ---
async function chequearEstado() {
    try {
        const ping = await API.get('/ping');
        $('#ping').textContent = ping.pong ? `ok (${ping.hora})` : 'raro';
    } catch (e) {
        $('#ping').textContent = 'sin respuesta';
    }
    try {
        const db = await API.get('/health/db');
        $('#db').textContent = db.db;
    } catch (e) {
        $('#db').textContent = e.message;
    }
}

// --- login / logout ---
$('#login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    $('#login-msg').textContent = '';
    try {
        // API.login ya se encarga de guardar el token — acá solo usamos el
        // usuario que devuelve para actualizar la pantalla.
        const usuario = await API.login(f.email.value, f.password.value);
        mostrarSesion(usuario);
        await cargarNotas();
    } catch (e) {
        $('#login-msg').textContent = e.message;
    }
});

$('#logout').addEventListener('click', async () => {
    // API.logout ya avisa al backend y borra el token pase lo que pase.
    await API.logout();
    $('#notas-card').classList.add('oculto');
    $('#login-card').classList.remove('oculto');
});

function mostrarSesion(usuario) {
    $('#login-card').classList.add('oculto');
    $('#notas-card').classList.remove('oculto');
    $('#notas-card h2').firstChild.textContent = `Notas de ${usuario.nombre} `;
}

// --- CRUD de notas ---
async function cargarNotas() {
    const r = await API.get('/notas');
    render(r.datos);
}

function render(notas) {
    const ul = $('#notas');
    ul.innerHTML = '';
    if (notas.length === 0) {
        ul.innerHTML = '<li class="vacio">Sin notas todavía.</li>';
        return;
    }
    for (const n of notas) {
        ul.appendChild(renderFila(n));
    }
}

// Cada nota se renderiza en modo "vista" (título + cuerpo + botones editar/
// borrar). "editar" la cambia a modo "edición" (inputs + guardar/cancelar)
// sin tocar las demás filas ni recargar la lista entera.
function renderFila(nota) {
    const li = document.createElement('li');
    li.dataset.id = nota.id;
    pintarVista(li, nota);
    return li;
}

function pintarVista(li, nota) {
    li.innerHTML = `
        <strong></strong><span></span>
        <button class="link" data-accion="editar">editar</button>
        <button class="link" data-accion="borrar">borrar</button>
    `;
    li.querySelector('strong').textContent = nota.titulo;
    li.querySelector('span').textContent = nota.cuerpo;

    li.querySelector('[data-accion="editar"]')
        .addEventListener('click', () => pintarEdicion(li, nota));

    li.querySelector('[data-accion="borrar"]').addEventListener('click', async () => {
        await API.del(`/notas/${nota.id}`);
        await cargarNotas();
    });
}

// Modo edición: dos inputs precargados con los valores actuales + guardar/
// cancelar. "guardar" manda un PATCH con los dos campos — el backend de este
// starter registra PATCH y PUT contra el mismo método (reemplazo completo,
// no un merge parcial de campos), así que igual hay que mandar los dos.
function pintarEdicion(li, nota) {
    li.innerHTML = `
        <input type="text" class="edit-titulo" value="" maxlength="120">
        <input type="text" class="edit-cuerpo" value="">
        <button data-accion="guardar">guardar</button>
        <button class="link" data-accion="cancelar">cancelar</button>
    `;
    li.querySelector('.edit-titulo').value = nota.titulo;
    li.querySelector('.edit-cuerpo').value = nota.cuerpo;

    li.querySelector('[data-accion="cancelar"]')
        .addEventListener('click', () => pintarVista(li, nota));

    li.querySelector('[data-accion="guardar"]').addEventListener('click', async () => {
        const titulo = li.querySelector('.edit-titulo').value;
        const cuerpo = li.querySelector('.edit-cuerpo').value;
        try {
            const actualizada = await API.patch(`/notas/${nota.id}`, { titulo, cuerpo });
            pintarVista(li, actualizada);
        } catch (e) {
            alert(e.errores ? JSON.stringify(e.errores) : e.message);
        }
    });
}

$('#nota-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    try {
        await API.post('/notas', { titulo: f.titulo.value, cuerpo: f.cuerpo.value });
        f.reset();
        await cargarNotas();
    } catch (e) {
        alert(e.errores ? JSON.stringify(e.errores) : e.message);
    }
});

// --- arranque ---
chequearEstado();
if (API.haySesion()) {
    // Tener un token guardado no garantiza que siga siendo válido (puede
    // haber vencido). GET /auth/me lo confirma contra el servidor; si
    // responde 401, limpiamos el token local en vez de quedarnos con uno
    // que ya no sirve.
    API.get('/auth/me')
        .then((r) => {
            mostrarSesion(r.usuario);
            return cargarNotas();
        })
        .catch(() => API.logout());
}
