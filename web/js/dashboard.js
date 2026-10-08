// como se muestra cada valor de margen.semaforo
const ESTADOS = {
    verde: { clase: 'bien', texto: 'Bien'},
    amarillo: { clase: 'ajustado', texto: 'Ajustado'},
    rojo: { clase: 'alerta', texto: 'Alerta'},
};

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = await usuarioLogueado();
    if (!usuario) return;

    // Encabezado
    document.querySelector('.encabezado-panel__saludo').textContent = `¡Buen día, ${usuario.nombre}!`;
    const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long'});
    document.querySelector('.encabezado-panel__fecha').textContent =  `${hoy.charAt(0).toUpperCase()}${hoy.slice(1)} — así está tu campo hoy`;

    // Mapa
    const mapa = Mapa.crearMapa('mapaLeaflet');
    const capaLotes = L.layerGroup().addTo(mapa);
    const tarjeta = document.getElementById('tarjetaFlotante');
    mapa.on('click', () => { tarjeta.hideen = true;});

    // Datos que no dependen del establecimiento
    const [establecimientos, campanias] = await Promise.all([
        API.get('/establecimientos'),
        API.get('/campanias'),
    ]);

    if (establecimientos.length === 0) {
        // Usuario que omitio el paso 2
        window.location.href = 'configuracion_de_campos.html';
        return;
    }

    // Campaña actual, la abierta más reciente
    const campania = campanias
        .filter((c) => !Number(c.cerrada))
        .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio)) [0] ?? null;

    const selector = document.getElementById('selectorEstablecimiento');
    selector.innerHTML = establecimientos
        .map((e) => `<option value="${e.id}">🏡 ${escapar(e.nombre)}</option>`)
        .join('');
    
    const guardado = localStorage.getItem('establecimientoActual');
    selector.value = establecimientos.some((e) => String(e.id) === guardado) ? guardado : String(establecimientos[0].id);

    selector.addEventListener('change', () => {
        localStorage.setItem('establecimientoActual', selector.value);
        cargarEstablecimiento(Number(selector.value));
    });

    let cargaActual = 0;

    await cargarEstablecimiento(Number(selector.value));

    async function cargarEstablecimiento(id) {
        const estaCarga = ++cargaActual;
        tarjeta.hidden = true;

        const establecimiento = establecimientos.find((e) => e.id === id);
        const [lotes, siembras] = await Promise.all([
            API.get(`/lotes?establecimiento_id=${id}`),
            campania ? API.get(`/siembras?campania_id=${campania.id}`) : Promise.resolve ([])
        ]);

        // Margen de cada lote con siembra, si falla el lote se ve gris y se guarda el motivo para mostrarlo al usuario.
        const filas = await Promise.all(lotes.map(async (lote) => {
            const siembra = siembras.find((s) => Number(s.lote_id) === Number(lote.id)) ?? null;
            let margen = null;
            let motivo = null;
            if (siembra) {
                try {
                    margen = await API.get(`/siembras/${siembra.id}/margen`);
                    } catch (error) {
                        motivo = error.status === 422 ? error.message : 'No se pudo calcular el margen.';
                }
            }
            return { lote, siembra, margen, motivo, estado: margen?.semaforo ?? null};
        }));

        if (estaCarga !== cargaActual) return;

        dibujarMapa(filas, establecimiento);
        dibujarLista(filas);
        dibujarResumen(filas);
    }

    // Si el nombre no tiene numero, usa las 2 primeras letras.
    const etiquetaLote = (lote) => lote.nombre.match(/\d+/)?.[0] ?? lote.nombre.slice(0, 2);
    const rindeQq = (margen) => (margen ? num(margen.rinde_indiferencia_kg_ha) / 100 : null );

    function dibujarMapa(filas, establecimiento) {
        capaLotes.clearLayers();
        const puntos = [];

        for (const fila of filas) {
            const lat = num(fila.lote.lat);
            const lng = num(fila.lote.lng);
            if (lat === null || lng === null) continue;

            puntos.push([lat, lng]);
            Mapa.marcadorLote(lat, lng, { estado: fila.estado ?? 'sinDato', texto: etiquetaLote(fila.lote) })
                .on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    mostrarTarjeta(fila);
                })
                .addTo(capaLotes);
        }

        // se va a usar cuando establecimiento guarde lat/lng
        if (num(establecimiento.lat) !== null) puntos.push([num(establecimiento.lat), num(establecimiento.lng)]);

        if (puntos.length === 1) mapa.setView(puntos[0], Mapa.ZOOM_CERCA);
        else if (puntos.length > 1) mapa.fitBounds(puntos, { padding: [40, 40] });
    }

    function mostrarTarjeta({ lote, siembra, margen, motivo, estado}) {
        document.getElementById('flotanteTitulo').textContent = siembra ? `${lote.nombre} — ${siembra.cultivo_nombre}` : lote.nombre;
        document.getElementById('flotanteHectareas').textContent = `${formatoNumero(num(lote.ha_totales), 1)} ha`;
        document.getElementById('flotanteRinde').textContent = margen ? `${formatoNumero(rindeQq(margen), 1)} qq/ha` : '-';
        document.getElementById('flotanteEstado').textContent = ESTADOS [estado]?.texto ?? motivo ?? (siembra ? 'Sin datos de margen' : 'Sin siembra');
        tarjeta.hidden = false;
    }

    function dibujarLista(filas) {
        const lista = document.getElementById('listaLotes');
        if (filas.length === 0) {
            lista.innerHTML = '<p>Este establecimiento todavía no tiene lotes. <a href="configuracion_de_campos.html">Agregar lotes</a></p>';
            return;
        }

        lista.innerHTML = filas.map(({ lote, siembra, margen, motivo, estado}) => {
            // con siembra va a semaforo, sin a cargarla.
            const destino = siembra ? `semaforo.html?siembra=${siembra.id}` : `datos_de_siembra.html?lote=${lote.id}`;
            const titulo = siembra ? `${lote.nombre} — ${siembra.cultivo_nombre}` : `${lote.nombre} — sin siembra`;
            
            const ha = `${formatoNumero(num(lote.ha_totales), 1)} ha`;
            const detalle = margen ? `${ha} · ${formatoNumero(rindeQq(margen), 1)} qq/ha` : (motivo ? `${ha} · ${motivo}` : ha);
            const clasePunto = ESTADOS[estado] ? `punto--${ESTADOS[estado].clase}` : '';

            return `<a href="${destino}" class="tarjeta-lote" data-lote="${lote.id}">
                <i class="punto ${clasePunto}"></i>
                <span class="tarjeta-lote__texto">
                    <strong>${escapar(titulo)}</strong>
                    <span>${escapar(detalle)}</span>
                </span>
                <span class="tarjeta-lote__flecha" aria-hidden="true">›</span>
                </a>`;
        }).join('');
    }

    function dibujarResumen(filas) {
        const promedio = (valores) => (valores.length ? valores.reduce ((a, b) => a + b, 0) / valores.length : null);
        const conMargen = filas.filter((f) => f.margen);

        const hectareas = filas.reduce((total, f) => total + num(f.lote.ha_totales), 0);
        const rinde = promedio(conMargen.map((f) => rindeQq(f.margen)));
        // Margen por hectarea en pesos
        const margenHa = promedio(conMargen.map((f) => num(f.margen_bruto_ars) / num(f.margen.ha_sembradas)));
        const cuenta = (estado) => filas.filter((f) => f.estado === estado).length;

        document.getElementById('resumenHectareas').textContent = `${formatoNumero(hectareas, 1)} ha`;
        
        document.getElementById('resumenRinde').textContent = rinde === null ? '-' : `${formatoNumero(rinde, 1)} qq/ha`;

        document.getElementById('resumenMargen').textContent = margenHa === null ? '-' : `$${formatoNumero(margenHa / 1000)}k /ha`;

        document.getElementById('resumenAlerta').textContent = `${cuenta('rojo')} de ${filas.length}`;

        document.getElementById('semaforoTexto').textContent = `${filas.length} lotes activos`;

        document.getElementById('semaforoLista').innerHTML = `<li><i class="punto punto--bien"></i>${cuenta('verde')} en verde</li>
            <li><i class="punto punto--ajustado"></i>${cuenta('amarillo')} ajustado</li>
            <li><i class="punto punto--alerta"></i>${cuenta('rojo')} en alerta</li>`;
    }
});
