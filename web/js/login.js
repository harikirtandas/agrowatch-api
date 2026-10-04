document.addEventListener("DOMContentLoaded", () => {
    // Si hay token, redirigir al dashboard. Si no, vuelve acá.
    if (API.haySesion()) {
        window.location.href = "dashboard_mi_campo.html";
        return;
    }

    const form = document.querySelector(".formulario-login");
    const boton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        mostrarError(form, null);
        boton.disabled = true;

        try {
            await API.login(valor('usuario'),
        document.getElementById('contrasena').value);
            window.location.href = "dashboard_mi_campo.html";
        } catch (error) {
            mostrarError(form, error, { email: 'usuario', password: 'contrasena' });
        } finally {
            boton.disabled = false;
            }
        });
    });