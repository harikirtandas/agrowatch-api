const Mapa = (() => {
    // Por defecto: Sudoeste de Buenos Aires)
    const CENTRO_DEFECTO = [-37.5, -62.0];
    const ZOOM_DEFECTO = 6;
    const ZOOM_CERCA = 14;

    // Mismos colores que semaforo.html, usando los valores que devuelve margen.semaforo
    const COLORES = { verde: '#4f9d63', amarillo: '#e0a83c', rojo: '#d1583f', sinDato: '#9aa0a6'};

    //La base guarda DECIMAL(10,7), más decimales no aportan nada.
    const redondear = (num) => Math.round(num * 1e7) / 1e7;

    // Mapa base con imagenes de OpenStreetMap
    // Atribución oblicatoria por licencia de OSM.
    function crearMapa(idContenedor, { centro = CENTRO_DEFECTO, zoom = ZOOM_DEFECTO } = {}) {
        const mapa = L.map(idContenedor).setView(centro, zoom);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapa);
        return mapa;
    }

    // Mapa para seleccionar un punto con un clic para poner el marcador (después se puede arrastrar).
    function selectorPunto(idContenedor, { inicial = null, onCambio} = {}) {
        const mapa = crearMapa(idContenedor, inicial ? { centro: [inicial.lat, inicial.lng], zoom: ZOOM_CERCA} : {});
        let marcador = null;

        const avisar = (lat, lng) => onCambio?.({ lat: redondear(lat), lng: redondear(lng) });

        function ubicar(lat, lng) {
            if (marcador) {
                marcador.setLatLng([lat, lng]);
            } else {
                marcador = L.marker([lat, lng], { draggable: true }).addTo(mapa);
                marcador.on('dragend', () => {
                    const p = marcador.getLatLng();
                    avisar(p.lat, p.lng);
                });
            }
            avisar(lat, lng);
        }

        mapa.on('click', (e) => ubicar(e.latlng.lat, e.latlng.lng));
            if (inicial) ubicar(inicial.lat, inicial.lng);
            return { mapa, ubicar };
        }
    
    // Círculo con el color del semáforo según el valor de margen.
    function marcadorLote(lat,lng, { estado = 'sinDato', texto = '' } = {}) {
        const marcador = L.circleMarker([lat, lng], {
            radius: 14,
            color: '#fff',
            weight: 3,
            fillColor: COLORES[estado] ?? COLORES.sinDato,
            fillOpacity: 1,
        });
        if (texto !== ''){
            marcador.bindTooltip(String(texto), {permanent: true, direction: 'center', className: 'mapa-etiqueta'});
        }
        return marcador;
    }

    //GPS del navegador/celular en localhost o https.
    function miUbicacion() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Tu navegador no permite obtener la ubicación.'));
            return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => reject(new Error('No se pudo obtener tu ubicación. Asegurate de permitir el acceso a la ubicación en tu navegador.')),
                { enableHighAccuracy: true, timeout: 10000 },
            );
        });
    }

    return { crearMapa, selectorPunto, marcadorLote, miUbicacion, redondear, COLORES, ZOOM_CERCA };

})();