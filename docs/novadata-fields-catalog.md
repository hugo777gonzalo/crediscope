# Catálogo de campos de Novadata

Generado a partir de 25 consultas reales (ver lista de cédulas en el chat), vía la Edge Function `explore-novadata`, el 2026-09-03.

**Cómo leer esto:** cada recurso trae `{ estado: {codigo, mensaje}, <campo>: [...] }`. "Consultas OK" = Novadata respondió con `estado.codigo === "OK"` (no necesariamente con datos). "Con datos" = cuántas de las 25 personas tuvieron ese campo con contenido real (no vacío/null).

No se incluyen valores reales de personas — solo nombres de campo, tipos, y tasa de llenado, para no exponer PII de las 25 personas consultadas en este documento.


## Eje actual: `general`

### `general` — Identidad: nombre, fecha nacimiento, género, estado civil, nivel educación, profesión(es), nacionalidad, cónyuge, fallecido.

- **Ruta real:** `data-services/novacredit/pn_inf_basica/{cedula}`
- **Grupo propuesto:** 1. Identidad y perfil personal
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `personaNatural.identificacion` | string | 25 |
| `personaNatural.nombre` | string | 25 |
| `personaNatural.nombreUno` | null | 0 |
| `personaNatural.nombreDos` | null | 0 |
| `personaNatural.condicion` | null | 0 |
| `personaNatural.tipoIdentificacion.idTipoIdentificacion` | number | 25 |
| `personaNatural.tipoIdentificacion.descripcion` | string | 25 |
| `personaNatural.fechaNacimiento` | string | 25 |
| `personaNatural.fechaDefuncion` | null | 0 |
| `personaNatural.informacionAdicional` | string | 25 |
| `personaNatural.genero.idGenero` | number | 25 |
| `personaNatural.genero.descripcion` | string | 25 |
| `personaNatural.lugarDefuncion` | null | 0 |
| `personaNatural.lugarNacimiento.idLugar` | number | 23 |
| `personaNatural.lugarNacimiento.codigoPostal` | string | 23 |
| `personaNatural.lugarNacimiento.fechaActualizacion` | null | 0 |
| `personaNatural.lugarNacimiento.parroquia.idParroquia` | number | 23 |
| `personaNatural.lugarNacimiento.parroquia.idProvincia` | null | 0 |
| `personaNatural.lugarNacimiento.parroquia.idPais` | null | 0 |
| `personaNatural.lugarNacimiento.parroquia.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.parroquia.canton.idCanton` | number | 23 |
| `personaNatural.lugarNacimiento.parroquia.canton.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.parroquia.canton.provincia.idProvincia` | number | 23 |
| `personaNatural.lugarNacimiento.parroquia.canton.provincia.codigoArea` | string | 23 |
| `personaNatural.lugarNacimiento.parroquia.canton.provincia.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.canton.idCanton` | number | 23 |
| `personaNatural.lugarNacimiento.canton.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.idProvincia` | number | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.codigoArea` | string | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.pais.idPais` | number | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.pais.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.pais.codigoArea` | string | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.pais.codigoIso2` | string | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.pais.codigoIso3` | string | 23 |
| `personaNatural.lugarNacimiento.canton.provincia.pais.codigoIso` | number | 23 |
| `personaNatural.lugarNacimiento.provincia.idProvincia` | number | 23 |
| `personaNatural.lugarNacimiento.provincia.codigoArea` | string | 23 |
| `personaNatural.lugarNacimiento.provincia.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.provincia.pais.idPais` | number | 23 |
| `personaNatural.lugarNacimiento.provincia.pais.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.provincia.pais.codigoArea` | string | 23 |
| `personaNatural.lugarNacimiento.provincia.pais.codigoIso2` | string | 23 |
| `personaNatural.lugarNacimiento.provincia.pais.codigoIso3` | string | 23 |
| `personaNatural.lugarNacimiento.provincia.pais.codigoIso` | number | 23 |
| `personaNatural.lugarNacimiento.pais.idPais` | number | 23 |
| `personaNatural.lugarNacimiento.pais.nombre` | string | 23 |
| `personaNatural.lugarNacimiento.pais.codigoArea` | string | 23 |
| `personaNatural.lugarNacimiento.pais.codigoIso2` | string | 23 |
| `personaNatural.lugarNacimiento.pais.codigoIso3` | string | 23 |
| `personaNatural.lugarNacimiento.pais.codigoIso` | number | 23 |
| `personaNatural.apellidoUno` | null | 0 |
| `personaNatural.apellidoDos` | null | 0 |
| `nacionalidades` | array | 25 |
| `nacionalidades[].pais.idPais` | number | 25 |
| `nacionalidades[].pais.nombre` | string | 25 |
| `nacionalidades[].pais.codigoArea` | string | 25 |
| `nacionalidades[].pais.codigoIso2` | string | 25 |
| `nacionalidades[].pais.codigoIso3` | string | 25 |
| `nacionalidades[].pais.codigoIso` | number | 25 |
| `profesiones` | array | 25 |
| `profesiones[].profesion.idProfesion` | number | 25 |
| `profesiones[].profesion.descripcion` | string | 25 |
| `personaNaturalConyuge.fechaMatrimonio` | string/null | 13 |
| `personaNaturalConyuge.personaConyuge.identificacion` | string/null | 11 |
| `personaNaturalConyuge.personaConyuge.nombre` | string | 12 |
| `personaNaturalConyuge.personaConyuge.nombreUno` | null | 0 |
| `personaNaturalConyuge.personaConyuge.nombreDos` | null | 0 |
| `personaNaturalConyuge.personaConyuge.condicion` | null | 0 |
| `personaNaturalConyuge.personaConyuge.tipoIdentificacion.idTipoIdentificacion` | number | 11 |
| `personaNaturalConyuge.personaConyuge.tipoIdentificacion.descripcion` | string | 11 |
| `personaNaturalConyuge.personaConyuge.fechaNacimiento` | string/null | 11 |
| `personaNaturalConyuge.personaConyuge.fechaDefuncion` | null | 0 |
| `personaNaturalConyuge.personaConyuge.informacionAdicional` | null/string | 8 |
| `personaNaturalConyuge.personaConyuge.genero.idGenero` | number | 11 |
| `personaNaturalConyuge.personaConyuge.genero.descripcion` | string | 11 |
| `personaNaturalConyuge.personaConyuge.lugarDefuncion` | null | 0 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.idLugar` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.codigoPostal` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.fechaActualizacion` | null | 0 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.parroquia.idParroquia` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.parroquia.idProvincia` | null | 0 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.parroquia.idPais` | null | 0 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.parroquia.nombre` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.parroquia.canton.idCanton` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.parroquia.canton.nombre` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.canton.idCanton` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.canton.nombre` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.canton.provincia.idProvincia` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.canton.provincia.codigoArea` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.canton.provincia.nombre` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.idProvincia` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.codigoArea` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.nombre` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.pais.idPais` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.pais.nombre` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.pais.codigoArea` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.pais.codigoIso2` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.pais.codigoIso3` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.provincia.pais.codigoIso` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.pais.idPais` | number | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.pais.nombre` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.pais.codigoArea` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.pais.codigoIso2` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.pais.codigoIso3` | string | 10 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento.pais.codigoIso` | number | 10 |
| `personaNaturalConyuge.personaConyuge.apellidoUno` | null | 0 |
| `personaNaturalConyuge.personaConyuge.apellidoDos` | null | 0 |
| `personaNaturalConyuge.lugar.idLugar` | number | 13 |
| `personaNaturalConyuge.lugar.codigoPostal` | string | 13 |
| `personaNaturalConyuge.lugar.fechaActualizacion` | null | 0 |
| `personaNaturalConyuge.lugar.parroquia.idParroquia` | number | 13 |
| `personaNaturalConyuge.lugar.parroquia.idProvincia` | null | 0 |
| `personaNaturalConyuge.lugar.parroquia.idPais` | null | 0 |
| `personaNaturalConyuge.lugar.parroquia.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.parroquia.canton.idCanton` | number | 13 |
| `personaNaturalConyuge.lugar.parroquia.canton.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.parroquia.canton.provincia.idProvincia` | number | 13 |
| `personaNaturalConyuge.lugar.parroquia.canton.provincia.codigoArea` | string | 13 |
| `personaNaturalConyuge.lugar.parroquia.canton.provincia.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.canton.idCanton` | number | 13 |
| `personaNaturalConyuge.lugar.canton.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.idProvincia` | number | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.codigoArea` | string | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.pais.idPais` | number | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.pais.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.pais.codigoArea` | string | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.pais.codigoIso2` | string | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.pais.codigoIso3` | string | 13 |
| `personaNaturalConyuge.lugar.canton.provincia.pais.codigoIso` | number | 13 |
| `personaNaturalConyuge.lugar.provincia.idProvincia` | number | 13 |
| `personaNaturalConyuge.lugar.provincia.codigoArea` | string | 13 |
| `personaNaturalConyuge.lugar.provincia.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.provincia.pais.idPais` | number | 13 |
| `personaNaturalConyuge.lugar.provincia.pais.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.provincia.pais.codigoArea` | string | 13 |
| `personaNaturalConyuge.lugar.provincia.pais.codigoIso2` | string | 13 |
| `personaNaturalConyuge.lugar.provincia.pais.codigoIso3` | string | 13 |
| `personaNaturalConyuge.lugar.provincia.pais.codigoIso` | number | 13 |
| `personaNaturalConyuge.lugar.pais.idPais` | number | 13 |
| `personaNaturalConyuge.lugar.pais.nombre` | string | 13 |
| `personaNaturalConyuge.lugar.pais.codigoArea` | string | 13 |
| `personaNaturalConyuge.lugar.pais.codigoIso2` | string | 13 |
| `personaNaturalConyuge.lugar.pais.codigoIso3` | string | 13 |
| `personaNaturalConyuge.lugar.pais.codigoIso` | number | 13 |
| `nivelEducacion.nivelEducacion.idNivelEducacion` | number | 25 |
| `nivelEducacion.nivelEducacion.descripcion` | string | 25 |
| `nivelEducacion.nivelEducacion.nivel` | number | 25 |
| `personaNaturalConyuge.personaConyuge.tipoIdentificacion` | null | 0 |
| `personaNaturalConyuge.personaConyuge.genero` | null | 0 |
| `personaNaturalConyuge.personaConyuge.lugarNacimiento` | null | 0 |
| `personaNaturalConyuge.lugar` | null | 0 |
| `personaNatural.lugarNacimiento` | null | 0 |


## Eje actual: `sociodemografica`

### `direcciones` — Domicilios registrados (tipo, calle).

- **Ruta real:** `pn_direcciones`
- **Grupo propuesto:** 2. Contacto y domicilio
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `direcciones` | array | 25 |
| `direcciones[].fechaActualizacion` | number | 25 |
| `direcciones[].tipoDireccion.idTipoDireccion` | number | 25 |
| `direcciones[].tipoDireccion.nombre` | string | 25 |
| `direcciones[].personaDireccionEstado.nombre` | string | 1 |
| `direcciones[].personaDireccionEstado.id_persona_direccion_estado` | number | 1 |
| `direcciones[].direccion.callePrincipal` | string | 25 |
| `direcciones[].direccion.calleSecundaria` | string | 1 |
| `direcciones[].direccion.numero` | string | 1 |
| `direcciones[].direccion.fechaActualizacion` | string | 11 |
| `direcciones[].direccion.lugar.idLugar` | number | 10 |
| `direcciones[].direccion.lugar.codigoPostal` | string/null | 8 |
| `direcciones[].direccion.lugar.fechaActualizacion` | number | 10 |
| `direcciones[].direccion.lugar.parroquia.idParroquia` | number | 10 |
| `direcciones[].direccion.lugar.parroquia.idProvincia` | number/null | 8 |
| `direcciones[].direccion.lugar.parroquia.idPais` | number | 10 |
| `direcciones[].direccion.lugar.parroquia.nombre` | string | 10 |
| `direcciones[].direccion.lugar.parroquia.canton` | null | 0 |
| `direcciones[].direccion.lugar.canton.idCanton` | number | 10 |
| `direcciones[].direccion.lugar.canton.nombre` | string | 10 |
| `direcciones[].direccion.lugar.provincia.idProvincia` | number | 10 |
| `direcciones[].direccion.lugar.provincia.codigoArea` | string | 10 |
| `direcciones[].direccion.lugar.provincia.nombre` | string | 10 |
| `direcciones[].direccion.lugar.provincia.pais` | null | 0 |
| `direcciones[].direccion.lugar.pais.idPais` | number | 10 |
| `direcciones[].direccion.lugar.pais.nombre` | string | 10 |
| `direcciones[].direccion.lugar.pais.codigoArea` | string | 10 |
| `direcciones[].direccion.lugar.pais.codigoIso2` | string | 10 |
| `direcciones[].direccion.lugar.pais.codigoIso3` | string | 10 |
| `direcciones[].direccion.lugar.pais.codigoIso` | number | 10 |
| `direcciones[].personaDireccionEstado` | null | 0 |
| `direcciones[].direccion.referencia` | string | 14 |

### `telefonos` — Teléfonos registrados (tipo, número).

- **Ruta real:** `pn_telefonos`
- **Grupo propuesto:** 2. Contacto y domicilio
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `telefonos` | array | 25 |
| `telefonos[].tipoPersonaTelefono.idTipoPersonaTelefono` | number | 25 |
| `telefonos[].tipoPersonaTelefono.nombre` | string | 25 |
| `telefonos[].telefono.codigoArea` | null | 0 |
| `telefonos[].telefono.codigoAreaLocal` | null | 0 |
| `telefonos[].telefono.nombrePropetario` | string/null | 23 |
| `telefonos[].telefono.numero` | string | 25 |
| `telefonos[].telefono.ext` | null | 0 |
| `telefonos[].telefono.fechaActualizacion` | number | 25 |
| `telefonos[].telefono.tipoTelefono.idTipoTelefono` | number | 24 |
| `telefonos[].telefono.tipoTelefono.nombre` | string | 24 |
| `telefonos[].telefono.direccion` | null | 0 |
| `telefonos[].telefono.tipoTelefono` | null | 0 |
| `telefonos[].telefono.direccion.callePrincipal` | string | 1 |
| `telefonos[].telefono.direccion.fechaActualizacion` | string | 1 |
| `telefonos[].telefono.direccion.lugar.idLugar` | number | 1 |
| `telefonos[].telefono.direccion.lugar.codigoPostal` | string | 1 |
| `telefonos[].telefono.direccion.lugar.fechaActualizacion` | number | 1 |

### `correo` — Correos electrónicos registrados.

- **Ruta real:** `pn_direccion_correoe`
- **Grupo propuesto:** 2. Contacto y domicilio
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `correos` | array | 25 |
| `correos[].descripcion` | string | 25 |
| `correos[].fechaActualizacion` | string | 25 |

### `padres` — Padres (nombre, si están fallecidos).

- **Ruta real:** `pn_padres`
- **Grupo propuesto:** 3. Núcleo familiar
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `personasNatural` | array | 22 |
| `personasNatural[].identificacion` | string | 22 |
| `personasNatural[].nombre` | string | 22 |
| `personasNatural[].nombreUno` | null | 0 |
| `personasNatural[].nombreDos` | null | 0 |
| `personasNatural[].tipoIdentificacion.idTipoIdentificacion` | number | 22 |
| `personasNatural[].tipoIdentificacion.descripcion` | string | 22 |
| `personasNatural[].fechaNacimiento` | string | 22 |
| `personasNatural[].fechaDefuncion` | null/string | 3 |
| `personasNatural[].informacionAdicional` | null/string | 10 |
| `personasNatural[].genero.idGenero` | number | 22 |
| `personasNatural[].genero.descripcion` | string | 22 |
| `personasNatural[].lugarDefuncion` | null | 0 |
| `personasNatural[].lugarNacimiento.idLugar` | number | 22 |
| `personasNatural[].lugarNacimiento.codigoPostal` | string | 22 |
| `personasNatural[].lugarNacimiento.fechaActualizacion` | null | 0 |
| `personasNatural[].lugarNacimiento.parroquia.idParroquia` | number | 22 |
| `personasNatural[].lugarNacimiento.parroquia.idProvincia` | null | 0 |
| `personasNatural[].lugarNacimiento.parroquia.idPais` | null | 0 |
| `personasNatural[].lugarNacimiento.parroquia.nombre` | string | 22 |
| `personasNatural[].lugarNacimiento.parroquia.canton.idCanton` | number | 22 |
| `personasNatural[].lugarNacimiento.parroquia.canton.nombre` | string | 22 |
| `personasNatural[].lugarNacimiento.canton.idCanton` | number | 22 |
| `personasNatural[].lugarNacimiento.canton.nombre` | string | 22 |
| `personasNatural[].lugarNacimiento.canton.provincia.idProvincia` | number | 22 |
| `personasNatural[].lugarNacimiento.canton.provincia.codigoArea` | string | 22 |
| `personasNatural[].lugarNacimiento.canton.provincia.nombre` | string | 22 |
| `personasNatural[].lugarNacimiento.provincia.idProvincia` | number | 22 |
| `personasNatural[].lugarNacimiento.provincia.codigoArea` | string | 22 |
| `personasNatural[].lugarNacimiento.provincia.nombre` | string | 22 |
| `personasNatural[].lugarNacimiento.provincia.pais.idPais` | number | 22 |
| `personasNatural[].lugarNacimiento.provincia.pais.nombre` | string | 22 |
| `personasNatural[].lugarNacimiento.provincia.pais.codigoArea` | string | 22 |
| `personasNatural[].lugarNacimiento.provincia.pais.codigoIso2` | string | 22 |
| `personasNatural[].lugarNacimiento.provincia.pais.codigoIso3` | string | 22 |
| `personasNatural[].lugarNacimiento.provincia.pais.codigoIso` | number | 22 |
| `personasNatural[].lugarNacimiento.pais.idPais` | number | 22 |
| `personasNatural[].lugarNacimiento.pais.nombre` | string | 22 |
| `personasNatural[].lugarNacimiento.pais.codigoArea` | string | 22 |
| `personasNatural[].lugarNacimiento.pais.codigoIso2` | string | 22 |
| `personasNatural[].lugarNacimiento.pais.codigoIso3` | string | 22 |
| `personasNatural[].lugarNacimiento.pais.codigoIso` | number | 22 |
| `personasNatural[].apellidoUno` | null | 0 |
| `personasNatural[].apellidoDos` | null | 0 |
| `personasNatural[].lugarDefuncion.idLugar` | number | 3 |
| `personasNatural[].lugarDefuncion.codigoPostal` | string | 3 |
| `personasNatural[].lugarDefuncion.fechaActualizacion` | null | 0 |
| `personasNatural[].lugarDefuncion.parroquia.idParroquia` | number | 3 |
| `personasNatural[].lugarDefuncion.parroquia.idProvincia` | null | 0 |
| `personasNatural[].lugarDefuncion.parroquia.idPais` | null | 0 |
| `personasNatural[].lugarDefuncion.parroquia.nombre` | string | 3 |
| `personasNatural[].lugarDefuncion.parroquia.canton.idCanton` | number | 3 |
| `personasNatural[].lugarDefuncion.parroquia.canton.nombre` | string | 3 |
| `personasNatural[].lugarDefuncion.canton.idCanton` | number | 3 |
| `personasNatural[].lugarDefuncion.canton.nombre` | string | 3 |
| `personasNatural[].lugarDefuncion.canton.provincia.idProvincia` | number | 3 |
| `personasNatural[].lugarDefuncion.canton.provincia.codigoArea` | string | 3 |
| `personasNatural[].lugarDefuncion.canton.provincia.nombre` | string | 3 |
| `personasNatural[].lugarDefuncion.provincia.idProvincia` | number | 3 |
| `personasNatural[].lugarDefuncion.provincia.codigoArea` | string | 3 |
| `personasNatural[].lugarDefuncion.provincia.nombre` | string | 3 |
| `personasNatural[].lugarDefuncion.provincia.pais.idPais` | number | 3 |
| `personasNatural[].lugarDefuncion.provincia.pais.nombre` | string | 3 |
| `personasNatural[].lugarDefuncion.provincia.pais.codigoArea` | string | 3 |
| `personasNatural[].lugarDefuncion.provincia.pais.codigoIso2` | string | 3 |
| `personasNatural[].lugarDefuncion.provincia.pais.codigoIso3` | string | 3 |
| `personasNatural[].lugarDefuncion.provincia.pais.codigoIso` | number | 3 |
| `personasNatural[].lugarDefuncion.pais.idPais` | number | 3 |
| `personasNatural[].lugarDefuncion.pais.nombre` | string | 3 |
| `personasNatural[].lugarDefuncion.pais.codigoArea` | string | 3 |
| `personasNatural[].lugarDefuncion.pais.codigoIso2` | string | 3 |
| `personasNatural[].lugarDefuncion.pais.codigoIso3` | string | 3 |
| `personasNatural[].lugarDefuncion.pais.codigoIso` | number | 3 |

### `hijos` — Hijos (nombre, fecha nacimiento).

- **Ruta real:** `pn_hijos`
- **Grupo propuesto:** 3. Núcleo familiar
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `personasNatural` | array | 17 |
| `personasNatural[].identificacion` | string | 17 |
| `personasNatural[].nombre` | string | 17 |
| `personasNatural[].nombreUno` | null | 0 |
| `personasNatural[].nombreDos` | null | 0 |
| `personasNatural[].tipoIdentificacion.idTipoIdentificacion` | number | 17 |
| `personasNatural[].tipoIdentificacion.descripcion` | string | 17 |
| `personasNatural[].fechaNacimiento` | string | 17 |
| `personasNatural[].fechaDefuncion` | null | 0 |
| `personasNatural[].informacionAdicional` | null/string | 6 |
| `personasNatural[].genero.idGenero` | number | 17 |
| `personasNatural[].genero.descripcion` | string | 17 |
| `personasNatural[].lugarDefuncion` | null | 0 |
| `personasNatural[].lugarNacimiento.idLugar` | number | 17 |
| `personasNatural[].lugarNacimiento.codigoPostal` | string | 17 |
| `personasNatural[].lugarNacimiento.fechaActualizacion` | null | 0 |
| `personasNatural[].lugarNacimiento.parroquia.idParroquia` | number | 17 |
| `personasNatural[].lugarNacimiento.parroquia.idProvincia` | null | 0 |
| `personasNatural[].lugarNacimiento.parroquia.idPais` | null | 0 |
| `personasNatural[].lugarNacimiento.parroquia.nombre` | string | 17 |
| `personasNatural[].lugarNacimiento.parroquia.canton.idCanton` | number | 17 |
| `personasNatural[].lugarNacimiento.parroquia.canton.nombre` | string | 17 |
| `personasNatural[].lugarNacimiento.canton.idCanton` | number | 17 |
| `personasNatural[].lugarNacimiento.canton.nombre` | string | 17 |
| `personasNatural[].lugarNacimiento.canton.provincia.idProvincia` | number | 17 |
| `personasNatural[].lugarNacimiento.canton.provincia.codigoArea` | string | 17 |
| `personasNatural[].lugarNacimiento.canton.provincia.nombre` | string | 17 |
| `personasNatural[].lugarNacimiento.provincia.idProvincia` | number | 17 |
| `personasNatural[].lugarNacimiento.provincia.codigoArea` | string | 17 |
| `personasNatural[].lugarNacimiento.provincia.nombre` | string | 17 |
| `personasNatural[].lugarNacimiento.provincia.pais.idPais` | number | 17 |
| `personasNatural[].lugarNacimiento.provincia.pais.nombre` | string | 17 |
| `personasNatural[].lugarNacimiento.provincia.pais.codigoArea` | string | 17 |
| `personasNatural[].lugarNacimiento.provincia.pais.codigoIso2` | string | 17 |
| `personasNatural[].lugarNacimiento.provincia.pais.codigoIso3` | string | 17 |
| `personasNatural[].lugarNacimiento.provincia.pais.codigoIso` | number | 17 |
| `personasNatural[].lugarNacimiento.pais.idPais` | number | 17 |
| `personasNatural[].lugarNacimiento.pais.nombre` | string | 17 |
| `personasNatural[].lugarNacimiento.pais.codigoArea` | string | 17 |
| `personasNatural[].lugarNacimiento.pais.codigoIso2` | string | 17 |
| `personasNatural[].lugarNacimiento.pais.codigoIso3` | string | 17 |
| `personasNatural[].lugarNacimiento.pais.codigoIso` | number | 17 |
| `personasNatural[].apellidoUno` | null | 0 |
| `personasNatural[].apellidoDos` | null | 0 |
| `personasNatural[].lugarDefuncion.idLugar` | number | 4 |
| `personasNatural[].lugarDefuncion.codigoPostal` | string | 4 |
| `personasNatural[].lugarDefuncion.fechaActualizacion` | null | 0 |
| `personasNatural[].lugarDefuncion.parroquia.idParroquia` | number | 4 |
| `personasNatural[].lugarDefuncion.parroquia.idProvincia` | null | 0 |
| `personasNatural[].lugarDefuncion.parroquia.idPais` | null | 0 |
| `personasNatural[].lugarDefuncion.parroquia.nombre` | string | 4 |
| `personasNatural[].lugarDefuncion.parroquia.canton.idCanton` | number | 4 |
| `personasNatural[].lugarDefuncion.parroquia.canton.nombre` | string | 4 |
| `personasNatural[].lugarDefuncion.canton.idCanton` | number | 4 |
| `personasNatural[].lugarDefuncion.canton.nombre` | string | 4 |
| `personasNatural[].lugarDefuncion.canton.provincia.idProvincia` | number | 4 |
| `personasNatural[].lugarDefuncion.canton.provincia.codigoArea` | string | 4 |
| `personasNatural[].lugarDefuncion.canton.provincia.nombre` | string | 4 |
| `personasNatural[].lugarDefuncion.provincia.idProvincia` | number | 4 |
| `personasNatural[].lugarDefuncion.provincia.codigoArea` | string | 4 |
| `personasNatural[].lugarDefuncion.provincia.nombre` | string | 4 |
| `personasNatural[].lugarDefuncion.provincia.pais.idPais` | number | 4 |
| `personasNatural[].lugarDefuncion.provincia.pais.nombre` | string | 4 |
| `personasNatural[].lugarDefuncion.provincia.pais.codigoArea` | string | 4 |
| `personasNatural[].lugarDefuncion.provincia.pais.codigoIso2` | string | 4 |
| `personasNatural[].lugarDefuncion.provincia.pais.codigoIso3` | string | 4 |
| `personasNatural[].lugarDefuncion.provincia.pais.codigoIso` | number | 4 |
| `personasNatural[].lugarDefuncion.pais.idPais` | number | 4 |
| `personasNatural[].lugarDefuncion.pais.nombre` | string | 4 |
| `personasNatural[].lugarDefuncion.pais.codigoArea` | string | 4 |
| `personasNatural[].lugarDefuncion.pais.codigoIso2` | string | 4 |
| `personasNatural[].lugarDefuncion.pais.codigoIso3` | string | 4 |
| `personasNatural[].lugarDefuncion.pais.codigoIso` | number | 4 |

### `titulos` — Títulos académicos. Vacío en las 25 personas de la muestra.

- **Ruta real:** `pn_titulos`
- **Grupo propuesto:** 14. Salud y educación (menor peso)
- **Consultas OK:** 0/25

### `bienesInmueble` — Inmuebles a nombre de la persona. Vacío en la muestra (posible limitación de cobertura, no necesariamente ausencia real).

- **Ruta real:** `pn_bienes_inmueble`
- **Grupo propuesto:** 7. Patrimonio
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `bienesInmueble` | array | 0 |

### `vacunados` — Registro de vacunación. Sin relevancia crediticia directa.

- **Ruta real:** `vacunados/get_inf_byIden`
- **Grupo propuesto:** 14. Salud y educación (menor peso)
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `datosVac` | array | 0 |


## Eje actual: `trabajo`

### `empleados` — Personas que esta persona tiene como empleados (si es empleador).

- **Ruta real:** `pn_empleados`
- **Grupo propuesto:** 4. Situación laboral e ingresos
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `empleados` | array | 5 |
| `empleados[].ci` | string | 5 |
| `empleados[].parroquias` | null | 0 |
| `empleados[].rucEmp` | string | 5 |
| `empleados[].codSuc` | null | 0 |
| `empleados[].tipEmp` | string | 5 |
| `empleados[].nomEmp` | string | 5 |
| `empleados[].telEmp` | string | 5 |
| `empleados[].dirEmp` | string | 5 |
| `empleados[].faxEmp` | null | 0 |
| `empleados[].nomAfi` | string | 5 |
| `empleados[].dirAfi` | string | 5 |
| `empleados[].telAfi` | null/string | 2 |
| `empleados[].celAfi` | null/string | 3 |
| `empleados[].email` | string | 5 |
| `empleados[].salario` | number | 5 |
| `empleados[].fecIng` | string | 5 |
| `empleados[].fecSal` | null | 0 |
| `empleados[].ocupacion` | string | 5 |
| `empleados[].anio` | number | 5 |
| `empleados[].mes` | number | 5 |
| `empleados[].idIess` | null | 0 |

### `trabajoHistoricos` — Historial laboral (patrono, cargo, ingreso mensual, antigüedad).

- **Ruta real:** `pn_trabajo_historicos`
- **Grupo propuesto:** 4. Situación laboral e ingresos
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `trabajosHistoricos` | array | 19 |
| `trabajosHistoricos[].personaTrabajo.fechaActualizacion` | number | 19 |
| `trabajosHistoricos[].personaTrabajo.fechaIngreso` | number | 19 |
| `trabajosHistoricos[].personaTrabajo.fechaAfiliacionHasta` | number | 19 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.tipoPersona` | string | 19 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.identificacion` | string | 19 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.nombre` | string | 19 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.nombreUno` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.nombreDos` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.tipoIdentificacion.idTipoIdentificacion` | number | 18 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.tipoIdentificacion.descripcion` | string | 18 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.plazoSocial` | null/number | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.expediente` | null/number | 5 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.fechaConstitucion` | null/number | 6 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.nombreComercial` | string/null | 11 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.tipoCompania` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.oficinaControl` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.situacionLegal` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.proveedoraEstado` | null/string | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.pagoRemesas` | null/string | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.vendeCredito` | null/string | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.capitalSuscrito` | null/number | 6 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.capitalAutorizado` | null/number | 5 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.valorNominal` | null/number | 5 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.perteneceMv` | null/string | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.apellidoUno` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.apellidoDos` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.fechaActualizacion` | string/null | 13 |
| `trabajosHistoricos[].personaTrabajo.personaIngreso.valor` | number | 19 |
| `trabajosHistoricos[].personaTrabajo.personaIngreso.tipoIngreso` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaIngreso.frecuenciaIngreso` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaIngreso.valorRango` | string | 19 |
| `trabajosHistoricos[].personaTrabajo.tipoAfiliado` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.cargo.idCargo` | number | 19 |
| `trabajosHistoricos[].personaTrabajo.cargo.nombre` | string | 19 |
| `trabajosHistoricos[].personaTrabajo.telefonoOfi` | string/null | 17 |
| `trabajosHistoricos[].personaTrabajo.telefonoAfi` | string/null | 16 |
| `trabajosHistoricos[].personaTrabajo.direccionOfi` | string/null | 18 |
| `trabajosHistoricos[].personaTrabajo.direccionAfi` | string/null | 18 |
| `trabajosHistoricos[].personaTrabajo.celular` | string/null | 17 |
| `trabajosHistoricos[].personaTrabajo.baseDate` | null | 0 |
| `trabajosHistoricos[].antiguedadEmpleado` | string | 19 |
| `trabajosHistoricos[].personasEmpleados` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.fechaNacimiento` | number | 5 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.fechaDefuncion` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.informacionAdicional` | string/null | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.genero.idGenero` | number | 5 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.genero.descripcion` | string | 5 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.lugarDefuncion` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.lugarNacimiento.idLugar` | number | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.lugarNacimiento.codigoPostal` | string | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.lugarNacimiento.fechaActualizacion` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.tipoCompania.idTipoCompania` | number | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.tipoCompania.nombre` | string | 4 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.oficinaControl.idCanton` | number | 6 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.oficinaControl.nombre` | string | 6 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.situacionLegal.nombre` | string | 6 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.tipoIdentificacion` | null | 0 |
| `trabajosHistoricos[].personaTrabajo.personaPatrono.lugarNacimiento` | null | 0 |

### `trabajoHistoricosMecanizado` — Historial laboral mecanizado IESS, mes a mes (patrono, cargo, salario, fechas). Más granular que trabajoHistoricos.

- **Ruta real:** `pn_trabajo_historicos/mecanizado`
- **Grupo propuesto:** 4. Situación laboral e ingresos
- **Consultas OK:** 21/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `mecanizadoEmpleados` | array | 18 |
| `mecanizadoEmpleados[].fechaActualizacion` | string | 18 |
| `mecanizadoEmpleados[].fechaIngreso` | number | 18 |
| `mecanizadoEmpleados[].fechaAfiliacionHasta` | null/number | 4 |
| `mecanizadoEmpleados[].personaPatrono.identificacion` | string | 18 |
| `mecanizadoEmpleados[].personaPatrono.nombre` | string | 18 |
| `mecanizadoEmpleados[].personaPatrono.nombreUno` | null | 0 |
| `mecanizadoEmpleados[].personaPatrono.nombreDos` | null | 0 |
| `mecanizadoEmpleados[].personaPatrono.tipoIdentificacion` | null | 0 |
| `mecanizadoEmpleados[].personaPatrono.plazoSocial` | null/string | 1 |
| `mecanizadoEmpleados[].personaPatrono.expediente` | number | 18 |
| `mecanizadoEmpleados[].personaPatrono.fechaConstitucion` | null/string | 1 |
| `mecanizadoEmpleados[].personaPatrono.nombreComercial` | null/string | 2 |
| `mecanizadoEmpleados[].personaPatrono.tipoCompania` | null | 0 |
| `mecanizadoEmpleados[].personaPatrono.oficinaControl` | null | 0 |
| `mecanizadoEmpleados[].personaPatrono.situacionLegal` | null | 0 |
| `mecanizadoEmpleados[].personaPatrono.proveedoraEstado` | null/string | 1 |
| `mecanizadoEmpleados[].personaPatrono.pagoRemesas` | null/string | 1 |
| `mecanizadoEmpleados[].personaPatrono.vendeCredito` | null/string | 1 |
| `mecanizadoEmpleados[].personaPatrono.capitalSuscrito` | null/number | 1 |
| `mecanizadoEmpleados[].personaPatrono.capitalAutorizado` | null/number | 1 |
| `mecanizadoEmpleados[].personaPatrono.valorNominal` | null/number | 1 |
| `mecanizadoEmpleados[].personaPatrono.perteneceMv` | null/string | 1 |
| `mecanizadoEmpleados[].personaPatrono.apellidoUno` | null | 0 |
| `mecanizadoEmpleados[].personaPatrono.apellidoDos` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado` | null | 0 |
| `mecanizadoEmpleados[].personaIngreso.valor` | number | 18 |
| `mecanizadoEmpleados[].personaIngreso.tipoIngreso.idTipoIngreso` | number | 18 |
| `mecanizadoEmpleados[].personaIngreso.tipoIngreso.nombre` | string | 18 |
| `mecanizadoEmpleados[].personaIngreso.frecuenciaIngreso.idFrecuenciaIngreso` | number | 18 |
| `mecanizadoEmpleados[].personaIngreso.frecuenciaIngreso.descripcion` | string | 18 |
| `mecanizadoEmpleados[].personaIngreso.valorRango` | null | 0 |
| `mecanizadoEmpleados[].cargo.idCargo` | number | 18 |
| `mecanizadoEmpleados[].cargo.nombre` | string | 18 |
| `mecanizadoEmpleados[].tipoAfiliado` | null | 0 |
| `mecanizadoEmpleados[].telefonoOfi` | string/null | 13 |
| `mecanizadoEmpleados[].telefonoAfi` | string/null | 13 |
| `mecanizadoEmpleados[].direccionOfi` | string/null | 13 |
| `mecanizadoEmpleados[].direccionAfi` | string | 18 |
| `mecanizadoEmpleados[].celular` | string/null | 16 |
| `mecanizadoEmpleados[].baseDate` | string | 18 |
| `mecanizadoEmpleados[].rucEmpresa` | string | 18 |
| `mecanizadoEmpleados[].nombreEmpresa` | string | 18 |
| `mecanizadoEmpleados[].tipoEmpresa` | string | 18 |
| `mecanizadoEmpleados[].personaEmpleado.identificacion` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.nombre` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.nombreUno` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado.nombreDos` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado.tipoIdentificacion.idTipoIdentificacion` | number | 6 |
| `mecanizadoEmpleados[].personaEmpleado.tipoIdentificacion.descripcion` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.fechaNacimiento` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.fechaDefuncion` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado.informacionAdicional` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.genero.idGenero` | number | 6 |
| `mecanizadoEmpleados[].personaEmpleado.genero.descripcion` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarDefuncion` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.idLugar` | number | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.codigoPostal` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.fechaActualizacion` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.parroquia.idParroquia` | number | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.parroquia.idProvincia` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.parroquia.idPais` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.parroquia.nombre` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.canton.idCanton` | number | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.canton.nombre` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.provincia.idProvincia` | number | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.provincia.codigoArea` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.provincia.nombre` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.pais.idPais` | number | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.pais.nombre` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.pais.codigoArea` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.pais.codigoIso2` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.pais.codigoIso3` | string | 6 |
| `mecanizadoEmpleados[].personaEmpleado.lugarNacimiento.pais.codigoIso` | number | 6 |
| `mecanizadoEmpleados[].personaEmpleado.apellidoUno` | null | 0 |
| `mecanizadoEmpleados[].personaEmpleado.apellidoDos` | null | 0 |
| `mecanizadoEmpleados[].personaPatrono.tipoIdentificacion.idTipoIdentificacion` | number | 2 |
| `mecanizadoEmpleados[].personaPatrono.tipoIdentificacion.descripcion` | string | 2 |
| `mecanizadoEmpleados[].personaPatrono.tipoCompania.idTipoCompania` | number | 1 |
| `mecanizadoEmpleados[].personaPatrono.tipoCompania.nombre` | string | 1 |
| `mecanizadoEmpleados[].personaPatrono.oficinaControl.idCanton` | number | 1 |
| `mecanizadoEmpleados[].personaPatrono.oficinaControl.nombre` | string | 1 |
| `mecanizadoEmpleados[].personaPatrono.oficinaControl.provincia.idProvincia` | number | 1 |
| `mecanizadoEmpleados[].personaPatrono.oficinaControl.provincia.codigoArea` | string | 1 |
| `mecanizadoEmpleados[].personaPatrono.oficinaControl.provincia.nombre` | string | 1 |
| `mecanizadoEmpleados[].personaPatrono.situacionLegal.nombre` | string | 1 |

