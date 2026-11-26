# Manual de Usuario y Operación — TechPharmacy POS SaaS

Bienvenido a **TechPharmacy**, la plataforma en la nube diseñada específicamente para la gestión integral de droguerías, farmacias y puntos de venta farmacéuticos.

---

## 1. Acceso al Sistema y Seguridad por Droguería

Cada droguería cuenta con su propio portal web exclusivo (por ejemplo: `https://midrogueria.vercel.app` o dominio propio).

1. Ingresa al enlace exclusivo de tu droguería. Verás el nombre de tu sede en la pantalla de inicio de sesión.
2. Escribe tu **Correo Electrónico** y **Contraseña** (puedes pulsar el ícono del ojo para verificar lo que escribiste antes de entrar).
3. Por seguridad multi-sucursal, una cuenta operativa solo puede iniciar sesión desde el enlace de su droguería asignada.
4. **Protección contra accesos no autorizados:** si se ingresan **8 intentos fallidos seguidos** con una misma cuenta/dirección, el acceso se bloquea temporalmente por 15 minutos como medida preventiva.

### Roles disponibles en tu droguería
| Rol | Qué puede hacer | Qué NO puede hacer |
|---|---|---|
| **Vendedor (Mostrador)** | Ver Dashboard, consultar Inventario, abrir/cerrar Caja, facturar en POS (contado/crédito), cobrar cartera y consultar Cronograma. | Crear o editar usuarios, anular facturas, ver Compras, Proveedores ni Reportes gerenciales. |
| **Administrador (Sede)** | Todo lo del Vendedor + gestionar Compras, Proveedores, Reportes, Usuarios de su sede, Importar inventario por CSV/Excel y Anular facturas. | Ver ni modificar información de otras droguerías. |

> **Nota de servicio:** Si tu plan vence o el servicio es suspendido temporalmente, al ingresar verás un aviso informativo; **ninguno de tus datos, facturas ni inventario se borra** y todo vuelve a operar al instante al reactivar el plan.

---

## 2. Dashboard (Centro de Control Farmacéutico)

Al iniciar sesión aterrizas en el **Centro de Control Farmacéutico**, donde supervisas toda tu droguería de un vistazo:
- **Barra de Comando Rápido:** muestra si tu **Caja está Abierta o Cerrada** (con su base inicial), cuántos usuarios están activos y botones directos para **Ir a Facturación**, **Recibir Mercancía** o **Inventario & Lotes**.
- **Facturación de Hoy:** total vendido en el día, comparativo porcentual contra ayer, número de ventas, ticket promedio y barra divisoria entre **Efectivo** y **Pagos Digitales**.
- **Pulso Comercial (7 o 14 días, en Curva o Barras):** gráfica interactiva de ingresos frente a compras/gastos, balance operativo y resumen de **Cartera por cobrar**.
- **Arqueo por Medio de Pago:** distribución exacta entre **Efectivo en Cajón**, **Nequi / Daviplata / QR**, **Tarjeta / Datáfono** y **Crédito** (separando automáticamente cada peso de los pagos mixtos).
- **Inteligencia Operativa en 3 Paneles:**
  1. **Radar FEFO & Reposición:** pestañas rápidas para filtrar **Vencidos (bloqueados en POS)**, **Por vencer (próximos 90 días)** y **Stock bajo**.
  2. **Top Medicamentos (30 Días):** ranking de los 5 productos con mayor rotación e ingresos.
  3. **Últimas Ventas en Mostrador:** recibos recientes con botón directo para reimprimir o enviar la tirilla por WhatsApp.

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

### 3.2.1 Control Multi-Lote FEFO y Baja de Vencidos (sin perder mercancía nueva)
En droguería es muy común tener aún existencias de un medicamento con un lote antiguo mientras llega mercancía nueva con otro lote y otra fecha de vencimiento:
- **Se mantienen los dos lotes por separado:** cada vez que registras una compra con un lote o vencimiento distinto, el sistema **no borra ni sobrescribe** el lote anterior.
  > **Ejemplo:** tienes `2 cajas` de Acetaminofén **Lote A (vence en enero)** y te llegan `5 cajas` del **Lote B (vence en noviembre)**. El sistema suma `7 cajas` disponibles en total, pero por dentro recuerda exactamente cuántas pertenecen al Lote A y cuántas al Lote B.
