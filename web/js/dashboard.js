// como se muestra cada valor de margen.semaforo
const ESTADOS = {
    verde: { clase: 'bien', texto: 'Bien'},
    amarillo: { clase: 'ajustado', texto: 'Ajustado'},
    rojo: { clase: 'alerta', texto: 'Alerta'},
};

const iconoEstado = (estado) => estado === 'rojo' ? '✕' : estado === 'amarillo' ? '!' : estado === 'verde' ? '✓' : '—';

// Mismo umbral que CalculoMargen::UMBRAL_VERDE (src/app/Services/CalculoMargen.php).
// No está expuesto por la API: si cambia ahí, hay que cambiarlo acá también.
const UMBRAL_VERDE = 0.20;

// Mismas 7 categorías del enum real (src/app/Schemas/costos.json), no las del boceto de referencia.
const CATEGORIAS_COSTO = {
    semilla: '#4f8f63',
    fertilizante: '#e0a83c',
    herbicida: '#d1583f',
    maquinaria: '#1c3325',
    labor: '#e8b84b',
    flete: '#6c93b0',
    otro: '#9aa0a6',
};

// Color fijo por cultivo (no por orden de aparición): así el mismo cultivo siempre se ve
// igual, y se eligen a propósito bien separados en el círculo cromático para que no se
// confundan dos parecidos (ej. verde de soja vs. verde de girasol).
const COLORES_CULTIVO = {
    Soja: '#4f8f63',
    Maiz: '#e0a83c',
    Girasol: '#c9752e',
    Trigo: '#6c93b0',
    Sorgo: '#8a5fb0',
};
const COLOR_CULTIVO_DEFECTO = '#9aa0a6';
const COLOR_SIN_SEMBRAR = '#c9cfc9';

// No hay un campo de "días sin actualizar" en la API: se calcula acá contra la fecha de la cotización.
const DIAS_COTIZACION_VIEJA = 2;

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaCorta = (iso) => iso.split('-').reverse().join('/');

const fUsd = (v) => v === null ? '-' : `${v < 0 ? '−' : ''}US$ ${formatoNumero(Math.abs(v), 0)}`;
const fArs = (v) => v === null ? '-' : `${v < 0 ? '−' : ''}$ ${formatoNumero(Math.abs(v), 0)}`;
const fKg = (v) => v === null ? '-' : `${v < 0 ? '−' : ''}${formatoNumero(Math.abs(v), 0)} kg/ha`;

function textoClima(codigo) {
    if (codigo === 0) return 'Despejado';
    if (codigo <= 2) return 'Parcialmente nublado';
    if (codigo === 3) return 'Nublado';
    if (codigo <= 48) return 'Niebla';
    if (codigo <= 57) return 'Llovizna';
    if (codigo <= 67) return 'Lluvia';
    if (codigo <= 77) return 'Nieve';
    if (codigo <= 82) return 'Chaparrones';
    if (codigo <= 86) return 'Nieve';
    return 'Tormenta';
}

// ---------- cálculos puros sobre una fila {lote, siembra, margen, motivo, estado} ----------

// Colchón: cuánto puede bajar el rinde antes de perder plata. rinde_esperado viene en kg/ha,
// igual que rinde_indiferencia_kg_ha (confirmado en SiembraController::margen() y el comentario
// de CalculoMargen.php) — no se convierte a qq/ha como en el boceto de referencia.
function colchonKgHa(fila) {
    if (!fila.margen || fila.siembra?.rinde_esperado == null) return null;
    return num(fila.siembra.rinde_esperado) - num(fila.margen.rinde_indiferencia_kg_ha);
}

function margenUsdPorHa(fila) {
    if (!fila.margen) return null;
    const ha = num(fila.margen.ha_sembradas);
    return ha > 0 ? num(fila.margen.margen_bruto_usd) / ha : null;
}

// rojo primero, después amarillo, verde, y sin datos al final.
function severidad(fila) {
    if (fila.estado === 'rojo') return 0;
    if (fila.estado === 'amarillo') return 1;
    if (fila.estado === 'verde') return 2;
    return 3;
}

function filasOrdenadas(filas) {
    return [...filas].sort((a, b) => {
        const diferencia = severidad(a) - severidad(b);
        if (diferencia !== 0) return diferencia;
        const pa = a.margen ? (num(a.margen.margen_pct) ?? -Infinity) : -Infinity;
        const pb = b.margen ? (num(b.margen.margen_pct) ?? -Infinity) : -Infinity;
        return pa - pb;
    });
}

// Misma lógica de 3 ramas que CalculoMargen::semaforo().
function semaforoDeMargen(margen, ingreso) {
    if (margen <= 0) return 'rojo';
    if (ingreso > 0 && margen >= UMBRAL_VERDE * ingreso) return 'verde';
    return 'amarillo';
}

function resumenAgregado(filas) {
    const conSiembra = filas.filter((f) => f.siembra);
    const conMargen = filas.filter((f) => f.margen);
    const lotesEnAlerta = filas.filter((f) => f.estado === 'rojo');

    const hectareas = filas.reduce((total, f) => total + num(f.lote.ha_totales), 0);
    const haSembradas = conSiembra.reduce((total, f) => total + num(f.siembra.ha_sembradas), 0);

    // Margen por hectárea PONDERADO: total de margen ÷ total de hectáreas sembradas (solo
    // las siembras con margen calculado) — un promedio simple pesaría igual un lote de 10 ha
    // que uno de 500.
    const haSembradasConMargen = conMargen.reduce((total, f) => total + num(f.margen.ha_sembradas), 0);
    const margenTotalUsdRaw = conMargen.reduce((total, f) => total + num(f.margen.margen_bruto_usd), 0);
    const margenTotalUsd = conMargen.length > 0 ? margenTotalUsdRaw : null;
    const margenHaUsd = haSembradasConMargen > 0 ? margenTotalUsdRaw / haSembradasConMargen : null;

    const ingresoTotalUsd = conMargen.reduce((total, f) => total + num(f.margen.ingreso_esperado_usd), 0);
    const margenPctGlobal = ingresoTotalUsd > 0 ? margenTotalUsdRaw / ingresoTotalUsd : null;
    const estadoGlobal = conMargen.length === 0 ? null : semaforoDeMargen(margenTotalUsdRaw, ingresoTotalUsd);

    return { filas, conSiembra, lotesEnAlerta, hectareas, haSembradas, margenTotalUsd, margenHaUsd, margenPctGlobal, estadoGlobal };
}