### `cumplimientoPatronal` — Cumplimiento de obligaciones patronales (si es empleador).

- **Ruta real:** `pn_cumplimiento_patronal`
- **Grupo propuesto:** 4. Situación laboral e ingresos
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `afiliaciones` | array | 3 |
| `afiliaciones[].identificacion` | string | 3 |
| `afiliaciones[].obligaciones` | string | 3 |
| `afiliaciones[].empresa` | string | 3 |
| `afiliaciones[].direccion` | string | 3 |
| `afiliaciones[].fechaActualizacion` | string | 3 |

### `administraciones` — Empresas que administra/representa legalmente.

- **Ruta real:** `pn_administraciones`
- **Grupo propuesto:** 4. Situación laboral e ingresos
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `administraciones` | array | 0 |

### `contribuyente` — Registro RUC/contribuyente SRI (razón social, fechas inscripción/cancelación).

- **Ruta real:** `contribuyente/get_contribuyente_inf`
- **Grupo propuesto:** 5. Situación tributaria (SRI)
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `datosContribuyente` | array | 25 |
| `datosContribuyente[].persona_sociedad` | string/null | 24 |
| `datosContribuyente[].ruc` | string/null | 24 |
| `datosContribuyente[].ruc_anterior` | null | 0 |
| `datosContribuyente[].razon_social` | string/null | 24 |
| `datosContribuyente[].nombre_comercial` | null | 0 |
| `datosContribuyente[].fecha_inscripcion_ruc` | string/null | 24 |
| `datosContribuyente[].lista_blanca` | null | 0 |
| `datosContribuyente[].fecha_inicio_actividades` | string/null | 24 |
| `datosContribuyente[].obligado` | string/null | 24 |
| `datosContribuyente[].fecha_solicitud_suspension` | null | 0 |
| `datosContribuyente[].fecha_cancelacion` | null/string | 11 |
| `datosContribuyente[].fecha_reinicio_actividades` | string/null | 13 |
| `datosContribuyente[].fecha_suspension_definitiva` | null/string | 11 |
| `datosContribuyente[].observ_solicitud_suspension` | null/string | 4 |

