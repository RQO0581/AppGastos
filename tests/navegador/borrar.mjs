// Comprueba en un navegador borrar por fechas y borrar todas las transacciones, con y sin servidor.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node borrar.mjs <puerto-de-depuración> <url-de-la-app> <conred|sinred> <carpeta-para-descargas-y-capturas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
// La etapa "sinred" se corre después de "conred", en el mismo perfil y con el servidor apagado.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [puerto, base, etapa, carpeta] = process.argv.slice(2);
const descargas = join(carpeta, 'descargas-borrar');
mkdirSync(descargas, { recursive: true });
const dormir = ms => new Promise(r => setTimeout(r, ms));
const objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
const ws = new WebSocket(objetivos.find(o => o.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let siguiente = 1;
const pendientes = new Map();
const consola = [];
ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') consola.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description ?? ''));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consola.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
// Con límite: sin él, una espera que nunca termina deja la prueba atascada para siempre, sin fallar.
const cdp = (method, params = {}) => new Promise((r, rechazar) => {
    const id = siguiente++;
    const reloj = setTimeout(() => { pendientes.delete(id); rechazar(new Error(`Sin respuesta en 90 s: ${method} ${params.expression?.slice(0, 120) ?? ''}`)); }, 90000);
    pendientes.set(id, m => { clearTimeout(reloj); r(m); });
    ws.send(JSON.stringify({ id, method, params }));
});
const evaluar = async expr => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'error en evaluar');
    return r.result?.result?.value;
};
const esperar = async (expr, ms = 60000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await evaluar(expr)) return true; await dormir(100); } return false; };
const texto = sel => evaluar(`document.querySelector(${JSON.stringify(sel)})?.innerText?.replace(/\\n+/g,' | ') ?? '(no está)'`);
const valor = sel => evaluar(`document.querySelector(${JSON.stringify(sel)})?.value ?? '(no está)'`);
const tocar = async sel => { await evaluar(`document.querySelector(${JSON.stringify(sel)}).click()`); await dormir(200); };
const fecha = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(300); };
const color = sel => evaluar(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).backgroundColor`);
const desactivado = sel => evaluar(`document.querySelector(${JSON.stringify(sel)}).disabled`);
const vaciarCampo = async sel => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await dormir(100); };
// insertText escribe como el teclado de un teléfono.
const escribir = async (sel, v) => { await vaciarCampo(sel); await evaluar(`document.querySelector(${JSON.stringify(sel)}).focus()`); await dormir(100); await cdp('Input.insertText', { text: v }); await dormir(200); };
const captura = async nombre => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64')); };
const bien = (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };
const irA = async ruta => { await cdp('Page.navigate', { url: base + ruta }); await dormir(300); };
const leerBd = almacen => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('${almacen}').objectStore('${almacen}').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result)); }; }; })`).then(JSON.parse);
const quedan = async () => (await leerBd('transacciones')).map(x => x.id.slice(-2)).sort().join(' ');
const intactos = async () => JSON.stringify([await leerBd('cuentasOrigen'), await leerBd('cuentasGasto'), await leerBd('cuentasIngreso'), await leerBd('ajustes')]);

