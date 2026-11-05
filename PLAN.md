# Plan de AppGastos

**Estado:** plan aprobado. Fase 1 aprobada: publicada en https://rqo0581.github.io/AppGastos/, se instala, abre como app y abre en modo avión en el Samsung y en el iPhone (este último está en inglés). Fase 2 aprobada: en el Samsung, Compartir falla como se esperaba, el Excel se guarda en Descargas con y sin internet, "Abrir correo" abre Gmail con el destinatario y el asunto, y el archivo adjunto llegó igual que la tabla. El iPhone se reportó como funcionando. Fase 3 aprobada: en el Samsung y en el iPhone los datos persisten al cerrar y abrir la app, funciona en modo avión, editar y borrar funcionan sin tocar cuentas ni correo, y "Protegido contra borrado automático" dice "sí" en ambos. **Cambio de requisitos (2 de noviembre):** la app también registra ingresos (ver sección 9) y transferencias (ver sección 10). Fases 4 y 4b aprobadas en el Samsung: la migración funcionó, el selector abrió el `.xlsx` desde Descargas, la vista previa mostró las tres hojas, y el catálogo real (8 cuentas de origen, 73 de gasto y 13 de ingreso) se importó con internet y en modo avión, y siguió ahí al cerrar y abrir la app. Los botones se ven azules. La prueba de error en el teléfono se saltó porque la cubren las pruebas automáticas. Fases 5 y 6 aprobadas en el Samsung, incluidos el monto estilo cajero, la fecha en palabras, el Historial con totales por tipo, editar, cancelar y borrar, y el Historial y registrar en modo avión. **Cambios de requisitos después:** devoluciones (sección 12), comentario (sección 13), Exportar con el mes actual por defecto, "Borrar todas las transacciones", el nombre "Importar cuentas" y el orden alfabético de las cuentas (sección 14). Fases 7, 7b y 8 aprobadas en el Samsung: las listas salen en orden alfabético, el comentario se guarda y se ve en el Historial, las devoluciones a banco y a tarjeta funcionan y el Gasto neto cuadra, Exportar trae del día 1 del mes a hoy, guarda en Descargas y "Abrir correo" funciona, y el Excel tiene el formato correcto con el comentario en la columna D. **El sistema de contabilidad cargó el Excel sin errores:** acepta los cuatro tipos, el comentario en la columna D, las devoluciones y la cuenta "Efectivo". Borrar por fechas borró solo el rango de prueba, y en Borrar todas "borrar" en minúsculas deja el botón gris y Cancelar no borró nada. Fases 9 y 10 aprobadas (ver secciones 15 y 16), incluido el Testamento: el usuario probó todo y funcionó, en el Samsung y en el iPhone. Con eso quedan cerradas también las pruebas pendientes del iPhone de las Fases 4 a 8. **La app está terminada según el plan.** El sitio de pruebas y el bloqueo de producción están activos (decisión 12). El usuario instaló la app de pruebas, y su app real siguió igual.

## 1. Lo ya hecho
- **Git:** repositorio iniciado con la rama `main`, el nombre habitual en GitHub, donde se va a publicar.
- **`CLAUDE.md`:** tiene el resumen y las reglas del proyecto. Claude Code lo lee en cada sesión, así no hay que repetirlas. Además, indica que `REQUISITOS.md` manda si hay contradicciones.
- **Entorno:** está instalado el SDK 10.0.403 y la plantilla `blazorwasm`, que incluye PWA.

## 2. Estructura de la solución
```text
AppGastos/
├─ AppGastos.slnx
├─ src/AppGastos/
│  ├─ Modelos/        clases de datos
│  ├─ Servicios/      IndexedDB, importar, exportar, compartir
│  ├─ Pages/          pantallas
│  ├─ Layout/         marco y menú inferior
│  ├─ Components/     piezas reutilizables, como el formulario
│  └─ wwwroot/        manifest, service worker, íconos, JS
├─ tests/AppGastos.Tests/
└─ .github/workflows/ publicación automática en GitHub Pages
```
- **Un solo proyecto de app:** separarla en varias capas sería complicarla sin necesidad.
- **Proyecto de pruebas:** el formato del Excel debe ser exacto, y una prueba automática lo vigila mejor que revisarlo a ojo.
- **Código en español:** los nombres del dominio irán en español (`Transaccion`, `CuentaGasto`), igual que los requisitos.