- **Salida automática FEFO (*Primero en vencer, primero en salir*):** cada vez que vendes en el mostrador, el sistema descuenta primero del lote vigente más próximo a vencer (el Lote A) hasta agotarlo, y solo después empieza a descontar del Lote B.
- **Ver lotes y dar de baja un lote vencido:** desde la tabla de **Inventario**, pulsa la insignia **N Lotes (FEFO)** o el ícono de capas en acciones para ver todos los lotes ordenados por prioridad de salida y usar el botón **Dar de baja** si necesitas retirar un lote vencido o averiado sin tocar los lotes nuevos vigentes.

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
1. **Buscar o escanear producto (el vendedor elige directo qué pidió el cliente):** escribe el nombre o pasa el lector de código de barras.
   - **Botones directos según lo que pidió el cliente (`+ Caja` / `+ Sobre` / `+ Unidad`):** al buscar un medicamento fraccionable, verás 3 botones con su precio para que el sistema **no adivine**:
     - Si el cliente dice *"deme un sobre"*, tocas **`+ Sobre`** y entra **solo `1 sobre`** al carrito (sin meter pastillas sueltas por error).
     - Si es un producto único que no se parte (como un jarabe o una crema), solo aparece el botón **`+ Agregar`**.
   - **Si usaste pistola lectora de código de barras + teclado rápido:** como el lector escanea la caja sin saber si el cliente quiere caja, sobre o pastillas, dentro del carrito tienes los botones **`Solo Caja` | `Solo Sobre` | `Solo Unidad`** para cambiar la presentación en un toque sin dejar cantidades viejas mezcladas. Además, puedes **escribir el número directamente con el teclado** (ej. escribir `15` o `20` pastillas en lugar de presionar `+` veinte veces).
   - **Aviso de conversión justa (cuidar el bolsillo del cliente):** si un sobre de `10` pastillas cuesta `$1.500` y cada pastilla suelta vale `$200`, al marcar `10` pastillas sueltas (`$2.000`) el carrito te muestra el aviso **`10U equivale a 1 Blíster • Convertir por $1.500`** para cobrar el precio justo con un clic.
   - **Equivalentes por Principio Activo (`Equiv.`):** si el producto buscado está agotado o el cliente pide otra marca, haz clic en **Equiv.** para ver alternativas disponibles con la misma molécula y agregarlas directo en Caja, Sobre o Unidad.
   - **Bloqueo Sanitario de Medicamentos Vencidos:** si un medicamento solo tiene existencias vencidas, aparece marcado como **VENCIDO • BLOQUEADO** y no se puede vender por accidente. Si conviven un lote viejo vencido y uno nuevo vigente, solo permite vender del lote vigente.
   - **Alerta de Fórmula Médica (`Rx Fórmula`):** los medicamentos controlados o de venta bajo fórmula muestran una etiqueta `Rx Fórmula` y un aviso preventivo en el carrito antes de facturar.

2. **Cómo funciona el Destape Automático (`Caja → Blíster/Sobre → Unidad`):**  
   En una droguería, muchas veces tienes cajas o sobres completos en el estante y **`0` pastillas sueltas** registradas, pero el cliente te pide pastillas sueltas. **No necesitas ir a Inventario a abrir cajas a mano:** el botón **`+ Unidad`** (o **`+ Sobre`**) sigue habilitado y al facturar el sistema destapa solo lo necesario y actualiza las presentaciones reales.

   > **Ejemplo A — Sacar 2 pastillas de un sobre (blíster de 10 unidades):**  
   > - **Lo que tienes antes de vender:** `0 Cajas | 1 Sobre | 0 Unidades`  
   > - **Lo que vendes:** `2 Unidades` (pastillas)  
   > - **Qué hace el sistema al facturar:** como cortaste `2` pastillas de ese sobre, ese sobre ya deja de ser un sobre completo. El sistema descuenta el `1 Sobre` cerrado y deja las **`8 Unidades`** sobrantes sueltas.  
   > - **Lo que queda en inventario:** **`0 Cajas | 0 Sobres | 8 Unidades`**.  
   > - **En la siguiente venta:** si minutos después otro cliente pide `3` pastillas, el sistema las toma primero de esas **`8 Unidades`** sueltas (dejando `5`), sin abrir otro sobre hasta que se acaben.

   > **Ejemplo B — Sacar 2 pastillas cuando solo tienes 1 Caja sellada (10 sobres × 10 unidades = 100 pastillas):**  
   > - **Lo que tienes antes de vender:** `1 Caja | 0 Sobres | 0 Unidades`  
   > - **Lo que vendes:** `2 Unidades`  
   > - **Qué hace el sistema al facturar:** abre esa `1 Caja` → deja **`9 Sobres`** cerrados quietos → abre **solo `1 Sobre`** para sacar las `2` pastillas → guarda las **`8 Unidades`** sobrantes sueltas.  
   > - **Lo que queda en inventario:** **`0 Cajas | 9 Sobres | 8 Unidades`** (`98` pastillas exactas en total).  
   > - **Regla de seguridad:** si ya abriste la caja y te quedan `0 Cajas | 9 Sobres | 8 Unidades`, el sistema ya **no** te deja vender una "Caja sellada" porque físicamente no hay una caja cerrada completa.

