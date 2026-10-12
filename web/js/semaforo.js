// Texto de cada valor de margen.semaforo.
const ESTADOS = { verde: 'Bien', amarillo: 'Ajustado', rojo: 'Alerta' };

// "2026-09-20" -> "20/09/2026"
const fechaCorta = (iso) => iso.split('-').reverse().join('/');

// Ángulo de la aguja en grados (0 = arriba, -90 = izquierda, 90 = derecha).
//   rojo: margen de -100% a 0%  ->  -90° a -25,7°
//   amarillo: 0% a 20%          ->  -25,7° a 25,7°
//   verde: 20% a 100%           ->  25,7° a 90°
const CORTE = 25.7;
function anguloAguja(pct) {
  const p = Math.max(-1, Math.min(1, pct)); // fuera de ±100% la aguja queda en el tope
  if (p <= 0) return -90 + (p + 1) * (90 - CORTE);
  if (p < 0.2) return -CORTE + (p / 0.2) * (2 * CORTE);
  return CORTE + ((p - 0.2) / 0.8) * (90 - CORTE);
}

// Mismo umbral que CalculoMargen::UMBRAL_VERDE (src/app/Services/CalculoMargen.php) — no está
// expuesto por la API, así que para el agregado por campaña se reimplementa acá (igual que en
// dashboard.js).
const UMBRAL_VERDE = 0.20;
function semaforoDeMargen(margen, ingreso) {
  if (margen <= 0) return 'rojo';
  if (ingreso > 0 && margen >= UMBRAL_VERDE * ingreso) return 'verde';
  return 'amarillo';
}

// Importes: el cálculo es en USD; los *_ars son solo para mostrar.
const usd = (v) => `US$ ${formatoNumero(num(v))}`;
const ars = (v) => `$ ${formatoNumero(num(v))}`;

function mostrarAviso(aviso, tarjeta, texto, link, textoLink) {
  aviso.innerHTML = `<p>${escapar(texto)}</p><a href="${link}">${textoLink}</a>`;
  aviso.hidden = false;
  tarjeta.hidden = true;
}

// Siembras para el selector "Ver otro lote" (modo siembra): las del establecimiento elegido
// en el panel, en la campaña abierta más reciente (lo mismo que muestra el dashboard).
async function siembrasDelCampo() {
  const [campanias, establecimientos] = await Promise.all([
    API.get('/campanias'),
    API.get('/establecimientos'),
  ]);
  const campania = campanias
    .filter((c) => !Number(c.cerrada))
    .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))[0];
  if (!campania || establecimientos.length === 0) return [];

  const guardado = localStorage.getItem('establecimientoActual');
  const establecimiento = establecimientos.find((e) => String(e.id) === guardado) ?? establecimientos[0];

  const [lotes, siembras] = await Promise.all([
    API.get(`/lotes?establecimiento_id=${establecimiento.id}`),
    API.get(`/siembras?campania_id=${campania.id}`),
  ]);
  const idsDeLotes = new Set(lotes.map((l) => Number(l.id)));
  return siembras.filter((s) => idsDeLotes.has(Number(s.lote_id)));
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await usuarioLogueado())) return;

  // Con ?siembra=ID (desde el dashboard: "Abrir lote completo") se ve el detalle de esa
  // siembra puntual. Sin parámetro (ícono "Lotes" de la barra lateral) se ve el semáforo
  // agregado del establecimiento, con un selector para cambiar de campaña.
  const siembraId = num(new URLSearchParams(window.location.search).get('siembra'));
  try {
    if (siembraId) {
      await modoSiembra(siembraId);
    } else {
      await modoCampania();
    }
  } catch (error) {
    // Si algo revienta a mitad de camino (red, un dato inesperado) que se vea el motivo
    // en vez de quedar la pantalla en blanco sin explicación.
    mostrarAviso(
      document.getElementById('avisoSemaforo'),
      document.querySelector('.tarjeta-semaforo'),
      `No se pudo cargar el semáforo: ${error.message}`,
      'dashboard_mi_campo.html',
      'Volver al panel',
    );
  }
});

