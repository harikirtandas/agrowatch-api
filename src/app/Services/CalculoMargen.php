<?php

declare(strict_types=1);

namespace App\Services;

// Calculo del margen bruto de una siembra. Puro: sin base de datos ni HTTP.
//
// Todo numero entra y sale como string decimal (PDO devuelve los DECIMAL asi) y se opera SOLO con bcmath, 
// nunca con float: un margen de exactamente 20% con float puede caer del lado equivocado del semaforo.
//
// Dos cosas de bcmath que hay que tener presentes:
//  - TRUNCA, no redondea: el redondeo a centavos va aparte (redondear()).
//  - Su escala por defecto es 0 (bcdiv('10','4') da '2'): por eso TODA
//    operacion lleva escala explicita.
//
// Ante un dato que impide calcular lanza CalculoException; el controller la convierte en un 422.

final class CalculoMargen
{
    // #region ====== BLOQUE 1: cabecera, constantes y calcular()
    // Decimales con los que se opera por dentro; se redondea recien al devolver.
    private const ESCALA = 10;

    // Unico lugar donde se definen las unidades: cuantos kg tiene cada una.
    private const FACTOR_UNIDAD = ['tn' => '1000', 'qq' => '100'];

    // El margen es verde si llega al 20% del ingreso.
    private const UMBRAL_VERDE = '0.20';

    /**
     * Margen bruto de una siembra, todo en USD.
     *
     * @param list<string> $costosUsd importe en USD de cada linea de costo
     * @return array{costo_total: string, costo_ha: string, ingreso: string, margen: string,
     *               margen_pct: ?string, rinde_indiferencia: string, semaforo: string,
     *               precio_neto: string}
     * @throws CalculoException
     */
    public static function calcular(
        ?string $ha,
        ?string $rindeKgHa,
        string $unidad,
        ?string $precio,
        ?string $retencionPct,
        array $costosUsd
    ): array {
        // El orden de las validaciones es parte del contrato: la primera que falla corta.
        self::validarSiembra($ha, $rindeKgHa, $unidad);
        self::validarPrecio($precio, $retencionPct);

        $factor = self::FACTOR_UNIDAD[$unidad];
        $precioNeto = self::precioNeto($precio, $retencionPct);
        $costoTotal = self::sumarCostos($costosUsd);
        $costoHa = bcdiv($costoTotal, $ha, self::ESCALA);
        $ingreso = self::ingreso($ha, $rindeKgHa, $factor, $precioNeto);
        $margen = bcsub($ingreso, $costoTotal, self::ESCALA);

        // Redondeo recien aca y solo para mostrar.
        return [
            'costo_total' => self::redondear($costoTotal, 2),
            'costo_ha' => self::redondear($costoHa, 2),
            'ingreso' => self::redondear($ingreso, 2),
            'margen' => self::redondear($margen, 2),
            'margen_pct' => self::margenPct($margen, $ingreso),
            'rinde_indiferencia' => self::redondear(self::rindeIndiferencia($costoHa, $precioNeto, $factor), 1),
            'semaforo' => self::semaforo($margen, $ingreso),
            'precio_neto' => self::redondear($precioNeto, 2),
        ];
    }
    // #endregion

    // #region ====== BLOQUE 2: conversiones de moneda
    /**
     * Pasa una linea de costo a USD. El importe se calcula exacto (cantidad x
     * precio unitario) y se redondea a centavos UNA vez, al final.
     *
     * @param ?string $tc dolar (pesos por USD); solo hace falta si la moneda es ARS
     * @return array{importe_original: string, importe_usd: string}
     * @throws CalculoException
     */
    public static function convertirCosto(string $cantidad, string $precioUnitario, string $moneda, ?string $tc): array
    {
        $exacto = bcmul($cantidad, $precioUnitario, self::ESCALA);

        if ($moneda === 'USD') {
            $importeUsd = self::redondear($exacto, 2);
        } elseif ($moneda === 'ARS') {
            $importeUsd = self::redondear(bcdiv($exacto, self::tipoCambioValido($tc), self::ESCALA), 2);
        } else {
            throw new CalculoException('Moneda desconocida.');
        }

        return [
            'importe_original' => self::redondear($exacto, 2),
            'importe_usd' => $importeUsd,
        ];
    }

    /**
     * Precio en pesos a USD. No redondea: el precio neto se redondea al mostrarlo.
     *
     * @throws CalculoException
     */
    public static function aUsd(string $precio, string $tc): string
    {
        return bcdiv($precio, self::tipoCambioValido($tc), self::ESCALA);
    }

    /**
     * Importe en USD a pesos, solo para mostrar (los campos *_ars del contrato).
     *
     * @throws CalculoException
     */
    public static function aPesos(string $usd, string $tc): string
    {
        return self::redondear(bcmul($usd, self::tipoCambioValido($tc), self::ESCALA), 2);
    }
    // #endregion

    // #region ===== BLOQUE 3: los pasos internos de calcular()
    // --- Pasos internos de calcular(): cada uno hace una sola cosa -------------

