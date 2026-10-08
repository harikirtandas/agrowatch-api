<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

// Modelo puro: solo SQL, nada de HTTP. El chequeo de que campania_id/lote_id/
// cultivo_id EXISTEN lo hace la base con las FK de la tabla (fk_siembras_*);
// una referencia invalida en crear()/actualizar() revienta con una
// PDOException (23000), no con un valor de retorno -- lo mismo pasa con el
// UNIQUE de (campania_id, lote_id, cultivo_id) si ya existe esa combinacion.
// Traducir esas dos PDOException a 404/409 es responsabilidad del controller
// (SiembraController), no de este archivo -- mismo criterio que el resto de
// los Modelos de esta capa (ver planning/00-flujo-guiado-establecimientos/README.md).
//
// A diferencia de Campanias/Cultivos (catalogos/calendario compartidos), las
// siembras SI estan filtradas por usuario: cuelgan de un lote, que cuelga de
// un establecimiento con dueno. El chequeo de pertenencia es el mismo JOIN
// doble que usa Lote (lotes -> establecimientos -> usuario_establecimiento),
// subiendo un escalon mas porque Siembra no tiene establecimiento_id propio.
final class Siembra
{
    /**
     * Todas las siembras DEL USUARIO, opcionalmente filtradas por campania
     * y/o lote (los dos filtros son opcionales y combinables, ver README
     * raiz). Trae los nombres de cultivo/lote/campania embebidos via JOIN
     * porque el contrato de GET los pide como campos de solo lectura
     * (cultivo_nombre/lote_nombre/campania_nombre) -- no se guardan en
     * `siembras`, se resuelven en cada lectura.
     *
     * @return list<array<string, mixed>>
     */
    public static function listar(?int $campaniaId, ?int $loteId, int $usuarioId): array
    {
        $condiciones = ['ue.usuario_id = :usuarioId'];
        $parametros = ['usuarioId' => $usuarioId];

        if ($campaniaId !== null) {
            $condiciones[] = 's.campania_id = :campaniaId';
            $parametros['campaniaId'] = $campaniaId;
        }
        if ($loteId !== null) {
            $condiciones[] = 's.lote_id = :loteId';
            $parametros['loteId'] = $loteId;
        }

        $where = 'WHERE ' . implode(' AND ', $condiciones);

        $stmt = Database::connection()->prepare(self::selectConNombres() . " {$where} ORDER BY s.id DESC");
        $stmt->execute($parametros);

        return $stmt->fetchAll();
    }

    /**
     * Una siembra puntual, con los mismos nombres embebidos que listar(),
     * pero SOLO si el usuario tiene vinculo con el establecimiento del lote
     * al que pertenece. Si no existe o es de un establecimiento ajeno,
     * devuelve null en los dos casos -- misma convencion anti-enumeracion
     * que Lote::buscarDeUsuario()/Establecimiento::buscarDeUsuario().
     *
     * @return array<string, mixed>|null
     */
    public static function buscarDeUsuario(int $id, int $usuarioId): ?array
    {
        $stmt = Database::connection()->prepare(
            self::selectConNombres() . ' WHERE s.id = :id AND ue.usuario_id = :usuarioId'
        );
        $stmt->execute(['id' => $id, 'usuarioId' => $usuarioId]);

        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }

    /**
     * SELECT base compartido por listar()/buscarDeUsuario() -- un solo lugar
     * para el JOIN (nombres + pertenencia), para no repetirlo si mañana
     * cambia una columna.
     */
    private static function selectConNombres(): string
    {
        return 'SELECT s.id, s.campania_id, s.lote_id, s.cultivo_id,
                        c.nombre AS cultivo_nombre, l.nombre AS lote_nombre, cam.nombre AS campania_nombre,
                        s.ha_sembradas, s.fecha_siembra, s.variedad, s.rinde_esperado,
                        s.created_at, s.updated_at
                 FROM siembras s
                 INNER JOIN cultivos c ON c.id = s.cultivo_id
                 INNER JOIN lotes l ON l.id = s.lote_id
                 INNER JOIN campanias cam ON cam.id = s.campania_id
                 INNER JOIN establecimientos est ON est.id = l.establecimiento_id
                 INNER JOIN usuario_establecimiento ue ON ue.establecimiento_id = est.id';
    }

    /**
     * Solo inserta la fila de `siembras`. Deja que la FK y el UNIQUE de la
     * tabla exploten con PDOException si campania_id/lote_id/cultivo_id no
     * existen o si ya hay una siembra con esa misma combinacion -- ver
     * comentario de clase.
     */
    public static function crear(
        int $campaniaId,
        int $loteId,
        int $cultivoId,
        float $haSembradas,
        string $fechaSiembra,
        ?string $variedad,
        ?float $rindeEsperado
    ): int {
        $stmt = Database::connection()->prepare(
            'INSERT INTO siembras (campania_id, lote_id, cultivo_id, ha_sembradas, fecha_siembra, variedad, rinde_esperado, created_at, updated_at)
             VALUES (:campaniaId, :loteId, :cultivoId, :haSembradas, :fechaSiembra, :variedad, :rindeEsperado, NOW(), NOW())'
        );
        $stmt->execute([
            'campaniaId' => $campaniaId,
            'loteId' => $loteId,
            'cultivoId' => $cultivoId,
            'haSembradas' => $haSembradas,
            'fechaSiembra' => $fechaSiembra,
            'variedad' => $variedad,
            'rindeEsperado' => $rindeEsperado,
        ]);

        return (int) Database::connection()->lastInsertId();
    }

    /**
     * Reemplazo completo: a diferencia de Lote::actualizar() (que no admite
     * reasignar establecimiento_id), aca el contrato no prohibe reasignar
     * campania_id/lote_id/cultivo_id -- "PUT reemplaza" sin excepciones para
     * este recurso (README raiz, seccion "Siembras"). El mismo UNIQUE de la
     * tabla protege contra pisar otra combinacion ya existente.
     */
    public static function actualizar(
        int $id,
        int $campaniaId,
        int $loteId,
        int $cultivoId,
        float $haSembradas,
        string $fechaSiembra,
        ?string $variedad,
        ?float $rindeEsperado
    ): bool {
        $stmt = Database::connection()->prepare(
            'UPDATE siembras
             SET campania_id = :campaniaId, lote_id = :loteId, cultivo_id = :cultivoId,
                 ha_sembradas = :haSembradas, fecha_siembra = :fechaSiembra,
                 variedad = :variedad, rinde_esperado = :rindeEsperado, updated_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([
            'campaniaId' => $campaniaId,
            'loteId' => $loteId,
            'cultivoId' => $cultivoId,
            'haSembradas' => $haSembradas,
            'fechaSiembra' => $fechaSiembra,
            'variedad' => $variedad,
            'rindeEsperado' => $rindeEsperado,
            'id' => $id,
        ]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Borra la siembra. Los `costos` de esa siembra se van solos por el
     * ON DELETE CASCADE de fk_costos_siembra (01-schema.sql) -- no hace falta
     * un DELETE explicito aca.
     */
    public static function eliminar(int $id): bool
    {
        $stmt = Database::connection()->prepare('DELETE FROM siembras WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->rowCount() > 0;
    }
}
