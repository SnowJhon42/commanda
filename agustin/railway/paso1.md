# COMANDA - Plan Maestro para pasar a Produccion (Railway)

Fecha: 2026-03-10  
Owner de coordinacion: CTO-Agent  
Estado: READY_TO_EXECUTE

## 1) Objetivo
Publicar COMANDA en un entorno de produccion estable y operable, con:
- Backend online
- Front cliente online
- Front staff online
- Base de datos remota
- Flujo E2E funcionando (cliente crea pedido -> staff procesa -> cliente ve tracking)
- Procedimiento de operacion, monitoreo y rollback

## 2) Alcance
Incluye:
- Preparacion tecnica para despliegue
- Limpieza de repositorio y secretos
- Provision de infraestructura en Railway (backend + DB)
- Deploy de frontends (Vercel recomendado)
- Pruebas smoke y checklist de salida
- Handoff operativo

No incluye (en esta fase):
- Integracion POS externo
- Pagos productivos
- Multi-sucursal avanzada
- Escalado enterprise

## 3) Necesidades previas (obligatorias)
### 3.1 Cuentas y accesos
- GitHub con permisos de admin en repo
- Railway (workspace + proyecto)
- Vercel (2 proyectos: client y staff)
- Proveedor de almacenamiento imagenes (R2 si aplica)
- Dominio (opcional para MVP)

### 3.2 Variables y secretos minimos
Backend:
- DATABASE_URL (Postgres remota)
- JWT_SECRET_KEY (largo, aleatorio)
- CORS_ALLOWED_ORIGINS (URLs publicas client/staff)
- ENV=production
- LOG_LEVEL=info
- CLOUDFLARE_ACCOUNT_ID (si usa R2)
- CLOUDFLARE_R2_BUCKET (si usa R2)
- CLOUDFLARE_API_TOKEN (si usa R2)
- CLOUDFLARE_PUBLIC_HOST (si usa R2)

Front cliente/staff:
- NEXT_PUBLIC_API_URL o VITE_API_URL (segun framework)

### 3.3 Criterios de salida global
- `/health` backend responde 200 en URL publica
- Cliente y staff accesibles por URL publica
- DB remota con esquema y seed minimo aplicados
- Cero bloqueantes en flujo E2E de demo

## 4) Agentes y responsabilidades
## 4.1 CTO-Agent (owner)
- Prioriza backlog de produccion
- Define secuencia por fases
- Aprueba cambios de alcance
- Consolida reporte ejecutivo diario

## 4.2 Backend-Agent
- Ajusta app para cloud/runtime Railway
- Configura DB remota y migrations
- Cierra seguridad minima (CORS, JWT, manejo de errores)

## 4.3 Client-Mobile-Agent
- Configura API URL publica
- Valida flujo mesa -> menu -> carrito -> pedido -> tracking
- Manejo de errores de red en produccion

## 4.4 Staff-Desktop-Agent
- Configura API URL publica
- Valida tablero, detalle, cambios de estado y refresh/polling

## 4.5 Data-Agent
- Garantiza consistencia esquema/seed
- Ejecuta inicializacion de DB remota
- Verifica datos minimos para demo

## 4.6 QA-Agent
- Ejecuta checklist E2E completo
- Reporta bugs criticos y evidencia
- Autoriza salida de fase con pass/fail

## 5) Limpieza obligatoria antes de produccion
## 5.1 Limpieza de repo
- Excluir backups, archivos temporales, DB locales, logs, debug html
- Validar `.gitignore` para:
  - `*.db`, `*.backup_*`, `backups/`, `.env`, `.env.*`, logs y archivos debug
- Eliminar assets duplicados o no utilizados
- Mantener solo imagenes/productivos necesarios y rutas consistentes

## 5.2 Limpieza de configuracion
- Unificar variables de entorno por app
- Eliminar hardcodes de `localhost`
- Definir archivo de ejemplo `.env.example` por proyecto

## 5.3 Limpieza de seguridad
- Rotar secretos que hayan estado expuestos
- Confirmar que ningun token/secret esta commiteado
- Validar CORS estricto a dominios reales de client/staff

## 5.4 Limpieza de datos
- Separar claramente DB local de DB remota
- Revisar seed minimo sin datos basura
- Preparar script de inicializacion repetible

## 6) Plan por fases para ir a servidor
## Fase 0 - Preflight local
Objetivo:
- Confirmar que todo funciona local antes de publicar.

Tareas:
- Levantar backend `:8000`, client `:5173`, staff `:5174`
- Corregir errores de arranque
- Confirmar flujo E2E local en menos de 5 min

Aceptacion:
- Todo local operativo sin bloqueantes

## Fase 1 - Hardening minimo de codigo
Objetivo:
- Dejar codigo apto para ambiente productivo basico.