const ORIGEN = [{ nombre: 'Efectivo', tipo: 'Efectivo' }, { nombre: 'Banco-Ejemplo', tipo: 'Banco' }, { nombre: 'Tarjeta-Ejemplo', tipo: 'TarjetaCredito' }];
const GASTO = [{ nombre: 'Telefonos' }];
const INGRESO = [{ nombre: 'Ingreso-Ejemplo' }];
const t = (n, tipo, fechaTexto, monto, metodoPago, cuentaOrigen, cuentaDestino) => ({ id: `aaaaaaaa-0000-0000-0000-0000000000${n}`, tipo, fecha: fechaTexto, monto, metodoPago, cuentaOrigen, cuentaDestino, comentario: '' });
const TRANSACCIONES = [
    t('01', 'Gasto', '2025-12-31', 1, 'Efectivo', 'Efectivo', 'Telefonos'),
    t('02', 'Gasto', '2026-01-04', 2, 'Efectivo', 'Efectivo', 'Telefonos'),
    t('03', 'Gasto', '2026-01-05', 104.24, 'AthMovil', 'Banco-Ejemplo', 'Telefonos'),
    t('04', 'Ingreso', '2026-01-10', 500, null, 'Ingreso-Ejemplo', 'Banco-Ejemplo'),
    t('05', 'Transferencia', '2026-01-20', 200, null, 'Banco-Ejemplo', 'Tarjeta-Ejemplo'),
    t('06', 'Devolucion', '2026-01-31', 30, null, 'Telefonos', 'Tarjeta-Ejemplo'),
    t('07', 'Gasto', '2026-02-01', 7, 'Efectivo', 'Efectivo', 'Telefonos'),
    t('08', 'Gasto', '2026-11-02', 9, 'Efectivo', 'Efectivo', 'Telefonos'),
];
const sembrar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes'],'readwrite'); for (const s of ['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes']) t.objectStore(s).clear(); ${JSON.stringify(ORIGEN)}.forEach(c => t.objectStore('cuentasOrigen').put(c)); ${JSON.stringify(GASTO)}.forEach(c => t.objectStore('cuentasGasto').put(c)); ${JSON.stringify(INGRESO)}.forEach(c => t.objectStore('cuentasIngreso').put(c)); ${JSON.stringify(TRANSACCIONES)}.forEach(c => t.objectStore('transacciones').put(c)); t.objectStore('ajustes').put({ clave: 'correo', valor: 'nombre@ejemplo.com' }); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
const abrirBorrarTodo = async () => { await irA('borrar-todo'); return esperar(`!!document.querySelector('#confirmar-borrado') || !!document.querySelector('#sin-transacciones')`); };
const borrarListo = `!!document.querySelector('#desde')?.value && (!!document.querySelector('#borrar-rango') || !!document.querySelector('#sin-transacciones'))`;
const abrirBorrar = async () => { await irA('borrar'); return esperar(borrarListo); };
const hoy = () => evaluar(`(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })()`);
const ponerTransacciones = lista => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction('transacciones','readwrite'); ${JSON.stringify(lista)}.forEach(c => t.objectStore('transacciones').put(c)); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
// Mientras Edge guarda el archivo, se llama .crdownload: hay que esperar a que termine antes de leer la carpeta.
const esperarDescarga = async () => { const fin = Date.now() + 20000; while (Date.now() < fin) { const a = readdirSync(descargas); if (a.length > 0 && a.every(n => n.endsWith('.xlsx'))) return; await dormir(100); } };
const ROJO = 'rgb(179, 38, 30)', AZUL = 'rgb(21, 101, 192)', GRIS = 'rgb(201, 201, 201)';

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 2, mobile: true });
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });

if (etapa === 'conred') {
    await irA('');
    await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`);
    // Sin service worker, un servidor de prueba responde 404 a las direcciones internas como borrar-todo.
    await evaluar(`navigator.serviceWorker.ready.then(r => !!r.active)`);
    await sembrar();
    const antes = await intactos();

    // Borrar por fechas: se llega desde Más.
    await irA('mas');
    await esperar(`!!document.querySelector('#ir-borrar')`);
    bien('Más enlaza a Borrar por fechas', (await texto('#ir-borrar')) === 'Borrar por fechas');
    await tocar('#ir-borrar');
    await esperar(borrarListo);

    // Fechas por defecto: del día 1 del mes actual hasta hoy.
    const textoHoy = await hoy();
    const primero = textoHoy.slice(0, 8) + '01';
    const [anio, mes, dia] = textoHoy.split('-').map(Number);
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mesAnterior = await evaluar(`(() => { const d = new Date(); const u = new Date(d.getFullYear(), d.getMonth(), 0); return u.getFullYear() + '-' + String(u.getMonth()+1).padStart(2,'0') + '-' + String(u.getDate()).padStart(2,'0'); })()`);
    bien('Desde trae el día 1 del mes', (await valor('#desde')) === primero, await valor('#desde'));
    bien('Hasta trae la fecha de hoy', (await valor('#hasta')) === textoHoy, await valor('#hasta'));
    bien('Desde en palabras por defecto', (await texto('#desde-palabras')).endsWith(`, 1 de ${meses[mes - 1]} de ${anio}`), await texto('#desde-palabras'));
    bien('Hasta en palabras por defecto', (await texto('#hasta-palabras')).endsWith(`, ${dia} de ${meses[mes - 1]} de ${anio}`), await texto('#hasta-palabras'));
    await captura('8-por-defecto.png');

    // Con el rango por defecto solo cuenta este mes, y el mes anterior no se borra.
    await sembrar();
    await ponerTransacciones([t('09', 'Gasto', textoHoy, 11, 'Efectivo', 'Efectivo', 'Telefonos'), t('10', 'Gasto', primero, 12, 'Efectivo', 'Efectivo', 'Telefonos'), t('11', 'Gasto', mesAnterior, 13, 'Efectivo', 'Efectivo', 'Telefonos')]);
    await abrirBorrar();
    const delMes = TRANSACCIONES.filter(x => x.fecha >= primero && x.fecha <= textoHoy).length + 2;
    bien('el rango por defecto cuenta solo este mes', (await texto('#cantidad-total')) === `En este rango hay ${delMes} transacciones:`, await texto('#cantidad-total'));
    await tocar('#borrar-rango');
    bien('la confirmación dice la cantidad', (await texto('#confirmacion')).includes(`¿Seguro que deseas borrar ${delMes} transacciones?`), await texto('#confirmacion'));
    await tocar('#confirmar-no');
    await tocar('#borrar-rango');
    await tocar('#confirmar-si');
    await esperar(`!!document.querySelector('#mensaje')`, 5000);
    bien('borrar con el rango por defecto dice cuántas', (await texto('#mensaje')) === `Se borraron ${delMes} transacciones.`, await texto('#mensaje'));
    const restantes = (await leerBd('transacciones')).map(x => x.fecha);
    bien('el mes anterior no se borra', restantes.includes(mesAnterior), restantes.join(' '));
    bien('de este mes no queda nada', !restantes.some(f => f >= primero && f <= textoHoy), restantes.join(' '));
    await sembrar();
    await abrirBorrar();

    // Las fechas se pueden cambiar.
    await fecha('#desde', '2026-01-05');
    bien('Desde se puede cambiar', (await valor('#desde')) === '2026-01-05' && (await texto('#desde-palabras')) === 'Lunes, 5 de enero de 2026', await texto('#desde-palabras'));
    await abrirBorrar();
    bien('al volver, trae otra vez el mes actual', (await valor('#desde')) === primero && (await valor('#hasta')) === textoHoy);

    // Sin las dos fechas no ofrece borrar.
    await fecha('#desde', '');
    await fecha('#hasta', '');
    await esperar(`!!document.querySelector('#faltan-fechas')`, 5000);
    bien('sin fechas, las pide', (await texto('#faltan-fechas')).includes('Escoge las fechas'));
    bien('sin fechas, no hay botón de borrar', (await texto('#borrar-rango')) === '(no está)');
    await fecha('#desde', '2026-01-05');
    bien('con una sola fecha, sigue sin ofrecer borrar', (await texto('#borrar-rango')) === '(no está)');
    bien('Desde en palabras', (await texto('#desde-palabras')) === 'Lunes, 5 de enero de 2026', await texto('#desde-palabras'));

    // El rango.
    await fecha('#hasta', '2026-01-31');
    await esperar(`!!document.querySelector('#borrar-rango')`, 5000);
    bien('Hasta en palabras', (await texto('#hasta-palabras')) === 'Sábado, 31 de enero de 2026', await texto('#hasta-palabras'));
    bien('la cantidad incluye los dos extremos', (await texto('#cantidad-total')) === 'En este rango hay 4 transacciones:', await texto('#cantidad-total'));
    bien('total de gastos', (await texto('#total-Gasto')) === 'Gastos (1) | $104.24', await texto('#total-Gasto'));
    bien('total de ingresos', (await texto('#total-Ingreso')) === 'Ingresos (1) | $500.00', await texto('#total-Ingreso'));
    bien('total de transferencias', (await texto('#total-Transferencia')) === 'Transferencias (1) | $200.00', await texto('#total-Transferencia'));
    bien('total de devoluciones', (await texto('#total-Devolucion')) === 'Devoluciones (1) | $30.00', await texto('#total-Devolucion'));
    bien('sin Gasto neto', (await texto('#gasto-neto')) === '(no está)');
    bien('recomienda exportar', (await texto('#recomendacion')).includes('Exporta este rango antes de borrar.'));
    bien('el botón es azul', (await color('#borrar-rango')) === AZUL, await color('#borrar-rango'));
    bien('sin fechas numéricas en pantalla', !/\d{1,2}\/\d{1,2}\/\d{4}/.test(await evaluar('document.body.innerText')));
    bien('sin desborde a 320', await evaluar('document.documentElement.scrollWidth <= innerWidth'));
    await captura('8-rango.png');

    // Exportar ese rango.
    await tocar('#exportar-rango');
    await esperar(`location.pathname.endsWith('/exportar') && !document.querySelector('#exportar')?.disabled`);
    bien('Exportar abre con el mismo Desde', (await valor('#desde')) === '2026-01-05', await valor('#desde'));
    bien('Exportar abre con el mismo Hasta', (await valor('#hasta')) === '2026-01-31', await valor('#hasta'));
    bien('Exportar muestra las mismas', (await texto('#total-Gasto')) === 'Gastos (1) | $104.24');
    for (const a of readdirSync(descargas)) rmSync(join(descargas, a), { force: true });
    await evaluar(`navigator.canShare = () => true; navigator.share = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };`);
    await tocar('#exportar');
    await esperar(`!!document.querySelector('#aviso-guardado')`, 20000);
    await esperarDescarga();
    bien('exporta con el nombre del rango', readdirSync(descargas).join() === 'Gastos_2026-01-05_a_2026-01-31.xlsx', readdirSync(descargas).join());
    await tocar('#menu-exportar');
    await esperar(`document.querySelector('#desde')?.value !== '2026-01-05'`, 5000);
    bien('el menú abre Exportar con el mes actual', (await valor('#desde')).endsWith('-01') && (await valor('#hasta')) !== '2026-01-31', `${await valor('#desde')} a ${await valor('#hasta')}`);
    bien('exportar no borra nada', (await leerBd('transacciones')).length === 8);

    // Rango al revés y rango vacío.
    await abrirBorrar();
    await fecha('#desde', '2026-02-02');
    await fecha('#hasta', '2026-01-01');
    bien('rango al revés lo dice', (await texto('#rango-invalido')).includes('no puede ser después'));
    bien('rango al revés no ofrece borrar', (await texto('#borrar-rango')) === '(no está)');
    await fecha('#desde', '2030-01-01');
    await fecha('#hasta', '2030-01-31');
    await esperar(`!!document.querySelector('#sin-transacciones')`, 5000);
    bien('rango vacío lo dice', (await texto('#sin-transacciones')).includes('No hay transacciones'));
    bien('rango vacío no ofrece borrar', (await texto('#borrar-rango')) === '(no está)');

    // Pregunta antes de borrar.
    await fecha('#desde', '2026-01-05');
    await fecha('#hasta', '2026-01-31');
    await esperar(`!!document.querySelector('#borrar-rango')`, 5000);
    await tocar('#borrar-rango');
    bien('pregunta con la cantidad', (await texto('#confirmacion')).includes('¿Seguro que deseas borrar 4 transacciones?'), await texto('#confirmacion'));
    bien('la confirmación repite los gastos', (await texto('#confirmar-total-Gasto')) === 'Gastos (1) | $104.24', await texto('#confirmar-total-Gasto'));
    bien('la confirmación repite las devoluciones', (await texto('#confirmar-total-Devolucion')) === 'Devoluciones (1) | $30.00', await texto('#confirmar-total-Devolucion'));
    bien('la confirmación repite los ingresos', (await texto('#confirmar-total-Ingreso')) === 'Ingresos (1) | $500.00');
    bien('la confirmación repite las transferencias', (await texto('#confirmar-total-Transferencia')) === 'Transferencias (1) | $200.00');
    bien('sin id repetidos', await evaluar(`(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return new Set(ids).size === ids.length; })()`));
    await evaluar(`document.querySelector('#confirmacion').scrollIntoView({ block: 'center' })`);
    await dormir(100);
    bien('preguntar no borra', (await leerBd('transacciones')).length === 8);
    await captura('8-pregunta.png');
    await tocar('#confirmar-no');
    bien('Cancelar no borra', (await leerBd('transacciones')).length === 8);
    bien('Cancelar quita la pregunta', (await texto('#confirmacion')) === '(no está)');

    // Cambiar las fechas anula la confirmación.
    await tocar('#borrar-rango');
    await fecha('#hasta', '2026-01-20');
    await esperar(`!!document.querySelector('#borrar-rango')`, 5000);
    bien('cambiar las fechas quita la pregunta', (await texto('#confirmacion')) === '(no está)');
    await fecha('#hasta', '2026-01-31');
    await esperar(`!!document.querySelector('#borrar-rango')`, 5000);

    // Borrar, con dos toques seguidos.
    await tocar('#borrar-rango');
    await evaluar(`(() => { const b = document.querySelector('#confirmar-si'); b.click(); b.click(); })()`);
    await esperar(`!!document.querySelector('#mensaje')`, 5000);
    await dormir(500);
    bien('dice cuántas se borraron', (await texto('#mensaje')) === 'Se borraron 4 transacciones.', await texto('#mensaje'));
    bien('los días vecinos no se borran', (await quedan()) === '01 02 07 08', await quedan());
    bien('el catálogo y el correo quedan idénticos', (await intactos()) === antes);
    bien('después, el rango está vacío', (await texto('#sin-transacciones')).includes('No hay transacciones'));
    await captura('8-borrado-rango.png');

    // Una sola transacción, en singular.
    await fecha('#desde', '2026-02-01');
    await fecha('#hasta', '2026-02-01');
    await esperar(`!!document.querySelector('#borrar-rango')`, 5000);
    bien('una sola en singular', (await texto('#cantidad-total')) === 'En este rango hay 1 transacción:', await texto('#cantidad-total'));
    await tocar('#borrar-rango');
    bien('la pregunta en singular', (await texto('#confirmacion')).includes('¿Seguro que deseas borrar 1 transacción?'));
    await tocar('#confirmar-si');
    await esperar(`!!document.querySelector('#mensaje')`, 5000);
    bien('el resultado en singular', (await texto('#mensaje')) === 'Se borró 1 transacción.', await texto('#mensaje'));

    // Borrar todas: el botón rojo del Historial.
    await sembrar();
    await irA('historial?mes=2026-01');
    await esperar(`!!document.querySelector('#borrar-todas')`);
    bien('el botón dice lo pedido', (await texto('#borrar-todas')) === 'Borrar todas las transacciones');
    bien('el botón es rojo', (await color('#borrar-todas')) === ROJO, await color('#borrar-todas'));
    bien('está debajo de la lista', await evaluar(`document.querySelector('#borrar-todas').getBoundingClientRect().top > document.querySelector('#lista').getBoundingClientRect().bottom`));
    await evaluar(`document.querySelector('#borrar-todas').scrollIntoView({ block: 'center' })`);
    await dormir(100);
    await captura('8-boton-rojo.png');
    await irA('historial?mes=2030-05');
    await esperar(`!!document.querySelector('#borrar-todas')`);
    bien('también en un mes vacío', (await color('#borrar-todas')) === ROJO);
    await tocar('#borrar-todas');
    await esperar(`!!document.querySelector('#confirmar-borrado')`);
    bien('tocarlo no borra', (await leerBd('transacciones')).length === 8);

    // La pantalla de confirmar: cantidad y suma por tipo, de todos los meses.
    bien('muestra la cantidad de todos los meses', (await texto('#cantidad-total')) === 'Se borrarán 8 transacciones de todos los meses:', await texto('#cantidad-total'));
    bien('suma de gastos de todos los meses', (await texto('#total-Gasto')) === 'Gastos (5) | $123.24', await texto('#total-Gasto'));
    bien('suma de ingresos', (await texto('#total-Ingreso')) === 'Ingresos (1) | $500.00');
    bien('suma de transferencias', (await texto('#total-Transferencia')) === 'Transferencias (1) | $200.00');
    bien('suma de devoluciones', (await texto('#total-Devolucion')) === 'Devoluciones (1) | $30.00');
    bien('recomienda exportar antes', (await texto('#recomendacion')).includes('Exporta antes de borrar.'));
    bien('sin desborde en la pantalla', await evaluar('document.documentElement.scrollWidth <= innerWidth'));

    // Exportar todo.
    await tocar('#exportar-todo');
    await esperar(`location.pathname.endsWith('/exportar') && !!document.querySelector('#total-Gasto')`);
    bien('Exportar todo abre sin fechas', (await valor('#desde')) === '' && (await valor('#hasta')) === '');
    bien('Exportar todo trae todas', (await texto('#total-Gasto')) === 'Gastos (5) | $123.24', await texto('#total-Gasto'));
    for (const a of readdirSync(descargas)) rmSync(join(descargas, a), { force: true });
    await evaluar(`navigator.canShare = () => true; navigator.share = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };`);
    await tocar('#exportar');
    await esperar(`!!document.querySelector('#aviso-guardado')`, 20000);
    await esperarDescarga();
    bien('exporta todo con su nombre', readdirSync(descargas)[0]?.startsWith('Gastos_todo_al_'), readdirSync(descargas).join());
    await abrirBorrarTodo();

    // La palabra.
    bien('sin escribir, el botón está gris', (await desactivado('#confirmar-borrado')) && (await color('#confirmar-borrado')) === GRIS, await color('#confirmar-borrado'));
    await captura('8-confirmar-gris.png');
    for (const mala of ['borrar', 'Borrar', 'BORRA', 'BORRARR', 'BORRAR TODO', 'SI']) {
        await escribir('#confirmacion', mala);
        bien(`"${mala}" no activa el botón`, (await desactivado('#confirmar-borrado')) && (await color('#confirmar-borrado')) === GRIS);
    }
    await evaluar(`document.querySelector('#confirmar-borrado').click()`);
    await dormir(300);
    bien('con la palabra mal, nada se borra', (await leerBd('transacciones')).length === 8);
    await escribir('#confirmacion', '  BORRAR ');
    bien('con espacios en los extremos sí vale', !(await desactivado('#confirmar-borrado')));
    await escribir('#confirmacion', 'BORRAR');
    bien('con BORRAR, el botón está activo y rojo', !(await desactivado('#confirmar-borrado')) && (await color('#confirmar-borrado')) === ROJO, await color('#confirmar-borrado'));
    await evaluar(`document.querySelector('#confirmar-borrado').scrollIntoView({ block: 'center' })`);
    await dormir(100);
    await captura('8-confirmar-rojo.png');
    bien('Cancelar es azul', (await color('#cancelar')) === AZUL);
    bien('escribir la palabra no borra', (await leerBd('transacciones')).length === 8);

    // Cancelar.
    await tocar('#cancelar');
    await esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#lista')`);
    bien('Cancelar vuelve al Historial', (await leerBd('transacciones')).length === 8);
    bien('Cancelar no deja mensaje', (await texto('#mensaje')) === '(no está)');

    // Borrar todas, con dos toques seguidos.
    await abrirBorrarTodo();
    await escribir('#confirmacion', 'BORRAR');
    await evaluar(`(() => { const b = document.querySelector('#confirmar-borrado'); b.click(); b.click(); })()`);
    await esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#mensaje')`);
    bien('vuelve al Historial y dice cuántas', (await texto('#mensaje')) === 'Se borraron 8 transacciones.', await texto('#mensaje'));
    bien('no queda ninguna', (await leerBd('transacciones')).length === 0);
    bien('el catálogo y el correo quedan idénticos', (await intactos()) === antes);
    await captura('8-borrado-todo.png');

    // Sin transacciones.
    await abrirBorrarTodo();
    bien('sin transacciones, lo dice', (await texto('#sin-transacciones')) === 'No hay transacciones para borrar.', await texto('#sin-transacciones'));
    bien('sin transacciones, no ofrece borrar', (await texto('#confirmar-borrado')) === '(no está)');

    // La app sigue funcionando: el catálogo está ahí para registrar.
    await irA('');
    await esperar(`!!document.querySelector('#guardar')`);
    bien('Registrar sigue abriendo, sin pedir catálogo', (await evaluar('location.pathname')).endsWith('/AppGastos/'));
    await irA('exportar');
    await esperar(`!!document.querySelector('#correo')`);
    await esperar(`document.querySelector('#correo').value !== ''`, 5000);
    bien('el correo sigue escrito en Exportar', (await valor('#correo')) === 'nombre@ejemplo.com', await valor('#correo'));

    await dormir(5000); // que el service worker termine de guardar todo en caché
}

if (etapa === 'sinred') {
    await irA('');
    bien('abre sin servidor', await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`));
    await sembrar();
    const antes = await intactos();
    bien('abre Borrar por fechas sin servidor', await abrirBorrar());
    await fecha('#desde', '2026-01-05');
    await fecha('#hasta', '2026-01-31');
    await esperar(`!!document.querySelector('#borrar-rango')`, 5000);
    await tocar('#borrar-rango');
    await tocar('#confirmar-si');
    await esperar(`!!document.querySelector('#mensaje')`, 5000);
    bien('borra un rango sin servidor', (await texto('#mensaje')) === 'Se borraron 4 transacciones.', await texto('#mensaje'));
    bien('abre Borrar todas sin servidor', await abrirBorrarTodo());
    await escribir('#confirmacion', 'BORRAR');
    await tocar('#confirmar-borrado');
    await esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#mensaje')`);
    bien('borra todas sin servidor', (await texto('#mensaje')) === 'Se borraron 4 transacciones.', await texto('#mensaje'));
    bien('no queda ninguna', (await leerBd('transacciones')).length === 0);
    bien('el catálogo y el correo quedan idénticos', (await intactos()) === antes);
}

console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