function agregarCostosPorCategoria(filas) {
    const totales = {};
    let haSembradasTotal = 0;
    for (const f of filas) {
        if (!f.margen) continue;
        haSembradasTotal += num(f.margen.ha_sembradas);
        for (const linea of f.margen.detalle_costos) {
            totales[linea.categoria] = (totales[linea.categoria] ?? 0) + num(linea.importe_usd);
        }
    }
    const categorias = Object.keys(totales);
    if (categorias.length === 0) return [];
    const totalGeneral = categorias.reduce((t, c) => t + totales[c], 0);
    return categorias
        .map((categoria) => ({
            categoria,
            nombre: capitalizar(categoria),
            color: CATEGORIAS_COSTO[categoria] ?? '#9aa0a6',
            usdHa: haSembradasTotal > 0 ? totales[categoria] / haSembradasTotal : 0,
            porcentaje: totalGeneral > 0 ? Math.round((totales[categoria] / totalGeneral) * 100) : 0,
        }))
        .sort((a, b) => b.usdHa - a.usdHa);
}

function agregarSuperficiePorCultivo(filas) {
    const porCultivo = new Map();
    let sinSembrar = 0;
    for (const f of filas) {
        if (f.siembra) {
            const nombre = f.siembra.cultivo_nombre;
            porCultivo.set(nombre, (porCultivo.get(nombre) ?? 0) + num(f.siembra.ha_sembradas));
        } else {
            sinSembrar += num(f.lote.ha_totales);
        }
    }
    const items = [...porCultivo].map(([nombre, ha]) => ({ nombre, ha, color: COLORES_CULTIVO[nombre] ?? COLOR_CULTIVO_DEFECTO }));
    if (sinSembrar > 0) items.push({ nombre: 'Sin sembrar', ha: sinSembrar, color: COLOR_SIN_SEMBRAR });
    return items;
}

// No hay GET /cotizaciones: se toma la cotización vigente de la primera siembra de cada cultivo
// que ya trajo su margen (mismo patrón que usaba dibujarCotizaciones).
function agregarMercado(filas) {
    const porCultivo = new Map();
    let tipoCambio = null;
    for (const f of filas) {
        if (!f.margen) continue;
        if (!porCultivo.has(f.siembra.cultivo_nombre)) {
            porCultivo.set(f.siembra.cultivo_nombre, { ...f.margen.cotizacion_vigente, unidad: f.margen.precio_neto_usd.unidad });
        }
        if (!tipoCambio) tipoCambio = f.margen.tipo_cambio_usado;
    }

    const hoy = new Date();
    const diasDesde = (iso) => Math.floor((hoy - new Date(iso)) / 86400000);

    const chips = [...porCultivo].map(([nombre, c]) => ({
        nombre,
        valor: `${c.moneda} ${formatoNumero(num(c.precio), 2)}`,
        unidad: `/ ${c.unidad}`,
        fecha: c.fecha,
        dias: diasDesde(c.fecha),
        vencido: diasDesde(c.fecha) > DIAS_COTIZACION_VIEJA,
    }));
    if (tipoCambio) {
        chips.push({
            nombre: 'Dólar oficial',
            valor: `$ ${formatoNumero(num(tipoCambio.valor), 2)}`,
            unidad: '',
            fecha: tipoCambio.fecha,
            dias: diasDesde(tipoCambio.fecha),
            vencido: diasDesde(tipoCambio.fecha) > DIAS_COTIZACION_VIEJA,
        });
    }
    return chips;
}

// ---------- simulador de precio: recalcula ingreso/margen/semáforo sin tocar el backend ----------
// El ingreso es lineal en el precio (la retención hoy siempre es 0), así que alcanza con escalarlo.

function recalcularFilaConDelta(fila, delta) {
    if (!fila.margen) return null;
    const m = fila.margen;
    const factor = m.precio_neto_usd.unidad === 'tn' ? 1000 : 100;
    const precioNetoNuevo = num(m.precio_neto_usd.por_unidad) * (1 + delta);
    const ingresoNuevo = num(m.ingreso_esperado_usd) * (1 + delta);
    const costoTotal = num(m.costo_total_usd);
    const costoHa = num(m.costo_por_ha_usd);
    const margenNuevo = ingresoNuevo - costoTotal;
    const margenPctNuevo = ingresoNuevo > 0 ? margenNuevo / ingresoNuevo : null;
    const rindeIndifNuevo = precioNetoNuevo > 0 ? (costoHa / precioNetoNuevo) * factor : null;
    const colchonNuevo = (fila.siembra?.rinde_esperado != null && rindeIndifNuevo !== null)
        ? num(fila.siembra.rinde_esperado) - rindeIndifNuevo
        : null;

    return {
        ingresoNuevo,
        costoTotal,
        margenNuevo,
        margenPctNuevo,
        rindeIndifNuevo,
        colchonNuevo,
        estado: semaforoDeMargen(margenNuevo, ingresoNuevo),
        haSembradas: num(m.ha_sembradas),
    };
}

