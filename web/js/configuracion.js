document.addEventListener('DOMContentLoaded', async () => {
    if(!(await usuarioLogueado())) return;

    const form = document.querySelector('.formulario-config');
    const cuerpoLotes = document.getElementById('cuerpoLotes');
    const inputUbicacion = document.getElementById('ubicacion');
    const ayudaMapa = document.getElementById('ayudaMapa');
    const contenedorMapa = document.getElementById('contenedorMapa');

    // modo edicion para establecimiento
    const establecimientoId = num(new URLSearchParams(window.location.search).get('establecimiento'));

    const mapa = Mapa.crearMapa('mapaCampo');

    // encuadre de mapa, mientras esta oculto mide 0px.
    let encuadrePendiente = null;

    function encuadrar(puntos) {
        if (puntos.length === 1) mapa.setView(puntos[0], Mapa.ZOOM_CERCA);
        else if (puntos.length > 1) mapa.fitBounds(puntos, {padding: [40, 40] });
    }

    //el mapa arranca oculto y se despliega desde el input
    function mostrarMapa(visible = true){
        contenedorMapa.hidden = !visible;
        inputUbicacion.setAttribute('aria-expanded', visible);
        if (!visible) return;
        mapa.invalidateSize();
        if (encuadrePendiente) {
            encuadrar(encuadrePendiente);
            encuadrePendiente = null;
        }
    }

    inputUbicacion.addEventListener('click', () => mostrarMapa(contenedorMapa.hidden));

    let ubicacionEstablecimiento = null;
    let marcadorEstablecimiento = null;

    // cada lote tiene fila, lat, lng, marcador, guardado
    const lotes = [];
    //ids de lotes que ya estan guardados y se quitaron en pantalla
    const lotesBorrados = new Set();

    let objetivo = null;

    //Si el establecimineto se creó pero falló un lote, se guarda acá para evitar duplicados.
    let establecimiento = null;

    let datosOriginales = null;

    mapa.on('click', (e) => {
        const lat = Mapa.redondear(e.latlng.lat)
        const lng = Mapa.redondear(e.latlng.lng);
        if (objetivo) ubicarLote(objetivo, lat, lng);
        else ubicarEstablecimiento(lat, lng)
    });

    function ubicarEstablecimiento(lat, lng) {
        ubicacionEstablecimiento = { lat, lng};
        inputUbicacion.value = `${lat}, ${lng}`;
        if (marcadorEstablecimiento) marcadorEstablecimiento.setLatLng([lat, lng])
        else marcadorEstablecimiento = L.marker([lat, lng]).addTo(mapa).bindTooltip('Establecimiento');
    }

    const nombreLote = (lote) => lote.fila.querySelector('[name="loteNombre"]').value.trim();

    // lo que se manda a la API por cada lote
    const leerLote = (lote) => ({
        nombre: nombreLote(lote),
        ha_totales: Number(lote.fila.querySelector('[name="loteHaTotales"]').value),
        ha_efectivas: Number(lote.fila.querySelector('[name="loteHaEfectivas"]').value),
        lat: lote.lat,
        lng: lote.lng,
    });

    // solo los campos que guarda el back (lat/lng todavía no)
    const camposEstablecimiento = () => ({
        nombre: valor('nombreEstablecimiento'),
        provincia: valor('provincia'),
        localidad: valor('localidad'),
    });

    function ubicarLote(lote, lat, lng) {
        lote.lat = lat;
        lote.lng = lng;
        lote.marcador?.remove();
        lote.marcador = Mapa.marcadorLote(lat, lng).bindTooltip(nombreLote(lote) || 'Lote').addTo(mapa);
        const botonUbicar = lote.fila.querySelector('.boton-ubicar');
        botonUbicar.querySelector('span').textContent = 'Ubicado';
        botonUbicar.classList.add('boton-ubicar--ubicado');
        cambiarObjetivo(null);
    }

    function cambiarObjetivo(lote){
        objetivo = lote;
        lotes.forEach((l) => l.fila.classList.toggle('fila--ubicando', l === lote));
        ayudaMapa.textContent = lote
        ? `Hacé clic en el mapa para ubicar "${nombreLote(lote) || 'el lote'}"`
        : 'Hacé clic en el mapa para ubicar el establecimiento';
        if (lote) {
            mostrarMapa();
            contenedorMapa.scrollIntoView({ behavior: 'smooth', block: 'center'})
        }
    }

    function agregarLote(datos = null) {
        const fila = document.createElement('tr');
        fila.innerHTML = `<td><input type="text" name="loteNombre" class="campo__entrada" maxlength="60" placeholder="Ej. Lote 1" required></td>
            <td><input type="number" name="loteHaTotales" class="campo__entrada" min="0.01" step="0.01" placeholder="Ej. 90" required></td>
            <td><input type="number" name="loteHaEfectivas" class="campo__entrada" min="0.01" step="0.01" placeholder="Ej. 85" required></td>
            <td>
                <button type="button" class="boton-ubicar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>
                    <span>Ubicar</span>
                </button>
            </td>
            <td><button type="button" class="boton-quitar" aria-label="Quitar lote">✕</button></td>`;

        const lote = { id: datos?.id ?? null, fila, lat: null, lng: null, marcador: null, original: null};
        lotes.push(lote);

        fila.querySelector('.boton-ubicar').addEventListener('click', () => cambiarObjetivo(lote));
        fila.querySelector('.boton-quitar').addEventListener('click', () => {
            if (lote.id !== null) {
                if (!confirm(`¿Quitar "${nombreLote(lote)}"? Se va a borrar al guardar.`)) return;
                lotesBorrados.add(lote.id);
            }
            lote.marcador?.remove();
            fila.remove();
            lotes.splice(lotes.indexOf(lote), 1);
            if (objetivo === lote) cambiarObjetivo(null);
        });

        cuerpoLotes.append(fila);
        if (datos) {
            fila.querySelector('[name="loteNombre"]').value = datos.nombre;
            fila.querySelector('[name="loteHaTotales"]').value = num(datos.ha_totales);
            fila.querySelector('[name="loteHaEfectivas"]').value = num(datos.ha_efectivas);
            if (num(datos.lat) !== null) ubicarLote(lote, num(datos.lat), num(datos.lng));
            lote.original = JSON.stringify(leerLote(lote));
        } else {
                fila.querySelector('input').focus();
        }
    }
    document.querySelector('.enlace-agregar-lote').addEventListener('click', () => agregarLote());

    if (establecimientoId) {
        try {
            const [guardado, lotesGuardados] = await Promise.all([ API.get(`/establecimientos/${establecimientoId}`),
                API.get(`/lotes?establecimiento_id=${establecimientoId}`),
            ]);
            establecimiento = guardado;

            document.getElementById('nombreEstablecimiento').value = guardado.nombre;
            document.getElementById('provincia').value = guardado.provincia;
            document.getElementById('localidad').value = guardado.localidad;
            datosOriginales = JSON.stringify(camposEstablecimiento());

            if (num(guardado.lat) !== null) ubicarEstablecimiento(num(guardado.lat), num(guardado.lng));

            document.querySelector('.encabezado-config__titulo').textContent = 'Editar establecimiento';
            document.querySelector('.encabezado-config__subtitulo').textContent = 'Agregá, editá o quitá lotes de este campo';

            form.querySelector('button[type="submit"]').textContent = 'Guardar cambios';

            lotesGuardados.forEach((l) => agregarLote(l));
            if (lotesGuardados.length === 0) agregarLote();
            encuadrePendiente = lotes.filter((l) => l.lat !== null).map((l) => [l.lat, l.lng]);
            } catch (error) {
                mostrarError(form, error);
                return;
        }
    } else {
        agregarLote();
    }

    // chips de cultivos: solo visual, la api no tiene donde guardarlos todavía.
    document.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const seleccionado = chip.classList.toggle('chip--seleccionado');
            chip.setAttribute('aria-pressed', seleccionado);
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        mostrarError(form, null);
        cuerpoLotes.querySelectorAll('.fila--error').forEach((f) => f.classList.remove('fila--error'));
        const boton = e.submitter;
        boton.disabled = true;

        try {
            const datosEstablecimiento = {
                ...camposEstablecimiento(),
                lat: ubicacionEstablecimiento?.lat ?? null,
                lng: ubicacionEstablecimiento?.lng ?? null,
            };
            if (!establecimiento) {
                establecimiento = await API.post('/establecimientos', datosEstablecimiento);
                datosOriginales = JSON.stringify(camposEstablecimiento());
            } else if (JSON.stringify(camposEstablecimiento()) !== datosOriginales) {
                establecimiento = await API.put(`/establecimientos/${establecimiento.id}`, datosEstablecimiento);
                datosOriginales = JSON.stringify(camposEstablecimiento());
            }

            for (const id of [...lotesBorrados]) {
                try {
                    await API.del(`/lotes/${id}`);
                } catch (error) {
                    if (error.status !== 404) throw error;
                }
                lotesBorrados.delete(id);
            }

            // para saber exactamente cuál falló.
            for (const lote of lotes) {
                const datos = leerLote(lote);
                const comoJson = JSON.stringify(datos);
                if (lote.id !== null && comoJson === lote.original) continue;

                try {
                    if (lote.id === null) {
                        const creado = await API.post('/lotes', { establecimiento_id: establecimiento.id, ...datos});
                        lote.id = creado.id;
                    } else {
                        await API.put(`/lotes/${lote.id}`, datos);
                    }
                } catch (error) {
                    error.lote = lote;
                    throw error;
                }
                lote.original = comoJson;
            }

            localStorage.setItem('establecimientoActual', establecimiento.id);
            window.location.href = 'dashboard_mi_campo.html';
            } catch (error) {
                if (error.lote) {
                    error.lote.fila.classList.add('fila--error');
                    const detalle = error.errores ? 
                        Object.entries(error.errores).map(([campo, mensaje]) => `${campo}: ${mensaje}`).join(' · ') : error.message;
                    mostrarError(form, new Error(`No se pudo guardar el lote "${nombreLote(error.lote) || 'sin nombre'}": ${detalle} Corregilo y volvé a guardar.`));
                } else {
                    mostrarError(form, error, { nombre: 'nombreEstablecimiento', provincia: 'provincia', localidad: 'localidad'});
                }
            } finally {
                boton.disabled = false;
        }
    });
});