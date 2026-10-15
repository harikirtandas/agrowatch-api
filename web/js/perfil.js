const fechaCorta = (iso) => iso.split('-').reverse().join('/');

// Mensaje verde de "guardado" (mostrarError es para errores, en rojo).
// Se borra solo a los 3 segundos.
function mostrarOk(form, texto) {
  mostrarError(form, null);
  let caja = form.querySelector('.mensaje-ok');
  if (!caja) {
    caja = document.createElement('p');
    caja.className = 'mensaje-ok';
    caja.setAttribute('role', 'status');
    form.append(caja);
  }
  caja.textContent = texto;
  setTimeout(() => { caja.textContent = ''; }, 3000);
}

document.addEventListener('DOMContentLoaded', async () => {
  const usuario = await usuarioLogueado();
  if (!usuario) return;

  // 1) Mis datos (solo lectura: no hay endpoint para editarlos todavía)
  document.getElementById('nombre').value = usuario.nombre;
  document.getElementById('apellido').value = usuario.apellido;
  document.getElementById('email').value = usuario.email;

  // 2) Establecimiento
  const formEst = document.getElementById('formEstablecimiento');
  const selector = document.getElementById('selectorEstablecimientoPerfil');
  let establecimientos = await API.get('/establecimientos');

  if (establecimientos.length === 0) {
    formEst.innerHTML = '<p>Todavía no tenés establecimientos. <a href="configuracion_de_campos.html">Crear uno</a></p>';
  } else {
    selector.innerHTML = establecimientos
      .map((e) => `<option value="${e.id}">${escapar(e.nombre)}</option>`)
      .join('');
    // Arranca con el mismo que está elegido en el panel.
    const guardado = localStorage.getItem('establecimientoActual');
    selector.value = establecimientos.some((e) => String(e.id) === guardado) ? guardado : String(establecimientos[0].id);

    // Muestra en los inputs los datos del establecimiento elegido en el select.
    function mostrarEstablecimiento() {
      const e = establecimientos.find((x) => String(x.id) === selector.value);
      document.getElementById('establecimiento').value = e.nombre;
      document.getElementById('provincia').value = e.provincia;
      document.getElementById('localidad').value = e.localidad;
      document.getElementById('editarLotes').href = `configuracion_de_campos.html?establecimiento=${e.id}`;
      // Solo el dueño puede modificarlo (un asesor solo lo ve; el backend daría 403).
      const esDueno = e.rol === 'dueno';
      formEst.querySelectorAll('input, button[type="submit"]').forEach((el) => { el.disabled = !esDueno; });
      mostrarError(formEst, null);
    }

    selector.addEventListener('change', () => {
      localStorage.setItem('establecimientoActual', selector.value); // el panel también lo usa
      mostrarEstablecimiento();
    });
    mostrarEstablecimiento();

    formEst.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      mostrarError(formEst, null);
      const boton = ev.submitter;
      boton.disabled = true;
      try {
        const actualizado = await API.put(`/establecimientos/${selector.value}`, {
          nombre: valor('establecimiento'),
          provincia: valor('provincia'),
          localidad: valor('localidad'),
        });
        // Se actualiza la copia local y el texto de la opción del select.
        establecimientos = establecimientos.map((x) => (x.id === actualizado.id ? actualizado : x));
        selector.selectedOptions[0].textContent = actualizado.nombre;
        mostrarOk(formEst, 'Cambios guardados.');
      } catch (error) {
        mostrarError(formEst, error, { nombre: 'establecimiento', provincia: 'provincia', localidad: 'localidad' });
      } finally {
        boton.disabled = false;
      }
    });
  }

  // 3) Campañas (11.7). Son compartidas por TODOS los usuarios y de alta manual
  // en la base (no se crean desde la app), asi que esta pantalla es de solo
  // lectura: no se cierran, no se reabren y no se eliminan desde el perfil.
  // Antes habia botones de Cerrar/Reabrir/Eliminar, pero cualquier usuario
  // logueado podia cambiarle el estado a una campania que afecta a todos los
  // demas (el backend tampoco filtra por usuario: la campania no tiene dueno),
  // asi que la vista ya no ofrece esa accion.
  const lista = document.getElementById('listaCampanias');
  const campaniasMensajes = document.getElementById('campaniasMensajes');

  // Trae las campañas y dibuja la lista (la más reciente primero).
  async function cargarCampanias() {
    let campanias;
    try {
      campanias = await API.get('/campanias');
    } catch (error) {
      // Antes el unico error posible era el de cerrar/eliminar; ahora el GET es
      // la unica llamada de esta tarjeta, asi que se muestra igual en la caja.
      mostrarError(campaniasMensajes, error);
      return;
    }
    campanias.sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));

    if (campanias.length === 0) {
      lista.innerHTML = '<li class="lista-campanias__vacia">No hay campañas cargadas.</li>';
      return;
    }

    lista.innerHTML = campanias.map((c) => {
      const cerrada = Boolean(Number(c.cerrada)); // puede llegar 0/1
      return `
        <li class="lista-campanias__item" data-id="${c.id}">
          <span class="lista-campanias__nombre">${escapar(c.nombre)}</span>
          <span class="lista-campanias__fechas">${fechaCorta(c.fecha_inicio)} – ${fechaCorta(c.fecha_fin)}</span>
          <span class="etiqueta-rol ${cerrada ? 'etiqueta-rol--asesor' : 'etiqueta-rol--dueno'}">${cerrada ? 'Cerrada' : 'Abierta'}</span>
        </li>`;
    }).join('');
  }

  await cargarCampanias();
});