## 3. Modelo de datos
```csharp
public enum TipoTransaccion { Gasto, Ingreso, Transferencia, Devolucion }   // Devolucion se añade según la sección 12
public enum MetodoPago { Efectivo, TarjetaDebito, TarjetaCredito, AthMovil }
public enum TipoCuentaOrigen { Efectivo, Banco, TarjetaCredito }

public class Transaccion
{
    public Guid Id { get; set; }
    public TipoTransaccion Tipo { get; set; }
    public DateOnly Fecha { get; set; }
    public decimal Monto { get; set; }
    public MetodoPago? MetodoPago { get; set; }     // solo en gastos
    public string CuentaOrigen { get; set; } = "";
    public string CuentaDestino { get; set; } = "";
}

public class CuentaOrigen
{
    public string Nombre { get; set; } = "";
    public TipoCuentaOrigen Tipo { get; set; }
}

public class CuentaGasto
{
    public string Nombre { get; set; } = "";
}

public class CuentaIngreso
{
    public string Nombre { get; set; } = "";
}
```
El correo guardado irá en un almacén aparte de ajustes, para que el borrado por fechas no pueda tocarlo.

| Decisión | Por qué |
|---|---|
| `decimal` para el monto | `double` acumula errores de redondeo con el dinero. Las sumas se harán siempre en C#, no en JavaScript. |
| `DateOnly` para la fecha | Sin hora no hay riesgo de que la zona horaria cambie el día. Se guarda como `2026-01-31`, un texto que se ordena bien y permite buscar por rango. |
| `Guid` como Id | Se genera sin consultar la base de datos. |
| Nombre de la cuenta como texto | El Excel exporta nombres, y así reimportar el catálogo no altera las transacciones anteriores. A cambio, renombrar una cuenta no actualiza las transacciones viejas. |

**Filtro de cuentas de un gasto, según el método de pago:**
- **Efectivo:** usa la cuenta de tipo Efectivo automáticamente, sin preguntar.
- **Tarjeta de crédito:** muestra solo cuentas de tipo tarjeta de crédito.
- **Débito o ATH Móvil:** muestra solo cuentas de banco.

## 4. Librerías
**Recomendación: ClosedXML** (0.105.1), tanto para leer como para crear Excel.

| Librería | Evaluación |
|---|---|
| **ClosedXML** | Gratis (licencia MIT) y controla cada celda, así que las tres columnas `filler` no son problema. Su desventaja es que aumenta la descarga inicial. |
| **MiniExcel** | Es el plan B porque es mucho más liviana. Trabaja mapeando columnas por nombre, y tres columnas llamadas igual podrían dar problemas. |
| **EPPlus** | Descartada porque su licencia es más restrictiva y requiere configuración. |
| **OpenXML SDK directo** | Descartada porque es muy verbosa y ClosedXML ya se apoya en ella. |

**Falta comprobar:** ClosedXML no se ha probado dentro de WebAssembly. Allí puede tener problemas con las fuentes o con el recorte de código al publicar. Por eso la Fase 2 lo prueba en los teléfonos antes de construir nada encima.

Para IndexedDB se propone no usar ninguna librería, solo un archivo JS pequeño propio. Son pocas operaciones, se evita depender de paquetes externos y sirve para aprender cómo funciona la comunicación entre Blazor y JavaScript.

## 5. Pantallas
Habrá un menú inferior fijo, al alcance del pulgar, con Registrar, Historial, Exportar y Más.

1. **Registrar (inicio):** el selector de tipo y el formulario, con la fecha de hoy y teclado numérico para el monto.
2. **Historial:** las transacciones por mes con su tipo y los totales de cada tipo, y opciones para editar o borrar.
3. **Editar transacción:** usa el mismo formulario que Registrar.
4. **Exportar:** rango de fechas opcional, correo con botón "Copiar" y botón para compartir.
5. **Borrar por fechas:** muestra la cantidad y la suma de cada tipo, recomienda exportar y pide confirmación.
6. **Importar cuentas:** selección del Excel y vista previa. Aparece sola si aún no hay cuentas.
7. **Más:** enlaces a Importar y Borrar, y la advertencia de que los datos viven en el teléfono.

