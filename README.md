# Genoma - Microbiota Vaginal

Aplicacion web para calcular concentraciones desde valores Ct, interpretar el perfil molecular y generar informes PDF de microbiota vaginal.

## Despliegue en EasyPanel

Configura el servicio con estos valores:

- Owner: `albinokeyt`
- Repository: `genoma-microbiota-vaginal`
- Branch: `main`
- Build Path: `/`
- Build: `Dockerfile`
- File: `Dockerfile`
- Puerto interno: `5063`

Agrega un volumen persistente con destino `/app/data`. Este volumen conserva la configuracion tecnica de formulas, curvas y umbrales cuando el contenedor se reinicia o actualiza.

## Actualizaciones

EasyPanel puede volver a desplegar la rama `main` cada vez que exista una nueva version en GitHub.

## Privacidad

El repositorio contiene solamente el codigo y los recursos visuales de la aplicacion. No incluye configuraciones guardadas, resultados, documentos de pacientes ni archivos de laboratorio.
