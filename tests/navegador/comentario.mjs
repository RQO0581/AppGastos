// Comprueba en un navegador el campo Comentario: registrar, Historial, editar y el Excel, con y sin servidor.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node comentario.mjs <puerto-de-depuración> <url-de-la-app> <conred|sinred> <carpeta-para-descargas-y-capturas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
// La etapa "sinred" se corre después de "conred", en el mismo perfil y con el servidor apagado.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const [puerto, base, etapa, carpeta] = process.argv.slice(2);
const descargas = join(carpeta, 'descargas-comentario');
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
// insertText respeta maxlength, como el teclado de un teléfono. Asignar el valor por código no lo respeta.
const insertar = async (sel, v) => { await evaluar(`document.querySelector(${JSON.stringify(sel)}).focus()`); await dormir(100); await cdp('Input.insertText', { text: v }); await dormir(200); };
const captura = async nombre => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64')); };
const bien = (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };
const irA = async ruta => { await cdp('Page.navigate', { url: base + ruta }); await dormir(300); };
const historial = async mes => { await irA(`historial?mes=${mes}`); return esperar(`!!document.querySelector('#lista')`); };
const leerBd = almacen => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('${almacen}').objectStore('${almacen}').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result)); }; }; })`).then(JSON.parse);
const porMonto = async monto => (await leerBd('transacciones')).find(x => x.monto === monto);
const textoFila = monto => evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes(${JSON.stringify(monto)}))?.innerText?.replace(/\\n+/g,' | ') ?? '(no está)'`);
const editarFila = async monto => { await evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes(${JSON.stringify(monto)})).querySelector('.accion-editar').click()`); await esperar(`!!document.querySelector('#comentario')`); await dormir(200); };
const guardarEdicion = async () => { await tocar('#guardar'); await esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#mensaje')`); return texto('#mensaje'); };

