// Comprueba el respaldo de punta a punta: crear, vaciar el teléfono, restaurar y comparar todo.
// Solo usa datos ficticios. BORRA los datos del navegador que use: no la corras en un perfil con datos reales.
// Uso: node respaldo.mjs <puerto-de-depuración> <url-de-la-app> <carpeta-para-descargas-y-capturas>
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conectar, crearBien, dormir } from './ayuda.mjs';

const [puerto, base, carpeta] = process.argv.slice(2);
const descargas = join(carpeta, 'descargas-respaldo');
mkdirSync(descargas, { recursive: true });
const bien = crearBien();
const p = await conectar(puerto, base);
const { cdp, evaluar, esperar, texto, tocar, escribir, irA } = p;

const ALMACENES = ['transacciones', 'cuentasOrigen', 'cuentasGasto', 'cuentasIngreso', 'ajustes', 'testamento', 'seguridadTestamento'];
const PIN = '4821';
const CONTRASENA = 'Clave-Ejemplo-1';
const TESTAMENTO = JSON.stringify({ ejemplo: 'Testamento ficticio', filas: [['Banco-Ejemplo', '100.00']] });

// Todo lo guardado, con los bytes como listas de números, para comparar exactamente.
const volcar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const nombres = ${JSON.stringify(ALMACENES)}; const t = d.transaction(nombres); const salida = {}; nombres.forEach(n => { const g = t.objectStore(n).getAll(); g.onsuccess = () => salida[n] = g.result; }); t.oncomplete = () => { d.close(); const conv = v => v instanceof Uint8Array ? { u8: Array.from(v) } : v instanceof ArrayBuffer ? { ab: Array.from(new Uint8Array(v)) } : Array.isArray(v) ? v.map(conv) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, conv(v[k])])) : v; salida.ajustes = salida.ajustes.filter(a => a.clave !== 'recordarBorrarRespaldo'); res(JSON.stringify(conv(salida))); }; t.onerror = () => rej(t.error); }; })`);
// Como un teléfono nuevo: todos los almacenes vacíos.
const vaciarTodo = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(${JSON.stringify(ALMACENES)}, 'readwrite'); ${JSON.stringify(ALMACENES)}.forEach(n => t.objectStore(n).clear()); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
const recordatorioGuardado = () => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('ajustes').objectStore('ajustes').get('recordarBorrarRespaldo'); g.onsuccess = () => { d.close(); res(g.result?.valor ?? null); }; }; })`);
const deshabilitado = s => evaluar(`document.querySelector(${JSON.stringify(s)}).disabled`);
const fondo = s => evaluar(`getComputedStyle(document.querySelector(${JSON.stringify(s)})).backgroundColor`);
const AZUL = 'rgb(21, 101, 192)';
const GRIS = 'rgb(201, 201, 201)';

// Recarga la app de verdad. La marca distingue la página nueva de la anterior: sin ella, la prueba
// podía encontrar el menú viejo justo antes de que se fuera, y tocar un botón que ya no existía.
// Con el teléfono vacío, la app manda a Importar cuentas al abrir: se espera a que termine de decidir.
const irAMas = async () => {
    await evaluar(`window.__paginaAnterior = true`);
    await irA('');
    if (!(await esperar(`!window.__paginaAnterior && !!document.querySelector('#menu-mas') && !document.body.innerText.includes('Cargando')`, 60000))) throw new Error('la app no cargó');
    await dormir(500);
    await tocar('#menu-mas');
    if (!(await esperar(`!!document.querySelector('#ir-respaldo')`, 15000))) throw new Error('no llegó a Más: ' + await evaluar(`location.href + ' | ' + document.body.innerText.slice(0, 200)`));
};
const irARespaldo = async () => {
    await irAMas();
    await tocar('#ir-respaldo');
    if (!(await esperar(`!!document.querySelector('#crear-respaldo')`, 15000))) throw new Error('no llegó a Respaldo');
};
const subir = async ruta => {
    const { result: { root } } = await cdp('DOM.getDocument', { depth: 0 });
    const { result: { nodeId } } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#archivo-respaldo' });
    await cdp('DOM.setFileInputFiles', { nodeId, files: [ruta] });
    await dormir(500);
};
const abrirCon = async (ruta, contrasena) => {
    await subir(ruta);
    await esperar(`!!document.querySelector('#contrasena-abrir')`, 15000);
    await escribir('#contrasena-abrir', contrasena);
    await tocar('#abrir-respaldo');
    await esperar(`!!document.querySelector('#resumen-respaldo') || !!document.querySelector('#mensaje-restaurar')`, 30000);
};
const captura = async nombre => {
    const { result } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64'));
};

