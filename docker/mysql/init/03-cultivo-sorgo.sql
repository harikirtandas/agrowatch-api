-- Sorgo: unico grano que faltaba en el catalogo y que granos.ar SI cotiza en
-- /api/v1/pizarra (junto con soja/maiz/trigo/girasol). retencion_pct en 12%,
-- mismo nivel que maiz/trigo en el seed original (ver README, seccion "Sync
-- de cotizaciones").
INSERT IGNORE INTO cultivos (nombre, unidad, simbolo_api, retencion_pct) VALUES
    ('Sorgo', 'tn', 'sorgo', 12.00);