function recalcularTodoConDelta(filas, delta) {
    return filas.map((fila) => ({ fila, sim: recalcularFilaConDelta(fila, delta) }));
}

function agregarSimulado(filasSimuladas) {
    const conSim = filasSimuladas.filter((x) => x.sim);
    const ingresoTotal = conSim.reduce((t, x) => t + x.sim.ingresoNuevo, 0);
    const costoTotal = conSim.reduce((t, x) => t + x.sim.costoTotal, 0);
    // Ingreso base (delta=0), tomado directo de la fila original, para un breakeven que no dependa del slider actual.
    const ingresoBaseTotal = conSim.reduce((t, x) => t + num(x.fila.margen.ingreso_esperado_usd), 0);
    const margenTotal = ingresoTotal - costoTotal;
    const margenPct = ingresoTotal > 0 ? margenTotal / ingresoTotal : null;
    const haSembradas = conSim.reduce((t, x) => t + x.sim.haSembradas, 0);
    const estado = conSim.length === 0 ? null : semaforoDeMargen(margenTotal, ingresoTotal);
    const breakevenPct = ingresoBaseTotal > 0 ? (costoTotal / ingresoBaseTotal - 1) * 100 : null;

    return { ingresoTotal, costoTotal, margenTotal, margenPct, haSembradas, estado, breakevenPct };
}

function fraseSemaforo(pct) {
    if (pct === null) return 'Todavía no hay margen calculado para mostrar un porcentaje.';
    const entero = Math.round(pct * 100);
    return entero >= 0
        ? `De cada 100 US$ que entran, ${entero} quedan de margen.`
        : 'El campo está perdiendo plata: el costo supera al ingreso.';
}

// ---------- piezas de render que sólo necesitan un id de contenedor ----------

// Mismo velocímetro SVG que semaforo.html (ángulo de aguja y arcos de color), para el
// semáforo agregado del campo — ocupa el lugar donde antes estaba el mapa.
const CORTE_GAUGE = 25.7;
function anguloAguja(pct) {
    const p = Math.max(-1, Math.min(1, pct));
    if (p <= 0) return -90 + (p + 1) * (90 - CORTE_GAUGE);
    if (p < 0.2) return -CORTE_GAUGE + (p / 0.2) * (2 * CORTE_GAUGE);
    return CORTE_GAUGE + ((p - 0.2) / 0.8) * (90 - CORTE_GAUGE);
}

function dibujarGaugeSemaforo(idContenedor, estado, pct) {
    const angulo = anguloAguja(pct ?? -1);
    const clase = estado ? ESTADOS[estado].clase : 'sin-dato';
    const texto = estado ? ESTADOS[estado].texto : 'Sin datos';
    document.getElementById(idContenedor).innerHTML = `
        <svg viewBox="0 0 220 130" class="semaforo-gauge__svg">
            <path d="M 20 110 A 90 90 0 0 1 70 27" fill="none" stroke="#d1583f" stroke-width="18" stroke-linecap="round"/>
            <path d="M 70 27 A 90 90 0 0 1 150 27" fill="none" stroke="#e0a83c" stroke-width="18" stroke-linecap="round"/>
            <path d="M 150 27 A 90 90 0 0 1 200 110" fill="none" stroke="#4f9d63" stroke-width="18" stroke-linecap="round"/>
            <g transform="rotate(${angulo} 110 110)">
                <line x1="110" y1="110" x2="110" y2="34" stroke="#1a1a1a" stroke-width="4" stroke-linecap="round"/>
            </g>
            <circle cx="110" cy="110" r="7" fill="#1a1a1a"/>
        </svg>
        <strong class="semaforo-gauge__valor">${pct === null ? '-' : `${formatoNumero(pct * 100, 1)}%`}</strong>
        <span class="semaforo-gauge__etiqueta">Rentabilidad proyectada</span>
        <p class="semaforo-gauge__estado semaforo-gauge__estado--${clase}">${escapar(texto)}</p>`;
}

function dibujarCirculoSemaforo(idContenedor, estado, pct, frase, meta) {
    const clase = estado ? ESTADOS[estado].clase : 'sin-dato';
    const texto = estado ? ESTADOS[estado].texto : 'Sin datos';
    const icono = iconoEstado(estado);
    const pctTexto = pct === null ? '' : `<small>${Math.round(pct * 100)}%</small>`;
    document.getElementById(idContenedor).innerHTML = `
        <div class="sema">
            <div class="sema__luz sema__luz--${clase}" aria-hidden="true">${icono}</div>
            <div class="sema__texto">
                <div class="sema__estado">${escapar(texto)} ${pctTexto}</div>
                <p class="sema__frase">${escapar(frase)}</p>
                ${meta ? `<p class="sema__meta">${escapar(meta)}</p>` : ''}
            </div>
        </div>`;
}

// "Campaña X · cotización al DD/MM, dólar al DD/MM" — contexto de qué datos usa el margen.
function metaSemaforo(campania, mercado) {
    const partes = [];
    if (campania) partes.push(`Campaña ${campania.nombre}`);

    const cultivos = mercado.filter((m) => m.nombre !== 'Dólar oficial');
    const dolar = mercado.find((m) => m.nombre === 'Dólar oficial');
    const sub = [];
    if (cultivos.length > 0) {
        const masReciente = cultivos.reduce((a, b) => (a.fecha > b.fecha ? a : b));
        sub.push(`cotización al ${fechaCorta(masReciente.fecha)}`);
    }
    if (dolar) sub.push(`dólar al ${fechaCorta(dolar.fecha)}`);
    if (sub.length > 0) partes.push(sub.join(', '));

    return partes.join(' · ');
}

