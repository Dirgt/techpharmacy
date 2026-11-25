# Manual de Usuario y Operación — TechPharmacy POS SaaS

Bienvenido a **TechPharmacy**, la plataforma en la nube diseñada específicamente para la gestión integral de droguerías, farmacias y puntos de venta farmacéuticos.

---

## 1. Acceso al Sistema y Seguridad por Droguería

Cada droguería cuenta con su propio portal web exclusivo (por ejemplo: `https://midrogueria.vercel.app` o dominio propio).

1. Ingresa al enlace exclusivo de tu droguería. Verás el nombre de tu sede en la pantalla de inicio de sesión.
2. Escribe tu **Correo Electrónico** y **Contraseña**.
3. Por seguridad multi-sucursal, una cuenta operativa solo puede iniciar sesión desde el enlace de su droguería asignada.
4. **Protección contra accesos no autorizados:** si se ingresan **8 intentos fallidos seguidos** con una misma cuenta/dirección, el acceso se bloquea temporalmente por 15 minutos como medida preventiva.

### Roles disponibles en tu droguería
| Rol | Qué puede hacer | Qué NO puede hacer |
|---|---|---|
| **Vendedor (Mostrador)** | Ver Dashboard, consultar Inventario, abrir/cerrar Caja, facturar en POS (contado/crédito), cobrar cartera y consultar Cronograma. | Crear o editar usuarios, anular facturas, ver Compras, Proveedores ni Reportes gerenciales. |
| **Administrador (Sede)** | Todo lo del Vendedor + gestionar Compras, Proveedores, Reportes, Usuarios de su sede, Importar inventario por CSV/Excel y Anular facturas. | Ver ni modificar información de otras droguerías. |

> **Nota de servicio:** Si tu plan vence o el servicio es suspendido temporalmente, al ingresar verás un aviso informativo; **ninguno de tus datos, facturas ni inventario se borra** y todo vuelve a operar al instante al reactivar el plan.

---

## 2. Dashboard (Resumen Operativo Diario)

Al iniciar sesión aterrizas en el **Dashboard**, donde ves en tiempo real:
- **Ventas de Hoy:** total facturado en la jornada actual (excluyendo facturas anuladas).
- **Alertas de Stock:** productos que alcanzaron su stock mínimo configurado.
- **Usuarios Activos:** cuentas habilitadas en tu droguería.
- **Vencimientos:** productos ya vencidos (rojo) y próximos a vencer dentro de los siguientes **90 días** (ámbar).
- **Gráfico Ingresos vs Gastos (Últimos 7 días):** comparación diaria entre ventas y egresos por compras/gastos.

---

## 3. Módulo de Inventario y Carga Masiva (Excel / CSV)

El inventario maneja estructura farmacéutica real por **Cajas**, **Blísters** y **Unidades** con conversión automática y trazabilidad por lote y registro INVIMA.

### 3.1 Semáforos inteligentes
En la parte superior puedes hacer clic sobre cualquier tarjeta para filtrar al instante:
- **Valor del Stock:** capital invertido al costo.
- **Margen Esperado:** ganancia proyectada sobre el inventario actual.
- **Stock Bajo:** productos por debajo de su mínimo para hacer pedido.
- **Vencimiento:** lotes próximos a vencer.
- **Stock Muerto:** productos sin movimiento en los últimos 10 días.

### 3.2 Crear o editar un producto manualmente
1. Haz clic en **Agregar Producto** (o el ícono de editar en la fila del producto).
2. Ingresa o escanea el **Código de barras**, **Nombre**, **Principio Activo** y **Laboratorio** (puedes crear laboratorios nuevos ahí mismo).
3. Define la presentación (**Blísters por caja** y **Unidades por blíster**): el sistema calcula automáticamente el costo unitario y los precios de venta según el margen de ganancia (o te permite escribir el PVP final y recalcula el margen exacto).
4. Completa **Lote**, **Fecha de vencimiento**, **Registro INVIMA**, **Sección**, **Ubicación** y **Stock mínimo**.
5. Si el medicamento requiere receta médica, activa la casilla **Requiere Fórmula Médica / Medicamento Controlado (Rx)** (también disponible en la columna `requiere_formula` de la plantilla CSV con `SI` o `NO`).
6. Cada cambio queda guardado en la **Bitácora de Auditoría** del producto y puede exportarse con **Auditoría Excel**.

