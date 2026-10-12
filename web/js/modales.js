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
