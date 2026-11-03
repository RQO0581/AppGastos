// Lo que comparten errores.mjs y completa.mjs: conectarse al navegador, tocar la pantalla y leer el Excel.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export const dormir = ms => new Promise(r => setTimeout(r, ms));

export async function conectar(puerto, base, ancho = 320) {
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
    const sel = s => JSON.stringify(s);

    const p = {
        cdp, evaluar, esperar, consola,
        cerrar: () => ws.close(),
        texto: s => evaluar(`document.querySelector(${sel(s)})?.innerText?.replace(/\\n+/g,' | ') ?? '(no está)'`),
        valor: s => evaluar(`document.querySelector(${sel(s)})?.value ?? '(no está)'`),
        tocar: async s => { await evaluar(`document.querySelector(${sel(s)}).click()`); await dormir(200); },
        fecha: async (s, v) => { await evaluar(`(() => { const e = document.querySelector(${sel(s)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(300); },
        elegir: async (s, v) => { await evaluar(`(() => { const e = document.querySelector(${sel(s)}); e.value = ${JSON.stringify(v)}; if (e.value !== ${JSON.stringify(v)}) throw new Error('la opción no existe: ${v}'); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(150); },
        escribir: async (s, v) => { await evaluar(`(() => { const e = document.querySelector(${sel(s)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await dormir(100); },
        // insertText escribe como el teclado de un teléfono.
        teclear: async (s, v) => { await evaluar(`document.querySelector(${sel(s)}).focus()`); await dormir(100); await cdp('Input.insertText', { text: v }); await dormir(200); },
        opciones: s => evaluar(`JSON.stringify([...document.querySelector(${sel(s)}).options].map(o => o.value).filter(Boolean))`).then(JSON.parse),
        irA: async ruta => { await cdp('Page.navigate', { url: base + ruta }); await dormir(300); },
        leerBd: almacen => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('${almacen}').objectStore('${almacen}').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result)); }; }; })`).then(JSON.parse),
        escribirBd: (almacen, lista, vaciar = false) => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction('${almacen}','readwrite'); const a = t.objectStore('${almacen}'); ${vaciar ? 'a.clear();' : ''} ${JSON.stringify(lista)}.forEach(c => a.put(c)); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`),
        servicioListo: () => evaluar(`navigator.serviceWorker.ready.then(r => !!r.active)`),
        compartirFalla: () => evaluar(`navigator.canShare = () => true; navigator.share = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };`),
    };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('DOM.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: 700, deviceScaleFactor: 2, mobile: true });
    return p;
}

export function crearBien() {
    return (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };
}

// Lee un .xlsx sin librerías: un .xlsx es un .zip con archivos XML, y ClosedXML escribe las etiquetas como <x:row>.
function leerZip(ruta) {
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
}

export function leerFilas(ruta) {
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
}