### `sriImpuestoRenta` — Impuesto a la renta e ISD declarados por período fiscal.

- **Ruta real:** `pn_sri_impuestos_renta`
- **Grupo propuesto:** 5. Situación tributaria (SRI)
- **Consultas OK:** 17/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `data` | array | 17 |
| `data[].identificacion` | string | 17 |
| `data[].impuestosISD` | array | 8 |
| `data[].impuestosISD[].tipoImpuesto` | string | 8 |
| `data[].impuestosISD[].periodoFiscal` | number | 8 |
| `data[].impuestosISD[].valor` | number | 8 |
| `data[].impuestosRenta` | array | 17 |
| `data[].impuestosRenta[].tipoImpuesto` | string | 17 |
| `data[].impuestosRenta[].periodoFiscal` | number | 17 |
| `data[].impuestosRenta[].formulario` | string | 17 |
| `data[].impuestosRenta[].rentaCausadoRetenido` | number | 17 |
| `data[].impuestosRenta[].rentaCausadoRetenidoRelacionDependencia` | null | 0 |

### `establecimientoActEconomica` — Establecimientos económicos registrados (actividad, estado, dirección).

- **Ruta real:** `establecimiento_act_economica/get_establecimiento_inf`
- **Grupo propuesto:** 5. Situación tributaria (SRI)
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `datosEstablecimientoActEco` | array | 24 |
| `datosEstablecimientoActEco[].ruc` | string | 24 |
| `datosEstablecimientoActEco[].ciudadela` | null/string | 4 |
| `datosEstablecimientoActEco[].barrio` | null/string | 4 |
| `datosEstablecimientoActEco[].calle` | string/null | 22 |
| `datosEstablecimientoActEco[].num_establecimiento` | string | 24 |
| `datosEstablecimientoActEco[].nombre_comercial` | string | 24 |
| `datosEstablecimientoActEco[].act_economica` | string | 24 |
| `datosEstablecimientoActEco[].ref_ubi` | string | 24 |
| `datosEstablecimientoActEco[].estado_establecimiento` | string | 24 |
| `datosEstablecimientoActEco[].fech_inscripcion` | string | 24 |
| `datosEstablecimientoActEco[].fech_inicio_actividades` | string | 24 |
| `datosEstablecimientoActEco[].fech_reinicio_actividades` | string/null | 13 |
| `datosEstablecimientoActEco[].fech_cierre` | null/string | 13 |