    // Datos de la siembra: hectareas, rinde y unidad del cultivo.
    private static function validarSiembra(?string $ha, ?string $rindeKgHa, string $unidad): void
    {
        if ($ha === null || bccomp($ha, '0', self::ESCALA) <= 0) {
            throw new CalculoException('Las hectareas tienen que ser mayores que 0.');
        }
        if ($rindeKgHa === null) {
            throw new CalculoException('La siembra no tiene rinde esperado.');
        }
        if (bccomp($rindeKgHa, '0', self::ESCALA) < 0) {
            throw new CalculoException('El rinde esperado no puede ser negativo.');
        }
        if (!isset(self::FACTOR_UNIDAD[$unidad])) {
            throw new CalculoException('Unidad desconocida: tiene que ser tn o qq.');
        }
    }

    // Datos del precio: el del grano y la retencion que se le descuenta.
    private static function validarPrecio(?string $precio, ?string $retencionPct): void
    {
        if ($precio === null || bccomp($precio, '0', self::ESCALA) <= 0) {
            throw new CalculoException('No hay precio del grano mayor que 0.');
        }
        if ($retencionPct === null || bccomp($retencionPct, '0', self::ESCALA) < 0) {
            throw new CalculoException('Retencion invalida.');
        }
    }

    // precio_neto = precio x (100 - retencion) / 100. La retencion va en puntos (24 = 24%).
    private static function precioNeto(string $precio, string $retencionPct): string
    {
        $neto = bcdiv(
            bcmul($precio, bcsub('100', $retencionPct, self::ESCALA), self::ESCALA),
            '100',
            self::ESCALA
        );
        if (bccomp($neto, '0', self::ESCALA) <= 0) {
            throw new CalculoException('El precio neto, despues de retencion, tiene que ser mayor que 0.');
        }

        return $neto;
    }

    // Suma las lineas de costo (ya en USD). Sin costos no hay margen que calcular.
    private static function sumarCostos(array $costosUsd): string
    {
        $total = '0';
        foreach ($costosUsd as $costo) {
            $total = bcadd($total, $costo, self::ESCALA);
        }
        if (bccomp($total, '0', self::ESCALA) <= 0) {
            throw new CalculoException('No hay costos cargados.');
        }

        return $total;
    }

    // El rinde siempre viene en kg/ha: se pasa a la unidad del precio antes de multiplicar.
    private static function ingreso(string $ha, string $rindeKgHa, string $factor, string $precioNeto): string
    {
        $produccion = bcmul(bcdiv($rindeKgHa, $factor, self::ESCALA), $ha, self::ESCALA);

        return bcmul($produccion, $precioNeto, self::ESCALA);
    }

    // margen / ingreso, TRUNCADO a 4 decimales (19,996% se ve 0.1999). Sin ingreso no hay porcentaje.
    private static function margenPct(string $margen, string $ingreso): ?string
    {
        return bccomp($ingreso, '0', self::ESCALA) > 0 ? bcdiv($margen, $ingreso, 4) : null;
    }

    // El rinde con el que el ingreso iguala al costo (vuelve a kg/ha).
    private static function rindeIndiferencia(string $costoHa, string $precioNeto, string $factor): string
    {
        return bcmul(bcdiv($costoHa, $precioNeto, self::ESCALA), $factor, self::ESCALA);
    }

    // Con los valores exactos y sin dividir: comparar contra el 20% del ingreso.
    private static function semaforo(string $margen, string $ingreso): string
    {
        if (bccomp($margen, '0', self::ESCALA) <= 0) {
            return 'rojo';
        }
        if (bccomp($margen, bcmul(self::UMBRAL_VERDE, $ingreso, self::ESCALA), self::ESCALA) >= 0) {
            return 'verde';
        }

        return 'amarillo';
    }
    // #endregion

    // #region ====== BLOQUE 4: utilidades y cierre de la clase
    
    // --- Utilidades de bcmath ---------------------------------------------------

    /**
     * Red de seguridad: un dolar null o <= 0 daria una division por cero.
     *
     * @throws CalculoException
     */
    private static function tipoCambioValido(?string $tc): string
    {
        if ($tc === null || bccomp($tc, '0', self::ESCALA) <= 0) {
            throw new CalculoException('Tipo de cambio invalido.');
        }

        return $tc;
    }

    /**
     * Redondeo "de 5 para arriba" (half-up) a $decimales. bcmath solo trunca,
     * asi que se suma media unidad de la ultima posicion antes de truncar:
     * 0.125 a 2 decimales -> 0.125 + 0.005 = 0.130 -> '0.13'. En negativos la
     * media unidad se resta, para que el redondeo sea simetrico.
     */
    private static function redondear(string $valor, int $decimales): string
    {
        $media = '0.' . str_repeat('0', $decimales) . '5';
        $ajuste = bccomp($valor, '0', self::ESCALA) < 0 ? '-' . $media : $media;

        return bcadd($valor, $ajuste, $decimales);
    }
    // #endregion
}