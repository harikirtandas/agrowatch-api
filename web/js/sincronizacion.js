// sincronizacion.js — guardar una siembra con sus costos, aunque no haya señal.
const Sincronizacion = (() => {
const CLAVE_COLA = 'enviosPendientes';
const CLAVE_FALLIDOS = 'enviosFallidos';

// si alguien rompió el JSON guardado a mano, arrancamos con la lista vacía.
function leer(clave) {
    try {
        return JSON.parse(localStorage.getItem(clave)) ?? [];
    } catch {
        return [];
    }
}
const escribir = (clave, lista) => localStorage.setItem(clave, JSON.stringify(lista));
const esErrorDeRed = (error) => error.status === undefined;

// ejecuta los pasos que falten de un envío.
async function ejecutar(envio, alAvanzar = () => {}) {
    if (!envio.siembraGuardada) {
        if (envio.siembraId === null) {
            const siembra = await API.post('/siembras', envio.siembra);
            envio.siembraId = siembra.id;
        } else {
            await API.put(`/siembras/${envio.siembraId}`, envio.siembra);
        }
        envio.siembraGuardada = true;
        alAvanzar();
    }

    for (const op of envio.costos) {
        if (op.hecho) continue;
        try {
            if (op.accion === 'crear') {
                const costo = await API.post(`/siembras/${envio.siembraId}/costos`, op.datos);
                op.id = costo.id; // la pantalla lo usa para que un reintento haga PUT y no otro POST
            } else if (op.accion === 'actualizar') {
                await API.put(`/costos/${op.id}`, op.datos);
            } else {
                await API.del(`/costos/${op.id}`);
            }
        } catch (error) {
            // Borrar algo que ya no existe es justo lo que queríamos: no es error.
            if (!(op.accion === 'borrar' && error.status === 404)) {
                error.op = op; // para que la pantalla sepa qué costo falló
                throw error;
            }
        }
        op.hecho = true;   
        alAvanzar();
    }                     

    return envio.siembraId; 
}                           

function encolar(envio) {
    escribir(CLAVE_COLA, [...leer(CLAVE_COLA), envio]);
    avisar();
}

// Lo que usa la pantalla. Devuelve { pendiente: false, siembraId } si se guardó, o { pendiente: true } si quedó en cola por falta de señal.
async function guardar(envio) {
if (!navigator.onLine) {
    encolar(envio);
    return { pendiente: true };
}
try {
    return { pendiente: false, siembraId: await ejecutar(envio) };
} catch (error) {
    if (esErrorDeRed(error)) {
    encolar(envio); // con el avance que haya logrado hasta el corte
    return { pendiente: true };
    }
    throw error;
}
}

// Manda la cola, en orden. Corre al cargar la página y cuando vuelve la red.
let sincronizando = false;
async function reintentar() {
if (sincronizando || !navigator.onLine) return;
sincronizando = true;
try {
    const cola = leer(CLAVE_COLA);
    while (cola.length > 0) {
    try {
        await ejecutar(cola[0], () => escribir(CLAVE_COLA, cola));
    } catch (error) {
        if (esErrorDeRed(error)) break;
        escribir(CLAVE_FALLIDOS, [...leer(CLAVE_FALLIDOS), { envio: cola[0], mensaje: error.message }]);
    }
    cola.shift();
    escribir(CLAVE_COLA, cola);
    }
} finally {
    sincronizando = false;
    avisar();
}
}

const estado = () => ({ pendientes: leer(CLAVE_COLA).length, fallidos: leer(CLAVE_FALLIDOS) });

// Las pantallas escuchan este evento para actualizar el cartel de estado.
const avisar = () => window.dispatchEvent(new CustomEvent('sincronizacion', { detail: estado() }));

const descartarFallidos = () => {
escribir(CLAVE_FALLIDOS, []);
avisar();
};

window.addEventListener('online', reintentar);
document.addEventListener('DOMContentLoaded', reintentar);

return { guardar, reintentar, estado, descartarFallidos };
})();