## Eje actual: `iess`

### `afiliacionIess` — Afiliación IESS general.

- **Ruta real:** `pn_afiliacion_iess`
- **Grupo propuesto:** 6. Seguridad social
- **Consultas OK:** 5/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `afiliacionIess` | array | 5 |
| `afiliacionIess[].cedula` | string | 5 |
| `afiliacionIess[].nombre` | string | 5 |
| `afiliacionIess[].corte` | string | 0 |
| `afiliacionIess[].estado` | string | 5 |
| `afiliacionIess[].empresas` | array | 0 |

### `afiliacionIsspol` — Afiliación ISSPOL (policía).

- **Ruta real:** `pn_afiliacion_isspol`
- **Grupo propuesto:** 6. Seguridad social
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `afiliaciones` | array | 0 |

### `afiliacionIssfacCertMedico` — Afiliación ISSFA — certificado médico (fuerzas armadas).

- **Ruta real:** `pn_afiliacion_issfac/cert_medico`
- **Grupo propuesto:** 6. Seguridad social
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `afiliaciones` | array | 1 |
| `afiliaciones[].cedula` | string | 1 |
| `afiliaciones[].nombre` | string | 1 |
| `afiliaciones[].edad` | string | 1 |
| `afiliaciones[].categoria` | string | 1 |
| `afiliaciones[].cobertura` | null | 0 |
| `afiliaciones[].fechaActualizacion` | string | 1 |