### 3.3 Importación Masiva desde Excel / CSV (hasta 500 productos por carga)
Ideal para arrancar una droguería nueva en minutos o actualizar precios/lotes por lote:
1. En **Inventario**, haz clic en el botón verde **Importar CSV / Excel**.
2. Presiona **Descargar Plantilla CSV** y ábrela en Microsoft Excel o Google Sheets.
3. Llena tus productos respetando los encabezados (`codigo`, `nombre`, `laboratorio`, `cajas`, `blisters`, `unidades`, `precio_caja`, `porcentaje_ganancia`, `stock_minimo`, `lote`, `fecha_vencimiento`, `blisters_por_caja`, `unidades_por_blister`, etc.).
   - Si escribes un laboratorio nuevo, el sistema lo crea automáticamente.
   - Si el código ya existe en tu droguería, actualiza sus datos y stock de forma segura.
4. Guarda el archivo en formato **CSV (delimitado por comas o punto y coma, UTF-8)** y súbelo en el Paso 2 del modal.
5. Revisa la vista previa (filas válidas y posibles errores de línea) y confirma en **Importar Productos**.

---

## 4. Caja, Facturación (POS), Cartera y Anulaciones

### 4.1 Apertura de Caja (obligatoria para facturar)
Antes de registrar ventas, el vendedor o administrador debe hacer clic en **Abrir Caja** e ingresar la base en efectivo inicial de la gaveta. En la barra superior siempre verás si la caja está **Caja Abierta** (verde) o **Caja Cerrada** (ámbar).

### 4.2 Venta Rápida en Mostrador (POS)
1. **Buscar o escanear producto:** escribe el nombre o pasa el lector de código de barras (el sistema detecta automáticamente el código escaneado).
   - **Equivalentes por Principio Activo (`Equiv.`):** si el producto buscado está agotado o el cliente pide otra marca, haz clic en el botón **Equiv.** para ver al instante alternativas disponibles en stock con la misma molécula y agregarlas directo al carrito.
   - **Alerta de Fórmula Médica (`Rx Fórmula`):** los medicamentos marcados como controlados o de venta bajo fórmula muestran una etiqueta `Rx Fórmula` y un aviso preventivo dentro del carrito para que el vendedor verifique la receta antes de dispensar.
2. **Elegir presentación:** agrega **Caja**, **Blíster** o **Unidad** al carrito según la necesidad del cliente.
3. **Cliente:** por defecto permite facturación ágil de mostrador (**Consumidor Final**) sin frenar la fila, o puedes buscar/crear un cliente con nombre, cédula/NIT, teléfono y correo.
4. **Descuentos, IVA y pago:** aplica descuento porcentual si corresponde, selecciona IVA (`0%`, `5%` o `19%`), elige tipo de venta (**Contado** o **Crédito** con días de plazo) y método de pago (**Efectivo** con cálculo automático de devuelta, **Tarjeta** o **Transferencia**).
5. **Emitir, Imprimir en Tirilla POS o Enviar por WhatsApp:** al confirmar, el sistema descuenta el inventario de forma atómica (si falta stock bloquea la venta para evitar saldos negativos) y abre el comprobante donde puedes:
   - Elegir el formato exacto de impresión: **Tirilla 80mm**, **Tirilla 58mm** o **Carta**, incluyendo los datos fiscales y el mensaje personalizado al pie de tu droguería.
   - Escribir opcionalmente el celular del cliente y presionar **WhatsApp** para enviarle el resumen de la compra directamente sin costo adicional.

### 4.3 Registro de Gastos de Caja Menor
Desde el panel de **Caja / Ventas** puedes registrar gastos operativos en efectivo (domicilios, papelería, aseo, etc.), los cuales se descuentan automáticamente del efectivo esperado al cierre.