## 6. Fases
Cada fase termina con algo que se puede probar, y se espera aprobación antes de pasar a la siguiente. Esta es la tabla original: la 4b está en la sección 9, y las fases 5 a 8 vigentes están en la sección 10.

| Fase | Contenido | Cómo se prueba |
|---|---|---|
| 1 | Esqueleto, PWA y publicación en GitHub Pages | Se instala la app vacía en ambos teléfonos y la app instalada abre en modo avión en ambos |
| 2 | Prueba técnica: crear un Excel de ejemplo y compartirlo | Se recibe por correo desde ambos teléfonos |
| 3 | Modelo y almacenamiento en IndexedDB | Los datos siguen ahí al cerrar y abrir la app |
| 4 | Importar catálogo | Se importa el Excel real y se ven las cuentas |
| 5 | Registrar transacción | Se registra un gasto real |
| 6 | Historial, editar y borrar | Se corrige y se borra un gasto |
| 7 | Exportación real y correo recordado | Se compara el archivo con el formato requerido |
| 8 | Borrar por fechas | Se borra un rango de prueba |
| 9 | Pulido, íconos y prueba completa | Se usa la app de principio a fin en ambos teléfonos |

Se publica primero y el Excel va justo después porque son los mayores riesgos. Compartir archivos requiere HTTPS y solo se puede comprobar bien en un teléfono real, sobre todo en iPhone.

## 7. Limitaciones a tener en cuenta
- **Compartir en dos pasos:** Safari puede bloquear "Compartir" si pasa mucho tiempo desde el toque. Por eso quizá haya que tocar "Crear Excel" y luego "Compartir". Se confirmará en la Fase 2.
- **Chrome para Android no comparte `.xlsx`:** su lista de archivos permitidos no incluye Excel, y `navigator.canShare()` no lo detecta porque devuelve `true` y luego `share()` falla con `NotAllowedError: Permission denied`. Por eso la app intenta compartir y, si no puede, guarda el archivo en Descargas y ofrece "Abrir correo".
- **Copias en Descargas:** en el Samsung, cada exportación crea otra copia con (1), (2), etc. Es lo normal en Android. La Fase 7 debe usar nombres con el rango de fechas para distinguirlas, y seguir avisando que hay que borrarlas a mano.
- **Repositorio público:** GitHub Pages gratis normalmente requiere un repositorio público. Las transacciones no se suben, pero el Excel del catálogo no debe estar en esa carpeta sin excluirlo, así que irá en `.gitignore`.
- **Dos teléfonos, dos bases de datos:** los datos de cada teléfono no se sincronizan. Cada persona exporta los suyos.
- **Datos separados en iPhone:** la app instalada puede no ver lo que se haya hecho en Safari. Conviene instalarla primero y usarla solo desde el ícono.

