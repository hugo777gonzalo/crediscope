# Política de seguridad

CrediScope califica el riesgo de crédito de personas en Ecuador y trata
datos personales. Una falla de seguridad puede exponer datos de terceros:
por eso se reporta en privado.

## Versiones con soporte

CrediScope no publica versiones numeradas. Lo que corre en producción es la
rama `main`, y sólo `main` recibe arreglos de seguridad.

## Cómo reportar una falla

- **No abras un issue ni un pedido de fusión público.** El repositorio es
  público, y un reporte abierto muestra la falla antes de que esté
  corregida.
- **Reportala en privado** desde la pestaña **Security** del repositorio,
  con el botón **Report a vulnerability**. El reporte sólo lo ven los
  responsables del repositorio.
- **Contá qué encontraste:** dónde está, cómo se reproduce y qué alcance
  creés que tiene.
- **No copies datos de personas** en el reporte (cédulas, nombres, datos de
  buró). Si los viste, decí dónde, sin copiarlos.

## Qué pasa después

- Te contestamos por el mismo canal privado en cuanto lo revisemos.
- Si la falla se confirma, se corrige en `main` y te avisamos. Si
  corresponde un aviso público, sale después de la corrección.
- Si la falla expuso datos personales, se trata como un incidente según la
  Ley Orgánica de Protección de Datos Personales.

## Alcance

- **Incluye:** la aplicación (`src/`), las funciones de Supabase
  (`supabase/functions/`), las migraciones y los guiones de este
  repositorio.
- **No incluye:** los servicios de terceros (Supabase, GitHub, los
  proveedores de datos). Una falla de ellos se les reporta a ellos.
- **No está permitido**, ni para probar:
  - consultar a personas reales;
  - saturar el servicio;
  - entrar a datos que no son tuyos.