### 4.4 Historial de Ventas y Anulación de Facturas (Solo Administrador)
En la pestaña **Historial / Caja**:
- Ves el resumen del turno (ventas por método de pago, egresos y total esperado en gaveta).
- Al hacer clic en una factura se despliega el detalle exacto de productos vendidos.
- **Anular factura:** si hubo un error de digitación o devolución del cliente, un **Administrador** puede hacer clic en **Anular**, escribir el motivo y confirmar. Automáticamente:
  1. La factura queda marcada como **Anulada** (con su motivo guardado y visible).
  2. Todas las **cajas, blísters y unidades vendidas regresan al inventario** convirtiendo unidades/blísters si aplica.
  3. El monto anulado deja de sumar en los KPIs del turno, Dashboard y Reportes, y queda registrado en auditoría.

### 4.5 Cartera de Créditos y Abonos Parciales
En la subpestaña **Cartera**, visualizas todas las facturas a crédito pendientes de cobro (con indicador de plazo vigente o expirado, total abonado a la fecha y **saldo pendiente** real):
- **Abonar (pagos parciales):** con el botón **Abonar** puedes registrar pagos parciales (en efectivo, tarjeta o transferencia) y añadir una nota de respaldo. Al completarse el 100% del saldo, la factura pasa automáticamente a estado **Pagado**.
- **Cobrar (saldo total):** registra de una sola vez el saldo pendiente restante cuando la caja esté abierta.

### 4.6 Cierre y Arqueo de Caja (con Arqueo Ciego)
Al finalizar el turno, presiona **Cerrar Caja**:
- **Para Vendedores (Arqueo Ciego):** el vendedor ingresa directamente el efectivo físico contado en la gaveta **sin ver previamente el total esperado**, evitando cuadres manuales "a ojo" y protegiendo el control de caja.
- **Para Administradores:** además del conteo físico, el administrador visualiza el cálculo detallado (`Base inicial + Ventas en efectivo - Gastos - Compras en efectivo`) y el **Total Esperado en Gaveta**.

---

## 5. Compras, Proveedores, Reportes, Personal y Cronograma (Admin)

- **Proveedores:** directorio de distribuidores con NIT, contacto, correo y días de crédito pactados.
- **Compras y Cuentas por Pagar a Proveedores:** registro de facturas de compra a proveedores (pagadas al contado desde caja, transferencia o a crédito/pendiente), con tarjetas de resumen de deuda total, filtro **Por Pagar** y botón **Pagar** para liquidar facturas pendientes con el método elegido.
- **Reportes, Arqueos, Pedido Sugerido y Auditoría Global:** organizado en 4 pestañas clave para la toma de decisiones:
  - **Resumen Financiero + Exportar Contable CSV:** métricas diarias y semanales de ingresos reales vs egresos, medios de pago, top 10 de productos más vendidos y selector de mes para descargar todas las facturas del periodo en **CSV listo para Excel / contador**.
  - **Arqueos de Caja:** historial completo de aperturas y cierres de turno con efectivo esperado, efectivo contado por el vendedor, cálculo automático de **cuadrada / sobrante / faltante** y exportación a Excel.
  - **Pedido Sugerido Inteligente:** cruza automáticamente tus ventas de los últimos 30 días, stock mínimo y existencias actuales para recomendarte exactamente **cuántas cajas pedir** de cada medicamento, con exportación directa a Excel.
  - **Auditoría Global:** bitácora buscable con fecha, usuario y detalle de acciones críticas (creación/edición/eliminación de usuarios, anulaciones de facturas, abonos, pagos a proveedores y cierres de caja).
- **Usuarios (Gestión de Personal):** crea cuentas de **Vendedor** o **Administrador** dentro del cupo de usuarios de tu plan, edita datos, cambia contraseñas o activa/inactiva personal al instante.
- **Cronograma:** programación mensual de turnos del equipo farmacéutico para organizar aperturas y cierres.
- **Mi Perfil y Datos Fiscales de Sede:** cambio seguro de contraseña propia para cualquier usuario, y panel exclusivo para **Administradores** donde pueden actualizar el **NIT, régimen, teléfono, dirección y el mensaje al pie de tirilla/factura** de su droguería sin depender de soporte técnico.