## 8. Decisiones tomadas
1. **Excel de cuentas:** tres hojas: `CuentasOrigen` (`Nombre`, `Tipo`), `CuentasGasto` (`Nombre`) y `CuentasIngreso` (`Nombre`), esta última opcional. Los valores de `Tipo` son `Efectivo`, `Banco` y `Tarjeta de crédito`. La cuenta `Efectivo` se añade sola si falta, y la vista previa lo avisa. Los nombres se conservan como están escritos y no pueden repetirse entre hojas. Si el archivo tiene errores, no se importa nada. Importar reemplaza el catálogo completo y no toca las transacciones.
2. **Fecha en el Excel exportado:** fecha real de Excel con formato `m/d/yyyy`.
3. **Filtro de cuentas:** se usa el de la sección 3. ATH Móvil y débito siempre salen de una cuenta de banco.
4. **Nota o descripción:** se añade como `Comentario` opcional (ver sección 13). Antes estaba fuera.
14. **Versión en Más:** `AppGastos.csproj` genera `VersionCompilada` en cada compilación, restando 4 horas a UTC, y una prueba automática vigila que Puerto Rico siga en UTC-4. Es una excepción a la regla de las fechas en palabras, pedida por el usuario.
13. **Fechas al cambiar el día:** en Exportar y Borrar por fechas, `RangoVigilado` revisa cada 30 segundos. Las fechas por defecto avanzan solas; un rango escogido a mano o que viene de otra pantalla no cambia, y mientras se confirma un borrado esperan.
12. **Producción y pruebas:** solo el usuario publica en producción, en una terminal normal. Se prueba primero en https://appgastos-pruebas.github.io/AppGastos-Pruebas/ , en otra organización de GitHub para que el navegador lo trate como otro sitio y sus datos queden separados; en `rqo0581.github.io` compartiría la base de datos con la app real. El repositorio de pruebas solo tiene la app compilada, sin documentos ni historial. El bloqueo tiene dos capas: reglas `deny` en `.claude/settings.json` y un hook `pre-push` local que pide `AUTORIZO_PRODUCCION=si`. El usuario lo comprobó con el commit `36cf8cf` pendiente: `git push --dry-run origin main` dijo BLOQUEADO, y el push con su autorización pasó.
5. **Repositorio público:** se suben el código y, por decisión del usuario, también `REQUISITOS.md`, `PLAN.md` y `CLAUDE.md`, tal como están. Los commits usan la identidad privada de GitHub.
6. **Reembolsos:** se registran como el tipo `Devolución` (ver sección 12). Antes estaban fuera.
7. **Cuenta de efectivo:** se llama `Efectivo`, y el sistema de contabilidad la acepta.
8. **Fechas en pantalla:** siempre en palabras, por ejemplo "Lunes, 2 de noviembre de 2026", con `FormatoFecha.EnPalabras`. Los nombres están escritos en el código para que no dependan del idioma del teléfono. Las Fases 6 a 8 deben usarlo. El Excel sigue con `m/d/yyyy`.
9. **Fecha después de guardar:** el campo se queda en la fecha usada, para registrar varios recibos del mismo día. Vuelve a hoy al abrir la pantalla otra vez. El monto, el método y las cuentas sí se vacían.
10. **Monto estilo cajero:** un solo campo con `inputmode="numeric"`, porque el iPhone mostró un teclado sin tecla de punto ni de coma con `inputmode="decimal"`. Cada dígito entra por la derecha y borrar quita el último. `js/monto.js` mantiene el cursor al final. La regla está en `BorradorTransaccion.EscribirMonto`. Se probaron antes dos campos (dólares y centavos), y el usuario prefirió este.
11. **Rango de Exportar:** `Desde` trae por defecto el día 1 del mes actual y `Hasta` la fecha de hoy del teléfono. Exportar todo requiere tocar "Quitar las fechas". Una transacción con fecha futura no entra en el rango por defecto.

## 9. Cambio de requisitos: ingresos
El usuario también quiere registrar ingresos. Se resuelve **antes** de seguir, porque cambia el modelo, el catálogo y la exportación.

**Modelo de datos (propuesta):**
```csharp
public enum TipoTransaccion { Gasto, Ingreso }

public class Transaccion
{
    public Guid Id { get; set; }
    public TipoTransaccion Tipo { get; set; }      // Gasto por defecto
    public DateOnly Fecha { get; set; }
    public decimal Monto { get; set; }
    public MetodoPago? MetodoPago { get; set; }    // solo en gastos
    public string CuentaOrigen { get; set; } = "";  // gasto: banco/tarjeta/Efectivo; ingreso: cuenta de ingreso
    public string CuentaDestino { get; set; } = ""; // gasto: cuenta de gasto; ingreso: banco/Efectivo
}

public class CuentaIngreso
{
    public string Nombre { get; set; } = "";
}
```
- `CuentaGasto` de `Transaccion` pasa a llamarse `CuentaDestino`. Así la exportación usa **una sola regla** para los dos tipos: fila 1 Cr = origen, Dr = destino, monto en Credit; fila 2 al revés, monto en Debit.
- Las transacciones guardadas sin `Tipo` pasan a ser Gasto, y su `CuentaGasto` pasa a ser `CuentaDestino`. Se implementó como una migración única al subir la base de datos a la versión 2, en lugar de tolerarlo en cada lectura.
- Nuevo almacén `cuentasIngreso` en IndexedDB. Importar reemplaza las tres listas en **una sola transacción**.

