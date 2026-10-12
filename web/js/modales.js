// modales.js — ventanas emergentes para crear cosas sin cambiar de pantalla.
//
// Los botones de la barra superior (navbar.js) llaman a Modales.abrir('...').
// Toda la ventana se arma acá, así funciona igual en cualquier pantalla y se
// define en un solo lugar.

const Modales = (() => {
    // La ventana se crea una sola vez y se reusa: se muestra y se esconde, no
    // se destruye y recrea en cada apertura.
    let caja = null;
    let foco = null; // a qué elemento devolver el foco al cerrar

    function armarEsqueleto() {
        caja = document.createElement('div');
        caja.className = 'modal-agro';
        caja.hidden = true;
        caja.innerHTML = `
            <div class="modal-agro__fondo" data-cerrar></div>
            <div class="modal-agro__caja" role="dialog" aria-modal="true" aria-labelledby="modalAgroTitulo">
                <div class="modal-agro__cabecera">
                    <h2 id="modalAgroTitulo"></h2>
                    <button type="button" class="modal-agro__cerrar" data-cerrar aria-label="Cerrar">✕</button>
                </div>
                <form class="modal-agro__cuerpo" id="modalAgroForm" novalidate></form>
                <div class="modal-agro__pie" id="modalAgroPie"></div>
            </div>
        `;
        document.body.append(caja);

        caja.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-cerrar]')) cerrar();
        });
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && !caja.hidden) cerrar();
        });
    }

    function cerrar() {
        if (!caja) return;
        caja.hidden = true;
        foco?.focus();
        foco = null;
    }

    // ---------- Definición de cada ventana ----------
    const VENTANAS = {
        establecimiento: {
            titulo: 'Nuevo establecimiento',
            continuaEn: 'siembra', // a dónde lleva "Guardar y continuar"
            campos: `
                <div class="campo campo--tres">
                    <div>
                        <label class="campo__etiqueta" for="mNombre">Nombre del establecimiento</label>
                        <input class="campo__entrada" id="mNombre" maxlength="100" placeholder="Ej. Las Carmelitas" required>
                    </div>
                    <div>
                        <label class="campo__etiqueta" for="mProvincia">Provincia</label>
                        <input class="campo__entrada" id="mProvincia" maxlength="60" placeholder="Ej. Buenos Aires" required>
                    </div>
                    <div>
                        <label class="campo__etiqueta" for="mLocalidad">Localidad</label>
                        <input class="campo__entrada" id="mLocalidad" maxlength="100" placeholder="Ej. Tres Arroyos" required>
                    </div>
                </div>

                <div class="campo">
                    <div class="modal-agro__filaTitulo">
                        <label class="campo__etiqueta">Lotes / parcelas</label>
                        <button type="button" class="modal-agro__agregar" id="mAgregarLote">+ Agregar lote</button>
                    </div>
                    <div class="lote-fila lote-fila--encabezado">
                        <span>Lote</span><span>Ha totales</span><span>Ha efectivas</span><span>Ubicación</span><span></span>
                    </div>
                    <div id="mLotes"></div>
                </div>

                <div class="campo">
                    <div class="modal-agro__filaTitulo">
                        <label class="campo__etiqueta">Mapa</label>
                        <button type="button" class="boton-ubicar" id="mUbicarCampo">
                            <span>Ubicar el establecimiento</span>
                        </button>
                    </div>
                    <p class="modal-agro__pista" id="mPista"></p>
                    <div class="modal-agro__mapa" id="mMapa"></div>
                </div>
            `,
            errores: { nombre: 'mNombre', provincia: 'mProvincia', localidad: 'mLocalidad' },

            // Se ejecuta después de pintar el formulario.
            alAbrir(form, estado) {
                estado.ubicacion = null;      // {lat,lng} del establecimiento
                estado.marcadorEst = null;
                estado.lotes = [];            // [{fila, lat, lng, marcador}]
                estado.objetivo = null;       // null = el establecimiento; si no, un lote

                const pista = form.querySelector('#mPista');
                const botonCampo = form.querySelector('#mUbicarCampo');

                const mapa = Mapa.crearMapa('mMapa');
                estado.mapa = mapa;

                const nombreDe = (lote) => lote.fila.querySelector('[data-lote="nombre"]').value.trim();

                // Dice qué se va a marcar con el próximo clic en el mapa.
                function cambiarObjetivo(lote) {
                    estado.objetivo = lote;
                    botonCampo.classList.toggle('boton-ubicar--activo', lote === null);
                    estado.lotes.forEach((l) => {
                        l.fila.querySelector('.boton-ubicar')
                            .classList.toggle('boton-ubicar--activo', l === lote);
                    });
                    pista.textContent = lote === null
                        ? 'Tocá el mapa para ubicar el establecimiento.'
                        : `Tocá el mapa para ubicar "${nombreDe(lote) || 'el lote'}".`;
                }

                function ubicarEstablecimiento(lat, lng) {
                    estado.ubicacion = { lat, lng };
                    if (estado.marcadorEst) {
                        estado.marcadorEst.setLatLng([lat, lng]);
                    } else {
                        estado.marcadorEst = L.marker([lat, lng]).addTo(mapa).bindTooltip('Establecimiento');
                    }
                    botonCampo.classList.add('boton-ubicar--ubicado');
                    botonCampo.querySelector('span').textContent = 'Establecimiento ubicado';
                }

                function ubicarLote(lote, lat, lng) {
                    lote.lat = lat;
                    lote.lng = lng;
                    lote.marcador?.remove();
                    lote.marcador = Mapa.marcadorLote(lat, lng)
                        .bindTooltip(nombreDe(lote) || 'Lote')
                        .addTo(mapa);
                    const boton = lote.fila.querySelector('.boton-ubicar');
                    boton.classList.add('boton-ubicar--ubicado');
                    boton.querySelector('span').textContent = 'Ubicado';
                    cambiarObjetivo(null); // vuelve al establecimiento
                }

                // Un solo manejador para todo el mapa: coloca lo que esté
                // marcado como objetivo en ese momento.
                mapa.on('click', (e) => {
                    const lat = Mapa.redondear(e.latlng.lat);
                    const lng = Mapa.redondear(e.latlng.lng);
                    if (estado.objetivo) ubicarLote(estado.objetivo, lat, lng);
                    else ubicarEstablecimiento(lat, lng);
                });

                botonCampo.addEventListener('click', () => cambiarObjetivo(null));

                function agregarLote() {
                    const fila = document.createElement('div');
                    fila.className = 'lote-fila';
                    fila.innerHTML = `
                        <input class="campo__entrada" data-lote="nombre" maxlength="60" placeholder="Lote 1">
                        <input class="campo__entrada" data-lote="totales" type="number" min="0" step="0.01" placeholder="90">
                        <input class="campo__entrada" data-lote="efectivas" type="number" min="0" step="0.01" placeholder="85">
                        <button type="button" class="boton-ubicar"><span>Ubicar</span></button>
                        <button type="button" class="lote-fila__quitar" aria-label="Quitar lote">✕</button>
                    `;
                    const lote = { fila, lat: null, lng: null, marcador: null };
                    estado.lotes.push(lote);

                    fila.querySelector('.boton-ubicar').addEventListener('click', () => cambiarObjetivo(lote));
                    fila.querySelector('.lote-fila__quitar').addEventListener('click', () => {
                        lote.marcador?.remove();
                        estado.lotes.splice(estado.lotes.indexOf(lote), 1);
                        if (estado.objetivo === lote) cambiarObjetivo(null);
                        fila.remove();
                    });

                    form.querySelector('#mLotes').append(fila);
                }

                form.querySelector('#mAgregarLote').addEventListener('click', agregarLote);
                agregarLote();        // arranca con una fila
                cambiarObjetivo(null); // por defecto se ubica el establecimiento

                // Leaflet mide mal el contenedor si todavía no terminó de
                // dibujarse; este respiro lo obliga a recalcular el tamaño.
                setTimeout(() => mapa.invalidateSize(), 60);
            },

            // Lee las filas y devuelve solo las que tengan algo cargado.
            // Tira un Error con el motivo si alguna está incompleta o mal.
            leerLotes(estado) {
                const lista = [];
                estado.lotes.forEach((lote, i) => {
                    const dato = (k) => lote.fila.querySelector(`[data-lote="${k}"]`).value.trim();
                    const nombre = dato('nombre');
                    const totales = dato('totales');
                    const efectivas = dato('efectivas');

                    if (!nombre && !totales && !efectivas) return; // fila vacía: se ignora

                    if (!nombre || !totales || !efectivas) {
                        throw new Error(`Al lote ${i + 1} le faltan datos: nombre, hectáreas totales y efectivas.`);
                    }
                    if (Number(efectivas) > Number(totales)) {
                        throw new Error(`En "${nombre}" las hectáreas efectivas no pueden superar a las totales.`);
                    }
                    lista.push({
                        nombre,
                        ha_totales: Number(totales),
                        ha_efectivas: Number(efectivas),
                        lat: lote.lat,
                        lng: lote.lng,
                    });
                });
                return lista;
            },

            async guardar(form, estado) {
                const lotes = this.leerLotes(estado); // puede tirar Error con el motivo

                const establecimiento = await API.post('/establecimientos', {
                    nombre: valor('mNombre'),
                    provincia: valor('mProvincia'),
                    localidad: valor('mLocalidad'),
                    lat: estado.ubicacion?.lat ?? null,
                    lng: estado.ubicacion?.lng ?? null,
                });

                // Los lotes se crean uno por uno: la API no tiene alta masiva.
                for (const lote of lotes) {
                    await API.post('/lotes', { establecimiento_id: establecimiento.id, ...lote });
                }
                return establecimiento;
            },
        },

        lote: {
            titulo: 'Nuevo lote',
            campos: `
                <div class="campo">
                    <label class="campo__etiqueta" for="mEst">Establecimiento</label>
                    <select class="campo__entrada" id="mEst"><option>Cargando...</option></select>
                </div>

                <div class="campo campo--tres">
                    <div>
                        <label class="campo__etiqueta" for="mLoteNombre">Nombre del lote</label>
                        <input class="campo__entrada" id="mLoteNombre" maxlength="60" placeholder="Ej. La Loma" required>
                    </div>
                    <div>
                        <label class="campo__etiqueta" for="mLoteTotales">Hectareas totales</label>
                        <input class="campo__entrada" id="mLoteTotales" type="number" min="0" step="0.01" placeholder="90" required>
                    </div>
                    <div>
                        <label class="campo__etiqueta" for="mLoteEfectivas">Hectareas efectivas</label>
                        <input class="campo__entrada" id="mLoteEfectivas" type="number" min="0" step="0.01" placeholder="85" required>
                    </div>
                </div>

                <div class="campo">
                    <label class="campo__etiqueta">Ubicacion del lote <span class="campo__opcional">(opcional - hace clic en el mapa)</span></label>
                    <p class="modal-agro__pista" id="mPista">Tocá el mapa para ubicar el lote.</p>
                    <div class="modal-agro__mapa" id="mMapa"></div>
                </div>
            `,
            errores: {
                establecimiento_id: 'mEst',
                nombre: 'mLoteNombre',
                ha_totales: 'mLoteTotales',
                ha_efectivas: 'mLoteEfectivas',
            },

            // async: hay que ir a buscar los establecimientos a la API. El modal
            // ya se mostro, asi que se completa el selector cuando llega.
            async alAbrir(form, estado) {
                estado.ubicacion = null;

                // Se arma a mano (y no con Mapa.selectorPunto) para usar el
                // MISMO marcador que los lotes del modal de establecimiento:
                // selectorPunto pone el pin azul por defecto de Leaflet, y un
                // lote tiene que verse igual se cree desde donde se cree.
                const mapa = Mapa.crearMapa('mMapa');
                let marcador = null;

                mapa.on('click', (e) => {
                    const lat = Mapa.redondear(e.latlng.lat);
                    const lng = Mapa.redondear(e.latlng.lng);
                    estado.ubicacion = { lat, lng };
                    marcador?.remove();
                    marcador = Mapa.marcadorLote(lat, lng)
                        .bindTooltip(valor('mLoteNombre') || 'Lote')
                        .addTo(mapa);
                    form.querySelector('#mPista').textContent = `Ubicado en ${lat}, ${lng} — tocá otro punto para moverlo.`;
                });

                setTimeout(() => mapa.invalidateSize(), 60);

                const selector = form.querySelector('#mEst');
                try {
                    // Solo los propios: la API devuelve 403 si un asesor intenta
                    // crear un lote en un establecimiento que no es suyo.
                    const propios = (await API.get('/establecimientos')).filter((e) => e.rol === 'dueno');

                    if (propios.length === 0) {
                        selector.innerHTML = '<option value="">No tenés establecimientos propios</option>';
                        mostrarError(form, new Error('Primero creá un establecimiento con el boton de al lado.'));
                        return;
                    }

                    selector.innerHTML = propios
                        .map((e) => `<option value="${e.id}" data-lat="${e.lat ?? ''}" data-lng="${e.lng ?? ''}">${escapar(e.nombre)} — ${escapar(e.localidad)}</option>`)
                        .join('');

                    // Centrar el mapa donde esta el establecimiento elegido.
                    const centrar = () => {
                        const op = selector.selectedOptions[0];
                        const lat = Number(op?.dataset.lat);
                        const lng = Number(op?.dataset.lng);
                        if (op?.dataset.lat && op?.dataset.lng) mapa.setView([lat, lng], Mapa.ZOOM_CERCA);
                    };
                    selector.addEventListener('change', centrar);
                    centrar();
                } catch (error) {
                    selector.innerHTML = '<option value="">No se pudieron cargar</option>';
                    mostrarError(form, error);
                }
            },

            async guardar(form, estado) {
                const totales = valor('mLoteTotales');
                const efectivas = valor('mLoteEfectivas');
                if (totales && efectivas && Number(efectivas) > Number(totales)) {
                    throw new Error('Las hectareas efectivas no pueden superar a las totales.');
                }

                return API.post('/lotes', {
                    establecimiento_id: Number(valor('mEst')),
                    nombre: valor('mLoteNombre'),
                    ha_totales: Number(totales),
                    ha_efectivas: Number(efectivas),
                    lat: estado.ubicacion?.lat ?? null,
                    lng: estado.ubicacion?.lng ?? null,
                });
            },
        },
        siembra: {
            titulo: 'Nueva siembra',
            campos: `
                <div class="campo campo--tres">
                    <div>
                        <label class="campo__etiqueta" for="mCampania">Campaña</label>
                        <select class="campo__entrada" id="mCampania"><option>Cargando...</option></select>
                    </div>
                    <div>
                        <label class="campo__etiqueta" for="mCultivo">Cultivo</label>
                        <select class="campo__entrada" id="mCultivo"><option>Cargando...</option></select>
                    </div>
                    <div>
                        <label class="campo__etiqueta" for="mSiembraEst">Establecimiento</label>
                        <select class="campo__entrada" id="mSiembraEst"><option>Cargando...</option></select>
                    </div>
                </div>

                <div class="campo">
                    <label class="campo__etiqueta">Lotes a sembrar</label>
                    <p class="modal-agro__pista" id="mPistaLotes">Elegí un establecimiento para ver sus lotes.</p>
                    <div id="mListaLotes"></div>
                </div>

                <div class="campo">
                    <div class="modal-agro__filaTitulo">
                        <label class="campo__etiqueta">Costos <span class="campo__opcional">(se reparten entre los lotes elegidos, segun sus hectareas)</span></label>
                        <button type="button" class="modal-agro__agregar" id="mAgregarCosto">+ Agregar costo</button>
                    </div>
                    <div class="costo-fila costo-fila--encabezado">
                        <span>Categoria</span><span>Descripcion</span><span>Cantidad</span><span>Unidad</span><span>Precio unit.</span><span>Moneda</span><span></span>
                    </div>
                    <div id="mListaCostos"></div>
                    <p class="modal-agro__pista" id="mPistaCostos"></p>
                </div>

                <div class="campo campo--tres">
                    <div>
                        <label class="campo__etiqueta" for="mFecha">Fecha de siembra</label>
                        <input class="campo__entrada" id="mFecha" type="date" required>
                    </div>
                    <div>
                        <label class="campo__etiqueta" for="mVariedad">Variedad <span class="campo__opcional">(opcional)</span></label>
                        <input class="campo__entrada" id="mVariedad" maxlength="60" placeholder="Ej. DM 53i54">
                    </div>
                    <div>
                        <label class="campo__etiqueta" for="mRinde">Rinde esperado (qq/ha)</label>
                        <input class="campo__entrada" id="mRinde" type="number" min="0.1" step="0.1" placeholder="Ej. 35">
                    </div>
                </div>
            `,
            errores: {
                campania_id: 'mCampania',
                cultivo_id: 'mCultivo',
                fecha_siembra: 'mFecha',
                rinde_esperado: 'mRinde',
            },

            async alAbrir(form, estado) {
                estado.lotes = [];            // lotes del establecimiento elegido
                estado.siembras = [];         // siembras que ya existen en esa campaña
                estado.elegidos = new Map();  // loteId -> hectáreas escritas

                const selCampania = form.querySelector('#mCampania');
                const selCultivo = form.querySelector('#mCultivo');
                const selEst = form.querySelector('#mSiembraEst');
                const lista = form.querySelector('#mListaLotes');
                const pista = form.querySelector('#mPistaLotes');

                const opciones = (filas, texto) =>
                    filas.map((f) => `<option value="${f.id}">${escapar(texto(f))}</option>`).join('');

                // ---- Dibuja la lista de lotes con su estado ----
                function pintarLotes() {
                    if (estado.lotes.length === 0) {
                        lista.innerHTML = '';
                        pista.textContent = 'Este establecimiento todavía no tiene lotes. Creá uno con el botón de la barra.';
                        return;
                    }

                    // Lotes que YA tienen este cultivo en esta campaña: no se pueden
                    // volver a sembrar (la API lo rechaza con 409). Se bloquean acá
                    // para que el error no llegue a pasar.
                    const cultivoId = Number(selCultivo.value);
                    const tomados = new Map(
                        estado.siembras
                            .filter((s) => Number(s.cultivo_id) === cultivoId)
                            .map((s) => [Number(s.lote_id), s.cultivo_nombre])
                    );

                    lista.innerHTML = estado.lotes.map((lote) => {
                        const id = Number(lote.id);
                        const bloqueado = tomados.has(id);
                        const max = num(lote.ha_efectivas) ?? 0;
                        const elegido = estado.elegidos.has(id);
                        const ha = estado.elegidos.get(id) ?? max;
                        const motivo = `Ya tiene ${escapar(tomados.get(id) ?? 'ese cultivo')} en esta campaña`;

                        return `
                            <div class="lote-check${bloqueado ? ' lote-check--bloqueado' : ''}" ${bloqueado ? `title="${motivo}"` : ''}>
                                <label class="lote-check__nombre">
                                    <input type="checkbox" data-lote-id="${id}" ${bloqueado ? 'disabled' : ''} ${elegido ? 'checked' : ''}>
                                    <span>${escapar(lote.nombre)}</span>
                                    <small>${formatoNumero(max, 2)} ha disponibles</small>
                                </label>
                                ${bloqueado
                                    ? `<span class="lote-check__aviso">${motivo}</span>`
                                    : `<div class="lote-check__ha">
                                           <input class="campo__entrada" type="number" data-ha-id="${id}"
                                                  min="0.01" max="${max}" step="0.01" value="${ha}" ${elegido ? '' : 'disabled'}>
                                           <span class="lote-check__unidad">ha</span>
                                       </div>
                                       <span class="lote-check__error" data-error-id="${id}"></span>`}
                            </div>
                        `;
                    }).join('');

                    pista.textContent = 'Tildá los lotes donde vas a sembrar. Las hectáreas vienen con lo que mide cada lote; podés bajarlas.';
                    validarHectareas();
                }

                // ---- No se puede sembrar más de lo que mide el lote ----
                function validarHectareas() {
                    let hayError = false;
                    lista.querySelectorAll('[data-ha-id]').forEach((input) => {
                        const id = Number(input.dataset.haId);
                        const aviso = lista.querySelector(`[data-error-id="${id}"]`);
                        const max = Number(input.max);
                        const cantidad = Number(input.value);
                        let mensaje = '';

                        if (estado.elegidos.has(id)) {
                            if (!input.value || cantidad <= 0) mensaje = 'Poné las hectáreas';
                            else if (cantidad > max) mensaje = `Máximo ${formatoNumero(max, 2)} ha`;
                        }
                        input.classList.toggle('campo__entrada--error', mensaje !== '');
                        if (aviso) aviso.textContent = mensaje;
                        if (mensaje) hayError = true;
                    });

                    estado.invalido = hayError || estado.elegidos.size === 0;
                    estado.mostrarReparto?.();
                    return !estado.invalido;
                }

                // ---- Eventos delegados: la lista se repinta entera al cambiar filtros ----
                lista.addEventListener('change', (ev) => {
                    const check = ev.target.closest('[data-lote-id]');
                    if (!check) return;
                    const id = Number(check.dataset.loteId);
                    const campoHa = lista.querySelector(`[data-ha-id="${id}"]`);
                    if (check.checked) {
                        estado.elegidos.set(id, campoHa?.value ?? '');
                        if (campoHa) campoHa.disabled = false;
                    } else {
                        estado.elegidos.delete(id);
                        if (campoHa) campoHa.disabled = true;
                    }
                    validarHectareas();
                });

                lista.addEventListener('input', (ev) => {
                    const campoHa = ev.target.closest('[data-ha-id]');
                    if (!campoHa) return;
                    estado.elegidos.set(Number(campoHa.dataset.haId), campoHa.value);
                    validarHectareas();
                });

                // Al cambiar la campaña hay que releer qué lotes ya están sembrados.
                async function cambioCampania() {
                    estado.siembras = await API.get(`/siembras?campania_id=${selCampania.value}`);
                    estado.elegidos.clear(); // lo elegido pudo haber quedado bloqueado
                    pintarLotes();
                }

                async function cambioEstablecimiento() {
                    estado.lotes = await API.get(`/lotes?establecimiento_id=${selEst.value}`);
                    estado.elegidos.clear();
                    pintarLotes();
                }

                // ---- Carga inicial ----
                try {
                    const [campanias, cultivos, establecimientos] = await Promise.all([
                        API.get('/campanias'),
                        API.get('/cultivos'),
                        API.get('/establecimientos'),
                    ]);

                    const abiertas = campanias.filter((c) => !Number(c.cerrada));
                    if (abiertas.length === 0) {
                        selCampania.innerHTML = '<option value="">No hay campañas abiertas</option>';
                        mostrarError(form, new Error('Creá una campaña desde Perfil antes de cargar una siembra.'));
                        return;
                    }
                    selCampania.innerHTML = opciones(abiertas, (c) => c.nombre);
                    selCultivo.innerHTML = opciones(cultivos, (c) => c.nombre);

                    const propios = establecimientos.filter((e) => e.rol === 'dueno');
                    if (propios.length === 0) {
                        selEst.innerHTML = '<option value="">No tenés establecimientos propios</option>';
                        mostrarError(form, new Error('Creá un establecimiento antes de cargar una siembra.'));
                        return;
                    }
                    selEst.innerHTML = opciones(propios, (e) => `${e.nombre} — ${e.localidad}`);

                    await cambioCampania();
                    await cambioEstablecimiento();
                } catch (error) {
                    mostrarError(form, error);
                }

                // ---- Costos: una fila por gasto, se reparten entre los lotes ----
                const listaCostos = form.querySelector('#mListaCostos');
                const pistaCostos = form.querySelector('#mPistaCostos');

                const CATEGORIAS = ['semilla', 'fertilizante', 'herbicida', 'maquinaria', 'labor', 'flete', 'otro'];

                function agregarCosto() {
                    const fila = document.createElement('div');
                    fila.className = 'costo-fila';
                    fila.innerHTML = `
                        <select class="campo__entrada" data-costo="categoria">
                            ${CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                        <input class="campo__entrada" data-costo="descripcion" maxlength="120" placeholder="Ej. Soja DM 53i54">
                        <input class="campo__entrada" data-costo="cantidad" type="number" min="0" step="0.01" placeholder="30">
                        <input class="campo__entrada" data-costo="unidad" maxlength="10" placeholder="bolsa">
                        <input class="campo__entrada" data-costo="precio" type="number" min="0" step="0.01" placeholder="45000">
                        <select class="campo__entrada" data-costo="moneda">
                            <option value="ARS">ARS</option>
                            <option value="USD">USD</option>
                        </select>
                        <button type="button" class="lote-fila__quitar" aria-label="Quitar costo">&#10005;</button>
                    `;
                    fila.querySelector('.lote-fila__quitar').addEventListener('click', () => {
                        fila.remove();
                        mostrarReparto();
                    });
                    fila.addEventListener('input', mostrarReparto);
                    listaCostos.append(fila);
                    mostrarReparto();
                }

                // Muestra como quedaria repartido, antes de guardar.
                function mostrarReparto() {
                    const filas = listaCostos.querySelectorAll('.costo-fila');
                    if (filas.length === 0 || estado.elegidos.size === 0) {
                        pistaCostos.textContent = '';
                        return;
                    }
                    const haTotal = [...estado.elegidos.values()].reduce((suma, ha) => suma + Number(ha || 0), 0);
                    if (haTotal <= 0) { pistaCostos.textContent = ''; return; }
                    pistaCostos.textContent = `Se reparten entre ${estado.elegidos.size} lote(s), ${formatoNumero(haTotal, 2)} ha en total.`;
                }

                form.querySelector('#mAgregarCosto').addEventListener('click', agregarCosto);
                estado.mostrarReparto = mostrarReparto;

                selCampania.addEventListener('change', () => cambioCampania().catch((e) => mostrarError(form, e)));
                selEst.addEventListener('change', () => cambioEstablecimiento().catch((e) => mostrarError(form, e)));
                selCultivo.addEventListener('change', () => {
                    estado.elegidos.clear(); // con otro cultivo cambia qué está bloqueado
                    pintarLotes();
                });
            },

            async guardar(form, estado) {
                if (estado.elegidos.size === 0) throw new Error('Elegí al menos un lote para sembrar.');
                if (estado.invalido) throw new Error('Revisá las hectáreas marcadas en rojo.');
                if (!valor('mFecha')) throw new Error('Poné la fecha de siembra.');
                if (!valor('mRinde')) throw new Error('Poné el rinde esperado: sin él no se puede calcular el margen.');

                const base = {
                    campania_id: Number(valor('mCampania')),
                    cultivo_id: Number(valor('mCultivo')),
                    fecha_siembra: valor('mFecha'),
                    variedad: valor('mVariedad') || null,
                    // En pantalla se usan quintales; la API guarda kilos por hectárea.
                    rinde_esperado: Number(valor('mRinde')) * 100,
                };

                // ---- Costos: se cargan una vez y se reparten entre los lotes ----
                const costos = [];
                // Solo las filas de #mListaCostos: la fila de encabezados tambien
                // tiene la clase .costo-fila pero no tiene inputs adentro.
                form.querySelectorAll('#mListaCostos .costo-fila').forEach((fila, i) => {
                    const dato = (k) => fila.querySelector(`[data-costo="${k}"]`).value.trim();
                    const descripcion = dato('descripcion');
                    const cantidad = dato('cantidad');
                    const precio = dato('precio');
                    const unidad = dato('unidad');

                    if (!descripcion && !cantidad && !precio && !unidad) return; // fila vacia

                    if (!descripcion || !cantidad || !precio || !unidad) {
                        throw new Error(`Al costo ${i + 1} le faltan datos: descripcion, cantidad, unidad y precio.`);
                    }
                    if (Number(cantidad) <= 0 || Number(precio) <= 0) {
                        throw new Error(`En el costo ${i + 1} la cantidad y el precio tienen que ser mayores que cero.`);
                    }
                    costos.push({
                        categoria: dato('categoria'),
                        descripcion,
                        cantidad: Number(cantidad),
                        unidad,
                        precio_unitario: Number(precio),
                        moneda: dato('moneda'),
                        fecha: base.fecha_siembra, // misma fecha que la siembra
                    });
                });

                const elegidos = [...estado.elegidos];
                const haTotal = elegidos.reduce((suma, [, ha]) => suma + Number(ha), 0);
                const dosDecimales = (n) => Math.round(n * 100) / 100;

                // Reparto proporcional a las hectareas. La diferencia del redondeo
                // se le da al ultimo lote para que la suma cierre exacta.
                const repartos = costos.map((costo) => {
                    const partes = elegidos.map(([, ha]) => dosDecimales(costo.cantidad * Number(ha) / haTotal));
                    const sumaPrevias = partes.slice(0, -1).reduce((a, b) => a + b, 0);
                    partes[partes.length - 1] = dosDecimales(costo.cantidad - sumaPrevias);
                    return partes;
                });

                // Una siembra por lote. Si alguna falla, las que salieron bien
                // quedan guardadas y se informa cual no pudo (decision del equipo).
                const fallidas = [];
                let creadas = 0;
                for (let i = 0; i < elegidos.length; i += 1) {
                    const [loteId, ha] = elegidos[i];
                    const nombreLote = estado.lotes.find((l) => Number(l.id) === loteId)?.nombre ?? `Lote ${loteId}`;
                    try {
                        const siembra = await API.post('/siembras', { ...base, lote_id: loteId, ha_sembradas: Number(ha) });
                        creadas += 1;

                        for (let j = 0; j < costos.length; j += 1) {
                            await API.post(`/siembras/${siembra.id}/costos`, {
                                ...costos[j],
                                cantidad: repartos[j][i],
                            });
                        }
                    } catch (error) {
                        fallidas.push(`${nombreLote}: ${error.message}`);
                    }
                }

                if (fallidas.length > 0) {
                    throw new Error(`Se crearon ${creadas} siembra(s). No se pudo con — ${fallidas.join(' · ')}`);
                }
                return { creadas };
            },
        },

    };

    // Devuelve true si abrió la ventana, false si todavía no existe para ese tipo
    function abrir(tipo) {
        const ventana = VENTANAS[tipo];
        if (!ventana) return false;

        if (!caja) armarEsqueleto();
        foco = document.activeElement;

        const estado = {}; // lo que la ventana va juntando (ubicación, lotes...)

        caja.querySelector('#modalAgroTitulo').textContent = ventana.titulo;

        const form = caja.querySelector('#modalAgroForm');
        form.innerHTML = ventana.campos;

        const pie = caja.querySelector('#modalAgroPie');
        pie.innerHTML = `
            <button type="button" class="boton-agro boton-agro--secundario" data-cerrar>Cancelar</button>
            <button type="submit" form="modalAgroForm" class="boton-agro boton-agro--principal">Guardar y cerrar</button>
            ${ventana.continuaEn ? '<button type="button" class="boton-agro boton-agro--principal" id="mContinuar">Guardar y continuar →</button>' : ''}
        `;

        caja.hidden = false;
        form.querySelector('.campo__entrada')?.focus();
        ventana.alAbrir?.(form, estado);

        // "seguir" dice qué hacer una vez que guardó bien.
        async function enviar(seguir) {
            const botones = pie.querySelectorAll('.boton-agro');
            mostrarError(form, null);
            botones.forEach((b) => (b.disabled = true));
            try {
                await ventana.guardar(form, estado);
                cerrar();
                // Si hay un paso siguiente y existe su ventana, se encadena.
                if (seguir && ventana.continuaEn && abrir(ventana.continuaEn)) return;
                // Si no, recargamos para que la pantalla muestre lo creado.
                window.location.reload();
            } catch (error) {
                mostrarError(form, error, ventana.errores);
            } finally {
                botones.forEach((b) => (b.disabled = false));
            }
        }

        // onsubmit (y no addEventListener) a propósito: reemplaza al anterior,
        // así no se acumulan manejadores si se abre la ventana varias veces.
        form.onsubmit = (ev) => {
            ev.preventDefault();
            enviar(false);
        };
        const continuar = pie.querySelector('#mContinuar');
        if (continuar) continuar.onclick = () => enviar(true);

        return true;
    }

    return { abrir, cerrar };
})();