### `afiliacionIssfacFuerzaArmada` — Afiliación ISSFA — fuerza armada. Vacío en la muestra.

- **Ruta real:** `pn_afiliacion_issfac/fuerza_armada`
- **Grupo propuesto:** 6. Seguridad social
- **Consultas OK:** 0/25

### `afiliacionSiisspol` — Certificado de afiliaciones (SIISSPOL) — en la práctica casi siempre responde 'No tiene afiliaciones registradas', es un certificado negativo para la mayoría.

- **Ruta real:** `pn_afiliacion_siisspol`
- **Grupo propuesto:** 6. Seguridad social
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `afiliacionSiisspol` | array | 20 |
| `afiliacionSiisspol[].codigo` | string | 20 |
| `afiliacionSiisspol[].fecha` | string | 20 |
| `afiliacionSiisspol[].numero` | string | 20 |
| `afiliacionSiisspol[].fechaEmision` | string | 20 |
| `afiliacionSiisspol[].nombres` | string | 20 |
| `afiliacionSiisspol[].cedula` | string | 20 |
| `afiliacionSiisspol[].estado` | string | 20 |
| `afiliacionSiisspol[].afiliaciones` | array | 0 |

### `afiliacionSalud` — Afiliación a seguro de salud. Vacío en la muestra.

- **Ruta real:** `pn_afiliacion_salud`
- **Grupo propuesto:** 6. Seguridad social
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `afiliacionSalud` | array | 0 |

### `pensionista` — Si recibe pensión IESS.

- **Ruta real:** `pn_pensionista`
- **Grupo propuesto:** 6. Seguridad social
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `pensionista` | array | 2 |
| `pensionista[].nombre` | string | 2 |
| `pensionista[].cedula` | string | 2 |
| `pensionista[].estado` | boolean | 2 |
| `pensionista[].fechaActualizacion` | string | 2 |
| `pensionista[].datos` | array | 0 |

### `jubilados` — Si está jubilado (campo interno se llama 'trabajos').

- **Ruta real:** `pn_jubilados`
- **Grupo propuesto:** 6. Seguridad social
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `trabajos` | array | 1 |
| `trabajos[].fechaActualizacion` | number | 1 |
| `trabajos[].fechaIngreso` | number | 1 |
| `trabajos[].fechaAfiliacionHasta` | number | 1 |
| `trabajos[].personaPatrono.identificacion` | string | 1 |
| `trabajos[].personaPatrono.nombre` | string | 1 |
| `trabajos[].personaPatrono.nombreUno` | null | 0 |
| `trabajos[].personaPatrono.nombreDos` | null | 0 |
| `trabajos[].personaPatrono.tipoIdentificacion` | null | 0 |
| `trabajos[].personaPatrono.plazoSocial` | null | 0 |
| `trabajos[].personaPatrono.expediente` | number | 1 |
| `trabajos[].personaPatrono.fechaConstitucion` | null | 0 |
| `trabajos[].personaPatrono.nombreComercial` | null | 0 |
| `trabajos[].personaPatrono.tipoCompania` | null | 0 |
| `trabajos[].personaPatrono.oficinaControl` | null | 0 |
| `trabajos[].personaPatrono.situacionLegal` | null | 0 |
| `trabajos[].personaPatrono.proveedoraEstado` | null | 0 |
| `trabajos[].personaPatrono.pagoRemesas` | null | 0 |
| `trabajos[].personaPatrono.vendeCredito` | null | 0 |
| `trabajos[].personaPatrono.capitalSuscrito` | null | 0 |
| `trabajos[].personaPatrono.capitalAutorizado` | null | 0 |
| `trabajos[].personaPatrono.valorNominal` | null | 0 |
| `trabajos[].personaPatrono.perteneceMv` | null | 0 |
| `trabajos[].personaPatrono.apellidoUno` | null | 0 |
| `trabajos[].personaPatrono.apellidoDos` | null | 0 |
| `trabajos[].personaEmpleado.identificacion` | string | 1 |
| `trabajos[].personaEmpleado.nombre` | string | 1 |
| `trabajos[].personaEmpleado.nombreUno` | null | 0 |
| `trabajos[].personaEmpleado.nombreDos` | null | 0 |
| `trabajos[].personaEmpleado.tipoIdentificacion` | null | 0 |
| `trabajos[].personaEmpleado.fechaNacimiento` | null | 0 |
| `trabajos[].personaEmpleado.fechaDefuncion` | null | 0 |
| `trabajos[].personaEmpleado.informacionAdicional` | null | 0 |
| `trabajos[].personaEmpleado.genero` | null | 0 |
| `trabajos[].personaEmpleado.lugarDefuncion` | null | 0 |
| `trabajos[].personaEmpleado.lugarNacimiento` | null | 0 |
| `trabajos[].personaEmpleado.apellidoUno` | null | 0 |
| `trabajos[].personaEmpleado.apellidoDos` | null | 0 |
| `trabajos[].personaIngreso.valor` | number | 1 |
| `trabajos[].personaIngreso.tipoIngreso.idTipoIngreso` | number | 1 |
| `trabajos[].personaIngreso.tipoIngreso.nombre` | string | 1 |
| `trabajos[].personaIngreso.frecuenciaIngreso.idFrecuenciaIngreso` | number | 1 |
| `trabajos[].personaIngreso.frecuenciaIngreso.descripcion` | string | 1 |
| `trabajos[].personaIngreso.valorRango` | string | 1 |
| `trabajos[].cargo` | null | 0 |
| `trabajos[].tipoAfiliado.idTipoAfiliado` | null | 0 |
| `trabajos[].tipoAfiliado.nombre` | string | 1 |
| `trabajos[].telefonoOfi` | string | 1 |
| `trabajos[].telefonoAfi` | string | 1 |
| `trabajos[].direccionOfi` | string | 1 |
| `trabajos[].direccionAfi` | string | 1 |
| `trabajos[].celular` | string | 1 |
| `trabajos[].baseDate` | string | 1 |


## Eje actual: `vehiculos`

### `vehiculos` — Vehículos a nombre de la persona (marca, modelo, año, avalúo). Se confirmó que se consulta DIRECTO por cédula.

- **Ruta real:** `pn_vehiculos/general/{cedula}`
- **Grupo propuesto:** 7. Patrimonio
- **Consultas OK:** 19/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `personaVehiculo` | array | 19 |
| `personaVehiculo[].identificacionPropietario` | string | 19 |
| `personaVehiculo[].numeroPlaca` | string | 19 |
| `personaVehiculo[].numeroRuc` | string/null | 6 |
| `personaVehiculo[].marca` | string | 19 |
| `personaVehiculo[].modelo` | string | 19 |
| `personaVehiculo[].pais` | string | 19 |
| `personaVehiculo[].anioModelo` | string | 19 |
| `personaVehiculo[].serialVinChasis` | string | 19 |
| `personaVehiculo[].numeroMotor` | string | 19 |
| `personaVehiculo[].codigoTipoServicio` | string | 19 |
| `personaVehiculo[].codigoEdadAuto` | string | 19 |
| `personaVehiculo[].capacidadPasajeros` | string/null | 7 |
| `personaVehiculo[].cilindraje` | string | 19 |
| `personaVehiculo[].codigoTipoCombustible` | string/null | 4 |
| `personaVehiculo[].estadoExoneracion` | string | 19 |
| `personaVehiculo[].fechaCompraRegistro` | string/null | 9 |
| `personaVehiculo[].fechaCaducidadMatricula` | string | 19 |
| `personaVehiculo[].codigoCanton` | string | 19 |
| `personaVehiculo[].codigoEntidadPolicial` | null | 0 |
| `personaVehiculo[].fechaUltimaMatricula` | string | 19 |
| `personaVehiculo[].numeroCamvCpn` | string | 19 |
| `personaVehiculo[].ultimoAnioPagado` | string | 19 |
| `personaVehiculo[].cargaUtil` | string | 19 |
| `personaVehiculo[].codigoUso` | string | 19 |
| `personaVehiculo[].codigoSubCategoria1` | string/null | 4 |
| `personaVehiculo[].anioFiscalDesde` | string/null | 6 |
| `personaVehiculo[].anioFiscDesde` | string/null | 6 |
| `personaVehiculo[].valorAvaluo` | number | 19 |
| `personaVehiculo[].valorImpuesto` | null/number | 2 |
| `personaVehiculo[].precioVenta` | number/null | 14 |
| `personaVehiculo[].precioPromedio` | number | 19 |
| `personaVehiculo[].precioMinimo` | number/null | 12 |
| `personaVehiculo[].precioMaximo` | number | 19 |
| `personaVehiculo[].clase` | string | 19 |
| `personaVehiculo[].nombreSubClase` | string | 19 |
| `personaVehiculo[].colorUno` | string | 19 |
| `personaVehiculo[].colorDos` | string/null | 2 |
| `personaVehiculo[].modeloComercial` | string | 19 |
| `personaVehiculo[].tipoComercial` | string | 19 |
| `personaVehiculo[].totalMatricula` | null/string | 7 |
| `personaVehiculo[].precioComercial` | number | 19 |
| `personaVehiculo[].precioVentaPublico` | number | 19 |
| `personaVehiculo[].precioVentaPromedio` | number/null | 13 |
| `personaVehiculo[].tipoPeso` | null | 0 |
| `personaVehiculo[].completelyNull` | boolean | 19 |

### `licenciaConducir` — Licencia de conducir (puntos, vigencia, tipo).

- **Ruta real:** `pn_licencia_conducir`
- **Grupo propuesto:** 10. Tránsito vehicular
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `licencia` | array/null | 21 |
| `licencia[].puntos` | string | 21 |
| `licencia[].validezDesde` | number | 21 |
| `licencia[].validezHasta` | number | 21 |
| `licencia[].tipoLicencia.idTipoLicencia` | number | 21 |
| `licencia[].tipoLicencia.descripcion` | string | 21 |
| `licencia[].fechaActualizacion` | number | 21 |

### `siniestros` — Siniestros de seguros. Vacío en la muestra.

- **Ruta real:** `pn_siniestros`
- **Grupo propuesto:** 10. Tránsito vehicular
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `siniestros` | array | 0 |

### `polizas` — Pólizas de seguro. Vacío en la muestra.

- **Ruta real:** `pn_polizas`
- **Grupo propuesto:** 10. Tránsito vehicular
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `polizas` | array | 0 |


## Eje actual: `funcion_judicial`

### `demandas` — Demandas donde la persona es DEMANDADA (tipo, delito/materia, judicatura, juez).

- **Ruta real:** `pn_demandas`
- **Grupo propuesto:** 11. Riesgo judicial civil
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `demandas` | array | 19 |
| `demandas[].fechaActualizacion` | number | 19 |
| `demandas[].tipoDemanda.idTipoDemanda` | number | 19 |
| `demandas[].tipoDemanda.descripcion` | string | 19 |
| `demandas[].demanda.numeroProceso` | string | 19 |
| `demandas[].demanda.judicatura` | string | 7 |
| `demandas[].demanda.numeroIngreso` | string | 19 |
| `demandas[].demanda.delito` | string | 19 |
| `demandas[].demanda.juez` | string | 0 |
| `demandas[].demanda.ofendido` | string | 19 |
| `demandas[].demanda.demandado` | string | 19 |
| `demandas[].demanda.fecha` | number | 19 |