function dibujarBala(rindeEsperado, rindeEquilibrio, clase) {
    if (rindeEsperado == null || rindeEquilibrio == null) {
        return '<p class="bala__txt">Sin datos de rinde para mostrar la barra.</p>';
    }
    const max = Math.max(rindeEsperado, rindeEquilibrio, 1) * 1.12;
    const color = clase === 'sin-dato' ? 'var(--gris-texto)' : `var(--${clase})`;
    return `<div class="bala">
        <div class="bala__pista" role="img" aria-label="Rinde esperado ${formatoNumero(rindeEsperado, 0)}, equilibrio ${formatoNumero(rindeEquilibrio, 0)} kg por hectárea">
            <i class="bala__fill" style="width:${(rindeEsperado / max * 100).toFixed(1)}%;background:${color}"></i>
            <b class="bala__eq" style="left:calc(${(rindeEquilibrio / max * 100).toFixed(1)}% - 1px)"></b>
        </div>
        <div class="bala__txt">Barra de color: rinde esperado (${formatoNumero(rindeEsperado, 0)} kg/ha). Marca negra: rinde de equilibrio (${formatoNumero(rindeEquilibrio, 0)} kg/ha).</div>
    </div>`;
}

// Contenido del modal de "Ver detalle" de un lote: margen total, rinde esperado, rinde de
// equilibrio, una lectura en texto y la barra "bala" — mismos 4 campos + bala del boceto de
// referencia, antes mostrados inline en la fila y ahora en el modal.
function detalleLoteHtml(fila) {
    const { siembra, margen, estado } = fila;
    const clase = ESTADOS[estado].clase;
    const colchon = colchonKgHa(fila);
    const rindeEsperado = num(siembra.rinde_esperado);
    const rindeEquilibrio = num(margen.rinde_indiferencia_kg_ha);
    const lectura = colchon < 0
        ? `Para empatar le faltan ${formatoNumero(Math.abs(colchon), 0)} kg/ha.`
        : `Aguanta una baja de ${formatoNumero(colchon, 0)} kg/ha antes de perder plata.`;

    return `
        <div><small>Margen total del lote</small><strong>${fUsd(num(margen.margen_bruto_usd))}</strong></div>
        <div><small>Rinde esperado</small><strong>${formatoNumero(rindeEsperado, 0)} kg/ha</strong></div>
        <div><small>Rinde de equilibrio</small><strong>${formatoNumero(rindeEquilibrio, 0)} kg/ha</strong></div>
        <div><small>Lectura</small><strong>${lectura}</strong></div>
        <div class="detalle__bala">${dibujarBala(rindeEsperado, rindeEquilibrio, clase)}</div>`;
}

function dibujarBarrasDivergentes(datos, idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    if (datos.length === 0) {
        contenedor.innerHTML = '<p class="grafico-vacio">Todavía no hay datos para mostrar.</p>';
        return;
    }
    const min = Math.min(0, ...datos.map((d) => d.valor));
    const max = Math.max(0, ...datos.map((d) => d.valor));
    const rango = (max - min) || 1;
    const z = ((0 - min) / rango) * 100;

    const barras = datos.map((d) => {
        const w = Math.abs(d.valor) / rango * 100;
        const left = d.valor >= 0 ? z : z - w;
        const color = d.clase === 'sin-dato' ? 'var(--gris-texto)' : `var(--${d.clase})`;
        return `<div class="mbarra">
                <span class="mbarra__nombre">${escapar(d.nombre)}</span>
                <div class="mbarra__pista">
                    <i class="mbarra__eje" style="left:${z.toFixed(2)}%"></i>
                    <i class="mbarra__barra" style="left:${left.toFixed(2)}%;width:${w.toFixed(2)}%;background:${color}"></i>
                </div>
                <span class="mbarra__valor">${fUsd(d.valor)}</span>
            </div>`;
    }).join('');
    contenedor.innerHTML = `${barras}<p class="eje-nota">La línea vertical es el cero: a la izquierda se pierde plata.</p>`;
}

function dibujarGraficoMargen(filas, idContenedor) {
    const datos = filasOrdenadas(filas)
        .filter((f) => f.margen)
        .map((f) => ({ nombre: `${f.lote.nombre} — ${f.siembra.cultivo_nombre}`, valor: margenUsdPorHa(f), clase: ESTADOS[f.estado]?.clase ?? 'sin-dato' }))
        .filter((d) => d.valor !== null);
    dibujarBarrasDivergentes(datos, idContenedor);
}

function dibujarGraficoMargenSimulado(filasSimuladas, idContenedor) {
    const datos = filasSimuladas
        .filter((x) => x.sim && x.fila.siembra)
        .map(({ fila, sim }) => ({
            nombre: `${fila.lote.nombre} — ${fila.siembra.cultivo_nombre}`,
            valor: sim.haSembradas > 0 ? sim.margenNuevo / sim.haSembradas : null,
            clase: ESTADOS[sim.estado]?.clase ?? 'sin-dato',
        }))
        .filter((d) => d.valor !== null);
    dibujarBarrasDivergentes(datos, idContenedor);
}

function dibujarGraficoCostos(costos, idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    if (costos.length === 0) {
        contenedor.innerHTML = '<p class="grafico-vacio">Todavía no hay costos cargados.</p>';
        return;
    }
    const barra = costos.map((c) => `<i style="flex:${Math.max(c.porcentaje, 1)};background:${c.color}" title="${escapar(c.nombre)}"></i>`).join('');
    const leyenda = costos.map((c) => `<div class="leyenda__fila"><i style="background:${c.color}"></i><span>${escapar(c.nombre)}</span><span>${fUsd(c.usdHa)}/ha</span><span>${c.porcentaje}%</span></div>`).join('');
    contenedor.innerHTML = `<div class="apilada" role="img" aria-label="Distribución de costos">${barra}</div><div class="leyenda">${leyenda}</div>`;
}

