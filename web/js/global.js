// Funciones que se van a usar en varias partes del sistema.

//Lee el valor de un input por su id, sin dejar espacios.
const valor = (id) =>
    document.getElementById(id).value.trim();

// Pasamos a numero el Decimal que devuelve la API como string.
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const formatoNumero = (n, decimales = 0) =>
    n === null || Number.isNaN(n) ? '-' : n.toLocaleString('es-ES', { minimumFractionDigits: decimales });

// Escapamos texto antes de meterlo en innerHTML para evitar inyecciones de código.
function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

// Devuelve el usuario logueado o manda a login si no hay usuario logueado.
//haySesion() solo dice si hay un token, no si el token es valido.
async function usuarioLogueado() {
    if (!API.haySesion()) {
        window.location.href = '/login.html';
        return null;
    }
    try {
        const { usuario} = await API.get('/auth/me');
        return usuario;
    } catch (error) {
        if (error.status === 401) {
            window.location.href = '/login.html';
            return null;
        }
        throw error;
    }
}

// Muestra un mensaje de error de la API al pie del formulario. Se marca con rojo el input con problema y se traduce el nombre
// del campo en la API al id del input en el formulario.
function mostrarError(form, error, campos = {}){
    let caja = form.querySelector('.mensaje-error');
    if (!caja) {
        caja = document.createElement('p');
        caja.className = 'mensaje-error';
        caja.setAttribute('role', 'alert');
        form.append(caja);
    }
    form.querySelectorAll('.campo__entrada--error').forEach((input) => input.classList.remove('campo__entrada--error'));

    if (!error) {
        caja.textContent = '';
        return;
    }

    if (error.status === 422 && error.errores) {
        caja.textContent = Object.entries(error.errores).map(([campo, mensaje]) => {
            const input = campos[campo] ? document.getElementById(campos[campo]) : null;
            input?.classList.add('campo__entrada--error');
            return `${input?.labels?.[0].textContent ?? campo}: ${mensaje}`;
        }).join(' . ');
    } else {
        caja.textContent = error.mensaje;
    }
}