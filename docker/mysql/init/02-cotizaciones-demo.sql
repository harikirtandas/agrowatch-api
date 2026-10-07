-- Soja es cultivo_id 1 en el seed (Soja 1, Trigo 2, Maiz 3, Girasol 4)
INSERT IGNORE INTO cotizaciones (cultivo_id, fecha, precio, moneda, mercado, fuente) VALUES
    (1, '2026-09-18', 295.00, 'USD', 'Rosario', 'carga manual'),
    (1, '2026-09-20', 300.00, 'USD', 'Rosario', 'carga manual');

INSERT IGNORE INTO tipos_cambio (fecha, tipo, valor) VALUES
    ('2026-09-10', 'oficial', 1000.0000),
    ('2026-09-20', 'oficial', 1050.0000);