function dibujarGraficoSuperficie(items, idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    if (items.length === 0) {
        contenedor.innerHTML = '<p class="grafico-vacio">Todavía no hay siembras para mostrar.</p>';
        return;
    }
    const total = items.reduce((t, i) => t + i.ha, 0);
    // Línea blanca fina entre porciones: cada tramo de color "cede" el final de su barrido
    // a un tramo blanco, así separa de la porción siguiente sin alterar las proporciones
    // de forma perceptible.
    const SEPARADOR_DEG = 1.6;
    let desde = 0;
    const tramos = items.map((it) => {
        const hasta = desde + (it.ha / total) * 360;
        const finColor = Math.max(desde, hasta - SEPARADOR_DEG);
        const tramo = `${it.color} ${desde.toFixed(2)}deg ${finColor.toFixed(2)}deg, var(--blanco) ${finColor.toFixed(2)}deg ${hasta.toFixed(2)}deg`;
        desde = hasta;
        return tramo;
    }).join(', ');
    const leyenda = items.map((it) => `<div class="leyenda__fila"><i style="background:${it.color}"></i><span>${escapar(it.nombre)}</span><span>${formatoNumero(it.ha, 0)} ha</span><span>${Math.round(it.ha / total * 100)}%</span></div>`).join('');
    const sembradas = items.filter((it) => it.nombre !== 'Sin sembrar').reduce((t, it) => t + it.ha, 0);
    contenedor.innerHTML = `<div class="dona-grande">
            <div class="dona-grande__circulo" style="background:conic-gradient(${tramos})">
                <div class="dona-grande__texto"><strong>${formatoNumero(sembradas, 0)} ha</strong><span>sembradas</span></div>
            </div>
            <div class="leyenda">${leyenda}</div>
        </div>`;
}

function dibujarMercado(chips, idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    if (chips.length === 0) {
        contenedor.innerHTML = '<p class="tarjeta-info__texto">Se muestra cuando haya siembras con el margen calculado.</p>';
        return;
    }
    contenedor.innerHTML = chips.map((c) => `
        <div class="mercado__fila ${c.vencido ? 'mercado__fila--vencido' : ''}">
            <div class="mercado__linea">
                <span class="mercado__nombre">${escapar(c.nombre)}</span>
                <span class="mercado__precio">${c.valor}${c.unidad ? ` ${c.unidad}` : ''}</span>
            </div>
            <span class="mercado__fecha">${c.vencido ? `Hace ${c.dias} días` : `al ${fechaCorta(c.fecha)}`}</span>
        </div>`).join('');
}

function dibujarGraficoColchon(filasSimuladas, idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    const datos = filasSimuladas.filter((x) => x.sim && x.fila.siembra);
    if (datos.length === 0) {
        contenedor.innerHTML = '<p class="grafico-vacio">Todavía no hay datos para mostrar.</p>';
        return;
    }
    contenedor.innerHTML = datos.map(({ fila, sim }) => {
        const rindeEsperado = num(fila.siembra.rinde_esperado);
        const clase = ESTADOS[sim.estado]?.clase ?? 'sin-dato';
        return `<div class="colchon-fila">
                <div class="colchon-fila__encabezado">
                    <strong>${escapar(fila.lote.nombre)} — ${escapar(fila.siembra.cultivo_nombre)}</strong>
                    <span>colchón ${fKg(sim.colchonNuevo)}</span>
                </div>
                ${dibujarBala(rindeEsperado, sim.rindeIndifNuevo, clase)}
            </div>`;
    }).join('');
}

function dibujarResumenTiles(agg) {
    document.getElementById('resumenSembradasHa').textContent = formatoNumero(agg.haSembradas, 1);
    document.getElementById('resumenSembradasTotal').textContent = `de ${formatoNumero(agg.hectareas, 1)} ha`;

    document.getElementById('resumenMargenBruto').textContent = agg.margenTotalUsd === null ? '-' : fUsd(agg.margenTotalUsd);
    document.getElementById('resumenMargenHa').textContent =
        agg.margenHaUsd === null ? '' : `${fUsd(agg.margenHaUsd)} por ha sembrada`;

    document.getElementById('resumenAlerta').textContent = `${agg.lotesEnAlerta.length} de ${agg.filas.length}`;
    document.getElementById('resumenAlertaDetalle').textContent =
        agg.lotesEnAlerta.map((f) => f.lote.nombre).join(', ');
}