**Catálogo:** tercera hoja `CuentasIngreso` (`Nombre`), opcional. Los nombres no se pueden repetir entre las tres hojas. "Crear plantilla" incluye la hoja nueva con un ejemplo.

**Filtro de cuentas para ingresos:** origen = cuentas de ingreso; destino = solo cuentas de tipo Banco o Efectivo.

**Fases:**

| Fase | Contenido | Cómo se prueba |
|---|---|---|
| 4b | Modelo con `Tipo` y `CuentaDestino`, almacén `cuentasIngreso`, importador y plantilla con la hoja `CuentasIngreso`, exportador con la regla de origen y destino. Pruebas automáticas para un ingreso en el Excel exportado y para nombres repetidos entre hojas. | Se crea la plantilla nueva, se importa el catálogo real con las tres hojas en ambos teléfonos, también en modo avión |

La Fase 4 se aprueba junto con la 4b, con el catálogo real de tres hojas.

## 10. Cambio de requisitos: transferencias (aprobado)
El usuario necesita registrar pagos de tarjeta, retiros de efectivo y transferencias entre bancos. Se añade un tercer tipo, `Transferencia`, de una cuenta de `CuentasOrigen` a otra distinta. Los reembolsos quedan fuera por ahora.

**Modelo de datos:**
```csharp
public enum TipoTransaccion { Gasto, Ingreso, Transferencia }
```
- No hay clases ni campos nuevos: una transferencia usa `CuentaOrigen` y `CuentaDestino`, y deja `MetodoPago` en `null`.
- No hace falta subir la base de datos a la versión 3 ni migrar nada, porque el tipo se guarda como texto.
- El catálogo, la plantilla y el importador no cambian.

**Exportación:** el exportador tampoco cambia, porque ya usa una sola regla. Por ejemplo, un pago de tarjeta acredita el banco y debita la tarjeta. Se añade una prueba automática con ese ejemplo.

**Filtro de cuentas:** origen = todas las cuentas de `CuentasOrigen`; destino = las mismas, menos la escogida como origen. Se permiten todas las combinaciones, incluidas de tarjeta a Efectivo, de Efectivo a banco y de tarjeta a tarjeta.

**Reglas para el formulario y los totales:**
- La regla de origen y destino distintos irá en C#, separada de la pantalla, para poder probarla. Compara sin distinguir mayúsculas.
- La opción Transferencia queda desactivada, con un mensaje, si hay menos de dos cuentas en `CuentasOrigen`.
- Al cambiar de tipo, se vacían las cuentas escogidas, porque las listas son distintas.
- Los totales de gastos, ingresos y transferencias nunca se mezclan. Pagar una tarjeta no es un gasto nuevo: el gasto se registró al comprar con ella.

**Fases:** no hace falta una fase aparte, porque sin formulario no habría nada visible que probar. El tipo y sus pruebas se añaden al empezar la Fase 5. La prueba de la Fase 4 y la 4b no cambia.

| Fase | Contenido | Cómo se prueba |
|---|---|---|
| 5 | Registrar transacción, con el selector de los tres tipos | Se registra un gasto, un ingreso y una transferencia reales |
| 6 | Historial con el tipo y los totales de cada tipo | Se corrige y se borra una transacción de cada tipo |
| 7 | Exportación con los tres tipos | El usuario confirma que su sistema de contabilidad carga bien los tres tipos |
| 8 | Borrar por fechas, con cantidad y suma por tipo | Se borra un rango de prueba |