await irA('');
await esperar(`!!document.querySelector('#menu-mas')`, 60000);
await p.servicioListo();
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });
for (const a of readdirSync(descargas)) rmSync(join(descargas, a), { force: true });

// --- Datos ficticios, incluido un testamento con PIN ---
await vaciarTodo();
await p.escribirBd('transacciones', [
    { id: '6f1c2a6e-0d6b-4b8e-9a39-0e4f4b2f8c11', tipo: 'Gasto', fecha: '2026-11-01', monto: 12.5, metodoPago: 'Efectivo', cuentaOrigen: 'Efectivo', cuentaDestino: 'Telefonos', comentario: '' },
    { id: '0a7b1f3c-5d2e-4c11-8f40-6a9d2b7e3c22', tipo: 'Ingreso', fecha: '2026-11-02', monto: 1500.75, metodoPago: null, cuentaOrigen: 'Salario-Ejemplo', cuentaDestino: 'Banco-Ejemplo', comentario: 'Pago ficticio ñandú' },
    { id: '9c3e5a7b-1f2d-4e6a-8b9c-0d1e2f3a4b33', tipo: 'Devolucion', fecha: '2026-11-03', monto: 0.01, metodoPago: null, cuentaOrigen: 'Telefonos', cuentaDestino: 'Tarjeta-Ejemplo', comentario: '' },
]);
await p.escribirBd('cuentasOrigen', [{ nombre: 'Banco-Ejemplo', tipo: 'Banco' }, { nombre: 'Tarjeta-Ejemplo', tipo: 'TarjetaCredito' }, { nombre: 'Efectivo', tipo: 'Efectivo' }]);
await p.escribirBd('cuentasGasto', [{ nombre: 'Telefonos' }, { nombre: 'Comida-Ejemplo' }]);
await p.escribirBd('cuentasIngreso', [{ nombre: 'Salario-Ejemplo' }]);
await p.escribirBd('ajustes', [{ clave: 'correo', valor: 'ejemplo@example.com' }]);
await evaluar(`appGastos.testamento.crearPin(${JSON.stringify(PIN)}).then(() => appGastos.testamento.guardar(${JSON.stringify(TESTAMENTO)})).then(() => appGastos.testamento.bloquear())`);
const original = await volcar();
bien('hay datos ficticios para respaldar', JSON.parse(original).transacciones.length === 3 && JSON.parse(original).testamento.length === 1);

// --- Más tiene el botón ---
await irAMas();
bien('Más tiene el botón Respaldo, en azul', (await texto('#ir-respaldo')) === 'Respaldo' && (await fondo('#ir-respaldo')) === AZUL);
bien('sin restaurar, no hay recordatorio', !(await evaluar(`!!document.querySelector('#recordatorio-respaldo')`)));
await tocar('#ir-respaldo');
await esperar(`!!document.querySelector('#crear-respaldo')`, 15000);

// --- Crear: la contraseña ---
bien('Crear respaldo empieza gris', (await deshabilitado('#crear-respaldo')) && (await fondo('#crear-respaldo')) === GRIS);
await escribir('#contrasena-crear', 'Clave-1');
await escribir('#contrasena-repetir', 'Clave-1');
bien('con 7 caracteres dice cuánto falta', (await texto('#problema-contrasena')) === 'Falta 1 carácter.' && await deshabilitado('#crear-respaldo'));
await escribir('#contrasena-crear', CONTRASENA);
await escribir('#contrasena-repetir', CONTRASENA + 'x');
bien('si no coinciden, lo dice y sigue gris', (await texto('#problema-contrasena')) === 'Las dos contraseñas no coinciden.' && await deshabilitado('#crear-respaldo'));
bien('las contraseñas no se ven', (await evaluar(`document.querySelector('#contrasena-crear').type`)) === 'password');
await tocar('#mostrar-contrasenas');
bien('Mostrar las contraseñas las enseña', (await evaluar(`document.querySelector('#contrasena-crear').type`)) === 'text');
await tocar('#mostrar-contrasenas');
await escribir('#contrasena-repetir', CONTRASENA);
bien('con las dos iguales, Crear respaldo se ve azul', !(await deshabilitado('#crear-respaldo')) && (await fondo('#crear-respaldo')) === AZUL);

