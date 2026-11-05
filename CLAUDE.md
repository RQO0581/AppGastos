# AppGastos

Aplicación móvil para registrar cuatro tipos de transacción desde el celular: gastos (efectivo, tarjeta de débito, tarjeta de crédito o ATH Móvil), ingresos, transferencias entre cuentas propias y devoluciones (a un banco, a una tarjeta o a Efectivo). Cada transacción guarda tipo, fecha, monto, cuenta de origen, cuenta de destino y un comentario opcional de hasta 100 caracteres, y los gastos también guardan el método de pago. El catálogo de cuentas se importa desde Excel y las transacciones se exportan a Excel para compartirlas por correo.

Se usa en un Samsung (Android) y en un iPhone (iOS). Se instala con "Agregar a pantalla de inicio" y se publica en GitHub Pages.

`REQUISITOS.md` es la fuente de verdad de los requisitos. Si algo aquí parece contradecirlo, pregunta antes de seguir.

## Reglas

- **Tecnología:** Blazor WebAssembly standalone con PWA, .NET 10, C#.
- **Datos:** solo en el teléfono (IndexedDB). Sin servidor y sin autenticación.
- **Funcionamiento standalone:** la app corre completamente en el celular y no depende de ningún servidor. GitHub Pages solo se usa para la descarga inicial y las actualizaciones. Después de instalada, debe abrir y funcionar en modo avión: registrar, ver historial, editar, borrar, importar el catálogo y crear el Excel. Solo enviar el correo necesita internet, porque lo hace la aplicación de correo del teléfono. Las transacciones, el catálogo y el correo guardado nunca salen del teléfono, excepto en el Excel que el usuario decide compartir.
- **Interfaz:** en español y diseñada para pantalla de celular.
- **Botones y respuesta a las acciones (todas las pantallas):** un botón activo debe verse claramente activo (azul), un botón desactivado debe verse gris, y después de una acción la app debe mostrar claramente qué pasó. **Excepción pedida por el usuario:** los dos botones de "Borrar todas las transacciones" (el del Historial y el de confirmar) son rojos cuando están activos. El de confirmar se ve gris hasta que se escribe BORRAR. Los demás botones, incluidos los de borrar por fechas, siguen en azul.
- **Fechas en pantalla (todas las pantallas):** toda fecha que la app muestre se escribe en palabras en español, por ejemplo "Lunes, 2 de noviembre de 2026", porque cada teléfono muestra los números en su propio orden. El campo de fecha usa el calendario del teléfono y lleva debajo la fecha en palabras. El Excel exportado no cambia: sigue con m/d/aaaa.
- **Exportación a Excel:** el formato debe ser exactamente el de la sección "Exportación" de `REQUISITOS.md`. El comentario va en la columna D de las dos filas, y su encabezado sigue diciendo "filler".
- **Producción:** nunca hacer push a `main` del repositorio AppGastos (producción) sin la autorización explícita del usuario. Los commits locales sí están permitidos. El push a producción lo hace el usuario, en una terminal normal. `.claude/settings.json` y un hook `pre-push` lo bloquean: no intentes saltarte esos bloqueos, ni siquiera con autorización.
- **Sitio de pruebas:** los cambios se prueban en los teléfonos con `scripts/publicar-pruebas.ps1`, que publica en https://appgastos-pruebas.github.io/AppGastos-Pruebas/ . Se puede publicar ahí sin preguntar. Es otro sitio, con sus propios datos, y solo usa datos ficticios.
- **Forma de trabajo:** por fases pequeñas. Al terminar cada fase, espera la aprobación del usuario antes de empezar la siguiente.
- **Aprendizaje:** el usuario quiere aprender mientras se construye la app. Explica en español cada decisión.