// Misma estructura que filaLote() del boceto de referencia (pestaña "Semáforo primero"):
// fila con pill + nombre + margen/colchón + botón. "Ver detalle" abre un modal con el margen
// total, rinde esperado, rinde de equilibrio, una lectura en texto y la barra "bala" (ver
// detalleLoteHtml() y el manejo del modal en el bootstrap más abajo).
function dibujarListaLotes(filas, urlEditar) {
    const lista = document.getElementById('listaLotes');
    if (filas.length === 0) {
        lista.innerHTML = `<p>Este establecimiento todavía no tiene lotes. <a href="${urlEditar}">Agregar lotes</a></p>`;
        return;
    }

    lista.innerHTML = filasOrdenadas(filas).map((fila, i) => {
        const { lote, siembra, margen, motivo, estado } = fila;

        // Sin margen calculado (sin siembra, o siembra con un dato faltante): mismo
        // tratamiento que el boceto le da a un lote sin cultivo. En ningún sub-caso se
        // redirige a una vista que no tiene forma de resolverse sola — el modal explica
        // el motivo y, si corresponde, da un link para completarlo.
        if (!margen) {
            const sinHectareas = !siembra && num(lote.ha_efectivas) <= 0;
            let subtitulo;
            let boton;
            if (siembra) {
                // Hay siembra pero el margen no se pudo calcular (falta costos, rinde, etc.).
                subtitulo = escapar(motivo ?? 'Sin datos');
                boton = `<button type="button" class="btn" data-sin-datos="${siembra.id}">Ver detalle</button>`;
            } else if (sinHectareas) {
                // Un lote sin hectáreas efectivas no se puede sembrar (ni el formulario ni
                // el cálculo de margen aceptan 0 ha).
                subtitulo = 'Sin hectáreas sembrables';
                boton = `<button type="button" class="btn" data-sin-ha="${lote.id}">Ver detalle</button>`;
            } else {
                subtitulo = 'Sin sembrar en esta campaña';
                boton = `<a href="datos_de_siembra.html?lote=${lote.id}" class="btn">Cargar siembra</a>`;
            }
            return `<div class="lote"><div class="lote__fila">
                <div class="lote__p"><span class="pill pill--sin-dato">Sin datos</span></div>
                <div class="lote__n"><strong>${escapar(lote.nombre)} · ${formatoNumero(num(lote.ha_totales), 1)} ha</strong><span>${subtitulo}</span></div>
                <div class="lote__m">
                    <div><small>Margen</small><strong>—</strong></div>
                    <div><small>Colchón</small><strong>—</strong></div>
                </div>
                <div class="lote__btn">${boton}</div>
            </div></div>`;
        }

        const clase = ESTADOS[estado].clase;
        const margenHa = margenUsdPorHa(fila);
        const colchon = colchonKgHa(fila);

        return `<div class="lote"><div class="lote__fila">
                <div class="lote__p"><span class="pill pill--${clase}"><span aria-hidden="true">${iconoEstado(estado)}</span>${escapar(ESTADOS[estado].texto)}</span></div>
                <div class="lote__n"><strong>${escapar(lote.nombre)} · ${escapar(siembra.cultivo_nombre)}</strong><span>${formatoNumero(num(lote.ha_totales), 1)} ha</span></div>
                <div class="lote__m">
                    <div><small>Margen</small><strong class="tx-${clase}">${fUsd(margenHa)}/ha</strong></div>
                    <div><small>Colchón</small><strong class="tx-${clase}">${fKg(colchon)}</strong></div>
                </div>
                <div class="lote__btn"><button type="button" class="btn" data-detalle="${i}">Ver detalle</button></div>
            </div></div>`;
    }).join('');
}