### `demandasOfendido` — Demandas donde la persona es OFENDIDA/demandante — no es lo mismo que ser demandado, mucho menor peso negativo.

- **Ruta real:** `pn_demandas_ofendido`
- **Grupo propuesto:** 11. Riesgo judicial civil
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `demandas` | array | 16 |
| `demandas[].fechaActualizacion` | number | 16 |
| `demandas[].tipoDemanda.idTipoDemanda` | number | 16 |
| `demandas[].tipoDemanda.descripcion` | string | 16 |
| `demandas[].demanda.numeroProceso` | string | 16 |
| `demandas[].demanda.judicatura` | string | 10 |
| `demandas[].demanda.numeroIngreso` | string | 16 |
| `demandas[].demanda.delito` | string | 16 |
| `demandas[].demanda.juez` | string | 0 |
| `demandas[].demanda.ofendido` | string | 15 |
| `demandas[].demanda.demandado` | string | 11 |
| `demandas[].demanda.fecha` | number | 16 |

### `impedimentoCargosPublicos` — Impedimento para cargos públicos — cuando existe, incluye la CAUSAL (ej. 'DEUDORES A ENTIDADES DEL SECTOR PUBLICO'). Señal fuerte cuando aparece.

- **Ruta real:** `pn_impedimento_cargos_publicos`
- **Grupo propuesto:** 13. Compliance y listas de control
- **Consultas OK:** 1/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `data` | array | 1 |
| `data[].certificado` | string | 1 |
| `data[].fechaEmision` | string | 1 |
| `data[].fechaNacimientoConsultada` | string | 1 |
| `data[].nombre` | string | 1 |
| `data[].numeroDocumento` | string | 1 |
| `data[].registraImpedimento` | boolean | 1 |
| `data[].causales` | array | 1 |
| `data[].causales[].causal` | string | 1 |
| `data[].causales[].excepciones` | string | 1 |
| `data[].causales[].institucion` | string | 1 |

### `pensionAlimenticia` — Pensión alimenticia — juicios de alimentos (NO es tránsito vehicular pese al nombre 'supa').

- **Ruta real:** `pn_supa`
- **Grupo propuesto:** 11. Riesgo judicial civil
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `supas` | array | 8 |
| `supas[].lugar` | null | 0 |
| `supas[].numeroProceso` | string/null | 7 |
| `supas[].dependenciaJurisdiccional` | string | 8 |
| `supas[].codigoTarjeta` | string | 8 |
| `supas[].tipoPension` | string | 8 |
| `supas[].pensionActual` | string/null | 7 |
| `supas[].representanteLegal` | string | 8 |

### `pensionAlimenticiaNovadata` — Pensión alimenticia, variante con más detalle: valorMensual, totalPagado, totalDeuda, estado.

- **Ruta real:** `pn_supa/novadata`
- **Grupo propuesto:** 11. Riesgo judicial civil
- **Consultas OK:** 23/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `supas` | array | 7 |
| `supas[].numeroProceso` | string/null | 6 |
| `supas[].dependenciaJurisdiccional` | string | 7 |
| `supas[].codigoTarjeta` | string | 7 |
| `supas[].tipoPension` | string | 7 |
| `supas[].representanteLegal` | string | 7 |
| `supas[].obligadoPrincipal` | string | 7 |
| `supas[].valorMensual` | number | 7 |
| `supas[].totalPagado` | number | 7 |
| `supas[].totalDeuda` | number | 7 |
| `supas[].valorDeuda` | null | 0 |
| `supas[].estado` | string | 7 |


## Eje actual: `fiscalia`

### `denuncias` — Denuncias registradas en Fiscalía.

- **Ruta real:** `pn_denuncias`
- **Grupo propuesto:** 12. Riesgo penal / Fiscalía
- **Consultas OK:** 23/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `denuncias` | array | 4 |
| `denuncias[].nroNoticia` | string | 4 |
| `denuncias[].lugar` | string | 4 |
| `denuncias[].fecha` | string | 4 |
| `denuncias[].hora` | string | 4 |
| `denuncias[].digitador` | string | 4 |
| `denuncias[].nroOficio` | string | 4 |
| `denuncias[].delito` | string | 4 |
| `denuncias[].unidad` | string | 4 |
| `denuncias[].detalleDenuncia` | array | 4 |
| `denuncias[].detalleDenuncia[].cedula` | string | 4 |
| `denuncias[].detalleDenuncia[].nombres` | string | 4 |
| `denuncias[].detalleDenuncia[].estado` | string | 4 |

### `antecedentesPenales` — Antecedentes penales — descripcion='NO' cuando está limpio; en caso contrario trae el detalle.

- **Ruta real:** `pn_antecedentes_penales`
- **Grupo propuesto:** 12. Riesgo penal / Fiscalía
- **Consultas OK:** 24/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `antecedentes.idAntecedente` | number | 24 |
| `antecedentes.descripcion` | string | 24 |
| `antecedentes.fechaActualizacion` | number | 24 |

### `sercop` — Registros en Contraloría y SERCOP (contratación pública) — inhabilidades para contratar con el Estado.

- **Ruta real:** `pn_sercop`
- **Grupo propuesto:** 13. Compliance y listas de control
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `data.criterioBusqueda` | string | 25 |
| `data.valorConsultado` | string | 25 |
| `data.contraloria.fuente` | string | 25 |
| `data.contraloria.mensaje` | string | 25 |
| `data.contraloria.registros` | array | 0 |
| `data.sercop.fuente` | string | 25 |
| `data.sercop.mensaje` | string | 25 |
| `data.sercop.registros` | array | 0 |


## Eje actual: `bancos`

### `creditoHipotecario` — Préstamos hipotecarios.

- **Ruta real:** `pn_credito/hipotecario`
- **Grupo propuesto:** 8. Comportamiento de pago — formal
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `prestamos` | array | 4 |
| `prestamos[].nroOperacion` | string | 4 |
| `prestamos[].cedula` | string | 4 |
| `prestamos[].estado` | string | 4 |
| `prestamos[].estadoDescripcion` | string | 4 |
| `prestamos[].diasMora` | number | 4 |
| `prestamos[].valorPorVencer` | number | 4 |
| `prestamos[].valorVencido` | number | 4 |
| `prestamos[].rucPatrono` | array | 1 |
| `prestamos[].nombre` | string | 4 |
| `prestamos[].plazoOriginal` | number | 4 |
| `prestamos[].valorPrestamo` | number | 4 |
| `prestamos[].fechaConcesion` | string | 4 |
| `prestamos[].fechaCorte` | string | 4 |
| `prestamos[].rucPatrono[]` | string | 1 |

### `creditoQuirografario` — Préstamos quirografarios.

- **Ruta real:** `pn_credito/quirografario`
- **Grupo propuesto:** 8. Comportamiento de pago — formal
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `prestamos` | array | 6 |
| `prestamos[].nroOperacion` | string | 6 |
| `prestamos[].cedula` | string | 6 |
| `prestamos[].estado` | string | 6 |
| `prestamos[].estadoDescripcion` | string | 6 |
| `prestamos[].diasMora` | number | 6 |
| `prestamos[].valorPorVencer` | number | 6 |
| `prestamos[].valorVencido` | number | 6 |
| `prestamos[].rucPatrono` | array | 0 |
| `prestamos[].nombre` | string | 6 |
| `prestamos[].plazoOriginal` | number | 6 |
| `prestamos[].valorPrestamo` | number | 6 |
| `prestamos[].fechaConcesion` | string | 6 |
| `prestamos[].fechaCorte` | string | 6 |

### `deudasAnt` — ⚠️ RECATEGORIZAR: son MULTAS DE TRÁNSITO (ANT — Agencia Nacional de Tránsito): multa, sanción, artículo, placa, citación. No es deuda bancaria.

- **Ruta real:** `pn_deudas_ant`
- **Grupo propuesto:** 10. Tránsito vehicular
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `deudaAnts` | array | 4 |
| `deudaAnts[].idPersonaDeudaAnt` | number | 4 |
| `deudaAnts[].fechaActualizacion` | string | 4 |
| `deudaAnts[].fechaEmision` | string | 4 |
| `deudaAnts[].fechaRegistro` | string | 4 |
| `deudaAnts[].puntos` | string | 4 |
| `deudaAnts[].multa` | string | 4 |
| `deudaAnts[].sancion` | string | 4 |
| `deudaAnts[].total` | string | 4 |
| `deudaAnts[].articulo` | string | 4 |
| `deudaAnts[].bq` | string | 4 |
| `deudaAnts[].entidad` | string | 4 |
| `deudaAnts[].placa` | string | 4 |
| `deudaAnts[].remision` | string | 4 |
| `deudaAnts[].infracion` | string | 1 |
| `deudaAnts[].citacion` | string | 4 |

### `deudasAmt` — ⚠️ RECATEGORIZAR: multas de tránsito municipales (AMT). Vacío en toda la muestra.

- **Ruta real:** `pn_deudas_amt`
- **Grupo propuesto:** 10. Tránsito vehicular
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `deudaAmt` | array | 0 |

### `deudasEmov` — ⚠️ RECATEGORIZAR: multas de tránsito de Quito (EMOV) — valorAdeudado, infracción(es).

- **Ruta real:** `pn_deudas_emov`
- **Grupo propuesto:** 10. Tránsito vehicular
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `deudaEmov` | array | 25 |
| `deudaEmov[].cedula` | string | 25 |
| `deudaEmov[].tipoBusqueda` | string | 0 |
| `deudaEmov[].valorAdeudado` | number | 25 |
| `deudaEmov[].fechaActualizacion` | string | 25 |
| `deudaEmov[].infraccion` | array | 0 |

### `deudasFirmes` — Deudas firmes (sentencia firme). Vacío en la muestra.

- **Ruta real:** `pn_deudas_firmes`
- **Grupo propuesto:** 8. Comportamiento de pago — formal
- **Consultas OK:** 0/25

### `deudores` — Si la persona tiene deudores a su cargo. Vacío en la muestra.

- **Ruta real:** `pn_deudores`
- **Grupo propuesto:** 8. Comportamiento de pago — formal
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `deudores` | array | 0 |

### `centralRiesgoDiners` — Central de riesgo específica de Diners.

- **Ruta real:** `central_riesgo/get_inf_diners`
- **Grupo propuesto:** 8. Comportamiento de pago — formal
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `datosSuper` | array | 8 |
| `datosSuper[].tipo` | string | 8 |
| `datosSuper[].cedulaRuc` | string | 8 |
| `datosSuper[].fecha` | string | 8 |
| `datosSuper[].nombre` | string | 8 |
| `datosSuper[].codEntidad` | string | 8 |
| `datosSuper[].entnombre` | string | 8 |
| `datosSuper[].enttipo` | string | 8 |
| `datosSuper[].riesgo` | string | 8 |
| `datosSuper[].calificacion` | string | 8 |
| `datosSuper[].saldoVigente` | string | 8 |
| `datosSuper[].noDevengaInteres` | string | 8 |
| `datosSuper[].saldo0_1` | string | 8 |
| `datosSuper[].saldo1_2` | string | 8 |
| `datosSuper[].saldo2_3` | string | 8 |
| `datosSuper[].saldo3_6` | string | 8 |
| `datosSuper[].saldo6_9` | string | 8 |
| `datosSuper[].saldo9_12` | string | 8 |
| `datosSuper[].saldo24_3` | string | 8 |
| `datosSuper[].mas_36` | string | 8 |
| `datosSuper[].judicial` | string | 8 |
| `datosSuper[].castigo` | string | 8 |
| `datosSuper[].mora` | string | 8 |
| `datosSuper[].saldomora` | string | 8 |

