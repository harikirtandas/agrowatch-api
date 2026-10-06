document.addEventListener('DOMContentLoaded', () => {
    // Se llega desde el paso 1
    if (!API.haySesion()) {
        window.location.href = 'login.html';
        return;
    }

    const form = document.querySelector('.formulario-registro');
    const inputUbicacion = document.getElementById('ubicacion');
    let ubicacion = null;

    const selector = Mapa.selectorPunto('mapaUbicacion', {
        onCambio: (punto) => {
            ubicacion = punto;
            inputUbicacion.value = `${punto.lat}, ${punto.lng}`;
        },
    });

    document.getElementById('botonMiUbicacion').addEventListener('click', async () => {
        try {
            const { lat,lng} = await Mapa.miUbicacion();
            selector.ubicar(lat, lng);
            selector.mapa.setView([lat,lng], Mapa.ZOOM_CERCA);
            } catch (error) {
                mostrarError(form, error);
            }
        });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Hay dos botones, e.submitter indica cual apretó
            if (e.submitter?.value === 'omitir'){
                window.location.href = 'dashboard_mi_campo.html';
                return;
            }

            mostrarError(form, null);
            e.submitter.disabled = true;

            try {
                const establecimiento = await API.post('/establecimientos', {
                    nombre: valor('establecimiento'),
                    provincia: valor('provincia'),
                    localidad: valor('localidad'),
                    lat: ubicacion?.lat ?? null,
                    lng: ubicacion?.lng ?? null,
                });
                localStorage.setItem('establecimientoActual', establecimiento.id);
                window.location.href = 'dashboard_mi_campo.html';
                } catch (error) {
                    mostrarError(form, error, { nombre: 'establecimiento', provincia: 'provincia', localidad: 'localidad'});
                } finally {
                    e.submitter.disabled = false;
            }
        });
});