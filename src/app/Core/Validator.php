<?php

declare(strict_types=1);

namespace App\Core;

use Opis\JsonSchema\Errors\ValidationError;
use Opis\JsonSchema\JsonPointer;
use Opis\JsonSchema\Validator as OpisValidator;
use RuntimeException;

// valida el body de una request contra un JSON Schema (app/Schemas/*.json) y
// traduce los errores al mismo formato { campo: mensaje } que ya espera
// ApiException::validacion() -- el contrato JSON de un 422 no cambia, solo
// como se arma internamente. No tocamos $datos (trim/casteos siguen siendo
// responsabilidad del controller, antes y despues de validar).
final class Validator
{
    private const DIR_SCHEMAS = __DIR__ . '/../Schemas';

    /** @var array<string, object> cache de schemas ya decodificados, por nombre */
    private static array $cache = [];

    /**
     * @param array<string, mixed> $datos
     */
    public static function validar(string $nombreSchema, array $datos): void
    {
        $schema = self::cargarSchema($nombreSchema);

        $validador = new OpisValidator();
        $validador->setMaxErrors(20);
        $validador->setStopAtFirstError(false);

        // json_decode(json_encode(...)) es la forma mas simple de convertir el
        // array asociativo de PHP en el arbol de stdClass que opis/json-schema
        // espera (un objeto JSON real, no un array) -- salvo el caso [], que
        // json_encode serializa como '[]' (array vacio) en vez de '{}' (objeto
        // vacio), y ahi opis ve "type: array" en vez de "type: object" y nunca
        // llega a chequear los campos requeridos.
        $objeto = $datos === [] ? new \stdClass() : json_decode(json_encode($datos));
        $resultado = $validador->validate($objeto, $schema);

        if (!$resultado->isValid()) {
            $errores = [];
            self::recolectar($resultado->error(), $errores);
            throw ApiException::validacion($errores);
        }
    }

    private static function cargarSchema(string $nombre): object
    {
        if (!isset(self::$cache[$nombre])) {
            $ruta = self::DIR_SCHEMAS . "/{$nombre}.json";
            if (!is_file($ruta)) {
                throw new RuntimeException("Schema no encontrado: {$nombre} ({$ruta})");
            }
            self::$cache[$nombre] = json_decode((string) file_get_contents($ruta), false, 512, JSON_THROW_ON_ERROR);
        }

        return self::$cache[$nombre];
    }

    /**
     * Recorre el arbol de ValidationError de opis y arma { campo: mensaje }.
     * El keyword 'required' de opis reporta TODOS los campos faltantes en un
     * unico error (no uno por subError), por eso se maneja aparte -- el resto
     * de los keywords (type, minLength, maxLength, pattern, anyOf...) si
     * bajan por subErrors() hasta llegar a un error "hoja" con el path exacto
     * del campo.
     *
     * @param array<string, string> $errores
     */
    private static function recolectar(ValidationError $error, array &$errores): void
    {
        if ($error->keyword() === 'required') {
            foreach ($error->args()['missing'] ?? [] as $campo) {
                $errores[$campo] ??= 'Requerido.';
            }
            return;
        }

        $subErrores = $error->subErrors();
        if ($subErrores !== []) {
            foreach ($subErrores as $subError) {
                self::recolectar($subError, $errores);
            }
            return;
        }

        $campo = ltrim(JsonPointer::pathToString($error->data()->fullPath()), '/');
        $errores[$campo] ??= self::mensaje($error);
    }

    private static function mensaje(ValidationError $error): string
    {
        $args = $error->args();
        $esperado = $args['expected'] ?? null;
        $tipo = is_array($esperado) ? ($esperado[0] ?? null) : $esperado;

        return match ($error->keyword()) {
            'minLength' => 'Requerido.',
            'maxLength' => "Maximo {$args['max']} caracteres.",
            'pattern' => 'Formato invalido.',
            'type' => match ($tipo) {
                'string' => 'Tiene que ser texto.',
                'integer' => 'Tiene que ser un numero entero.',
                'number' => 'Tiene que ser numerico.',
                default => 'Tipo de dato invalido.',
            },
            default => 'Dato invalido.',
        };
    }
}