Tareas:
- Revisar manejo de errores y codigos HTTP
- Revisar timeouts y reintentos en frontend
- Agregar endpoint de health robusto
- Validar logs utiles (sin filtrar secretos)

Aceptacion:
- App estable bajo flujo normal y errores esperables

## Fase 2 - Datos remotos y migraciones
Objetivo:
- Mover persistencia a Postgres remota.

Tareas:
- Crear Postgres en Railway
- Configurar `DATABASE_URL`
- Aplicar esquema y seed minimo
- Probar lecturas/escrituras reales

Aceptacion:
- Backend opera 100% sobre DB remota

## Fase 3 - Deploy backend en Railway
Objetivo:
- Exponer API publica estable.

Tareas:
- Conectar repo en Railway
- Configurar build/start command
- Cargar variables de entorno
- Validar `/health` y endpoints criticos

Aceptacion:
- URL publica backend estable, health 200

## Fase 4 - Deploy front cliente/staff
Objetivo:
- Publicar interfaces de usuario.

Tareas:
- Crear proyectos en Vercel (o Railway Static si se decide)
- Configurar variable API publica
- Ejecutar build y validar runtime
- Probar navegacion principal en mobile/desktop

Aceptacion:
- Cliente y staff en URLs publicas funcionando

## Fase 5 - Integracion E2E online
Objetivo:
- Validar flujo real completo en internet.

Tareas:
- Cliente carga menu
- Cliente crea pedido con mesa
- Staff ve pedido y cambia estados
- Cliente visualiza tracking actualizado
- Validar imagenes (R2/CDN) si aplica

Aceptacion:
- Checklist E2E en verde, sin criticos

## Fase 6 - Observabilidad y operacion minima
Objetivo:
- Dejar el sistema operable sin improvisar.

Tareas:
- Definir monitoreo basico (health + errores)
- Definir rutina diaria de verificacion
- Documentar runbook de incidentes
- Definir rollback a ultimo commit estable

Aceptacion:
- Equipo puede operar, verificar y recuperar servicio

## Fase 7 - Corte a produccion controlado
Objetivo:
- Habilitar uso real con bajo riesgo.

Tareas:
- Ventana de liberacion acordada
- Smoke test previo y posterior al corte
- Congelar cambios durante ventana
- Monitoreo intensivo primeras 24h

Aceptacion:
- Produccion activa y estable post-corte

## 7) Checklist tecnico por componente
## 7.1 Backend
- [ ] Health endpoint
- [ ] CORS cerrado a dominios reales
- [ ] Variables obligatorias validadas al boot
- [ ] Migraciones/seed ejecutables
- [ ] Logs estructurados

## 7.2 Front cliente
- [ ] API URL publica configurada
- [ ] Flujo compra completo
- [ ] Errores de red visibles y recuperables

## 7.3 Front staff
- [ ] Login y tablero operativo
- [ ] Cambio de estados estable
- [ ] Refresh/polling correcto

## 7.4 Data
- [ ] Esquema versionado
- [ ] Seed minimo listo
- [ ] Sin drift entre codigo y DB

## 7.5 QA
- [ ] E2E cliente/staff aprobado
- [ ] No hay bugs criticos
- [ ] Evidencia de pruebas registrada

## 8) Riesgos principales y mitigacion
1. Configuracion incorrecta de variables
- Mitigacion: matriz de env vars por plataforma + validacion en arranque

2. Incompatibilidad SQLite -> Postgres
- Mitigacion: pruebas tempranas en DB remota + ajustes de tipos/queries

3. CORS/JWT mal configurado
- Mitigacion: test integrado con dominios reales antes del corte

4. Regresiones en flujo E2E
- Mitigacion: congelar scope y ejecutar checklist QA antes de cada release

5. Dependencia de servicios free tier
- Mitigacion: plan B documentado (Neon/Render/Vercel alternativos)

## 9) Definicion de Done para "Listo para Produccion"
- Backend, cliente y staff publicados y estables
- DB remota activa con datos minimos consistentes
- Flujo E2E principal validado online
- Secrets gestionados fuera de repo
- Runbook de operacion y rollback documentado

## 10) Orden recomendado de implementacion
1. Limpieza y hardening
2. DB remota
3. Backend deploy
4. Fronts deploy
5. E2E QA
6. Observabilidad y rollback
7. Corte controlado

## 11) Entregables esperados
- Documento de arquitectura final (URLs + CORS + variables)
- Registro de despliegue por fase con evidencia
- Checklist E2E firmado por QA-Agent
- Runbook operativo y rollback

## 12) Siguiente paso inmediato (Paso 2)
Ejecutar Fase 0 + Fase 1 y emitir reporte CTO:
- estado actual
- bloqueos
- decisiones pendientes
- fecha objetivo de Fase 2
