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

// Siembras para el selector "Ver otro lote": las del establecimiento elegido
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

  const aviso = document.getElementById('avisoSemaforo');
  const tarjeta = document.querySelector('.tarjeta-semaforo');
  const tituloEncabezado = document.querySelector('.encabezado-lote__titulo');
  const selector = document.getElementById('selectorSiembra');

  // Reemplaza la tarjeta por un mensaje (con un link para resolverlo).
  function mostrarAviso(texto, link, textoLink) {
    aviso.innerHTML = `<p>${escapar(texto)}</p><a href="${link}">${textoLink}</a>`;
    aviso.hidden = false;
    tarjeta.hidden = true;
  }

  // ---- ¿Qué siembra mostrar? ----
  // Con ?siembra=ID (desde el dashboard o datos de siembra), esa. Sin parámetro
  // (ícono "Lotes" de la barra lateral): la última que se miró, o si no, la
  // primera del campo. Si el campo no tiene siembras, se avisa.
  const opciones = await siembrasDelCampo();
  let siembraId = num(new URLSearchParams(window.location.search).get('siembra'));

  if (!siembraId) {
    const ultima = num(localStorage.getItem('ultimaSiembra'));
    siembraId = opciones.some((s) => s.id === ultima) ? ultima : (opciones[0]?.id ?? null);
    if (!siembraId) {
      tituloEncabezado.textContent = 'Semáforo';
      mostrarAviso('Todavía no hay siembras cargadas en este campo para la campaña actual.', 'dashboard_mi_campo.html', 'Ir al panel para cargar una');
      return;
    }
    // Se pone en la URL: así F5 y "Editar siembra" usan la misma siembra.
    history.replaceState(null, '', `?siembra=${siembraId}`);
  }

  const urlEditar = `datos_de_siembra.html?siembra=${siembraId}`;
  document.getElementById('editarSiembra').href = urlEditar;

  // ---- La siembra (nombres de lote, cultivo y campaña) ----
  let siembra;
  try {
    siembra = await API.get(`/siembras/${siembraId}`);
  } catch (error) {
    // 404: no existe o es de otro usuario (la API no distingue a propósito).
    tituloEncabezado.textContent = 'Semáforo'; // si no, queda "Cargando..."
    mostrarAviso(error.message, 'dashboard_mi_campo.html', 'Volver al panel');
    return;
  }
  // La próxima vez que se entre desde la barra lateral, se abre esta.
  localStorage.setItem('ultimaSiembra', siembraId);

  // ---- Selector "Ver otro lote" ----
  // Si la siembra es de otro establecimiento (ej. llegaste por un link), se agrega igual.
  if (!opciones.some((s) => s.id === siembra.id)) opciones.unshift(siembra);
  selector.innerHTML = opciones
    .map((s) => `<option value="${s.id}">${escapar(`${s.lote_nombre} — ${s.cultivo_nombre}`)}</option>`)
    .join('');
  selector.value = siembra.id;
  // Con una sola siembra no hay a dónde cambiar: se oculta.
  document.getElementById('cambioSiembra').hidden = opciones.length < 2;
  selector.addEventListener('change', () => {
    window.location.href = `semaforo.html?siembra=${selector.value}`;
  });

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
    mostrarAviso(texto, urlEditar, 'Completar datos de siembra');
    return;
  }

  const pct = num(m.margen_pct); // "0.9531" -> 0.9531; puede venir null si no hay ingreso
  document.getElementById('agujaSemaforo').setAttribute('transform', `rotate(${anguloAguja(pct ?? -1)} 110 110)`);
  document.getElementById('valorRentabilidad').textContent = pct === null ? '-' : `${formatoNumero(pct * 100, 1)}%`;
  document.getElementById('valorRinde').textContent = `${formatoNumero(num(m.rinde_indiferencia_kg_ha) / 100, 1)} qq/ha`;

  const estado = document.getElementById('estadoSemaforo');
  estado.textContent = ESTADOS[m.semaforo] ?? '';
  estado.className = `semaforo-gauge__estado semaforo-gauge__estado--${m.semaforo}`;

  // Importes: el cálculo es en USD; los *_ars son solo para mostrar.
  const usd = (v) => `US$ ${formatoNumero(num(v))}`;
  const ars = (v) => `$ ${formatoNumero(num(v))}`;
  document.getElementById('detIngreso').textContent = `${usd(m.ingreso_esperado_usd)} (${ars(m.ingreso_esperado_ars)})`;
  document.getElementById('detCosto').textContent = `${usd(m.costo_total_usd)} (${ars(m.costo_total_ars)})`;
  document.getElementById('detCostoHa').textContent = `${usd(m.costo_por_ha_usd)} (${ars(m.costo_por_ha_ars)})`;
  document.getElementById('detMargen').textContent = `${usd(m.margen_bruto_usd)} (${ars(m.margen_bruto_ars)})`;

  const cot = m.cotizacion_vigente;
  document.getElementById('detPrecio').textContent =
    `${cot.moneda} ${formatoNumero(num(cot.precio), 2)} / ${m.precio_neto_usd.unidad} · ${cot.mercado}, ${fechaCorta(cot.fecha)}`;
  document.getElementById('detDolar').textContent =
    `$ ${formatoNumero(num(m.tipo_cambio_usado.valor), 2)} (${fechaCorta(m.tipo_cambio_usado.fecha)})`;
  subtitulo.textContent += ` · Cotización del ${fechaCorta(cot.fecha)}`;
});