### `centralRiesgoSuper` — Central de riesgo de la Superintendencia — LA fuente más completa y universal (25/25): calificación, mora por tramos, judicial, castigo.

- **Ruta real:** `central_riesgo/get_inf_super`
- **Grupo propuesto:** 8. Comportamiento de pago — formal
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `datosSuper` | array | 25 |
| `datosSuper[].tipo` | string | 25 |
| `datosSuper[].cedulaRuc` | string | 25 |
| `datosSuper[].fecha` | string | 25 |
| `datosSuper[].nombre` | string | 25 |
| `datosSuper[].codEntidad` | string | 25 |
| `datosSuper[].entnombre` | string | 25 |
| `datosSuper[].enttipo` | string | 25 |
| `datosSuper[].riesgo` | string | 25 |
| `datosSuper[].calificacion` | string | 25 |
| `datosSuper[].saldoVigente` | string | 25 |
| `datosSuper[].noDevengaInteres` | string | 25 |
| `datosSuper[].saldo0_1` | string | 25 |
| `datosSuper[].saldo1_2` | string | 25 |
| `datosSuper[].saldo2_3` | string | 25 |
| `datosSuper[].saldo3_6` | string | 25 |
| `datosSuper[].saldo6_9` | string | 25 |
| `datosSuper[].saldo9_12` | string | 25 |
| `datosSuper[].saldo24_3` | string | 25 |
| `datosSuper[].mas_36` | string | 25 |
| `datosSuper[].judicial` | string | 25 |
| `datosSuper[].castigo` | string | 25 |
| `datosSuper[].mora` | string | 25 |
| `datosSuper[].saldomora` | string | 25 |

### `listasControl` — OFAC, homónimos, providencias judiciales, personas públicas (PEP).

- **Ruta real:** `pn_listas_control`
- **Grupo propuesto:** 13. Compliance y listas de control
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `ofacsOpr` | array | 0 |
| `homonimosOpr` | array | 0 |
| `providenciasOpr` | array | 0 |
| `personaPublicasOpr` | array | 1 |
| `personaPublicasOpr[].cargo` | string | 1 |
| `personaPublicasOpr[].empresa` | string | 1 |
| `personaPublicasOpr[].sueldo` | number | 1 |
| `personaPublicasOpr[].fecha` | string | 1 |
| `personaPublicasOpr[].fuente` | string | 1 |
| `personaPublicasOpr[].observaciones` | null | 0 |
| `personaPublicasOpr[].nombreConyugue` | null | 0 |

### `listaNegra` — Lista negra interna Novadata. Nunca poblada en la muestra (0/25) — infrecuente pero crítica cuando aparece.

- **Ruta real:** `pn_lista_negra`
- **Grupo propuesto:** 13. Compliance y listas de control
- **Consultas OK:** 24/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `listaNegra` | null | 0 |

### `inversiones` — Inversiones registradas.

- **Ruta real:** `pn_inversiones`
- **Grupo propuesto:** 7. Patrimonio
- **Consultas OK:** 17/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `inversiones` | array | 1 |
| `inversiones[].capital` | number | 1 |
| `inversiones[].restriccion` | string | 1 |
| `inversiones[].transaccion` | null | 0 |
| `inversiones[].persona.identificacion` | string | 1 |
| `inversiones[].persona.nombre` | string | 1 |
| `inversiones[].persona.nombreUno` | null | 0 |
| `inversiones[].persona.nombreDos` | null | 0 |
| `inversiones[].persona.tipoIdentificacion.idTipoIdentificacion` | number | 1 |
| `inversiones[].persona.tipoIdentificacion.descripcion` | string | 1 |
| `inversiones[].persona.fechaNacimiento` | string | 1 |
| `inversiones[].persona.fechaDefuncion` | null | 0 |
| `inversiones[].persona.informacionAdicional` | string | 1 |
| `inversiones[].persona.genero.idGenero` | number | 1 |
| `inversiones[].persona.genero.descripcion` | string | 1 |
| `inversiones[].persona.lugarDefuncion` | null | 0 |
| `inversiones[].persona.lugarNacimiento.idLugar` | number | 1 |
| `inversiones[].persona.lugarNacimiento.codigoPostal` | string | 1 |
| `inversiones[].persona.lugarNacimiento.fechaActualizacion` | null | 0 |
| `inversiones[].persona.lugarNacimiento.parroquia.idParroquia` | number | 1 |
| `inversiones[].persona.lugarNacimiento.parroquia.idProvincia` | null | 0 |
| `inversiones[].persona.lugarNacimiento.parroquia.idPais` | null | 0 |
| `inversiones[].persona.lugarNacimiento.parroquia.nombre` | string | 1 |
| `inversiones[].persona.lugarNacimiento.canton.idCanton` | number | 1 |
| `inversiones[].persona.lugarNacimiento.canton.nombre` | string | 1 |
| `inversiones[].persona.lugarNacimiento.provincia.idProvincia` | number | 1 |
| `inversiones[].persona.lugarNacimiento.provincia.codigoArea` | string | 1 |
| `inversiones[].persona.lugarNacimiento.provincia.nombre` | string | 1 |
| `inversiones[].persona.lugarNacimiento.pais.idPais` | number | 1 |
| `inversiones[].persona.lugarNacimiento.pais.nombre` | string | 1 |
| `inversiones[].persona.lugarNacimiento.pais.codigoArea` | string | 1 |
| `inversiones[].persona.lugarNacimiento.pais.codigoIso2` | string | 1 |
| `inversiones[].persona.lugarNacimiento.pais.codigoIso3` | string | 1 |
| `inversiones[].persona.lugarNacimiento.pais.codigoIso` | number | 1 |
| `inversiones[].persona.apellidoUno` | null | 0 |
| `inversiones[].persona.apellidoDos` | null | 0 |
| `inversiones[].personaJuridica.identificacion` | string | 1 |
| `inversiones[].personaJuridica.nombre` | string | 1 |
| `inversiones[].personaJuridica.nombreUno` | null | 0 |
| `inversiones[].personaJuridica.nombreDos` | null | 0 |
| `inversiones[].personaJuridica.tipoIdentificacion.idTipoIdentificacion` | number | 1 |
| `inversiones[].personaJuridica.tipoIdentificacion.descripcion` | string | 1 |
| `inversiones[].personaJuridica.plazoSocial` | null | 0 |
| `inversiones[].personaJuridica.expediente` | number | 1 |
| `inversiones[].personaJuridica.fechaConstitucion` | null | 0 |
| `inversiones[].personaJuridica.nombreComercial` | string | 1 |
| `inversiones[].personaJuridica.tipoCompania` | null | 0 |
| `inversiones[].personaJuridica.oficinaControl` | null | 0 |
| `inversiones[].personaJuridica.situacionLegal.nombre` | string | 1 |
| `inversiones[].personaJuridica.proveedoraEstado` | null | 0 |
| `inversiones[].personaJuridica.pagoRemesas` | null | 0 |
| `inversiones[].personaJuridica.vendeCredito` | null | 0 |
| `inversiones[].personaJuridica.capitalSuscrito` | number | 1 |
| `inversiones[].personaJuridica.capitalAutorizado` | number | 1 |
| `inversiones[].personaJuridica.valorNominal` | number | 1 |
| `inversiones[].personaJuridica.perteneceMv` | null | 0 |
| `inversiones[].personaJuridica.apellidoUno` | null | 0 |
| `inversiones[].personaJuridica.apellidoDos` | null | 0 |
| `inversiones[].tipoInversion.idTipoInversion` | number | 1 |
| `inversiones[].tipoInversion.nombre` | string | 1 |
| `inversiones[].fechaActualizacion` | string | 1 |

### `retails` — Deudas en crédito retail/comercial (institución, valor vencido, días de mora).

- **Ruta real:** `pn_retails`
- **Grupo propuesto:** 8. Comportamiento de pago — formal
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `retails` | array | 6 |
| `retails[].institucion` | string | 6 |
| `retails[].tipoIdentificacion` | string | 6 |
| `retails[].identificacion` | string | 6 |
| `retails[].nombre` | string | 6 |
| `retails[].valorVencido` | number | 6 |
| `retails[].valorProcesoJudicial` | null | 0 |
| `retails[].valorProcesoCastigado` | number | 6 |
| `retails[].totalDeuda` | number | 6 |
| `retails[].diasMora` | number | 6 |
| `retails[].fecha` | string | 6 |
| `retails[].fechaActualizacion` | string | 6 |

### `basesInternas` — ⭐ Bundle interno con VARIOS sub-recursos (ver detalle abajo) — incluye el hallazgo más importante: personasIncumplimientos.