function dibujarResultadoSimulado(agg, delta) {
    document.getElementById('simuladorSalida').textContent =
        delta === 0 ? 'Sin cambios en el precio' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}% sobre el precio actual`;

    document.getElementById('simuladorResultado').innerHTML = `
        <div><small>Margen bruto</small><strong>${fUsd(agg.margenTotal)}</strong></div>
        <div><small>Margen por ha sembrada</small><strong>${fUsd(agg.haSembradas > 0 ? agg.margenTotal / agg.haSembradas : null)}/ha</strong></div>
        <div><small>Ingreso total</small><strong>${fUsd(agg.ingresoTotal)}</strong></div>`;

    const eq = document.getElementById('simuladorEquilibrio');
    if (agg.breakevenPct === null) {
        eq.textContent = 'Todavía no hay datos suficientes para calcular el punto de equilibrio.';
        eq.className = 'simulador__equilibrio pill--sin-dato';
    } else if (agg.margenTotal >= 0) {
        eq.textContent = `El campo aguanta una baja de hasta ${Math.abs(Math.round(agg.breakevenPct))}% en el precio antes de perder plata.`;
        eq.className = 'simulador__equilibrio pill--bien';
    } else {
        eq.textContent = `Estás por debajo del punto de equilibrio, que está en una baja de ${Math.abs(Math.round(agg.breakevenPct))}% respecto del precio actual.`;
        eq.className = 'simulador__equilibrio pill--alerta';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = await usuarioLogueado();
    if (!usuario) return;

    // Encabezado
    const hora = new Date().getHours();
    const saludo = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
    document.querySelector('.encabezado-panel__saludo').textContent = `¡${saludo}, ${usuario.nombre}!`;
    const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long'});
    document.querySelector('.encabezado-panel__fecha').textContent =  `${hoy.charAt(0).toUpperCase()}${hoy.slice(1)} — así está tu campo hoy`;

    // Pestañas
    const panelComoVoy = document.getElementById('panelComoVoy');
    const panelSimulador = document.getElementById('panelSimulador');
    document.querySelectorAll('.panel-tabs__boton').forEach((boton) => {
        boton.addEventListener('click', () => {
            const activo = boton.dataset.tab === 'comoVoy';
            panelComoVoy.hidden = !activo;
            panelSimulador.hidden = activo;
            document.querySelectorAll('.panel-tabs__boton').forEach((b) => {
                b.classList.toggle('panel-tabs__boton--activo', b === boton);
                b.setAttribute('aria-selected', String(b === boton));
            });
        });
    });

    // Modal de "Ver detalle" de un lote: un solo listener delegado, no se reatacha en cada
    // render. El índice del botón es la posición en filasOrdenadas(filasActuales), que es
    // exactamente el mismo orden con el que se dibujó la lista.
    const modalLote = document.getElementById('modalLote');
    const modalLoteTitulo = document.getElementById('modalLoteTitulo');
    const modalLoteContenido = document.getElementById('modalLoteContenido');

    function cerrarModalLote() {
        modalLote.hidden = true;
    }

    document.getElementById('listaLotes').addEventListener('click', (ev) => {
        const botonDetalle = ev.target.closest('[data-detalle]');
        if (botonDetalle) {
            const fila = filasOrdenadas(filasActuales)[Number(botonDetalle.dataset.detalle)];
            modalLoteTitulo.textContent = `${fila.lote.nombre} — ${fila.siembra.cultivo_nombre}`;
            modalLoteContenido.innerHTML = detalleLoteHtml(fila);
            modalLote.hidden = false;
            return;
        }
        const botonSinHa = ev.target.closest('[data-sin-ha]');
        if (botonSinHa) {
            const lote = filasActuales.find((f) => f.lote.id === Number(botonSinHa.dataset.sinHa))?.lote;
            const editarHref = document.getElementById('editarEstablecimiento').href;
            modalLoteTitulo.textContent = lote?.nombre ?? 'Lote';
            modalLoteContenido.innerHTML = `<p>Este lote todavía no tiene hectáreas efectivas cargadas (${formatoNumero(num(lote?.ha_efectivas), 1)} ha), así que no se le puede asignar una siembra. Corregí sus hectáreas desde <a href="${editarHref}">Editar campo</a>.</p>`;
            modalLote.hidden = false;
            return;
        }
        const botonSinDatos = ev.target.closest('[data-sin-datos]');
        if (botonSinDatos) {
            const siembraId = Number(botonSinDatos.dataset.sinDatos);
            const fila = filasActuales.find((f) => f.siembra?.id === siembraId);
            modalLoteTitulo.textContent = fila ? `${fila.lote.nombre} — ${fila.siembra.cultivo_nombre}` : 'Lote';
            modalLoteContenido.innerHTML = `
                <p>${escapar(fila?.motivo ?? 'No se pudo calcular el margen de esta siembra.')}</p>
                <p><a href="datos_de_siembra.html?siembra=${siembraId}" class="btn">Completar datos de siembra</a></p>`;
            modalLote.hidden = false;
        }
    });
    modalLote.querySelector('.modal__fondo').addEventListener('click', cerrarModalLote);
    modalLote.querySelector('.modal__cerrar').addEventListener('click', cerrarModalLote);
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !modalLote.hidden) cerrarModalLote();
    });

    // Slider del simulador
    const slider = document.getElementById('simuladorPrecio');
    slider.addEventListener('input', () => aplicarSimulador(Number(slider.value) / 100));

    // Mapa: va dentro de un <details> plegado por defecto. Leaflet no mide bien un
    // contenedor oculto (display:none), así que al abrirlo hay que invalidar el tamaño
    // y volver a aplicar la vista con los últimos puntos dibujados.
    const mapa = Mapa.crearMapa('mapaLeaflet');
    const capaLotes = L.layerGroup().addTo(mapa);
    const tarjeta = document.getElementById('tarjetaFlotante');
    mapa.on('click', () => { tarjeta.hidden = true;});

    let ultimosPuntosMapa = [];
    const detalleMapa = document.getElementById('mapaLotes');
    detalleMapa.addEventListener('toggle', (ev) => {
        if (!ev.target.open) return;
        mapa.invalidateSize();
        if (ultimosPuntosMapa.length === 1) mapa.setView(ultimosPuntosMapa[0], Mapa.ZOOM_CERCA);
        else if (ultimosPuntosMapa.length > 1) mapa.fitBounds(ultimosPuntosMapa, { padding: [40, 40] });
    });

    // Mapa y Clima están plegados por separado pero se abren/cierran juntos: abrir
    // cualquiera de las dos abre la otra (y cerrar una cierra la otra). El guard evita
    // el loop infinito, ya que togglear ".open" por código dispara "toggle" de nuevo.
    const detalleClima = document.getElementById('climaLotes');
    detalleMapa.addEventListener('toggle', () => {
        if (detalleClima.open !== detalleMapa.open) detalleClima.open = detalleMapa.open;
    });
    detalleClima.addEventListener('toggle', () => {
        if (detalleMapa.open !== detalleClima.open) detalleMapa.open = detalleClima.open;
    });

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
    const idInicial = establecimientos.some((e) => String(e.id) === guardado) ? guardado : String(establecimientos[0].id);
    selector.value = idInicial;
    // Se persiste YA, no solo en el "change": si no, mientras el usuario nunca toque el
    // selector, localStorage queda sin este valor y otras páginas (ej. semaforo.html) no
    // saben qué establecimiento se está mirando acá.
    localStorage.setItem('establecimientoActual', idInicial);

    selector.addEventListener('change', () => {
        localStorage.setItem('establecimientoActual', selector.value);
        cargarEstablecimiento(Number(selector.value));
    });

    // Si el nombre no tiene numero, usa las 2 primeras letras.
    const etiquetaLote = (lote) => lote.nombre.match(/\d+/)?.[0] ?? lote.nombre.slice(0, 2);
    const rindeQq = (margen) => (margen ? num(margen.rinde_indiferencia_kg_ha) / 100 : null );

    let cargaActual = 0;
    let filasActuales = [];

    // Trae el dólar del día de dolarapi.com (una vez por día). Si falla, se sigue con el último guardado.
    const hoyIso = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('ultimoSync') !== hoyIso) {
        try {
             await API.post('/sync/cotizaciones');
             localStorage.setItem('ultimoSync', hoyIso);
        } catch { /* 502: la API externa no respondió */ }
    }

    await cargarEstablecimiento(Number(selector.value));

    async function cargarEstablecimiento(id) {
        const estaCarga = ++cargaActual;
        tarjeta.hidden = true;
        slider.value = 0;

        const urlEditar = `configuracion_de_campos.html?establecimiento=${id}`;
        document.getElementById('editarEstablecimiento').href = urlEditar;

        const establecimiento = establecimientos.find((e) => e.id === id);
        const [lotes, siembras] = await Promise.all([
            API.get(`/lotes?establecimiento_id=${id}`),
            campania ? API.get(`/siembras?campania_id=${campania.id}`) : Promise.resolve ([])
        ]);

        // Margen de cada lote con siembra, si falla el lote se ve gris y se guarda el motivo para mostrarlo al usuario.
        filasActuales = await Promise.all(lotes.map(async (lote) => {
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

        dibujarMapa(filasActuales, establecimiento);
        dibujarClima(filasActuales, establecimiento);

        const agg = resumenAgregado(filasActuales);
        const mercado = agregarMercado(filasActuales);
        dibujarResumenTiles(agg);
        dibujarCirculoSemaforo('circuloSemaforo', agg.estadoGlobal, agg.margenPctGlobal, fraseSemaforo(agg.margenPctGlobal), metaSemaforo(campania, mercado));
        dibujarGaugeSemaforo('gaugeSemaforo', agg.estadoGlobal, agg.margenPctGlobal);
        dibujarMercado(mercado, 'mercado1');
        dibujarListaLotes(filasActuales, urlEditar);
        dibujarGraficoMargen(filasActuales, 'graficoMargenReal');

        const costos = agregarCostosPorCategoria(filasActuales);
        dibujarGraficoCostos(costos, 'graficoCostos2');

        const superficie = agregarSuperficiePorCultivo(filasActuales);
        dibujarGraficoSuperficie(superficie, 'graficoSuperficie1');

        aplicarSimulador(0);
    }

    function aplicarSimulador(delta) {
        const simuladas = recalcularTodoConDelta(filasActuales, delta);
        const agg = agregarSimulado(simuladas);
        dibujarCirculoSemaforo('circuloSemaforoSim', agg.estado, agg.margenPct, fraseSemaforo(agg.margenPct));
        dibujarResultadoSimulado(agg, delta);
        dibujarGraficoColchon(simuladas, 'graficoColchon');
        dibujarGraficoMargenSimulado(simuladas, 'graficoMargenSim');
    }

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

        ultimosPuntosMapa = puntos;
        // Si el <details> está cerrado el contenedor mide 0: ajustar la vista ahora daría
        // un zoom inválido. Se aplica recién al abrirlo (ver el listener de "toggle" arriba).
        if (detalleMapa.open) {
            if (puntos.length === 1) mapa.setView(puntos[0], Mapa.ZOOM_CERCA);
            else if (puntos.length > 1) mapa.fitBounds(puntos, { padding: [40, 40] });
        }
    }

    function mostrarTarjeta({ lote, siembra, margen, motivo, estado}) {
        document.getElementById('flotanteTitulo').textContent = siembra ? `${lote.nombre} — ${siembra.cultivo_nombre}` : lote.nombre;
        document.getElementById('flotanteHectareas').textContent = `${formatoNumero(num(lote.ha_totales), 1)} ha`;
        document.getElementById('flotanteRinde').textContent = margen ? `${formatoNumero(rindeQq(margen), 1)} qq/ha` : '-';
        document.getElementById('flotanteEstado').textContent = ESTADOS [estado]?.texto ?? motivo ?? (siembra ? 'Sin datos de margen' : 'Sin siembra');
        tarjeta.hidden = false;
    }

    // El clima es uno solo por establecimiento: los lotes de un mismo campo comparten
    // la misma zona geográfica, así que no tiene sentido pedirlo lote por lote. Se usa
    // la ubicación del establecimiento si la tiene, y si no, el promedio de sus lotes
    // ubicados (un centro aproximado del campo).
    function ubicacionEstablecimiento(filas, establecimiento) {
        if (num(establecimiento.lat) !== null) {
            return { lat: num(establecimiento.lat), lng: num(establecimiento.lng) };
        }
        const ubicados = filas.filter((f) => num(f.lote.lat) !== null);
        if (ubicados.length === 0) return null;
        const suma = ubicados.reduce((acc, f) => ({ lat: acc.lat + num(f.lote.lat), lng: acc.lng + num(f.lote.lng) }), { lat: 0, lng: 0 });
        return { lat: suma.lat / ubicados.length, lng: suma.lng / ubicados.length };
    }

    function dibujarClima(filas, establecimiento) {
        const contenido = document.getElementById('climaContenido');
        const ubicacion = ubicacionEstablecimiento(filas, establecimiento);

        if (!ubicacion) {
            contenido.innerHTML = '<p class="tarjeta-info__texto">Este establecimiento todavía no tiene ubicación. Ubicalo en "Editar campo".</p>';
            return;
        }

        pedirClima(ubicacion);
    }

    async function pedirClima({ lat, lng }) {
        const contenido = document.getElementById('climaContenido');
        contenido.innerHTML = '<p class="tarjeta-info__texto">Cargando pronóstico...</p>';
        const url = 'https://api.open-meteo.com/v1/forecast'
            + `?latitude=${lat}&longitude=${lng}`
            + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code'
            + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
            + '&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=3';
        try {
            const respuesta = await fetch(url);
            if (!respuesta.ok) throw new Error();
            const d = await respuesta.json();

            const lluvias = d.daily.precipitation_probability_max;
            const i = lluvias.indexOf(Math.max(...lluvias));
            const dia = new Date(`${d.daily.time[i]}T12:00`).toLocaleDateString('es-AR', { weekday: 'short' });

            contenido.innerHTML = `
                <div class="clima-actual">
                    <span class="clima-actual__temperatura">${Math.round(d.current.temperature_2m)}°</span>
                    <div>
                        <strong>${textoClima(d.current.weather_code)}</strong>
                        <p>Máx ${Math.round(d.daily.temperature_2m_max[0])}° · Mín ${Math.round(d.daily.temperature_2m_min[0])}°</p>
                    </div>
                </div>
                <div class="clima-datos">
                    <div><strong>${lluvias[i]}%</strong><span>Lluvia ${dia}</span></div>
                    <div><strong>${d.current.relative_humidity_2m}%</strong><span>Humedad</span></div>
                    <div><strong>${Math.round(d.current.wind_speed_10m)} km/h</strong><span>Viento</span></div>
                </div>`;
        } catch {
            contenido.innerHTML = '<p class="tarjeta-info__texto">No se pudo cargar el pronóstico.</p>';
        }
    }
});