// ---------- modo siembra: detalle de un lote puntual (llegando desde "Abrir lote completo") ----------
async function modoSiembra(siembraId) {
  const aviso = document.getElementById('avisoSemaforo');
  const tarjeta = document.querySelector('.tarjeta-semaforo');
  const tituloEncabezado = document.querySelector('.encabezado-lote__titulo');
  const cambioVista = document.getElementById('cambioVista');
  const etiquetaVista = document.getElementById('etiquetaVista');
  const selector = document.getElementById('selectorVista');

  document.getElementById('editarSiembra').hidden = false;
  document.getElementById('otraSiembra').hidden = false;

  const urlEditar = `datos_de_siembra.html?siembra=${siembraId}`;
  document.getElementById('editarSiembra').href = urlEditar;

  let siembra;
  try {
    siembra = await API.get(`/siembras/${siembraId}`);
  } catch (error) {
    // 404: no existe o es de otro usuario (la API no distingue a propósito).
    tituloEncabezado.textContent = 'Semáforo'; // si no, queda "Cargando..."
    mostrarAviso(aviso, tarjeta, error.message, 'dashboard_mi_campo.html', 'Volver al panel');
    return;
  }

  document.getElementById('otraSiembra').href = `datos_de_siembra.html?lote=${siembra.lote_id}`;

  // ---- Selector "Ver otro lote" ----
  const opciones = await siembrasDelCampo();
  // Si la siembra es de otro establecimiento o de otra campaña (ej. llegaste por un link), se agrega igual.
  if (!opciones.some((s) => s.id === siembra.id)) opciones.unshift(siembra);
  etiquetaVista.textContent = 'Ver otro lote:';
  selector.innerHTML = opciones
    .map((s) => `<option value="${s.id}">${escapar(`${s.lote_nombre} — ${s.cultivo_nombre}`)}</option>`)
    .join('');
  selector.value = siembra.id;
  // Con una sola siembra no hay a dónde cambiar: se oculta.
  cambioVista.hidden = opciones.length < 2;
  selector.onchange = () => {
    window.location.href = `semaforo.html?siembra=${selector.value}`;
  };

  const titulo = `${siembra.lote_nombre} — ${siembra.cultivo_nombre}`;
  document.title = `AgroWatchOut — ${titulo}`;
  tituloEncabezado.textContent = titulo;
  const subtitulo = document.querySelector('.encabezado-lote__subtitulo');
  subtitulo.textContent = `Campaña ${siembra.campania_nombre} · ${formatoNumero(num(siembra.ha_sembradas), 1)} ha sembradas`;

  // ---- El margen ----
  let m;
  try {
    m = await API.get(`/siembras/${siembraId}/margen`);
  } catch (error) {
    // 422 = falta un dato para calcular (costos, rinde, cotización): se dice cuál.
    const texto = error.status === 422 ? error.message : 'No se pudo calcular la proyección.';
    mostrarAviso(aviso, tarjeta, texto, urlEditar, 'Completar datos de siembra');
    return;
  }

  const pct = num(m.margen_pct); // "0.9531" -> 0.9531; puede venir null si no hay ingreso
  document.getElementById('agujaSemaforo').setAttribute('transform', `rotate(${anguloAguja(pct ?? -1)} 110 110)`);
  document.getElementById('valorRentabilidad').textContent = pct === null ? '-' : `${formatoNumero(pct * 100, 1)}%`;
  document.getElementById('etiquetaSecundaria').textContent = 'Rinde de indiferencia';
  document.getElementById('valorRinde').textContent = `${formatoNumero(num(m.rinde_indiferencia_kg_ha) / 100, 1)} qq/ha`;

  const estado = document.getElementById('estadoSemaforo');
  estado.textContent = ESTADOS[m.semaforo] ?? '';
  estado.className = `semaforo-gauge__estado semaforo-gauge__estado--${m.semaforo}`;

  document.getElementById('detIngreso').textContent = `${usd(m.ingreso_esperado_usd)} (${ars(m.ingreso_esperado_ars)})`;
  document.getElementById('detCosto').textContent = `${usd(m.costo_total_usd)} (${ars(m.costo_total_ars)})`;
  document.getElementById('detCostoHa').textContent = `${usd(m.costo_por_ha_usd)} (${ars(m.costo_por_ha_ars)})`;
  document.getElementById('detMargen').textContent = `${usd(m.margen_bruto_usd)} (${ars(m.margen_bruto_ars)})`;

  document.getElementById('etiquetaPrecio').textContent = 'Precio usado';
  const cot = m.cotizacion_vigente;
  document.getElementById('detPrecio').textContent =
    `${cot.moneda} ${formatoNumero(num(cot.precio), 2)} / ${m.precio_neto_usd.unidad} · ${cot.mercado}, ${fechaCorta(cot.fecha)}`;
  document.getElementById('detDolar').textContent =
    `$ ${formatoNumero(num(m.tipo_cambio_usado.valor), 2)} (${fechaCorta(m.tipo_cambio_usado.fecha)})`;
  subtitulo.textContent += ` · Cotización del ${fechaCorta(cot.fecha)}`;
}