3. **Cliente:** por defecto permite facturación ágil de mostrador (**Consumidor Final** con documento `222222222222`) sin frenar la fila, o puedes buscar/crear un cliente con nombre, cédula/NIT, teléfono y correo.

4. **Descuentos, IVA y Métodos de Pago (incluido Pago Mixto exacto):**
   - Aplica descuento porcentual si corresponde, selecciona IVA (`0%`, `5%` o `19%`) y elige tipo de venta (**Contado** o **Crédito** con días de plazo).
   - En ventas de contado puedes elegir **Efectivo** (con calculadora de devuelta), **Transferencia**, **Tarjeta** o **PAGO MIXTO**:
   - **¿Cómo funciona el Pago Mixto sin errores de caja?**  
     > **Ejemplo:** una venta suma **`$35.000`** y el cliente paga **`$20.000` en billete** y **`$15.000` por Nequi/Transferencia**.  
     > 1. Tocas **PAGO MIXTO**.  
     > 2. En **Efectivo** escribes `20000`.  
     > 3. En **Transferencia** pulsas **Restante (`$15.000`)** o escribes `15000`.  
     > 4. Cuando ves el aviso verde **`Cuadrado exacto ($35.000)`**, el botón **FACTURAR E IMPRIMIR** se habilita (si falta o sobra plata, el sistema bloquea el cobro para evitar errores de digitación).  
     > 5. **Impacto en caja:** al cerrar turno, **únicamente los `$20.000` en efectivo suman al dinero esperado en gaveta**, mientras que los `$15.000` de Nequi se reflejan en Transferencias en Ventas del Día, tirilla y Reportes.

5. **Emitir, Imprimir en Tirilla POS o Enviar por WhatsApp:** al confirmar, el sistema asigna un **consecutivo independiente exclusivo de tu droguería** (con prefijo opcional si lo configuraste), descuenta primero el lote vigente más próximo a vencer (FEFO) de forma atómica y abre el comprobante donde puedes:
   - Elegir el formato exacto de impresión: **Tirilla 80mm**, **Tirilla 58mm** o **Carta**, incluyendo datos fiscales, desglose de pago mixto si aplica, resolución opcional y pie de página personalizado.
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
- **Compras, Recepción Técnica Multi-Lote y Cuentas por Pagar:** registro de facturas de compra a proveedores con **Lote**, **Fecha de Vencimiento** y **Estado Técnico (Conforme / Con observación)** por cada producto. Si ya existían cajas de un lote viejo, el sistema conserva ambos lotes separados (FEFO) y recalcula automáticamente el costo de caja, blíster y unidad. Desde **Ver Detalles / Acta** puedes imprimir el **Acta de Recepción Técnica de Medicamentos** (con firmas para Secretaría de Salud), además de filtrar **Por Pagar** y liquidar facturas pendientes con el botón **Pagar**.
- **Reportes, Arqueos, Pedido Sugerido y Auditoría Global:** organizado en 4 pestañas clave para la toma de decisiones:
  - **Resumen Financiero + Exportar Contable CSV:** métricas diarias y semanales de ingresos reales vs egresos (repartiendo automáticamente los pagos mixtos en efectivo, tarjeta y transferencia), top 10 de productos más vendidos y selector de mes para descargar todas las facturas del periodo en **CSV listo para Excel / contador**.
  - **Arqueos de Caja:** historial completo de aperturas y cierres de turno con efectivo esperado, efectivo contado por el vendedor, cálculo automático de **cuadrada / sobrante / faltante** y exportación a Excel.
  - **Pedido Sugerido Inteligente:** cruza automáticamente tus ventas de los últimos 30 días, stock mínimo y existencias actuales para recomendarte exactamente **cuántas cajas pedir** de cada medicamento, con exportación directa a Excel.
  - **Auditoría Global:** bitácora buscable con fecha, usuario y detalle de acciones críticas (creación/edición/eliminación de usuarios, anulaciones de facturas, abonos, bajas de lotes, pagos a proveedores y cierres de caja).
- **Usuarios (Gestión de Personal):** crea cuentas de **Vendedor** o **Administrador** dentro del cupo de usuarios de tu plan, edita datos, cambia contraseñas o activa/inactiva personal al instante.
- **Cronograma:** programación mensual de turnos del equipo farmacéutico para organizar aperturas y cierres.
- **Mi Perfil y Datos Fiscales de Sede:** cambio seguro de contraseña propia para cualquier usuario, y panel exclusivo para **Administradores** donde pueden actualizar el **NIT, régimen, teléfono, dirección, prefijo propio de numeración (opcional), resolución DIAN/nota fiscal (opcional) y el mensaje al pie de tirilla/factura** de su droguería sin depender de soporte técnico.

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
