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
    engranaje:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    establecimiento:
      '<path d="M3 10.5 12 4l9 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    // Mapa plegado. Lo usa "Mi establecimiento" en la nav: la casita ya es el
    // boton de CREAR establecimiento, y a 19px las dos juntas se confunden.
    mapa:
      '<path d="m9 4.5-5.2 2.1a1 1 0 0 0-.8 1V19a.6.6 0 0 0 .8.5L9 17.5l6 2 5.2-2.1a1 1 0 0 0 .8-1V4.5a.6.6 0 0 0-.8-.5L15 6z"/><line x1="9" y1="4.5" x2="9" y2="17.5"/><line x1="15" y1="6" x2="15" y2="19.5"/>',
    lote: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="4.5" x2="12" y2="12"/>',
    siembra:
      '<path d="M12 21v-8"/><path d="M12 13c0-3.3 2.4-5.5 5.5-5.5C17.5 10.8 15.1 13 12 13z"/><path d="M12 13c0-2.8-2-4.8-4.8-4.8C7.2 11 9.2 13 12 13z"/>',
  };

  const svg = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  // Navegación: a dónde lleva cada ícono. Perfil no va acá: vive en el
  // desplegable del engranaje, a la derecha de todo.
  const NAV = [
    { clave: "panel", href: "dashboard_mi_campo.html", tip: "Panel", icono: "panel" },
    { clave: "semaforo", href: "semaforo.html", tip: "Semáforo", icono: "semaforo" },
    // Antes era el enlace "Editar campo" suelto en el encabezado del panel.
    // Acá se llama "establecimiento" como en el resto de la app, y al ser una
    // pantalla principal mas vive en la nav junto a Panel y Semaforo.
    {
      clave: "establecimiento",
      href: "configuracion_de_campos.html",
      tip: "Mi establecimiento",
      icono: "mapa",
    },
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
        <a href="${n.href}" data-nav="${n.clave}"
           class="barra-superior__navitem${n.href === PAGINA ? " barra-superior__navitem--activo" : ""}"
           aria-label="${n.tip}">${svg(ICONOS[n.icono])}<span>${n.tip}</span></a>
      `,
      ).join("")}
    </nav>

    <div class="barra-superior__acciones">
           ${ACCIONES.map((a) => `
        <button type="button" class="barra-superior__accion"
                data-accion="${a.accion}" aria-label="${a.tip}">
          ${svg(ICONOS[a.icono])}<span>${a.tip}</span>
        </button>
      `).join('')}
    </div>

    <div class="barra-superior__perfil">
      <button type="button" class="barra-superior__icono" data-perfil-toggle
              aria-haspopup="true" aria-expanded="false" aria-label="Perfil y configuración">
        ${svg(ICONOS.engranaje)}
      </button>
      <div class="barra-superior__menu" data-perfil-menu hidden>
        <a href="perfil.html" class="barra-superior__menu-item">${svg(ICONOS.perfil)}<span>Mi perfil</span></a>
        <button type="button" class="barra-superior__menu-item" data-cerrar-sesion>
          ${svg(ICONOS.salir)}<span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  `;

  document.body.prepend(barra);

  // "Mi establecimiento" abre la configuracion DEL establecimiento elegido en el
  // panel, no el alta en blanco: sin ?establecimiento=<id>, configuracion.js
  // arranca en modo "crear uno nuevo" (que es lo que hace el boton de crear).
  // El id sale de localStorage, la misma llave que escriben el panel y el
  // perfil al cambiar de establecimiento. Se recalcula en cada clic porque la
  // barra se arma una sola vez al cargar la pagina, pero el selector del panel
  // puede cambiar el establecimiento despues, sin recargar.
  const itemEstablecimiento = barra.querySelector('[data-nav="establecimiento"]');
  const hrefEstablecimiento = () => {
    const id = localStorage.getItem("establecimientoActual");
    return id
      ? `configuracion_de_campos.html?establecimiento=${id}`
      : "configuracion_de_campos.html";
  };
  itemEstablecimiento.href = hrefEstablecimiento();
  // El navegador lee el href DESPUES del listener, asi que alcanza con
  // actualizarlo acá (no hace falta preventDefault ni location.href a mano).
  itemEstablecimiento.addEventListener("click", () => {
    itemEstablecimiento.href = hrefEstablecimiento();
  });

  // Clic en un botón de crear.
  barra.querySelectorAll("[data-accion]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const { accion } = boton.dataset;
      // Si ya existe la ventana emergente para esta accion, se abre. Las que
      // todavia no estan hechas caen a la pantalla que hace esa tarea hoy.
      // Ojo: Modales se declara con const, asi que NO existe como
      // window.Modales (solo var y las funciones se cuelgan de window).
      // Por eso se usa directo, con typeof por si el archivo no cargo.
      if (typeof Modales !== 'undefined' && Modales.abrir(accion)) return;
      window.location.href = ACCIONES.find((a) => a.accion === accion).destino;
    });
  });

  // Desplegable del engranaje: "Mi perfil" / "Cerrar sesión".
  const contenedorPerfil = barra.querySelector(".barra-superior__perfil");
  const botonPerfil = barra.querySelector("[data-perfil-toggle]");
  const menuPerfil = barra.querySelector("[data-perfil-menu]");

  const cerrarMenuPerfil = () => {
    menuPerfil.hidden = true;
    botonPerfil.setAttribute("aria-expanded", "false");
  };

  botonPerfil.addEventListener("click", (evento) => {
    evento.stopPropagation();
    const estaAbierto = !menuPerfil.hidden;
    menuPerfil.hidden = estaAbierto;
    botonPerfil.setAttribute("aria-expanded", String(!estaAbierto));
  });

  // Clic afuera del desplegable, o Escape, lo cierran.
  document.addEventListener("click", (evento) => {
    if (!contenedorPerfil.contains(evento.target)) cerrarMenuPerfil();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") cerrarMenuPerfil();
  });
})();
