// navbar.js — arma e inserta la barra superior en todas las pantallas.
// La barra se escribe UNA sola vez acá, en vez de estar copiada en cada HTML.
// Se carga después de global.js y antes del script propio de cada página.

(() => {
  // Nombre del archivo actual, para marcar cuál ícono está activo.
  const PAGINA =
    location.pathname.split("/").pop() || "dashboard_mi_campo.html";

  const ICONOS = {
    panel:
      '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    semaforo:
      '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    perfil:
      '<circle cx="12" cy="8" r="3.2"/><path d="M4.5 20c1.6-3.6 5-5 7.5-5s5.9 1.4 7.5 5"/>',
    salir:
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    establecimiento:
      '<path d="M3 10.5 12 4l9 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    lote: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="4.5" x2="12" y2="12"/>',
    siembra:
      '<path d="M12 21v-8"/><path d="M12 13c0-3.3 2.4-5.5 5.5-5.5C17.5 10.8 15.1 13 12 13z"/><path d="M12 13c0-2.8-2-4.8-4.8-4.8C7.2 11 9.2 13 12 13z"/>',
  };

  const svg = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  // Navegación: a dónde lleva cada ícono.
  const NAV = [
    { href: "dashboard_mi_campo.html", tip: "Panel", icono: "panel" },
    { href: "semaforo.html", tip: "Semáforo", icono: "semaforo" },
    { href: "perfil.html", tip: "Mi perfil", icono: "perfil" },
  ];

  // Los 3 botones de crear. "destino" es la pantalla a la que llevan POR AHORA;
  // en la etapa 4 van a abrir un modal en vez de navegar.
  const ACCIONES = [
    {
      accion: "establecimiento",
      tip: "Crear establecimiento",
      icono: "establecimiento",
      destino: "configuracion_de_campos.html",
    },
    {
      accion: "lote",
      tip: "Crear lote",
      icono: "lote",
      destino: "configuracion_de_campos.html",
    },
    {
      accion: "siembra",
      tip: "Crear siembra",
      icono: "siembra",
      destino: "datos_de_siembra.html",
    },
  ];

  const barra = document.createElement("header");
  barra.className = "barra-superior";
  barra.innerHTML = `
    <a class="barra-superior__marca" href="dashboard_mi_campo.html">
      <span class="barra-superior__logo"></span>
      <span class="barra-superior__nombre">AgroWatchOut</span>
    </a>

    <nav class="barra-superior__nav">
      ${NAV.map(
        (n) => `
        <a href="${n.href}"
           class="barra-superior__icono con-tip${n.href === PAGINA ? " barra-superior__icono--activo" : ""}"
           data-tip="${n.tip}" aria-label="${n.tip}">${svg(ICONOS[n.icono])}</a>
      `,
      ).join("")}
    </nav>

    <div class="barra-superior__acciones">
      ${ACCIONES.map(
        (a) => `
        <button type="button" class="barra-superior__accion con-tip"
                data-accion="${a.accion}" data-tip="${a.tip}" aria-label="${a.tip}">${svg(ICONOS[a.icono])}</button>
      `,
      ).join("")}
      <button type="button" class="barra-superior__icono con-tip" data-cerrar-sesion
              data-tip="Cerrar sesión" aria-label="Cerrar sesión">${svg(ICONOS.salir)}</button>
    </div>
  `;

  document.body.prepend(barra);

  // Clic en un botón de crear.
  barra.querySelectorAll("[data-accion]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const { accion } = boton.dataset;
      // Etapa 4: acá se va a abrir el modal. Mientras tanto, lleva a la
      // pantalla que hace esa tarea hoy.
      const destino = ACCIONES.find((a) => a.accion === accion).destino;
      window.location.href = destino;
    });
  });
})();
