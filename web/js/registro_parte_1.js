document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('.formulario-registro');
    const boton = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        mostrarError(form, null);
        boton.disabled = true;

        const datos = {
            nombre: valor('nombre'),
            apellido: valor('apellido'),
            email: valor('email'),
            password: document.getElementById('contrasena').value,
        };

        try {
            await API.post('/usuarios', datos); // todavía no está en el backend
            await API.login(datos.email, datos.password); // entra sin pasar por login.html
            window.location.href = 'creacion_de_usuario_parte_2.html';
            } catch (error) {
                if (error.status === 409) error.message = 'Ya existe una cuenta con ese email.';
                mostrarError (form, error, { nombre: 'nombre', apellido: 'apellido', email: 'email', password: 'contrasena'});
            } finally {
                boton.disabled = false;
            }
    });
});