---

## 6. Consola Superadmin SaaS (Dueño de la Plataforma)

El usuario con rol **Superadmin** accede a una consola exclusiva de plataforma (`/droguerias`) separada de la operación de mostrador:
- **Droguerías, URLs y Uso:** crea y edita sedes, configura subdominios o dominios personalizados, define el **Plan** (`Básico`, `Pro`, `Enterprise`), el **Cupo Máximo de Usuarios** y la **Fecha de Vencimiento**, consulta métricas de uso en vivo (cajas abiertas, productos, facturas, ventas) y **suspende o reactiva** cualquier droguería en 1 clic.
- **Usuarios Globales:** administra cuentas de todas las sedes, reasigna usuarios entre droguerías o cambia roles sin salir de la pantalla.
- **API Keys & Integraciones:** genera llaves `tp_live_...` aisladas por droguería con permisos granulares (`read:productos`, `read:inventario`, `read:facturas`, `read:clientes`, `write:clientes`), expiración opcional, revocación instantánea y documentación automática en `/api/v1/openapi`.

---

## 7. Integraciones vía API REST Enterprise (`/api/v1`)

Disponible para conectar la droguería con sistemas contables, tiendas virtuales, Power BI, bots de WhatsApp o apps móviles:
- **Autenticación:** enviar cabecera `Authorization: Bearer tp_live_...` o `x-api-key: tp_live_...`.
- **Endpoints disponibles:**
  - `GET /api/v1/health`: estado del servicio API.
  - `GET /api/v1/openapi`: especificación OpenAPI 3.1 lista para importar en Postman, Make, Zapier o n8n.
  - `GET /api/v1/productos`: catálogo filtrado (`?search=`, `?page=`, `?limit=`).
  - `GET /api/v1/inventario`: stock, precios y lotes (`?search=`, `?stock_bajo=true`).
  - `GET /api/v1/facturas`: ventas emitidas (`?desde=YYYY-MM-DD`, `?hasta=YYYY-MM-DD`, `?estado_pago=`).
  - `GET /api/v1/clientes` y `POST /api/v1/clientes`: consulta y registro automatizado de clientes.
- **Límite y seguridad:** hasta `120` peticiones por minuto por API Key; si la sede es suspendida o la llave es revocada, la API bloquea el acceso inmediatamente.

---

## 8. Preguntas Frecuentes (FAQ)

- **¿Qué pasa si olvido abrir caja antes de cobrar?**  
  El punto de venta te mostrará un aviso bloqueando la emisión hasta que abras caja; así nunca quedan ventas sin respaldo de turno.
- **¿Puedo importar mi inventario actual si lo tengo en Excel?**  
  Sí. En **Inventario -> Importar CSV / Excel** descargas la plantilla, pegas tus productos, guardas como CSV y los subes en segundos.
- **¿Si anulo una factura, tengo que sumar el stock manualmente?**  
  No. La anulación devuelve automáticamente las cajas, blísters y unidades al inventario y ajusta los totales del turno y reportes.
- **¿Cómo aumento el número de vendedores permitidos?**  
  El Superadmin de la plataforma puede subir el plan o el campo **Máx. Usuarios** de tu droguería en segundos desde `/droguerias`.
- **¿Cómo puedo registrar si un cliente de crédito me abona solo una parte de su factura?**  
  En **Facturación -> Ventas del Día -> Cartera**, haz clic en **Abonar** sobre la factura pendiente, escribe el valor del abono y el método de pago. El sistema descuenta el saldo pendiente y la marca como pagada automáticamente al quedar en $0.
- **¿Qué hago si un cliente pide un medicamento agotado?**  
  Al buscarlo en el POS, presiona **Equiv.** para ver otros productos con el mismo principio activo que sí tengan inventario disponible en tu sede.
