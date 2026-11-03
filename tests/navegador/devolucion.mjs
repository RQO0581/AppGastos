// Comprueba en un navegador el tipo Devolución: registrar, Historial, editar, borrar y exportar, con y sin servidor.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node devolucion.mjs <puerto-de-depuración> <url-de-la-app> <conred|sinred> <carpeta-para-descargas-y-capturas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
// La etapa "sinred" se corre después de "conred", en el mismo perfil y con el servidor apagado.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const [puerto, base, etapa, carpeta] = process.argv.slice(2);
const descargas = join(carpeta, 'descargas-devolucion');
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
const elegir = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; if (e.value !== ${JSON.stringify(v)}) throw new Error('la opción no existe: ${v}'); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(150); };
const escribir = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await dormir(100); };
const fecha = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(150); };
const opciones = sel => evaluar(`JSON.stringify([...document.querySelector(${JSON.stringify(sel)}).options].map(o => o.value).filter(Boolean))`);
const captura = async nombre => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64')); };
const bien = (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };
const irA = async ruta => { await cdp('Page.navigate', { url: base + ruta }); await dormir(300); };
const historial = async mes => { await irA(`historial?mes=${mes}`); return esperar(`!!document.querySelector('#lista')`); };
const leerBd = almacen => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('${almacen}').objectStore('${almacen}').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result)); }; }; })`).then(JSON.parse);
const textoFila = monto => evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes(${JSON.stringify(monto)}))?.innerText?.replace(/\\n+/g,' | ') ?? '(no está)'`);
const accionFila = async (monto, clase) => { await evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes(${JSON.stringify(monto)})).querySelector(${JSON.stringify(clase)}).click()`); await dormir(200); };

const ORIGEN = [{ nombre: 'Efectivo', tipo: 'Efectivo' }, { nombre: 'Banco-Ejemplo', tipo: 'Banco' }, { nombre: 'Tarjeta-Ejemplo', tipo: 'TarjetaCredito' }];
const GASTO = [{ nombre: 'Telefonos' }, { nombre: 'Comida' }];
const INGRESO = [{ nombre: 'Ingreso-Ejemplo' }];
const t = (n, tipo, fechaTexto, monto, metodoPago, cuentaOrigen, cuentaDestino) => ({ id: `aaaaaaaa-0000-0000-0000-00000000000${n}`, tipo, fecha: fechaTexto, monto, metodoPago, cuentaOrigen, cuentaDestino });
const TRANSACCIONES = [
    t(1, 'Gasto', '2026-01-10', 100, 'AthMovil', 'Banco-Ejemplo', 'Telefonos'),
    t(2, 'Gasto', '2026-01-11', 50, 'Efectivo', 'Efectivo', 'Comida'),
    t(3, 'Ingreso', '2026-01-12', 500, null, 'Ingreso-Ejemplo', 'Banco-Ejemplo'),
    t(4, 'Transferencia', '2026-01-13', 200, null, 'Banco-Ejemplo', 'Tarjeta-Ejemplo'),
];
const sembrar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes'],'readwrite'); for (const s of ['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes']) t.objectStore(s).clear(); ${JSON.stringify(ORIGEN)}.forEach(c => t.objectStore('cuentasOrigen').put(c)); ${JSON.stringify(GASTO)}.forEach(c => t.objectStore('cuentasGasto').put(c)); ${JSON.stringify(INGRESO)}.forEach(c => t.objectStore('cuentasIngreso').put(c)); ${JSON.stringify(TRANSACCIONES)}.forEach(c => t.objectStore('transacciones').put(c)); t.objectStore('ajustes').put({ clave: 'correo', valor: 'nombre@ejemplo.com' }); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
const registrar = async (fechaTexto, monto, origen, destino) => {
    await tocar('#tipo-Devolucion');
    await fecha('#fecha', fechaTexto);
    await escribir('#monto', monto);
    await elegir('#origen', origen);
    await elegir('#destino', destino);
    await tocar('#guardar');
    await esperar(`!!document.querySelector('#exito')`, 5000);
    return texto('#exito');
};

// Lee un .xlsx sin librerías: un .xlsx es un .zip con archivos XML, y ClosedXML escribe las etiquetas como <x:row>.
const leerZip = ruta => {
    const datos = readFileSync(ruta);
    const entradas = {};
    let fin = datos.length - 22;
    while (datos.readUInt32LE(fin) !== 0x06054b50) fin--;
    let p = datos.readUInt32LE(fin + 16);
    for (let i = 0; i < datos.readUInt16LE(fin + 10); i++) {
        const metodo = datos.readUInt16LE(p + 10), comprimido = datos.readUInt32LE(p + 20), a = datos.readUInt16LE(p + 28), b = datos.readUInt16LE(p + 30), c = datos.readUInt16LE(p + 32), local = datos.readUInt32LE(p + 42);
        const nombre = datos.toString('utf8', p + 46, p + 46 + a);
        const inicio = local + 30 + datos.readUInt16LE(local + 26) + datos.readUInt16LE(local + 28);
        const crudo = datos.subarray(inicio, inicio + comprimido);
        entradas[nombre] = (metodo === 8 ? inflateRawSync(crudo) : crudo).toString('utf8').replace(/<(\/?)x:/g, '<$1');
        p += 46 + a + b + c;
    }
    return entradas;
};
const leerFilas = ruta => {
    const zip = leerZip(ruta);
    const compartidos = [...zip['xl/sharedStrings.xml'].matchAll(/<si>.*?<t[^>]*>(.*?)<\/t>.*?<\/si>/gs)].map(m => m[1]);
    return [...zip['xl/worksheets/sheet1.xml'].matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map(([, cuerpo]) => {
        const fila = {};
        for (const [, columna, atributos, interior] of cuerpo.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
            const v = interior?.match(/<v>(.*?)<\/v>/)?.[1];
            if (v !== undefined) fila[columna] = atributos.includes('t="s"') ? compartidos[Number(v)] : v;
        }
        return fila;
    });
};
const exportar = async () => {
    for (const a of readdirSync(descargas)) rmSync(join(descargas, a), { force: true });
    await evaluar(`navigator.canShare = () => true; navigator.share = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };`);
    await tocar('#exportar');
    const limite = Date.now() + 20000;
    while (Date.now() < limite) {
        const listos = readdirSync(descargas).filter(a => a.endsWith('.xlsx'));
        if (listos.length > 0) { await dormir(300); return listos[0]; }
        await dormir(100);
    }
    return null;
};

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 2, mobile: true });
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });

if (etapa === 'conred') {
    await irA('');
    await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`);
    // Sin service worker, un servidor de prueba responde 404 a las direcciones internas como historial?mes=...
    await evaluar(`navigator.serviceWorker.ready.then(r => !!r.active)`);
    await sembrar();
    await irA('');
    await esperar(`!!document.querySelector('#guardar')`);

    // El selector.
    bien('el selector tiene los cuatro tipos', (await texto('#tipos')) === 'Gasto | Ingreso | Transferencia | Devolución', await texto('#tipos'));
    bien('Gasto sigue por defecto', (await evaluar(`document.querySelector('#tipo-Gasto').getAttribute('aria-pressed')`)) === 'true');
    bien('sin desborde a 320', await evaluar('document.documentElement.scrollWidth <= innerWidth'));
    bien('los botones no se recortan', await evaluar(`[...document.querySelectorAll('#tipos .opcion')].every(b => b.scrollWidth <= b.clientWidth)`));
    await captura('devolucion-selector.png');

    // El formulario.
    await tocar('#tipo-Devolucion');
    bien('no pide método de pago', (await texto('#metodos')) === '(no está)');
    bien('etiqueta de origen', (await texto('label[for="origen"]')) === 'Cuenta del gasto original');
    bien('etiqueta de destino', (await texto('label[for="destino"]')) === 'Cuenta a donde vuelve el dinero');
    bien('origen: las cuentas de gasto', (await opciones('#origen')) === JSON.stringify(['Comida', 'Telefonos']), await opciones('#origen'));
    bien('destino: banco, tarjeta y Efectivo', (await opciones('#destino')) === JSON.stringify(['Banco-Ejemplo', 'Efectivo', 'Tarjeta-Ejemplo']), await opciones('#destino'));
    bien('el botón dice Guardar devolución', (await texto('#guardar')) === 'Guardar devolución', await texto('#guardar'));
    await captura('devolucion-formulario.png');
    await tocar('#guardar');
    bien('sin datos, dice qué falta', (await texto('#errores')).includes('Falta: Cuenta del gasto original.'), await texto('#errores'));

    // Registrar a un banco, a una tarjeta y a Efectivo.
    const aTarjeta = await registrar('2026-01-15', '30.00', 'Telefonos', 'Tarjeta-Ejemplo');
    bien('devolución a una tarjeta', aTarjeta === 'Devolución guardada: $30.00. Jueves, 15 de enero de 2026. De Telefonos a Tarjeta-Ejemplo.', aTarjeta);
    bien('el formulario vuelve a Gasto', (await evaluar(`document.querySelector('#tipo-Gasto').getAttribute('aria-pressed')`)) === 'true');
    bien('devolución a un banco', (await registrar('2026-01-16', '10.25', 'Comida', 'Banco-Ejemplo')).includes('$10.25'), await texto('#exito'));
    bien('devolución a Efectivo', (await registrar('2026-01-17', '5.00', 'Comida', 'Efectivo')).includes('De Comida a Efectivo'), await texto('#exito'));
    const guardadas = (await leerBd('transacciones')).filter(x => x.tipo === 'Devolucion');
    bien('se guardan sin método', guardadas.length === 3 && guardadas.every(x => x.metodoPago === null), JSON.stringify(guardadas.map(x => x.metodoPago)));

    // Historial.
    await historial('2026-01');
    const totales = await texto('#totales');
    console.log('totales:', totales);
    bien('líneas en el orden pedido', totales === 'Gastos (2) | $150.00 | Devoluciones (3) | $45.25 | Gasto neto | $104.75 | Ingresos (1) | $500.00 | Transferencias (1) | $200.00', totales);
    const fila = await textoFila('$30.00');
    console.log('fila:', fila);
    bien('la fila dice Devolución con acento', fila.startsWith('Devolución · $30.00'), fila);
    bien('la fila no muestra método', !fila.includes('método'), fila);
    bien('sin desborde en el Historial', await evaluar('document.documentElement.scrollWidth <= innerWidth'));
    await captura('devolucion-historial.png');

    // Gasto neto negativo, en el mes de la devolución.
    await irA('');
    await esperar(`!!document.querySelector('#guardar')`);
    await registrar('2026-03-05', '30.00', 'Telefonos', 'Banco-Ejemplo');
    await historial('2026-03');
    bien('Gasto neto negativo', (await texto('#gasto-neto')) === 'Gasto neto | -$30.00', await texto('#gasto-neto'));
    await captura('devolucion-negativo.png');
    await historial('2026-02');
    bien('un mes sin nada, neto en cero', (await texto('#gasto-neto')) === 'Gasto neto | $0.00', await texto('#gasto-neto'));

    // Editar.
    await historial('2026-01');
    await accionFila('$30.00', '.accion-editar');
    await esperar(`!!document.querySelector('#monto')`);
    await dormir(200);
    bien('Editar carga el tipo', (await evaluar(`document.querySelector('#tipo-Devolucion').getAttribute('aria-pressed')`)) === 'true');
    bien('Editar carga el monto', (await valor('#monto')) === '30.00');
    bien('Editar carga el origen', (await valor('#origen')) === 'Telefonos');
    bien('Editar carga el destino', (await valor('#destino')) === 'Tarjeta-Ejemplo');
    await elegir('#destino', 'Banco-Ejemplo');
    await escribir('#monto', '25.00');
    await tocar('#guardar');
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('el mensaje dice el cambio', (await texto('#mensaje')) === 'Devolución actualizada. Monto: $30.00 → $25.00. Cuenta de destino: Tarjeta-Ejemplo → Banco-Ejemplo.', await texto('#mensaje'));
    bien('el total se actualiza', (await texto('#gasto-neto')) === 'Gasto neto | $109.75', await texto('#gasto-neto'));

    // Cambiar un gasto a devolución al editar.
    await accionFila('$50.00', '.accion-editar');
    await esperar(`!!document.querySelector('#monto')`);
    await dormir(200);
    await tocar('#tipo-Devolucion');
    bien('cambiar de tipo vacía las cuentas', (await valor('#destino')) === '');
    await elegir('#origen', 'Comida');
    await elegir('#destino', 'Efectivo');
    await tocar('#guardar');
    await esperar(`!!document.querySelector('#mensaje')`);
    console.log('cambio de tipo:', await texto('#mensaje'));
    bien('cambiar de tipo lo dice', (await texto('#mensaje')).startsWith('Devolución actualizada. Tipo: Gasto → Devolución.'), await texto('#mensaje'));
    const cambiada = (await leerBd('transacciones')).find(x => x.id === 'aaaaaaaa-0000-0000-0000-000000000002');
    bien('queda sin método', cambiada.tipo === 'Devolucion' && cambiada.metodoPago === null, JSON.stringify(cambiada));
    bien('neto con dos devoluciones más', (await texto('#gasto-neto')) === 'Gasto neto | $9.75', await texto('#gasto-neto'));

    // Borrar.
    await accionFila('$25.00', '.accion-borrar');
    bien('la pregunta dice esta devolución', (await texto('.confirmar-borrado')).includes('¿Seguro que deseas borrar esta devolución de $25.00?'), await texto('.confirmar-borrado'));
    await evaluar(`document.querySelector('.confirmar-si').click()`);
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('dice qué se borró', (await texto('#mensaje')).startsWith('Devolución borrada: $25.00.'), await texto('#mensaje'));
    bien('neto sin la borrada', (await texto('#gasto-neto')) === 'Gasto neto | $34.75', await texto('#gasto-neto'));

    // Exportar.
    await irA('exportar');
    await esperar(`!!document.querySelector('#exportar') && !document.querySelector('#exportar').disabled`);
    bien('Exportar muestra las devoluciones', (await texto('#total-Devolucion')).startsWith('Devoluciones (4)'), await texto('#total-Devolucion'));
    bien('Exportar no muestra Gasto neto', (await texto('#gasto-neto')) === '(no está)');
    await fecha('#desde', '2026-01-17');
    await fecha('#hasta', '2026-01-17');
    await dormir(300);
    const nombre = await exportar();
    bien('descarga el Excel del rango', nombre === 'Gastos_2026-01-17_a_2026-01-17.xlsx', nombre);
    const filas = leerFilas(join(descargas, nombre)).slice(1).map(f => JSON.stringify(f));
    const serial = '46039'; // el 17 de enero de 2026 en Excel
    bien('la fila 1 acredita la cuenta de gasto', filas[0] === JSON.stringify({ A: serial, E: 'Comida', F: 'Efectivo', H: '5' }), filas[0]);
    bien('la fila 2 es la inversa', filas[1] === JSON.stringify({ A: serial, E: 'Efectivo', F: 'Comida', G: '5' }), filas[1]);
    bien('solo esas dos filas', filas.length === 2, String(filas.length));

    await dormir(5000); // que el service worker termine de guardar todo en caché
}

if (etapa === 'sinred') {
    await irA('');
    bien('abre sin servidor', await esperar(`!!document.querySelector('#guardar')`));
    const antes = (await leerBd('transacciones')).length;
    bien('registra sin servidor', (await registrar('2026-04-01', '7.50', 'Telefonos', 'Tarjeta-Ejemplo')).startsWith('Devolución guardada: $7.50.'), await texto('#exito'));
    bien('queda guardada', (await leerBd('transacciones')).length === antes + 1);
    await historial('2026-04');
    bien('el Historial la muestra sin servidor', (await texto('#gasto-neto')) === 'Gasto neto | -$7.50', await texto('#gasto-neto'));
    await irA('exportar');
    await esperar(`!!document.querySelector('#exportar') && !document.querySelector('#exportar').disabled`);
    await fecha('#desde', '2026-04-01');
    await dormir(300);
    const nombre = await exportar();
    bien('exporta sin servidor', nombre === 'Gastos_desde_2026-04-01.xlsx', nombre);
    bien('con la regla de origen y destino', leerFilas(join(descargas, nombre))[1].E === 'Telefonos');
}

console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
