// Comprueba en un navegador el nombre "Importar cuentas" y el orden alfabético de las listas de cuentas.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node cuentas.mjs <puerto-de-depuración> <url-de-la-app> <carpeta-para-descargas-y-capturas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const [puerto, base, carpeta] = process.argv.slice(2);
const descargas = join(carpeta, 'descargas-cuentas');
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
const tocar = async sel => { await evaluar(`document.querySelector(${JSON.stringify(sel)}).click()`); await dormir(200); };
const elegir = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; if (e.value !== ${JSON.stringify(v)}) throw new Error('la opción no existe: ${v}'); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(150); };
const escribir = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await dormir(100); };
const opciones = sel => evaluar(`JSON.stringify([...document.querySelector(${JSON.stringify(sel)}).options].map(o => o.value).filter(Boolean))`).then(JSON.parse);
const captura = async nombre => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64')); };
const bien = (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };
const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const irA = async ruta => { await cdp('Page.navigate', { url: base + ruta }); await dormir(300); };
const leerBd = almacen => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('${almacen}').objectStore('${almacen}').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result)); }; }; })`).then(JSON.parse);
const sinLaPalabraVieja = async nombre => {
    const pantalla = await evaluar('document.body.innerText + " " + document.title');
    bien(`${nombre} no dice catálogo`, !/cat[aá]logo/i.test(pantalla));
};

// El orden que se espera, escrito a mano. En la base de datos están guardadas en otro orden.
const BANCOS = ['Árbol-Banco', 'banco-Uno', 'Ñu-Banco', 'oro-Banco', 'ZETA-Banco'];
const TARJETAS = ['Área-Tarjeta', 'visa-Tarjeta'];
const ORIGEN_TODAS = ['Árbol-Banco', 'Área-Tarjeta', 'banco-Uno', 'Efectivo', 'Ñu-Banco', 'oro-Banco', 'visa-Tarjeta', 'ZETA-Banco'];
const GASTOS = ['agua', 'Árbol-Gasto', 'Comida', 'éxito', 'Exito-Dos', 'nube', 'Ñandú', 'Óscar', 'zapatos'];
const INGRESOS = ['ápice', 'Bono', 'sueldo'];
const desordenar = lista => [...lista].sort((a, b) => a.length - b.length || (b < a ? -1 : 1));
const ORIGEN = desordenar(ORIGEN_TODAS).map(nombre => ({ nombre, tipo: nombre === 'Efectivo' ? 'Efectivo' : nombre.includes('Tarjeta') ? 'TarjetaCredito' : 'Banco' }));
const sembrar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes'],'readwrite'); for (const s of ['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes']) t.objectStore(s).clear(); ${JSON.stringify(ORIGEN)}.forEach(c => t.objectStore('cuentasOrigen').put(c)); ${JSON.stringify(desordenar(GASTOS).map(nombre => ({ nombre })))}.forEach(c => t.objectStore('cuentasGasto').put(c)); ${JSON.stringify(desordenar(INGRESOS).map(nombre => ({ nombre })))}.forEach(c => t.objectStore('cuentasIngreso').put(c)); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('DOM.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 2, mobile: true });
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });
for (const a of readdirSync(descargas)) rmSync(join(descargas, a), { force: true });

// Sin cuentas, la app abre Importar cuentas.
await irA('');
await esperar(`!!document.querySelector('#plantilla')`);
// Sin service worker, un servidor de prueba responde 404 a las direcciones internas como importar.
await evaluar(`navigator.serviceWorker.ready.then(r => !!r.active)`);
bien('el título de la pantalla', (await texto('h1')) === 'Importar cuentas', await texto('h1'));
bien('el título de la pestaña', (await evaluar('document.title')) === 'Importar cuentas', await evaluar('document.title'));
bien('sin cuentas, lo dice', (await texto('#catalogo-actual')) === 'Aún no hay cuentas. Importa tu Excel de cuentas para empezar.', await texto('#catalogo-actual'));
await sinLaPalabraVieja('Importar sin cuentas');

// La plantilla se llama como la pantalla.
await evaluar(`navigator.canShare = () => true; navigator.share = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };`);
await tocar('#plantilla');
await esperar(`document.querySelector('#mensaje')?.innerText.includes('Plantilla')`, 20000);
await dormir(800);
bien('la plantilla se llama Cuentas_plantilla', readdirSync(descargas).join() === 'Cuentas_plantilla.xlsx', readdirSync(descargas).join());
bien('el mensaje dice su nombre', (await texto('#mensaje')).includes('Cuentas_plantilla.xlsx'), await texto('#mensaje'));

// Importar: el botón y el mensaje.
const { result: { root } } = await cdp('DOM.getDocument');
const { result: { nodeId } } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#archivo' });
await cdp('DOM.setFileInputFiles', { nodeId, files: [join(descargas, 'Cuentas_plantilla.xlsx')] });
await esperar(`!!document.querySelector('#importar')`, 20000);
bien('el botón dice Importar cuentas', (await texto('#importar')) === 'Importar cuentas', await texto('#importar'));
await sinLaPalabraVieja('La vista previa');
await tocar('#importar');
await esperar(`document.querySelector('#mensaje')?.innerText.includes('importadas')`, 10000);
bien('el mensaje dice cuentas importadas', (await texto('#mensaje')).startsWith('Cuentas importadas:'), await texto('#mensaje'));
bien('la línea de arriba dice cuentas actuales', (await texto('#catalogo-actual')).startsWith('Cuentas actuales:'), await texto('#catalogo-actual'));
await sinLaPalabraVieja('Importar con cuentas');
await captura('cuentas-importar.png');

// El enlace en Más.
await irA('mas');
await esperar(`!!document.querySelector('#ir-importar')`);
bien('Más enlaza a Importar cuentas', (await texto('#ir-importar')) === 'Importar cuentas', await texto('#ir-importar'));
await sinLaPalabraVieja('Más');

// Las listas: cuentas guardadas en otro orden, con mayúsculas y acentos mezclados.
await sembrar();
await irA('');
await esperar(`!!document.querySelector('#guardar')`);
await sinLaPalabraVieja('Registrar');
bien('Gasto, destino', iguales(await opciones('#destino'), GASTOS), JSON.stringify(await opciones('#destino')));
await tocar('#metodo-TarjetaDebito');
bien('Gasto con débito, origen', iguales(await opciones('#origen'), BANCOS), JSON.stringify(await opciones('#origen')));
await tocar('#metodo-AthMovil');
bien('Gasto con ATH Móvil, origen', iguales(await opciones('#origen'), BANCOS));
await tocar('#metodo-TarjetaCredito');
bien('Gasto con crédito, origen', iguales(await opciones('#origen'), TARJETAS), JSON.stringify(await opciones('#origen')));
await evaluar(`document.querySelector('#destino').scrollIntoView({ block: 'center' })`);
await tocar('#tipo-Ingreso');
bien('Ingreso, origen', iguales(await opciones('#origen'), INGRESOS), JSON.stringify(await opciones('#origen')));
bien('Ingreso, destino', iguales(await opciones('#destino'), ORIGEN_TODAS.filter(n => !n.includes('Tarjeta'))), JSON.stringify(await opciones('#destino')));
await tocar('#tipo-Transferencia');
bien('Transferencia, origen', iguales(await opciones('#origen'), ORIGEN_TODAS), JSON.stringify(await opciones('#origen')));
bien('Transferencia, destino', iguales(await opciones('#destino'), ORIGEN_TODAS));
await elegir('#origen', 'banco-Uno');
bien('Transferencia, destino sin el origen', iguales(await opciones('#destino'), ORIGEN_TODAS.filter(n => n !== 'banco-Uno')));
await tocar('#tipo-Devolucion');
bien('Devolución, origen', iguales(await opciones('#origen'), GASTOS), JSON.stringify(await opciones('#origen')));
bien('Devolución, destino', iguales(await opciones('#destino'), ORIGEN_TODAS), JSON.stringify(await opciones('#destino')));

// Se guarda y se exporta como está escrito.
await tocar('#tipo-Gasto');
await escribir('#monto', '12.34');
await tocar('#metodo-TarjetaCredito');
await elegir('#origen', 'Área-Tarjeta');
await elegir('#destino', 'Ñandú');
await tocar('#guardar');
await esperar(`!!document.querySelector('#exito')`, 5000);
bien('el mensaje conserva el nombre', (await texto('#exito')).includes('De Área-Tarjeta a Ñandú'), await texto('#exito'));
const guardada = (await leerBd('transacciones'))[0];
bien('se guarda como está escrito', guardada.cuentaOrigen === 'Área-Tarjeta' && guardada.cuentaDestino === 'Ñandú', JSON.stringify(guardada));
bien('el orden no cambia lo guardado en las cuentas', (await leerBd('cuentasGasto')).some(c => c.nombre === 'Exito-Dos') && (await leerBd('cuentasGasto')).some(c => c.nombre === 'éxito'));

await irA('exportar');
await esperar(`!!document.querySelector('#exportar') && !document.querySelector('#exportar').disabled`);
await evaluar(`(() => { const e = document.querySelector('#correo'); e.value = 'nombre@ejemplo.com'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await dormir(200);
for (const a of readdirSync(descargas)) rmSync(join(descargas, a), { force: true });
await evaluar(`navigator.canShare = () => true; navigator.share = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };`);
await tocar('#exportar');
await esperar(`!!document.querySelector('#aviso-guardado')`, 20000);
await dormir(500);
const crudo = readFileSync(join(descargas, readdirSync(descargas)[0]));
let fin = crudo.length - 22;
while (crudo.readUInt32LE(fin) !== 0x06054b50) fin--;
let p = crudo.readUInt32LE(fin + 16), compartidos = '';
for (let i = 0; i < crudo.readUInt16LE(fin + 10); i++) {
    const metodo = crudo.readUInt16LE(p + 10), comprimido = crudo.readUInt32LE(p + 20), a = crudo.readUInt16LE(p + 28), b = crudo.readUInt16LE(p + 30), c = crudo.readUInt16LE(p + 32), local = crudo.readUInt32LE(p + 42);
    const nombre = crudo.toString('utf8', p + 46, p + 46 + a);
    const inicio = local + 30 + crudo.readUInt16LE(local + 26) + crudo.readUInt16LE(local + 28);
    const datos = crudo.subarray(inicio, inicio + comprimido);
    if (nombre === 'xl/sharedStrings.xml') compartidos = (metodo === 8 ? inflateRawSync(datos) : datos).toString('utf8');
    p += 46 + a + b + c;
}
bien('el Excel los lleva como están escritos', compartidos.includes('>Área-Tarjeta<') && compartidos.includes('>Ñandú<'));
await sinLaPalabraVieja('Exportar');

// El resto de las pantallas.
await irA('borrar');
await esperar(`!!document.querySelector('#faltan-fechas')`);
await sinLaPalabraVieja('Borrar por fechas');
await irA('borrar-todo');
await esperar(`!!document.querySelector('#confirmar-borrado')`);
await sinLaPalabraVieja('Borrar todas');
await irA('historial');
await esperar(`!!document.querySelector('#lista')`);
await sinLaPalabraVieja('Historial');

console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
