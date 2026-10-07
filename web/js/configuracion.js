document.addEventListener('DOMContentLoaded', async () => {
    if(!(await usuarioLogueado())) return;

    const form = document.querySelector('.formulario-config');
    const cuerpoLotes = document.getElementById('cuerpoLotes');
    const inputUbicacion = document.getElementById('ubicacion');
    const ayudaMapa = document.getElementById('ayudaMapa');
    const contenedorMapa = document.getElementById('contenedorMapa');


    const mapa = Mapa.crearMapa('mapaCampo');

    //el mapa arranca oculto y se despliega desde el input
    function mostrarMapa(visible = true){
        contenedorMapa.hidden = !visible;
        inputUbicacion.setAttribute('aria-expanded', visible);
        if (visible) mapa.invalidateSize();
    }
    inputUbicacion.addEventListener('click', () => mostrarMapa(contenedorMapa.hidden));

    let ubicacionEstablecimiento = null;
    let marcadorEstablecimiento = null;

    // cada lote tiene fila, lat, lng, marcador, guardado
    const lotes = [];
    let objetivo = null;

    //Si el establecimineto se creó pero falló un lote, se guarda acá para evitar duplicados.
    let establecimientoCreado = null;

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

    function agregarLote() {
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

        const lote = { fila, lat: null, lng: null, marcador: null, guardado: false};
        lotes.push(lote);

        fila.querySelector('.boton-ubicar').addEventListener('click', () => cambiarObjetivo(lote));
        fila.querySelector('.boton-quitar').addEventListener('click', () => {
            lote.marcador?.remove();
            fila.remove();
            lotes.splice(lotes.indexOf(lote), 1);
            if (objetivo === lote) cambiarObjetivo(null);
        });

        cuerpoLotes.append(fila);
        fila.querySelector('input').focus();
    }
    document.querySelector('.enlace-agregar-lote').addEventListener('click', agregarLote);
    agregarLote(); //Arranca con una fila vacía.

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
        const boton = e.submitter;
        boton.disabled = true;

        try {
            if (!establecimientoCreado) {
                establecimientoCreado = await API.post('/establecimientos', {
                    nombre: valor('nombreEstablecimiento'),
                    provincia: valor('provincia'),
                    localidad: valor('localidad'),
                    lat: ubicacionEstablecimiento?.lat ?? null,
                    lng: ubicacionEstablecimiento?. lng ?? null,
                });
            }

            // para saber exactamente cuál falló.
            for (const lote of lotes.filter((l) => !l.guardado)) {
                await API.post('/lotes', {
                    establecimiento_id: establecimientoCreado.id,
                    nombre: nombreLote(lote),
                    ha_totales: Number(lote.fila.querySelector('[name="loteHaTotales"]').value),
                    ha_efectivas: Number(lote.fila.querySelector('[name="loteHaEfectivas"]').value),
                    lat: lote.lat,
                    lng: lote.lng,
                });
                lote.guardado = true;
                lote.fila.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
            }

            localStorage.setItem('establecimientoActual', establecimientoCreado.id);
            window.location.href = 'dashboard_mi_campo.html';
            } catch (error) {
                if (establecimientoCreado) {
                    error.message = `El establecimiento ya se guardó, pero falló un lote: ${error.message}. Corregilo y volvé a guardar.`;
                }
                mostrarError (form, error, {nombre: 'nombreEstablecimiento', provincia: 'provincia', localidad: 'localidad'});
                } finally {
                    boton.disabled = false;
        }
    })
});