## 11. Fase 6: historial, editar y borrar (decisiones aprobadas)
- **Borrar:** pide confirmación, con un mensaje como "¿Seguro que deseas borrar este gasto de $104.24?".
- **Historial:** mes por mes, con botones para ir al anterior y al siguiente, y con los totales de ese mes por tipo.
- **Al guardar una edición:** vuelve al Historial, con un mensaje verde que dice qué cambió.
- **"Ver lo guardado":** se quita al terminar esta fase. La prueba de Excel se queda hasta la Fase 7.
- **Editar:** las cuentas que ya no están en el catálogo siguen en la lista, la fecha nunca cambia sola, y cambiar el tipo vacía las cuentas.

**Pasos:** 1) `BorradorTransaccion` carga una transacción guardada, con pruebas; 2) el formulario pasa a un componente compartido, sin cambiar cómo funciona; 3) pantalla de Editar; 4) Historial con totales y borrar.

## 12. Cambio de requisitos: devoluciones (aprobado)
El usuario necesita registrar devoluciones a cuentas de banco y a tarjetas de crédito. Se añade un cuarto tipo, `Devolución`, antes de cerrar la Fase 7.

**Modelo de datos:** `TipoTransaccion` añade `Devolucion`. Usa `CuentaOrigen` y `CuentaDestino`, y deja `MetodoPago` en `null`. No hay clases ni campos nuevos, y no hace falta subir la base de datos a la versión 3, porque el tipo se guarda como texto. El catálogo, la plantilla y el importador no cambian.

**Cuentas:** origen = `CuentasGasto`; destino = todas las de `CuentasOrigen`. No hace falta comparar origen y destino: el importador ya impide que un nombre se repita entre hojas.

**Exportación:** el exportador no cambia, porque ya usa una sola regla. La fila 1 acredita la cuenta de gasto y debita la cuenta que recibe el dinero, al revés que el gasto original. Se añade una prueba con ese ejemplo.

**Pantalla:**
- El selector de tipo pasa a dos filas de dos botones, porque cuatro no caben en un teléfono angosto.
- Hace falta un nombre para mostrar: el enum se escribe `Devolucion`, y en pantalla debe decir "Devolución". Los mensajes usan femenino: "Devolución guardada", "esta devolución".
- Etiquetas: "Cuenta del gasto original" y "Cuenta a donde vuelve el dinero".

**Totales:**
- El Historial muestra, en este orden: Gastos, Devoluciones, **Gasto neto**, Ingresos, Transferencias.
- `Gasto neto` = gastos menos devoluciones, calculado en C# y con pruebas. Si es negativo se muestra como `-$5.00`.
- Exportar muestra la línea de Devoluciones, sin Gasto neto, porque el pedido es para el Historial. Borrar por fechas (Fase 8) mostrará cantidad y suma de los cuatro tipos.

**Límites aceptados:** la devolución no se enlaza con el gasto original ni limita su monto, y cuenta en el mes de su propia fecha.

**Fases:**

| Fase | Contenido | Cómo se prueba |
|---|---|---|
| 7b | Tipo `Devolución` en Registrar, Editar, Historial y Exportar | Se registra una devolución a un banco y otra a una tarjeta, se revisa el Gasto neto y se carga el Excel en el sistema de contabilidad junto con los otros tipos |
| 8 | Borrar por fechas, con cantidad y suma de los cuatro tipos | Se borra un rango de prueba |

## 13. Cambio de requisitos: comentario
Cada transacción puede llevar un comentario opcional de hasta 100 caracteres, en los cuatro tipos.

- **Modelo:** `Transaccion` añade `Comentario` (texto, vacío por defecto). No hace falta subir la base de datos a la versión 3: una transacción guardada sin el campo se lee con el comentario vacío.
- **Formulario:** campo "Comentario (opcional)" al final, con contador de caracteres. Cambiar de tipo lo conserva, y guardar lo vacía. Se quitan los espacios de los extremos, y solo espacios cuenta como vacío. Si de alguna forma llega a pasar de 100, se muestra un error en lugar de cortarlo sin avisar.
- **Historial:** una línea "Comentario: ..." en la fila, solo si tiene. Los mensajes de guardar, borrar y editar también lo mencionan.
- **Excel:** va en la columna D de las dos filas. El encabezado sigue diciendo "filler", y sin comentario la celda queda vacía. Siempre se guarda como texto: un comentario como `=1+1` no se ejecuta como fórmula.
- **Pendiente:** confirmar que el sistema de contabilidad acepta texto en la columna D. Antes esa columna iba siempre vacía.