- **Ruta real:** `nova_bases_internas`
- **Grupo propuesto:** (múltiples, ver sub-recursos)
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `tclientesNovacredit` | null | 0 |
| `personasIncumplimientos` | array | 19 |
| `tiess` | array | 22 |
| `tiess[].ci` | string | 22 |
| `tiess[].parroquias` | null | 0 |
| `tiess[].rucEmp` | string | 22 |
| `tiess[].codSuc` | string | 22 |
| `tiess[].tipEmp` | string | 22 |
| `tiess[].nomEmp` | string | 22 |
| `tiess[].telEmp` | string | 16 |
| `tiess[].dirEmp` | string | 16 |
| `tiess[].faxEmp` | string | 1 |
| `tiess[].nomAfi` | string | 22 |
| `tiess[].dirAfi` | string | 22 |
| `tiess[].telAfi` | string | 17 |
| `tiess[].celAfi` | string | 20 |
| `tiess[].email` | string | 22 |
| `tiess[].salario` | string | 22 |
| `tiess[].fecIng` | string | 22 |
| `tiess[].fecSal` | string | 5 |
| `tiess[].ocupacion` | string | 22 |
| `tiess[].anio` | number | 22 |
| `tiess[].mes` | number | 22 |
| `tiess[].idIess` | null | 0 |
| `tiessemp` | array | 5 |
| `tconsepvinculados` | array | 0 |
| `tconsephomonimos` | array | 0 |
| `tpeps` | array | 0 |
| `tofac` | null/array | 0 |
| `tofac2` | null/array | 0 |
| `tprovidencias` | array | 0 |
| `tcredHipotecarios` | array | 4 |
| `tcredQuirografarios` | array | 8 |
| `tcredQuirografarios[].provincia` | string | 8 |
| `tcredQuirografarios[].fondoFinanciaCred` | string | 8 |
| `tcredQuirografarios[].numeroOperacion` | string | 8 |
| `tcredQuirografarios[].estadoOperacion` | string | 8 |
| `tcredQuirografarios[].cedulaAfiliado` | string | 8 |
| `tcredQuirografarios[].nombreAfiliado` | string | 8 |
| `tcredQuirografarios[].montoTransferido` | string | 8 |
| `tcredQuirografarios[].fechaConsesion` | string | 8 |
| `tcredQuirografarios[].fechaFinCredito` | string | 8 |
| `tcredQuirografarios[].saldoTotalCredito` | string | 8 |
| `tcredQuirografarios[].plazo` | string | 8 |
| `tcredQuirografarios[].tasaActual` | string | 8 |
| `tcredQuirografarios[].tasaEfectiva` | string | 8 |
| `tcredQuirografarios[].diasMoraAfi` | string | 8 |
| `tcredQuirografarios[].edad` | string | 8 |
| `tcredQuirografarios[].tipoAfiliado` | string | 8 |
| `tcredQuirografarios[].direccion` | null | 0 |
| `tcredQuirografarios[].telfDomicilio` | null | 0 |
| `tcredQuirografarios[].telfCelular` | null | 0 |
| `tcredQuirografarios[].idTcredQuirografario` | number | 8 |
| `tcredQuirografarios[].cuotaEstimada` | string | 8 |
| `nombreAfiliado` | string/null | 22 |
| `personasIncumplimientos[].fechaCorte` | string | 19 |
| `personasIncumplimientos[].identificacion` | string | 19 |
| `personasIncumplimientos[].estadoOperacion` | string | 19 |
| `personasIncumplimientos[].operacion` | string | 19 |
| `personasIncumplimientos[].plazoCuotas` | string | 19 |
| `personasIncumplimientos[].diasMaxMoraCuotas` | string | 19 |
| `personasIncumplimientos[].diasPromOperCanceladas` | string | 19 |
| `personasIncumplimientos[].cuotasVencidas` | string | 19 |
| `personasIncumplimientos[].cuotasCanceladas` | string | 19 |
| `personasIncumplimientos[].cuotasActivadas` | string | 19 |
| `personasIncumplimientos[].diasMoraVigentes` | string | 19 |
| `personasIncumplimientos[].diasMoraMax` | string | 19 |
| `personasIncumplimientos[].vencimientosCuotasCan` | string | 19 |
| `personasIncumplimientos[].vencimientosCuotasTot` | string | 19 |
| `personasIncumplimientos[].saldoCapital` | string | 19 |
| `personasIncumplimientos[].cuotaNova` | string | 19 |
| `personasIncumplimientos[].historialCliente` | string | 19 |
| `personasIncumplimientos[].codCliente` | string | 19 |
| `personasIncumplimientos[].porIncumplimientosTot` | string | 19 |
| `personasIncumplimientos[].porIncumplimientosCanceladas` | string | 19 |
| `personasIncumplimientos[].moraPromedio` | string | 19 |
| `personasIncumplimientos[].moraMaxima` | string | 19 |
| `personasIncumplimientos[].moraVigente` | string | 19 |
| `personasIncumplimientos[].perfilInterno` | string | 19 |
| `personasIncumplimientos[].resultadoHabitoPago` | string | 19 |
| `personasIncumplimientos[].idPersonaIncumplimiento` | number | 19 |
| `tcredHipotecarios[].idTcredHipotecario` | number | 4 |
| `tcredHipotecarios[].srProvincia` | string | 4 |
| `tcredHipotecarios[].srDescripcionfondo` | string | 4 |
| `tcredHipotecarios[].srNut` | string | 4 |
| `tcredHipotecarios[].srNrooperaciongaf` | string | 4 |
| `tcredHipotecarios[].srEstadocredito` | string | 4 |
| `tcredHipotecarios[].srCedafiliado` | string | 4 |
| `tcredHipotecarios[].srCedprincipal` | string | 4 |
| `tcredHipotecarios[].srMontofinanciado` | string | 4 |
| `tcredHipotecarios[].srFecprimerdesembolso` | string | 4 |
| `tcredHipotecarios[].srFecfincredito` | string | 4 |
| `tcredHipotecarios[].srSaldototalcredito` | string | 4 |
| `tcredHipotecarios[].srTasaactual` | string | 4 |
| `tcredHipotecarios[].srDiasmoraafi` | string | 4 |
| `tcredHipotecarios[].cuotaEstimada` | string | 4 |
| `tiessemp[]` | array | 5 |
| `tiessemp[][].ci` | string | 0 |
| `tiessemp[][].parroquias` | null | 0 |
| `tiessemp[][].rucEmp` | string | 0 |
| `tiessemp[][].codSuc` | string | 0 |
| `tiessemp[][].tipEmp` | string | 5 |
| `tiessemp[][].nomEmp` | string | 5 |
| `tiessemp[][].telEmp` | string | 5 |
| `tiessemp[][].dirEmp` | string | 5 |
| `tiessemp[][].faxEmp` | string | 0 |
| `tiessemp[][].nomAfi` | string | 5 |
| `tiessemp[][].dirAfi` | string | 5 |
| `tiessemp[][].telAfi` | string | 2 |
| `tiessemp[][].celAfi` | string | 3 |
| `tiessemp[][].email` | string | 5 |
| `tiessemp[][].salario` | string | 5 |
| `tiessemp[][].fecIng` | string | 5 |
| `tiessemp[][].fecSal` | string | 0 |
| `tiessemp[][].ocupacion` | string | 5 |
| `tiessemp[][].anio` | number | 5 |
| `tiessemp[][].mes` | number | 5 |
| `tiessemp[][].idIess` | null | 0 |
| `tclientesNovacredit.clieCodigo` | number | 5 |
| `tclientesNovacredit.clieFechaCreacion` | string | 5 |
| `tclientesNovacredit.fechaNacConst` | string | 5 |
| `tclientesNovacredit.clase` | string | 5 |
| `tclientesNovacredit.categoria` | string | 5 |
| `tclientesNovacredit.documento` | string | 5 |
| `tclientesNovacredit.clieIdentificacion` | string | 5 |
| `tclientesNovacredit.clieNombre` | string | 5 |
| `tclientesNovacredit.tipoDireccion` | string | 5 |
| `tclientesNovacredit.direccion` | string | 5 |
| `tclientesNovacredit.telefono` | string | 5 |
| `tclientesNovacredit.clieTipo` | string | 5 |
| `tclientesNovacredit.clieTipoProyecto` | number | 5 |
| `tclientesNovacredit.clieTipoRol` | string | 5 |
| `tclientesNovacredit.agencia` | number | 5 |
| `tclientesNovacredit.codTipoProyecto` | number | 5 |
| `tclientesNovacredit.sexoDescripcion` | string | 5 |
| `tclientesNovacredit.esciDescripcion` | string | 5 |
| `tclientesNovacredit.idClienteNovacredit` | number | 5 |

**Sub-recursos dentro de `basesInternas` (bundle):**

| Sub-recurso | Descripción | Con datos (de 25) |
|---|---|---|
| `personasIncumplimientos` | ⭐⭐⭐ EL HALLAZGO MÁS IMPORTANTE: el scoring de comportamiento de pago PROPIO de Novadata. Trae resultadoHabitoPago ('Mal pagador'/'Buen pagador'), perfilInterno ('MALO'/'BUENO'), moraMaxima, moraVigente, diasMoraMax, diasMoraVigentes, saldoCapital, cuotasVencidas/Canceladas/Activadas, estadoOperacion, historialCliente. Poblado en 19/25 personas. | 19 |
| `tiess` | Histórico laboral IESS mes a mes CON SALARIO real (nomEmp, ocupacion, salario, fecIng, fecSal, anio, mes). Poblado en 22/25 — la fuente más confiable de ingresos. | 22 |
| `tiessemp` | Variante de tiess del lado empleador. Poblado en 5/25. | 5 |
| `tcredQuirografarios` | Créditos quirografarios afiliados IESS/BIESS (montoTransferido, saldoTotalCredito, diasMoraAfi, estadoOperacion). Poblado en 8/25. | 8 |
| `tcredHipotecarios` | Créditos hipotecarios afiliados IESS/BIESS. Poblado en 4/25. | 4 |
| `tconsepvinculados` | Vínculos con CONSEP (control de sustancias). Vacío en la muestra. | 0 |
| `tconsephomonimos` | Homónimos en listas CONSEP. Vacío en la muestra. | 0 |
| `tpeps` | Personas Expuestas Políticamente (PEP), fuente interna. Vacío en la muestra. | 0 |
| `tofac` | Lista OFAC, fuente interna. Vacío en la muestra. | 0 |
| `tofac2` | Lista OFAC (variante 2), fuente interna. Vacío en la muestra. | 0 |
| `tprovidencias` | Providencias judiciales, fuente interna. Vacío en la muestra. | 0 |
| `tclientesNovacredit` | Si es cliente directo de Novacredit. Vacío/null en la muestra. | 0 |
| `nombreAfiliado` | Nombre del afiliado IESS (dato de identidad redundante). Poblado en 22/25. | 22 |


## Eje actual: `cooperativas`

### `centralRiesgoCoop` — Central de riesgo de cooperativas (mismos campos que bancos: mora, saldo, judicial, castigo).

- **Ruta real:** `central_riesgo/get_inf_coop`
- **Grupo propuesto:** 9. Comportamiento de pago — cooperativas
- **Consultas OK:** 25/25

| Campo | Tipo | Con datos (de 25) |
|---|---|---|
| `datosSuper` | array | 9 |
| `datosSuper[].codRuc` | string | 9 |
| `datosSuper[].razon_social` | string | 9 |
| `datosSuper[].fec_corte_saldo` | string | 9 |
| `datosSuper[].cod_tipo_id` | string | 9 |
| `datosSuper[].cod_id_sujeto` | string | 9 |
| `datosSuper[].nombres` | string | 9 |
| `datosSuper[].num_operacion` | string | 9 |
| `datosSuper[].num_dias_morosidad` | string | 9 |
| `datosSuper[].val_xvencer_1_30` | string | 9 |
| `datosSuper[].val_xvencer_31_90` | string | 9 |
| `datosSuper[].val_ndi_91_180` | string | 9 |
| `datosSuper[].val_ndi_181_360` | string | 9 |
| `datosSuper[].val_ndi_360` | string | 9 |
| `datosSuper[].val_venc_1` | string | 9 |
| `datosSuper[].val_venc_2` | string | 9 |
| `datosSuper[].val_venc_3` | string | 9 |
| `datosSuper[].val_venc_4` | string | 9 |
| `datosSuper[].val_venc_5` | string | 9 |
| `datosSuper[].val_venc_6` | string | 9 |
| `datosSuper[].val_venc_7` | string | 9 |
| `datosSuper[].val_venc_8` | string | 9 |
| `datosSuper[].val_venc_9` | string | 9 |
| `datosSuper[].val_venc_10` | string | 9 |
| `datosSuper[].val_venc_11` | string | 9 |
| `datosSuper[].val_saldo_total` | string | 9 |
| `datosSuper[].val_dem_judicial` | string | 9 |
| `datosSuper[].val_int_ordinario` | string | 9 |
| `datosSuper[].val_int_mora` | string | 9 |
| `datosSuper[].val_cart_castigada` | string | 9 |
| `datosSuper[].cod_tipo_operacion` | string | 9 |
| `datosSuper[].val_cuota_credito` | string | 9 |
| `datosSuper[].mes` | string | 9 |
| `datosSuper[].anio` | string | 9 |

