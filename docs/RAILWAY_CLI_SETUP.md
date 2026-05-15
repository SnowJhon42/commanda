# COMANDA - Railway CLI

Fecha: `2026-05-09`
Owner: `CTO-Agent -> Santiago (Infra-Ops-Agent)`
Estado: `READY_FOR_TOKEN`

## Objetivo

Conectar este workspace local a Railway por CLI sin guardar credenciales en el repo.

## Estado real hoy

- CLI valido: `@railway/cli`
- Version validada: `4.57.1`
- Metodo invalido en este entorno: `railway login --browserless`
- Motivo: Railway requiere terminal interactivo para ese flujo
- Metodo correcto para esta maquina/sesion: `RAILWAY_TOKEN` o `RAILWAY_API_TOKEN`

## Regla de seguridad

- No commitear tokens ni pegarlos en archivos versionados.
- Usar variable de entorno de sesion o secreto del sistema.

## Comandos base en Windows

Ver version:

```powershell
& 'C:\Program Files\nodejs\npx.cmd' @railway/cli --version
```

Exportar token para la sesion actual:

```powershell
$env:RAILWAY_TOKEN='tu_token'
```

Verificar identidad:

```powershell
& 'C:\Program Files\nodejs\npx.cmd' @railway/cli whoami
```

Listar proyectos accesibles:

```powershell
& 'C:\Program Files\nodejs\npx.cmd' @railway/cli list
```

Enlazar este directorio a un proyecto:

```powershell
& 'C:\Program Files\nodejs\npx.cmd' @railway/cli link -w <workspace> -p <project> -s <service>
```

Ver estado del link:

```powershell
& 'C:\Program Files\nodejs\npx.cmd' @railway/cli status
```

## Flujo recomendado para COMANDA

1. Exportar `RAILWAY_TOKEN` en la sesion local.
2. Ejecutar `whoami`.
3. Ejecutar `list` para identificar workspace/proyecto.
4. Ejecutar `link` desde `C:\Users\agust\Desktop\COMANDA_LOCAL` o desde la carpeta del servicio a desplegar.
5. Confirmar con `status`.

## Datos que faltan para cerrar la conexion

- Token valido de Railway
- Workspace objetivo
- Proyecto objetivo
- Servicio objetivo si el proyecto tiene mas de uno

## Nota operativa

El stack online documentado actual de COMANDA sigue en `Render + Vercel + Neon`.
Configurar Railway por CLI no cambia por si solo el estado de despliegue ni reemplaza la fuente de verdad de `docs/ONLINE_STACK.md`.