// --- Crear: el archivo ---
await tocar('#crear-respaldo');
await esperar(`!!document.querySelector('#mensaje-crear')`, 60000);
let archivo = null;
for (const fin = Date.now() + 20000; Date.now() < fin && !archivo; await dormir(200)) {
    const listos = readdirSync(descargas);
    if (listos.length === 1 && listos[0].endsWith('.json')) archivo = listos[0];
}
bien('descarga el respaldo con su nombre', /^AppGastos-respaldo-\d{4}-\d{2}-\d{2}\.json$/.test(archivo ?? ''), archivo ?? readdirSync(descargas).join());
bien('dice que se guardó en Descargas', (await texto('#mensaje-crear')).includes('Respaldo guardado en Descargas'), await texto('#mensaje-crear'));
bien('después de crear, los campos quedan vacíos', (await p.valor('#contrasena-crear')) === '' && (await p.valor('#contrasena-repetir')) === '');
const rutaRespaldo = join(descargas, archivo);
const crudo = readFileSync(rutaRespaldo, 'utf8');
const sobre = JSON.parse(crudo);
bien('el archivo dice qué es y cómo va cifrado', sobre.formato === 'AppGastos-respaldo' && sobre.version === 1 && sobre.cifrado.algoritmo === 'AES-GCM' && sobre.cifrado.iteraciones === 600000);
const secretos = ['Banco-Ejemplo', 'Telefonos', 'Salario-Ejemplo', 'ejemplo@example.com', 'ficticio', '1500.75', 'Testamento', 'transacciones'];
bien('el archivo no deja leer ningún dato', secretos.every(s => !crudo.includes(s)), secretos.filter(s => crudo.includes(s)).join());
bien('el archivo no guarda la contraseña', !crudo.includes(CONTRASENA));
await captura('respaldo-crear.png');

// --- Un teléfono nuevo: todo vacío. La app abre Importar cuentas, que ofrece restaurar ---
await vaciarTodo();
await evaluar(`window.__paginaAnterior = true`);
await irA('');
bien('con el teléfono vacío abre Importar cuentas', await esperar(`!window.__paginaAnterior && location.pathname.endsWith('/importar') && !!document.querySelector('#ir-respaldo-importar')`, 60000));
bien('y ofrece Restaurar un respaldo, en azul', (await texto('#ir-respaldo-importar')) === 'Restaurar un respaldo' && (await fondo('#ir-respaldo-importar')) === AZUL);
await captura('respaldo-importar.png');
await tocar('#ir-respaldo-importar');
bien('ese botón lleva a Respaldo', await esperar(`!!document.querySelector('#archivo-respaldo')`, 15000));

// Archivos que no son un respaldo.
const rutaOtro = join(descargas, 'otro.json');
writeFileSync(rutaOtro, JSON.stringify({ hola: 'mundo' }));
await abrirCon(rutaOtro, 'cualquiera');
bien('un archivo que no es respaldo se rechaza', (await texto('#mensaje-restaurar')).includes('no es un respaldo de AppGastos'), await texto('#mensaje-restaurar'));
const rutaAlterado = join(descargas, 'alterado.json');
const alterado = { ...sobre, datos: sobre.datos.slice(0, 20) + (sobre.datos[20] === 'A' ? 'B' : 'A') + sobre.datos.slice(21) };
writeFileSync(rutaAlterado, JSON.stringify(alterado));
await abrirCon(rutaAlterado, CONTRASENA);
bien('un archivo alterado se rechaza', (await texto('#mensaje-restaurar')).includes('La contraseña no es correcta, o el archivo se dañó'));
bien('nada de eso cambió el teléfono', JSON.parse(await volcar()).transacciones.length === 0);

// Contraseña equivocada.
await abrirCon(rutaRespaldo, 'Clave-Equivocada');
bien('con otra contraseña no abre', (await texto('#mensaje-restaurar')).includes('La contraseña no es correcta'), await texto('#mensaje-restaurar'));
bien('y deja intentar otra vez', await evaluar(`!!document.querySelector('#contrasena-abrir')`));
bien('el teléfono sigue vacío', JSON.parse(await volcar()).transacciones.length === 0);

// Contraseña correcta.
await escribir('#contrasena-abrir', CONTRASENA);
await tocar('#abrir-respaldo');
await esperar(`!!document.querySelector('#resumen-respaldo')`, 30000);
const resumen = await texto('#resumen-respaldo');
bien('el resumen dice lo que trae', resumen.includes('3 transacciones') && resumen.includes('3 cuentas de origen') && resumen.includes('2 cuentas de gasto') && resumen.includes('1 cuenta de ingreso') && resumen.includes('Correo guardado: sí') && resumen.includes('Testamento: sí'), resumen);
bien('la fecha de creación va en palabras', /Creado el (Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo), \d{1,2} de [a-z]+ de \d{4}, a las \d{2}:\d{2}\./.test(resumen), resumen);
bien('con el teléfono vacío no pide confirmar', !(await evaluar(`!!document.querySelector('#aviso-reemplazo')`)) && !(await deshabilitado('#restaurar')));
await captura('respaldo-resumen.png');

