<?php

declare(strict_types=1);

namespace App\Services;

use RuntimeException;

// Error de negocio del calculo del margen: falta un dato o un dato no sirve
// para calcular. A proposito NO lleva codigo HTTP: el Service no sabe de HTTP;
// el controller la atrapa y la convierte en ApiException(422, mensaje).
final class CalculoException extends RuntimeException
{
}