## 14. Fase 8: borrar por fechas y borrar todo (aprobado)

**Pantalla "Borrar por fechas" (`/borrar`, enlace en Más):**
- `Desde` y `Hasta`, obligatorias, con la fecha en palabras. Por decisión del usuario traen por defecto el día 1 del mes actual y la fecha de hoy, igual que en Exportar. Antes no traían valor. Se pueden cambiar.
- Cantidad total, y cantidad y suma de cada tipo, con los mismos totales de `ResumenHistorial`.
- Recomienda exportar ese rango, con un botón que abre Exportar con esas fechas ya puestas.
- Confirmación: "¿Seguro que deseas borrar X transacciones?", con la cantidad y la suma de cada tipo repetidas dentro, y no se puede deshacer.
- Usa `BorrarTransaccionesPorRangoAsync`, que ya existe y ya tiene pruebas, y el mensaje dice cuántas se borraron.

**"Borrar todas las transacciones":**
- Botón rojo al final del Historial, debajo de la lista, para alejarlo de los botones de uso diario. Abre su propia pantalla (`/borrar-todo`).
- Esa pantalla muestra la cantidad y la suma de cada tipo de todos los meses, recomienda exportar con un botón que abre Exportar sin fechas, y pide escribir BORRAR.
- La palabra debe estar en mayúsculas; solo se ignoran los espacios de los extremos. El botón final queda gris hasta que la palabra coincide, y entonces se pone rojo.
- Si no hay transacciones, lo dice y no ofrece borrar.
- Al terminar vuelve al Historial con un mensaje verde: "Se borraron N transacciones."

**Almacenamiento:** función nueva `borrarTodasLasTransacciones` en `almacen.js`, que cuenta y vacía en una sola transacción de IndexedDB. Esa transacción solo incluye el almacén `transacciones`, así que no puede tocar el catálogo ni el correo.

**Exportar desde las pantallas de borrado:** Exportar acepta las fechas en la dirección (`exportar?desde=...&hasta=...` o `exportar?todo=1`). Así se reutiliza el correo, Compartir y Descargas sin duplicarlos. Sin esos datos sigue abriendo con el mes actual. Exportar antes de borrar se recomienda, pero no se obliga.

**Regla de colores:** el rojo es una excepción pedida por el usuario a la regla de "activo es azul", solo para los dos botones de "Borrar todas las transacciones". Está anotada en `CLAUDE.md`.

**Cómo se prueba:** se borra un rango de prueba y luego todo, en ambos teléfonos y en modo avión, comprobando que el catálogo y el correo siguen ahí.

**Dos cambios pequeños, junto con la Fase 8:**
- **"Importar cuentas":** la pantalla pasa a llamarse así, y lo que ve el usuario dice "cuentas" en lugar de "catálogo", incluida la plantilla `Cuentas_plantilla.xlsx`. Dentro del código sigue la palabra `Catalogo`, que el usuario no ve.
- **Orden de las cuentas:** `OrdenCuentas` ordena sin distinguir mayúsculas ni acentos y sin depender del idioma del teléfono. La ñ se trata como otra letra, entre la n y la o. Es solo para mostrar: los nombres se guardan y se exportan como están escritos.

## 15. Fase 9: íconos, pulido y prueba completa
- **Ícono:** propio, con el signo de dólar sobre el azul de la app. `theme-color` con ese mismo azul. El ícono de una app ya instalada puede tardar en cambiar, y en el iPhone puede no cambiar sin reinstalar. **Borrar la app del teléfono borra sus datos:** no se debe reinstalar sin exportar antes.
- **Más:** muestra "Protegido contra borrado automático", que dejó de verse al quitar la pantalla de prueba de datos.
- **Limpieza:** sin `HttpClient` ni estilos de la plantilla que nadie usa.
- **Pruebas de fallos:** `tests/navegador/errores.mjs` provoca fallos reales de IndexedDB al leer, guardar y borrar, y comprueba que el mensaje se ve y que los datos no cambian.
- **Prueba completa:** `tests/navegador/completa.mjs` recorre la app de principio a fin, y mide cuánto tarda con muchas transacciones.
- **Prueba en los teléfonos:** de principio a fin. El iPhone tiene pendientes las Fases 4 a 8.