const ORIGEN = [{ nombre: 'Efectivo', tipo: 'Efectivo' }, { nombre: 'Banco-Ejemplo', tipo: 'Banco' }, { nombre: 'Tarjeta-Ejemplo', tipo: 'TarjetaCredito' }];
const GASTO = [{ nombre: 'Telefonos' }];
const INGRESO = [{ nombre: 'Ingreso-Ejemplo' }];
// Una transacción tal como la dejó la versión anterior: sin el campo comentario.
const VIEJA = { id: 'aaaaaaaa-0000-0000-0000-000000000001', tipo: 'Gasto', fecha: '2026-01-10', monto: 99, metodoPago: 'AthMovil', cuentaOrigen: 'Banco-Ejemplo', cuentaDestino: 'Telefonos' };
const sembrar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes'],'readwrite'); for (const s of ['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes']) t.objectStore(s).clear(); ${JSON.stringify(ORIGEN)}.forEach(c => t.objectStore('cuentasOrigen').put(c)); ${JSON.stringify(GASTO)}.forEach(c => t.objectStore('cuentasGasto').put(c)); ${JSON.stringify(INGRESO)}.forEach(c => t.objectStore('cuentasIngreso').put(c)); t.objectStore('transacciones').put(${JSON.stringify(VIEJA)}); t.objectStore('ajustes').put({ clave: 'correo', valor: 'nombre@ejemplo.com' }); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
const registrar = async (tipo, monto, comentario, origen, destino) => {
    await tocar(`#tipo-${tipo}`);
    await fecha('#fecha', '2026-01-15');
    await escribir('#monto', monto);
    if (tipo === 'Gasto') await tocar('#metodo-Efectivo');
    else await elegir('#origen', origen);
    await elegir('#destino', destino);
    if (comentario) await insertar('#comentario', comentario);
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
const desescapar = s => s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&');
const leerFilas = ruta => {
    const zip = leerZip(ruta);
    const compartidos = [...zip['xl/sharedStrings.xml'].matchAll(/<si>.*?<t[^>]*>(.*?)<\/t>.*?<\/si>/gs)].map(m => desescapar(m[1]));
    return [...zip['xl/worksheets/sheet1.xml'].matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map(([, cuerpo]) => {
        const fila = {};
        for (const [, columna, atributos, interior] of cuerpo.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
            const v = interior?.match(/<v>(.*?)<\/v>/)?.[1];
            if (v !== undefined) fila[columna] = atributos.includes('t="s"') ? compartidos[Number(v)] : v;
            if (interior?.includes('<f>')) fila.formula = true;
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
const CIEN = 'x'.repeat(100);

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

    // El campo, en los cuatro tipos.
    bien('se llama Comentario (opcional)', (await texto('label[for="comentario"]')) === 'Comentario (opcional)');
    for (const tipo of ['Gasto', 'Ingreso', 'Transferencia', 'Devolucion']) {
        await tocar(`#tipo-${tipo}`);
        bien(`está en ${tipo}`, (await valor('#comentario')) === '');
    }
    await tocar('#tipo-Gasto');
    bien('el contador empieza en cero', (await texto('#comentario-contador')) === '0 de 100 caracteres', await texto('#comentario-contador'));
    bien('sin desborde a 320', await evaluar('document.documentElement.scrollWidth <= innerWidth'));

    // El máximo: lo que escribe el teléfono se detiene en 100.
    await insertar('#comentario', 'y'.repeat(150));
    bien('el campo no pasa de 100', (await valor('#comentario')).length === 100, String((await valor('#comentario')).length));
    bien('el contador llega a 100', (await texto('#comentario-contador')) === '100 de 100 caracteres', await texto('#comentario-contador'));
    await evaluar(`document.querySelector('#comentario').scrollIntoView({ block: 'center' })`);
    await dormir(100);
    await captura('comentario-formulario.png');
    await escribir('#comentario', '');
    bien('el contador vuelve a cero', (await texto('#comentario-contador')) === '0 de 100 caracteres');

    // Registrar en los cuatro tipos.
    const conGasto = await registrar('Gasto', '11.00', 'Factura de marzo', null, 'Telefonos');
    bien('el mensaje incluye el comentario', conGasto.endsWith('Comentario: Factura de marzo'), conGasto);
    bien('el comentario se vacía después de guardar', (await valor('#comentario')) === '');
    bien('el contador se reinicia', (await texto('#comentario-contador')) === '0 de 100 caracteres');
    await registrar('Ingreso', '22.00', 'Niño & café <bueno> "sí"', 'Ingreso-Ejemplo', 'Banco-Ejemplo');
    await registrar('Transferencia', '33.00', '=1+1', 'Banco-Ejemplo', 'Tarjeta-Ejemplo');
    await registrar('Devolucion', '44.00', CIEN, 'Telefonos', 'Efectivo');
    const sinNada = await registrar('Gasto', '55.00', '', null, 'Telefonos');
    bien('sin comentario, el mensaje no lo menciona', !sinNada.includes('Comentario'), sinNada);
    bien('se guarda', (await porMonto(11)).comentario === 'Factura de marzo');
    bien('se guarda con símbolos', (await porMonto(22)).comentario === 'Niño & café <bueno> "sí"', (await porMonto(22)).comentario);
    bien('se guardan los 100', (await porMonto(44)).comentario === CIEN);
    bien('sin comentario se guarda vacío', (await porMonto(55)).comentario === '');

    // Solo espacios.
    await registrar('Gasto', '66.00', '     ', null, 'Telefonos');
    bien('solo espacios queda sin comentario', (await porMonto(66)).comentario === '');

    // Historial.
    await historial('2026-01');
    bien('se ve en el Historial', (await textoFila('$11.00')).includes('Comentario: Factura de marzo'), await textoFila('$11.00'));
    bien('los símbolos se ven tal cual', (await textoFila('$22.00')).includes('Comentario: Niño & café <bueno> "sí"'), await textoFila('$22.00'));
    bien('sin comentario no sale la línea', !(await textoFila('$55.00')).includes('Comentario'));
    bien('la vieja no tiene la línea', !(await textoFila('$99.00')).includes('Comentario'), await textoFila('$99.00'));
    bien('100 caracteres sin espacios no desbordan', await evaluar('document.documentElement.scrollWidth <= innerWidth'));
    await evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes('$44.00')).scrollIntoView({ block: 'center' })`);
    await dormir(100);
    await captura('comentario-historial.png');

    // Editar.
    await editarFila('$11.00');
    bien('Editar lo muestra', (await valor('#comentario')) === 'Factura de marzo');
    bien('Editar cuenta sus caracteres', (await texto('#comentario-contador')) === '16 de 100 caracteres', await texto('#comentario-contador'));
    await escribir('#comentario', 'Factura corregida');
    const cambiado = await guardarEdicion();
    bien('el mensaje dice el cambio', cambiado === 'Gasto actualizado. Comentario: Factura de marzo → Factura corregida.', cambiado);
    bien('se edita', (await porMonto(11)).comentario === 'Factura corregida');
    bien('el Historial lo actualiza', (await textoFila('$11.00')).includes('Comentario: Factura corregida'));
    await editarFila('$11.00');
    await escribir('#comentario', '');
    const quitado = await guardarEdicion();
    bien('se puede quitar', quitado === 'Gasto actualizado. Comentario: Factura corregida → Sin comentario.', quitado);
    bien('sin él ya no sale en el Historial', !(await textoFila('$11.00')).includes('Comentario'));
    await editarFila('$11.00');
    await escribir('#comentario', 'Factura de marzo');
    await guardarEdicion();

    // Una transacción vieja.
    await editarFila('$99.00');
    bien('la vieja abre sin comentario', (await valor('#comentario')) === '');
    const sinCambios = await guardarEdicion();
    bien('guardar la vieja sin tocarla no cambia nada', sinCambios === 'No hubo cambios.', sinCambios);
    const vieja = await porMonto(99);
    bien('la vieja conserva sus datos', vieja.fecha === '2026-01-10' && vieja.cuentaOrigen === 'Banco-Ejemplo' && vieja.metodoPago === 'AthMovil', JSON.stringify(vieja));
    await editarFila('$99.00');
    await insertar('#comentario', 'Ahora sí');
    const agregado = await guardarEdicion();
    bien('a la vieja se le puede añadir', agregado === 'Gasto actualizado. Comentario: Sin comentario → Ahora sí.', agregado);
    await editarFila('$99.00');
    await escribir('#comentario', '');
    await guardarEdicion();

    // Exportar: columna D, en las dos filas.
    await irA('exportar');
    await esperar(`!!document.querySelector('#quitar-fechas')`);
    await tocar('#quitar-fechas');
    await esperar(`!!document.querySelector('#exportar') && !document.querySelector('#exportar').disabled`);
    const nombre = await exportar();
    bien('descarga el Excel', !!nombre, nombre);
    const filas = leerFilas(join(descargas, nombre));
    bien('el encabezado D sigue diciendo filler', filas[0].D === 'filler' && filas[0].B === 'filler' && filas[0].C === 'filler', JSON.stringify(filas[0]));
    const delMonto = monto => filas.slice(1).filter(f => (f.G ?? f.H) === monto);
    const dos = delMonto('11');
    bien('el comentario va en D de las dos filas', dos.length === 2 && dos.every(f => f.D === 'Factura de marzo'), JSON.stringify(dos));
    bien('B y C siguen vacías', filas.slice(1).every(f => !('B' in f) && !('C' in f)));
    bien('con símbolos', delMonto('22').every(f => f.D === 'Niño & café <bueno> "sí"'), JSON.stringify(delMonto('22')));
    bien('"=1+1" es texto, no una fórmula', delMonto('33').every(f => f.D === '=1+1' && !f.formula), JSON.stringify(delMonto('33')));
    bien('los 100 caracteres', delMonto('44').every(f => f.D === CIEN));
    bien('sin comentario, D queda vacía', delMonto('55').every(f => !('D' in f)), JSON.stringify(delMonto('55')));
    bien('una vieja sin comentario, D queda vacía', delMonto('99').every(f => !('D' in f)), JSON.stringify(delMonto('99')));
    bien('el resto de la fila no cambia', JSON.stringify(dos.map(({ E, F, G, H }) => ({ E, F, G, H }))) === JSON.stringify([{ E: 'Efectivo', F: 'Telefonos', H: '11' }, { E: 'Telefonos', F: 'Efectivo', G: '11' }]), JSON.stringify(dos));

    await dormir(5000); // que el service worker termine de guardar todo en caché
}

if (etapa === 'sinred') {
    await irA('');
    bien('abre sin servidor', await esperar(`!!document.querySelector('#guardar')`));
    const mensaje = await registrar('Gasto', '77.00', 'Sin conexión', null, 'Telefonos');
    bien('registra con comentario sin servidor', mensaje.endsWith('Comentario: Sin conexión'), mensaje);
    await historial('2026-01');
    bien('se ve sin servidor', (await textoFila('$77.00')).includes('Comentario: Sin conexión'));
    await editarFila('$77.00');
    await escribir('#comentario', 'Editado sin conexión');
    bien('se edita sin servidor', (await guardarEdicion()).includes('Sin conexión → Editado sin conexión'));
    await irA('exportar');
    await esperar(`!!document.querySelector('#quitar-fechas')`);
    await tocar('#quitar-fechas');
    await esperar(`!!document.querySelector('#exportar') && !document.querySelector('#exportar').disabled`);
    const nombre = await exportar();
    const filas = leerFilas(join(descargas, nombre)).slice(1).filter(f => (f.G ?? f.H) === '77');
    bien('exporta el comentario sin servidor', filas.length === 2 && filas.every(f => f.D === 'Editado sin conexión'), JSON.stringify(filas));
}

console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