// Cancelar no cambia nada.
await tocar('#cancelar-restaurar');
bien('Cancelar dice que no se restauró nada', (await texto('#mensaje-restaurar')) === 'No se restauró nada.');
bien('y el teléfono sigue vacío', JSON.parse(await volcar()).transacciones.length === 0);

// Restaurar.
await abrirCon(rutaRespaldo, CONTRASENA);
await tocar('#restaurar');
await esperar(`!!document.querySelector('#mensaje-restaurar')`, 30000);
bien('dice qué se restauró', (await texto('#mensaje-restaurar')) === 'Respaldo restaurado: 3 transacciones, 6 cuentas, correo: sí, testamento: sí.', await texto('#mensaje-restaurar'));
bien('todo quedó idéntico, byte por byte', (await volcar()) === original);
bien('recuerda borrar el archivo', await evaluar(`!!document.querySelector('#recordatorio-respaldo')`) && (await texto('#recordatorio-respaldo')).includes('Samsung') && (await texto('#recordatorio-respaldo')).includes('iPhone'));
await captura('respaldo-restaurado.png');
const abierto = await evaluar(`appGastos.testamento.desbloquear(${JSON.stringify(PIN)}).then(r => r.correcto ? appGastos.testamento.leer() : 'PIN rechazado')`);
bien('el testamento se abre con su mismo PIN', abierto === TESTAMENTO, abierto.slice(0, 40));
const otroPin = await evaluar(`appGastos.testamento.desbloquear('0000').then(r => r.correcto)`);
bien('y no con otro PIN', otroPin === false);
await evaluar(`appGastos.testamento.bloquear()`);

// El recordatorio sigue en Más hasta tocar "Ya lo borré".
await irAMas();
bien('Más muestra el recordatorio', await evaluar(`!!document.querySelector('#recordatorio-respaldo')`));
bien('Ya lo borré se ve azul', (await fondo('#ya-lo-borre')) === AZUL);
await captura('respaldo-recordatorio-mas.png');
await irAMas();
bien('sigue al volver a Más', await evaluar(`!!document.querySelector('#recordatorio-respaldo')`));
await tocar('#ya-lo-borre');
bien('Ya lo borré lo quita', !(await evaluar(`!!document.querySelector('#recordatorio-respaldo')`)));
await irAMas();
bien('y no vuelve', !(await evaluar(`!!document.querySelector('#recordatorio-respaldo')`)) && (await recordatorioGuardado()) === false);

// --- Reemplazar datos que ya existen ---
await p.escribirBd('transacciones', [{ id: '1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c44', tipo: 'Gasto', fecha: '2026-11-04', monto: 9.99, metodoPago: 'AthMovil', cuentaOrigen: 'Banco-Ejemplo', cuentaDestino: 'Comida-Ejemplo', comentario: '' }]);
await irARespaldo();
await abrirCon(rutaRespaldo, CONTRASENA);
bien('si el teléfono ya tiene datos, avisa cuántos', (await texto('#aviso-reemplazo')).includes('4 transacciones'), await texto('#aviso-reemplazo'));
bien('y Restaurar sigue gris hasta escribir REEMPLAZAR', (await deshabilitado('#restaurar')) && (await fondo('#restaurar')) === GRIS);
await escribir('#confirmacion', 'reemplazar');
bien('en minúsculas no basta', await deshabilitado('#restaurar'));
await escribir('#confirmacion', 'REEMPLAZAR');
bien('con REEMPLAZAR se ve azul', !(await deshabilitado('#restaurar')) && (await fondo('#restaurar')) === AZUL);
await tocar('#restaurar');
await esperar(`(document.querySelector('#mensaje-restaurar')?.innerText ?? '').startsWith('Respaldo restaurado')`, 30000);
bien('reemplazó todo por lo del respaldo', (await volcar()) === original);

// --- La pantalla cabe en un teléfono pequeño ---
await irARespaldo();
bien('sin desborde a los lados a 320 px', await evaluar('document.documentElement.scrollWidth <= innerWidth'));

console.log('errores en consola:', p.consola.length ? p.consola : 'ninguno');
bien('sin errores en la consola', p.consola.length === 0);
await vaciarTodo();
p.cerrar();