**Límites conocidos, sin cambiar por ahora:**
- En un computador, teclear una fecha por partes puede dar otra fecha (ver la Fase 5). En el Samsung se usa el calendario, que entrega la fecha completa.
- Dentro de un mismo día, las transacciones no siguen el orden en que se registraron, porque se guarda la fecha sin la hora.

## 16. Fase 10: Testamento (aprobado)
**Pantallas:** botón "Ver testamento" en Más, que abre una sola pantalla (`/testamento`) con estos estados: crear PIN, pedir PIN, sin testamento, y ver el testamento con "Importar otro Excel".

**PIN:**
- Se guarda con PBKDF2 y una sal aleatoria, usando `crypto.subtle` del navegador. Así no se puede leer el PIN, y la sal impide usar una tabla de hashes ya calculada. Las iteraciones se fijan midiendo en los teléfonos.
- El PIN no se guarda en la memoria de la app. La pantalla se bloquea al salir de ella o al enviar la app a segundo plano.
- Propuesta: después de 5 intentos fallidos, 30 segundos de espera.
- "Olvidé el PIN": borra el testamento y el PIN en una sola transacción, después de escribir BORRAR. Esto no pide el PIN, porque es la salida para quien lo olvidó.

**Límite de seguridad que el usuario debe conocer:** un PIN de 4 dígitos tiene 10,000 combinaciones. Evita que alguien lo vea con el teléfono en la mano, pero no resiste a quien saque los datos del teléfono y pruebe todas. Sin cifrado, el contenido queda legible para quien inspeccione el navegador. El Excel original también queda fuera de la protección, en Descargas o en el correo.

**Decisiones aprobadas:** el contenido se guarda cifrado con AES-GCM, con una clave derivada del PIN que solo existe en memoria mientras está abierto. Montos en el formato de la app (`$1,250.50`, `-$500.00` en rojo). Espera de 30 segundos después de 5 intentos, que se conserva al recargar. "Olvidé el PIN" pide escribir BORRAR.

**El selector de archivos:** abrirlo envía la app a segundo plano, y eso no debe bloquearla. El botón lleva `data-elige-archivo`, y esa pausa termina al escoger, al cancelar o poco después de volver.

**Importar:**
- `ImportadorTestamento` lee con ClosedXML la primera hoja, columnas A y B, fila por fila, y conserva las filas vacías intermedias.
- Cada fila guarda el texto de A, si A está en negrita, y el valor de B: número, texto o vacío. Se guarda el valor calculado de las fórmulas, como las de los totales.
- Muestra una vista previa antes de reemplazar. Si el archivo tiene errores, no cambia nada.
- La fecha de importación es la fecha del teléfono.

**Almacenamiento:** `VERSION_BD` sube a 3 y añade los almacenes `testamento` y `seguridadTestamento`, sin tocar los datos existentes. Se prueba la migración desde una base real de la versión 2. Las funciones de borrado de transacciones solo incluyen el almacén `transacciones`, y una prueba comprobará que el testamento queda idéntico.

**Mostrar:** tabla de dos columnas en el mismo orden. La primera fila como título, la negrita respetada, las filas vacías como separación y los negativos en rojo. Nombres largos sin desbordar a 320 px.

**Colores:** los botones siguen la regla: azul activo, gris desactivado. El rojo de los negativos es texto, no un botón.

**Pruebas:** archivo de ejemplo ficticio creado por las propias pruebas. Nunca se añade un testamento real al repositorio; `*.xlsx` ya está en `.gitignore`.

**Cómo se prueba:** en ambos teléfonos, crear el PIN, importar un Excel ficticio y comparar con el original, equivocarse de PIN, verlo en modo avión, reemplazarlo, borrar transacciones y confirmar que sigue, y probar "Olvidé el PIN". Cada teléfono tiene su propio PIN y su propia copia.