// ---------- modo campaña: semáforo agregado del establecimiento, eligiendo la campaña ----------
async function modoCampania() {
  const aviso = document.getElementById('avisoSemaforo');
  const tarjeta = document.querySelector('.tarjeta-semaforo');
  const tituloEncabezado = document.querySelector('.encabezado-lote__titulo');
  const subtitulo = document.querySelector('.encabezado-lote__subtitulo');
  const cambioVista = document.getElementById('cambioVista');
  const etiquetaVista = document.getElementById('etiquetaVista');
  const selector = document.getElementById('selectorVista');

  // No hay una siembra puntual que editar en este modo.
  document.getElementById('editarSiembra').hidden = true;
  document.getElementById('otraSiembra').hidden = true;

  const [establecimientos, campanias] = await Promise.all([
    API.get('/establecimientos'),
    API.get('/campanias'),
  ]);

  if (establecimientos.length === 0) {
    window.location.href = 'configuracion_de_campos.html';
    return;
  }
  const guardado = localStorage.getItem('establecimientoActual');
  const establecimiento = establecimientos.find((e) => String(e.id) === guardado) ?? establecimientos[0];

  document.title = `AgroWatchOut — ${establecimiento.nombre}`;
  tituloEncabezado.textContent = establecimiento.nombre;

  if (campanias.length === 0) {
    mostrarAviso(aviso, tarjeta, 'Todavía no hay campañas cargadas.', 'dashboard_mi_campo.html', 'Ir al panel');
    return;
  }

  // ---- Selector "Ver otra campaña" ----
  const campaniasOrdenadas = [...campanias].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));
  const idUrl = num(new URLSearchParams(window.location.search).get('campania'));
  const idGuardado = num(localStorage.getItem('ultimaCampania'));
  const abierta = campaniasOrdenadas.find((c) => !Number(c.cerrada));
  const campania =
    campaniasOrdenadas.find((c) => c.id === idUrl) ??
    campaniasOrdenadas.find((c) => c.id === idGuardado) ??
    abierta ??
    campaniasOrdenadas[0];

  localStorage.setItem('ultimaCampania', campania.id);
  try { history.replaceState(null, '', `?campania=${campania.id}`); } catch { /* vista privada: no pasa nada */ }

  etiquetaVista.textContent = 'Ver otra campaña:';
  selector.innerHTML = campaniasOrdenadas
    .map((c) => `<option value="${c.id}">${escapar(c.nombre)}${Number(c.cerrada) ? ' (cerrada)' : ''}</option>`)
    .join('');
  selector.value = campania.id;
  cambioVista.hidden = campaniasOrdenadas.length < 2;
  selector.onchange = () => {
    window.location.href = `semaforo.html?campania=${selector.value}`;
  };

  // ---- Lotes y siembras de esa campaña, con el margen de cada una (igual patrón que el panel) ----
  const [lotes, siembras] = await Promise.all([
    API.get(`/lotes?establecimiento_id=${establecimiento.id}`),
    API.get(`/siembras?campania_id=${campania.id}`),
  ]);

  const filas = await Promise.all(lotes.map(async (lote) => {
    const siembra = siembras.find((s) => Number(s.lote_id) === Number(lote.id)) ?? null;
    let margen = null;
    if (siembra) {
      try {
        margen = await API.get(`/siembras/${siembra.id}/margen`);
      } catch { /* se excluye del agregado, igual que en el panel: no corta la página entera */ }
    }
    return { lote, siembra, margen };
  }));

  const conSiembra = filas.filter((f) => f.siembra);
  const conMargen = filas.filter((f) => f.margen);
  const hectareas = filas.reduce((t, f) => t + num(f.lote.ha_totales), 0);
  const haSembradas = conSiembra.reduce((t, f) => t + num(f.siembra.ha_sembradas), 0);

  subtitulo.textContent = `Campaña ${campania.nombre} · ${formatoNumero(haSembradas, 1)} de ${formatoNumero(hectareas, 1)} ha sembradas`;

  document.getElementById('etiquetaSecundaria').textContent = 'Hectáreas sembradas';
  document.getElementById('valorRinde').textContent = `${formatoNumero(haSembradas, 1)} de ${formatoNumero(hectareas, 1)} ha`;
  document.getElementById('etiquetaPrecio').textContent = 'Cotizaciones usadas';

  if (conMargen.length === 0) {
    document.getElementById('agujaSemaforo').setAttribute('transform', 'rotate(-90 110 110)');
    document.getElementById('valorRentabilidad').textContent = '-';
    const estado = document.getElementById('estadoSemaforo');
    estado.textContent = 'Sin datos';
    estado.className = 'semaforo-gauge__estado semaforo-gauge__estado--sin-dato';
    ['detIngreso', 'detCosto', 'detCostoHa', 'detMargen', 'detPrecio', 'detDolar'].forEach((id) => {
      document.getElementById(id).textContent = '-';
    });
    return;
  }

  // Agregado en USD (mismo criterio que resumenAgregado() del panel): se suman los montos
  // reales de cada siembra, no se promedian los porcentajes.
  const haSembradasConMargen = conMargen.reduce((t, f) => t + num(f.margen.ha_sembradas), 0);
  const ingresoTotalUsd = conMargen.reduce((t, f) => t + num(f.margen.ingreso_esperado_usd), 0);
  const costoTotalUsd = conMargen.reduce((t, f) => t + num(f.margen.costo_total_usd), 0);
  const margenTotalUsd = ingresoTotalUsd - costoTotalUsd;
  const ingresoTotalArs = conMargen.reduce((t, f) => t + num(f.margen.ingreso_esperado_ars), 0);
  const costoTotalArs = conMargen.reduce((t, f) => t + num(f.margen.costo_total_ars), 0);
  const margenTotalArs = ingresoTotalArs - costoTotalArs;
  const costoHaUsd = haSembradasConMargen > 0 ? costoTotalUsd / haSembradasConMargen : null;
  const costoHaArs = haSembradasConMargen > 0 ? costoTotalArs / haSembradasConMargen : null;

  const pct = ingresoTotalUsd > 0 ? margenTotalUsd / ingresoTotalUsd : null;
  const estadoGlobal = semaforoDeMargen(margenTotalUsd, ingresoTotalUsd);

  document.getElementById('agujaSemaforo').setAttribute('transform', `rotate(${anguloAguja(pct ?? -1)} 110 110)`);
  document.getElementById('valorRentabilidad').textContent = pct === null ? '-' : `${formatoNumero(pct * 100, 1)}%`;
  const estado = document.getElementById('estadoSemaforo');
  estado.textContent = ESTADOS[estadoGlobal] ?? '';
  estado.className = `semaforo-gauge__estado semaforo-gauge__estado--${estadoGlobal}`;

  document.getElementById('detIngreso').textContent = `${usd(ingresoTotalUsd)} (${ars(ingresoTotalArs)})`;
  document.getElementById('detCosto').textContent = `${usd(costoTotalUsd)} (${ars(costoTotalArs)})`;
  document.getElementById('detCostoHa').textContent = costoHaUsd === null ? '-' : `${usd(costoHaUsd)} (${ars(costoHaArs)})`;
  document.getElementById('detMargen').textContent = `${usd(margenTotalUsd)} (${ars(margenTotalArs)})`;

  // Un precio por cultivo (no hay un "precio usado" único cuando hay varios cultivos).
  const porCultivo = new Map();
  for (const f of conMargen) {
    if (porCultivo.has(f.siembra.cultivo_nombre)) continue;
    const c = f.margen.cotizacion_vigente;
    porCultivo.set(
      f.siembra.cultivo_nombre,
      `${f.siembra.cultivo_nombre} ${c.moneda} ${formatoNumero(num(c.precio), 2)}/${f.margen.precio_neto_usd.unidad} (${fechaCorta(c.fecha)})`,
    );
  }
  document.getElementById('detPrecio').textContent = [...porCultivo.values()].join(' · ');

  // El dólar oficial usado es "el de hoy" para todas las siembras por igual (no depende del
  // cultivo ni de la campaña), así que cualquiera de los márgenes calculados sirve.
  const dolar = conMargen[0].margen.tipo_cambio_usado;
  document.getElementById('detDolar').textContent = `$ ${formatoNumero(num(dolar.valor), 2)} (${fechaCorta(dolar.fecha)})`;
}
