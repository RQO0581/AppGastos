# Aplicación móvil para registro de gastos, devoluciones, ingresos y transferencias personales

## Objetivo
Crear una aplicación móvil que funcione en mi teléfono Samsung (Android) y en el iPhone de mi esposa (iOS).

## Ubicación del proyecto
- Carpeta del proyecto en la PC: `C:\Users\Rafael Quinones\source\repos\AppGastos`
- Para abrir Claude Code en el proyecto, en PowerShell:
  ```powershell
  cd "C:\Users\Rafael Quinones\source\repos\AppGastos"
  claude
  ```

## Tecnología
- Blazor WebAssembly standalone con PWA (.NET, C#), desarrollada en Visual Studio Community.
- Se instala desde Safari (iPhone) y Chrome (Android) con "Agregar a pantalla de inicio".
- Se publica gratis en GitHub Pages. No requiere Mac ni cuenta de Apple Developer.

## Funcionamiento standalone (sin internet)
- La app corre completamente en el celular (standalone). No depende de ningún servidor para funcionar.
- GitHub Pages solo se usa para descargar e instalar la app la primera vez, y para recibir actualizaciones.
- Después de instalada, la app debe abrir y funcionar en modo avión: registrar, ver historial, editar, borrar, importar las cuentas y crear el Excel.
- Lo único que necesita internet es enviar el correo, porque eso lo hace la aplicación de correo del teléfono.
- Las transacciones, el catálogo y el correo guardado nunca salen del teléfono, excepto en el Excel que el usuario decide compartir.

## Descripción
Cada vez que haga un pago, sea en efectivo, con tarjeta o por ATH Móvil, quiero registrar esa transacción desde el celular. También quiero registrar los ingresos que recibo, el dinero que muevo entre mis cuentas y las devoluciones de lo que compré. Las transacciones se guardarán en una base de datos dentro del mismo teléfono.

Voy a proveer el catálogo de cuentas (chart of accounts): cuentas de banco y tarjetas de crédito, cuentas de gasto y cuentas de ingreso. Al registrar cada transacción escogeré primero si es un **Gasto**, un **Ingreso**, una **Transferencia** o una **Devolución**:
- **Gasto:** la cuenta de banco, tarjeta o Efectivo con la que se pagó, y la cuenta de gasto a la que se carga.
- **Ingreso:** la cuenta de ingreso que lo origina, y la cuenta de banco o Efectivo donde entra el dinero.
- **Transferencia:** la cuenta de donde sale el dinero y la cuenta a donde entra, ambas de la hoja `CuentasOrigen` y distintas entre sí.
- **Devolución:** la cuenta de gasto del gasto original, y la cuenta de banco, tarjeta o Efectivo a donde vuelve el dinero.

## Datos de cada transacción
| Campo | Descripción | Obligatorio |
|---|---|---|
| Tipo | Gasto, Ingreso, Transferencia o Devolución (por defecto, Gasto) | Sí |
| Fecha | Fecha de la transacción (por defecto, la fecha de hoy) | Sí |
| Monto | Cantidad, en dólares | Sí |
| Método de pago | Solo para gastos: Efectivo, tarjeta de débito, tarjeta de crédito o ATH Móvil | Solo en gastos |
| Cuenta de origen | **Gasto:** cuenta de banco, tarjeta de crédito o "Efectivo" con la que se pagó. **Ingreso:** cuenta de ingreso que lo origina. **Transferencia:** cuenta de `CuentasOrigen` de donde sale el dinero. **Devolución:** cuenta de `CuentasGasto`, la del gasto original. | Sí |
| Cuenta de destino | **Gasto:** cuenta de gasto a la que se carga. **Ingreso:** cuenta de banco o "Efectivo" donde entra el dinero. **Transferencia:** otra cuenta de `CuentasOrigen` a donde entra el dinero. **Devolución:** cuenta de `CuentasOrigen` (banco, tarjeta o "Efectivo") a donde vuelve el dinero. | Sí |
| Comentario | Texto libre, de hasta 100 caracteres, en los cuatro tipos | No |

## Comentario
- Cada transacción puede llevar un comentario opcional de hasta 100 caracteres, en los cuatro tipos.
- Se ve en el Historial y se puede editar, añadir o quitar.
- En el Excel exportado va en la columna D (ver sección "Exportación").
- Las transacciones guardadas antes de este cambio quedan sin comentario.

## Escribir el monto
- Hay un solo campo "Monto", que muestra el valor con punto decimal, por ejemplo 22.22. Funciona igual en Registrar y en Editar.
- Usa el estilo cajero, con el teclado de dígitos del teléfono (`inputmode="numeric"`): cada dígito entra por la derecha. Por ejemplo, 2-2-2-2 muestra 0.02, 0.22, 2.22 y 22.22.
- Borrar quita el último dígito. Por ejemplo, 22.22 pasa a 2.22.
- Un monto en dólares redondos se escribe con sus dos ceros: 50 dólares son 5-0-0-0.
- Al editar, el campo muestra el monto guardado.

## Ingresos
- Al registrar, un selector arriba del formulario permite escoger **Gasto**, **Ingreso**, **Transferencia** o **Devolución**. Gasto viene seleccionado.
- Un ingreso no pide método de pago. Pide la cuenta de ingreso (hoja `CuentasIngreso`) y la cuenta donde entra el dinero: solo cuentas de tipo Banco o Efectivo.
- Si el catálogo no tiene cuentas de ingreso, la opción Ingreso aparece desactivada con un mensaje que explica que hay que importar la hoja `CuentasIngreso`.
- El historial muestra el tipo de cada transacción y los totales de gastos e ingresos por separado.
- "Borrar datos por fecha" borra gastos e ingresos del rango, y muestra antes la cantidad y la suma de cada tipo.
- La exportación incluye gastos e ingresos en el mismo archivo.

## Transferencias
- Una transferencia mueve dinero entre dos cuentas propias: por ejemplo, un pago de tarjeta (de un banco a una tarjeta), un retiro de efectivo (de un banco a Efectivo) o una transferencia entre bancos.
- No pide método de pago. Pide la cuenta de donde sale el dinero y la cuenta a donde entra. Las dos se escogen de la hoja `CuentasOrigen` y no pueden ser la misma.
- Si el catálogo tiene menos de dos cuentas en `CuentasOrigen`, la opción Transferencia aparece desactivada con un mensaje que explica por qué.
- Una transferencia no es un gasto ni un ingreso: no se suma a esos totales. El historial muestra su total por separado.
- "Borrar datos por fecha" también borra las transferencias del rango, y muestra antes su cantidad y su suma.
- La exportación incluye las transferencias en el mismo archivo, con la misma regla de origen y destino.

## Devoluciones
- Una devolución registra el dinero que vuelve por algo que se compró, a una cuenta de banco, a una tarjeta de crédito o a Efectivo.
- No pide método de pago. Pide la cuenta de gasto del gasto original (hoja `CuentasGasto`) y la cuenta a donde vuelve el dinero (cualquier cuenta de la hoja `CuentasOrigen`).
- El monto se escribe en positivo. La app no la enlaza con el gasto original ni limita su monto.
- El Historial muestra las devoluciones en una línea aparte, y añade "Gasto neto" = gastos menos devoluciones. El Gasto neto puede ser negativo si en ese mes se devolvió más de lo que se gastó.
- Una devolución cuenta en el mes de su propia fecha, no en el del gasto original.
- "Borrar datos por fecha" también borra las devoluciones del rango, y muestra antes su cantidad y su suma.
- La exportación incluye las devoluciones en el mismo archivo, con la misma regla de origen y destino.

## Catálogo de cuentas (Excel a importar)
El archivo tiene tres hojas:

| Hoja | Columnas | Qué va |
|---|---|---|
| `CuentasOrigen` | `Nombre`, `Tipo` | Bancos, tarjetas de crédito y Efectivo. `Tipo`: Banco, Tarjeta de crédito o Efectivo. También son las cuentas de destino de ingresos, transferencias y devoluciones. |
| `CuentasGasto` | `Nombre` | Cuentas de gasto. También son las cuentas de origen de las devoluciones. |
| `CuentasIngreso` | `Nombre` | Cuentas de ingreso. La hoja es opcional, para que los catálogos de dos hojas sigan funcionando. |

- Un nombre no puede repetirse en ninguna de las tres hojas, porque en el Excel exportado solo se ve el nombre.
- Los nombres deben escribirse exactamente como en el sistema de contabilidad que recibe el Excel exportado.
- La pantalla para cargar este archivo se llama "Importar cuentas".
- Todas las listas desplegables de cuentas se muestran en orden alfabético, sin distinguir mayúsculas de minúsculas ni acentos. El orden es solo para mostrarlas: los nombres se guardan y se exportan exactamente como están escritos.

## Requisitos
1. La aplicación no pedirá usuario ni contraseña.
2. El catálogo de cuentas y la lista de cuentas de banco y tarjetas vendrán en un archivo de Excel que la aplicación podrá importar.
3. La aplicación debe funcionar en Android (Samsung) y en iOS (iPhone).
4. Los datos se guardarán dentro del celular (IndexedDB del navegador).
5. La aplicación permitirá editar y borrar transacciones ya registradas.
6. La aplicación permitirá exportar los datos a Excel y compartirlos por correo electrónico. La aplicación recordará el último correo usado.
7. La aplicación permitirá borrar transacciones de la base de datos del teléfono por rango de fechas (ver sección "Borrar datos por fecha") o todas a la vez (ver sección "Borrar todas las transacciones").

## Borrar datos por fecha
- Pantalla para escoger una fecha desde y una fecha hasta. "Desde" trae por defecto el día 1 del mes actual y "Hasta" la fecha de hoy del teléfono. Se pueden cambiar, y debajo de cada campo se muestra la fecha en palabras.
- Antes de borrar, la app mostrará cuántas transacciones hay en ese rango, y la cantidad y la suma de los montos de cada tipo por separado (gastos, ingresos, transferencias y devoluciones).
- La app pedirá confirmación ("¿Seguro que deseas borrar X transacciones?") antes de borrar, y la confirmación repite la cantidad y la suma de cada tipo.
- La app recomendará exportar ese rango a Excel antes de borrar, con un botón para exportar desde la misma pantalla.
- Solo se borran transacciones (gastos, ingresos, transferencias y devoluciones). El catálogo de cuentas, las cuentas de banco y el correo guardado no se tocan.
- El borrado no se puede deshacer.

## Borrar todas las transacciones
- El Historial tiene un botón rojo "Borrar todas las transacciones", que borra las transacciones de todos los meses.
- Al tocarlo, la app muestra la cantidad y la suma de cada tipo por separado (gastos, ingresos, transferencias y devoluciones), de todos los meses.
- La app recomienda exportar antes, con un botón para exportar todo.
- Para confirmar, hay que escribir la palabra BORRAR.
- Solo se borran transacciones. El catálogo de cuentas y el correo guardado no se tocan. Los archivos ya guardados en Descargas tampoco.
- Al terminar, la app muestra cuántas transacciones se borraron.
- El borrado no se puede deshacer.

## Exportación
Formato: archivo de Excel (.xlsx) con estas columnas, en este orden:

| Date | filler | filler | filler | Account Cr | Account Dr | Debit | Credit |
|---|---|---|---|---|---|---|---|
| 1/1/2026 | | | | Rafael-BPPR | Telefonos | | 104.24 |
| 1/1/2026 | | | | Telefonos | Rafael-BPPR | 104.24 | |

- Cada transacción genera dos filas, con la misma regla para gastos, ingresos, transferencias y devoluciones:
  - **Fila 1 (crédito):** Account Cr = cuenta de origen, Account Dr = cuenta de destino, el monto va en Credit.
  - **Fila 2 (débito):** Account Cr = cuenta de destino, Account Dr = cuenta de origen, el monto va en Debit.
- Ejemplo de gasto: origen Rafael-BPPR, destino Telefonos (la tabla de arriba).
- Ejemplo de ingreso: origen Ingreso-Consultoria, destino Rafael-BPPR:

| Date | filler | filler | filler | Account Cr | Account Dr | Debit | Credit |
|---|---|---|---|---|---|---|---|
| 1/5/2026 | | | | Ingreso-Consultoria | Rafael-BPPR | | 500.00 |
| 1/5/2026 | | | | Rafael-BPPR | Ingreso-Consultoria | 500.00 | |

- Ejemplo de transferencia (pago de tarjeta): origen Rafael-BPPR, destino Tarjeta-Ejemplo:

| Date | filler | filler | filler | Account Cr | Account Dr | Debit | Credit |
|---|---|---|---|---|---|---|---|
| 1/10/2026 | | | | Rafael-BPPR | Tarjeta-Ejemplo | | 200.00 |
| 1/10/2026 | | | | Tarjeta-Ejemplo | Rafael-BPPR | 200.00 | |

- Ejemplo de devolución a una tarjeta: origen Telefonos, destino Tarjeta-Ejemplo:

| Date | filler | filler | filler | Account Cr | Account Dr | Debit | Credit |
|---|---|---|---|---|---|---|---|
| 1/15/2026 | | | | Telefonos | Tarjeta-Ejemplo | | 30.00 |
| 1/15/2026 | | | | Tarjeta-Ejemplo | Telefonos | 30.00 | |

- **Confirmado:** el sistema de contabilidad carga sin errores los cuatro tipos con este formato, el comentario en la columna D y la cuenta "Efectivo".
- La fecha va en formato m/d/aaaa.
- Las columnas B y C ("filler") se envían vacías.
- La columna D lleva el comentario de la transacción en las dos filas, y queda vacía si no tiene comentario. Su encabezado sigue diciendo "filler".
- Ejemplo de gasto con comentario:

| Date | filler | filler | filler | Account Cr | Account Dr | Debit | Credit |
|---|---|---|---|---|---|---|---|
| 1/1/2026 | | | Factura de enero | Banco-Ejemplo | Telefonos | | 104.24 |
| 1/1/2026 | | | Factura de enero | Telefonos | Banco-Ejemplo | 104.24 | |

- Los montos van con dos decimales.
- Antes de exportar, se podrá escoger un rango de fechas. "Desde" trae por defecto el día 1 del mes actual y "Hasta" la fecha de hoy del teléfono. Se pueden cambiar, y debajo de cada campo se muestra la fecha en palabras.
- Un botón permite quitar las fechas para exportar todas las transacciones.
- Si la pantalla queda abierta y cambia el día, las fechas por defecto avanzan solas. Un rango escogido por el usuario no cambia. Lo mismo aplica en "Borrar datos por fecha", donde además las fechas no se mueven mientras se confirma un borrado.

## Envío por correo
- Al exportar, la app crea el Excel e intenta abrir "Compartir" del teléfono (Web Share API). Si se abre, se escoge Gmail o Correo y el archivo va adjunto.
- Si el teléfono no permite compartir el archivo (Chrome para Android no permite .xlsx), la app lo guarda en Descargas e indica su nombre. Un botón "Abrir correo" abre la aplicación de correo con el destinatario y el asunto ya escritos, y el archivo se adjunta a mano desde Descargas.
- La app avisa que el archivo guardado sigue en Descargas hasta que se borre. "Borrar datos por fecha" no lo borra.
- Crear y guardar el Excel funciona en modo avión. El correo sale cuando vuelve la conexión.
- La primera vez, la app pide el correo electrónico de destino y lo guarda en el teléfono.
- Las próximas veces, el correo aparece ya escrito con un botón "Copiar" para pegarlo en el destinatario. Se puede cambiar y el nuevo queda guardado.

## Versión
- Al final de la pantalla Más, de forma discreta, se muestra la versión con este formato: `Versión: 2026-11-04 22:22:57` (año-mes-día hora:minutos:segundos).
- La fecha y hora se generan automáticamente al compilar y publicar, en la hora de Puerto Rico (America/Puerto_Rico), no en UTC.
- Cada sitio muestra cuándo se compiló, así que AG Pruebas y producción muestran versiones distintas.

## Testamento
- `Más` tiene un botón "Ver testamento". Al tocarlo, la app pide un PIN de 4 dígitos.
- La primera vez, la app pide crear el PIN, escribiéndolo dos veces para confirmar.
- El PIN se guarda solo en el teléfono, como hash. Nunca está en el código ni en el repositorio.
- Si se olvida el PIN, se puede borrar el testamento guardado junto con el PIN, y volver a importar. Para confirmarlo hay que escribir la palabra BORRAR.
- Después de 5 intentos fallidos, hay que esperar 30 segundos.
- El contenido se guarda cifrado con una clave derivada del PIN. Un PIN de 4 dígitos evita que alguien lo vea o lo lea fácilmente, pero no resiste a quien saque los datos del teléfono y pruebe todas las combinaciones. El Excel original que quede en Descargas o en el correo no está protegido.
- La pantalla se bloquea al salir de ella o al enviar la app a segundo plano.
- El testamento es un Excel que se importa cada mes, con una tabla de dos columnas: A = Descripción, B = Cantidad. Tiene un título en la primera fila, encabezados de sección en negrita sin cantidad, filas con montos en dólares, filas de totales, filas vacías y montos negativos.
- La app muestra la tabla tal como viene, en el mismo orden, respetando los títulos, las secciones y la negrita. Los montos se muestran con el formato de la app, como $1,250.50 y -$500.00, y los negativos en rojo. Solo se lee la primera hoja, columnas A y B. Antes de reemplazar se muestra una vista previa. También muestra la fecha de importación, en palabras.
- Es de solo lectura. Para cambiarla se importa un Excel nuevo, que reemplaza al anterior.
- Se guarda solo en el teléfono, en un almacén aparte que "Borrar datos por fecha" y "Borrar todas las transacciones" nunca tocan, y se ve en modo avión.
- Las pruebas usan solo datos ficticios.

## Advertencia
Los datos viven en el teléfono. Si se borra la app del teléfono, se borran los datos. Exportar a menudo.
