// Valores del ENUM de la tabla costos y de la validación de moneda del backend.
const CATEGORIAS = ['semilla', 'fertilizante', 'herbicida', 'maquinaria', 'labor', 'flete', 'otro'];
const MONEDAS = ['ARS', 'USD'];

// "AAAA-MM-DD" en hora LOCAL. toISOString() usa UTC: en Argentina, después
// de las 21 hs ya te daría la fecha de mañana. El formato sueco (sv-SE)
// justo coincide con AAAA-MM-DD.
const hoyISO = () => new Date().toLocaleDateString('sv-SE');

const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

// La API guarda el rinde en kg/ha; en pantalla se usa qq/ha como en el resto
// del diseño (1 quintal = 100 kg).
const KG_POR_QQ = 100;

// Arma las <option> de un select. `deshabilitada(item)` permite mostrar
// opciones que no se pueden elegir (ej. campañas cerradas).
function llenarSelect(select, items, texto, deshabilitada = () => false) {
  select.innerHTML = '<option value="" disabled selected>Elegí una opción</option>' +
    items.map((item) => `<option value="${item.id}" ${deshabilitada(item) ? 'disabled' : ''}>${escapar(texto(item))}</option>`).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await usuarioLogueado())) return;

  const form = document.querySelector('.formulario-siembra');
  const selCampania = document.getElementById('campania');
  const selLote = document.getElementById('lote');
  const selCultivo = document.getElementById('cultivo');
  const inputFecha = document.getElementById('fechaSiembra');
  const inputHa = document.getElementById('hectareasSembradas');
  const inputVariedad = document.getElementById('variedad');
  const inputRinde = document.getElementById('rindeEsperado');
  const cuerpoCostos = document.getElementById('cuerpoCostos');
  const cartelEstado = document.getElementById('estadoSincronizacion');

  const parametros = new URLSearchParams(window.location.search);
  let siembraId = num(parametros.get('siembra')); // null = siembra nueva
  const loteDeLaUrl = num(parametros.get('lote'));

  // Costos tal como están en la base.
  const originales = new Map();
  const borrados = new Set();

  // Mapeo campo de la API -> id del input, para marcar errores.
  const CAMPOS_SIEMBRA = {
    campania_id: 'campania', lote_id: 'lote', cultivo_id: 'cultivo',
    ha_sembradas: 'hectareasSembradas', fecha_siembra: 'fechaSiembra',
    variedad: 'variedad', rinde_esperado: 'rindeEsperado',
  };

  let lotes = [];

  // Carga inicial
  try {
    const [campanias, cultivos, siembra] = await Promise.all([
      API.get('/campanias'),
      API.get('/cultivos'),
      siembraId ? API.get(`/siembras/${siembraId}`) : Promise.resolve(null),
    ]);

    const loteDado = siembra?.lote_id ?? loteDeLaUrl;
    let establecimientoId;
    if (loteDado) {
      establecimientoId = (await API.get(`/lotes/${loteDado}`)).establecimiento_id;
    } else {
      establecimientoId = num(localStorage.getItem('establecimientoActual'))
        ?? (await API.get('/establecimientos'))[0]?.id;
    }
    if (!establecimientoId) {
      Modales.avisoVacio({
            texto: 'Todavía no tenés ningún campo cargado.',
            boton: 'Crear establecimiento',
            accion: 'establecimiento',
        });
        return;
    }
    lotes = await API.get(`/lotes?establecimiento_id=${establecimientoId}`);

    // Las campañas cerradas se ven pero no se eligen (salvo la de la siembra
    // que se está editando, si no el select quedaría vacío).
    llenarSelect(selCampania, campanias,
      (c) => c.nombre + (Number(c.cerrada) ? ' (cerrada)' : ''),
      (c) => Number(c.cerrada) && c.id !== siembra?.campania_id);
    llenarSelect(selLote, lotes, (l) => `${l.nombre} (${formatoNumero(num(l.ha_efectivas), 1)} ha)`);
    llenarSelect(selCultivo, cultivos, (c) => c.nombre);

    if (siembra) {
      selCampania.value = siembra.campania_id;
      selLote.value = siembra.lote_id;
      selCultivo.value = siembra.cultivo_id;
      inputFecha.value = siembra.fecha_siembra;
      inputHa.value = num(siembra.ha_sembradas);
      inputVariedad.value = siembra.variedad ?? '';
      inputRinde.value = siembra.rinde_esperado === null ? '' : num(siembra.rinde_esperado) / KG_POR_QQ;

      document.querySelector('.encabezado-siembra__titulo').textContent = 'Editar siembra';
      form.querySelector('button[type="submit"]').textContent = 'Guardar y ver proyección';
      document.querySelector('.encabezado-siembra__subtitulo').textContent =
        `${siembra.lote_nombre} — ${siembra.cultivo_nombre} · Campaña ${siembra.campania_nombre}`;

      try {
        const costos = await API.get(`/siembras/${siembraId}/costos`);
        costos.forEach((costo) => agregarFilaCosto(costo));
      } catch (error) {
        mostrarError(form, new Error(`No se pudieron cargar los costos: ${error.message}`));
      }
    } else {
      // Por defecto, la campaña abierta más reciente.
      const actual = campanias.filter((c) => !Number(c.cerrada))
        .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))[0];
      if (actual) selCampania.value = actual.id;
      if (loteDeLaUrl) {
        selLote.value = loteDeLaUrl;
        completarHectareas();
      }
      inputFecha.value = hoyISO();
      agregarFilaCosto(); // una fila vacía para arrancar
    }
  } catch (error) {
    mostrarError(form, error);
    return;
  }

  // ---- Eliminar siembra (solo en modo edición) ----
    const botonEliminar = document.getElementById('botonEliminarSiembra');
    botonEliminar.hidden = siembraId === null;
    botonEliminar.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta siembra y todos sus costos? No se puede deshacer.')) return;
    botonEliminar.disabled = true;
    try {
        await API.del(`/siembras/${siembraId}`); // los costos se borran en cascada
        window.location.href = 'dashboard_mi_campo.html';
    } catch (error) {
        mostrarError(form, error);
        botonEliminar.disabled = false;
    }
});

  // Al elegir un lote, si las hectáreas están vacías, se sugieren las efectivas.
  function completarHectareas() {
    const lote = lotes.find((l) => l.id === Number(selLote.value));
    if (lote && inputHa.value === '') inputHa.value = num(lote.ha_efectivas);
  }
  selLote.addEventListener('change', completarHectareas);

  // Tabla de costos

  // Cada input tiene name = nombre exacto del campo en la API. Así leerFila() arma el body sin traducir nada.
  function agregarFilaCosto(costo = null) {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td><select name="categoria" class="campo__entrada" required>
        ${CATEGORIAS.map((c) => `<option value="${c}">${capitalizar(c)}</option>`).join('')}
      </select></td>
      <td><input name="descripcion" class="campo__entrada" maxlength="120" required></td>
      <td><input name="cantidad" type="number" class="campo__entrada" min="0.01" step="0.01" required></td>
      <td><input name="unidad" class="campo__entrada" maxlength="10" placeholder="kg, l, ha" required></td>
      <td><input name="precio_unitario" type="number" class="campo__entrada" min="0" step="0.01" required></td>
      <td><select name="moneda" class="campo__entrada">
        ${MONEDAS.map((m) => `<option value="${m}">${m}</option>`).join('')}
      </select></td>
      <td><input name="fecha" type="date" class="campo__entrada" required></td>
      <td><button type="button" class="boton-quitar" aria-label="Quitar costo">✕</button></td>`;

    if (costo) {
      fila.dataset.id = costo.id;
      fila.querySelectorAll('[name]').forEach((campo) => { campo.value = costo[campo.name]; });
      // Se guarda normalizado con leerFila() (y no el objeto de la API, que trae "2.00" como string) para que la comparación de después sea justa.
      originales.set(costo.id, leerFila(fila));
    } else {
      fila.querySelector('[name="fecha"]').value = inputFecha.value || hoyISO();
    }

    fila.querySelector('.boton-quitar').addEventListener('click', () => {
      if (fila.dataset.id) borrados.add(Number(fila.dataset.id));
      fila.remove();
    });

    cuerpoCostos.append(fila);
    if (!costo) fila.querySelector('[name="descripcion"]').focus();
  }

  function leerFila(fila) {
    const datos = {};
    fila.querySelectorAll('[name]').forEach((campo) => {
      datos[campo.name] = campo.type === 'number' ? Number(campo.value) : campo.value.trim();
    });
    return datos;
  }

  document.querySelector('.enlace-agregar-costo').addEventListener('click', () => agregarFilaCosto());

  // Guardar
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarError(form, null);
    cuerpoCostos.querySelectorAll('.fila--error').forEach((f) => f.classList.remove('fila--error'));
    const boton = e.submitter;
    boton.disabled = true;

    // Foto de las filas en este momento: op.fila apunta a una posición acá.
    const filas = [...cuerpoCostos.rows];

    const envio = {
      siembraId,
      siembraGuardada: false,
      siembra: {
        campania_id: Number(selCampania.value),
        lote_id: Number(selLote.value),
        cultivo_id: Number(selCultivo.value),
        ha_sembradas: Number(inputHa.value),
        fecha_siembra: inputFecha.value,
        variedad: inputVariedad.value.trim() || null,
        // qq/ha en pantalla -> kg/ha en la API (confirmado en CalculoMargen: "el rinde siempre viene en kg/ha").
        rinde_esperado: Number(inputRinde.value) * KG_POR_QQ,
      },
      costos: [
        ...filas.map((fila, i) => {
          const datos = leerFila(fila);
          const id = num(fila.dataset.id);
          if (id === null) return { accion: 'crear', datos, fila: i };
          if (JSON.stringify(datos) !== JSON.stringify(originales.get(id))) {
            return { accion: 'actualizar', id, datos, fila: i };
          }
          return null; // sin cambios: no se manda
        }).filter(Boolean),
        ...[...borrados].map((id) => ({ accion: 'borrar', id })),
      ],
    };

    try {
      const resultado = await Sincronizacion.guardar(envio);
      if (resultado.pendiente) {
        // Se bloquea el form: si lo reenviara, en la cola quedarían dos envíos de la misma siembra y el segundo daría 409.
        form.querySelectorAll('input, select, button').forEach((el) => { el.disabled = true; });
        mostrarEstado('Sin señal: la siembra quedó guardada en este dispositivo y se va a sincronizar sola cuando vuelva la conexión.');
        return;
      }
      window.location.href = `semaforo.html?siembra=${resultado.siembraId}`;
    } catch (error) {
      recordarAvance(envio, filas);
      mostrarErrorDeEnvio(error, filas);
    } finally {
      boton.disabled = form.querySelector('select').disabled; // queda bloqueado solo si quedó pendiente
    }
  });

  // Si falló a mitad de camino, lo que SÍ se guardó tiene que quedar registrado
  function recordarAvance(envio, filas) {
    if (siembraId === null && envio.siembraId !== null) {
      siembraId = envio.siembraId;
      // Si recarga la página, abre en modo edición en vez de crear otra.
      history.replaceState(null, '', `?siembra=${siembraId}`);
      botonEliminar.hidden = false;
    }
    for (const op of envio.costos.filter((o) => o.hecho)) {
      if (op.accion === 'borrar') {
        borrados.delete(op.id);
        continue;
      }
      if (op.accion === 'crear') filas[op.fila].dataset.id = op.id;
      originales.set(op.id, op.datos);
    }
  }

  function mostrarErrorDeEnvio(error, filas) {
    if (error.op?.fila === undefined) {
      // Error de la siembra en sí (422 de un campo, 409 por duplicada...).
      mostrarError(form, error, CAMPOS_SIEMBRA);
      return;
    }
    // Error de un costo: se marca la fila y se dice cuál fue.
    filas[error.op.fila].classList.add('fila--error');
    const detalle = error.errores
      ? Object.entries(error.errores).map(([campo, mensaje]) => `${campo}: ${mensaje}`).join(' · ')
      : error.message;
    const prefijo = siembraId ? 'La siembra se guardó, pero falló el ' : 'Falló el ';
    mostrarError(form, new Error(`${prefijo}costo ${error.op.fila + 1}: ${detalle}`));
  }

  // Cartel de sincronización
  function mostrarEstado(texto) {
    cartelEstado.textContent = texto;
    cartelEstado.hidden = !texto;
  }

  function actualizarCartel({ pendientes, fallidos }) {
    if (fallidos.length > 0) {
      mostrarEstado(`Una siembra guardada sin señal fue rechazada por el servidor: ${fallidos[0].mensaje}`);
    } else if (pendientes > 0) {
      mostrarEstado(`${pendientes} envío(s) esperando señal para sincronizar.`);
    } else if (!navigator.onLine) {
      mostrarEstado('Sin señal: guarda y sincroniza después.');
    } else {
      mostrarEstado('');
    }
  }

  window.addEventListener('sincronizacion', (e) => actualizarCartel(e.detail));
  window.addEventListener('offline', () => actualizarCartel(Sincronizacion.estado()));
  actualizarCartel(Sincronizacion.estado());
});