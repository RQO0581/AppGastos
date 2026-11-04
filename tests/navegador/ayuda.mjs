// Lo que comparten errores.mjs y completa.mjs: conectarse al navegador, tocar la pantalla y leer el Excel.
import { readFileSync, writeFileSync } from 'node:fs';
import { crc32, inflateRawSync } from 'node:zlib';

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

// Escribe un .xlsx mínimo sin librerías, como lo guarda Excel: las fórmulas llevan su valor ya calculado.
// Cada fila es { a, b, negritaA, negritaB, formula }.
export function crearExcel(ruta, filas, hojasDeMas = 0) {
    const xml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const celda = (referencia, valor, negrita, formula) => {
        const estilo = negrita ? ' s="1"' : '';
        if (valor === undefined || valor === null) return negrita ? `<c r="${referencia}"${estilo}/>` : '';
        if (typeof valor === 'number') return `<c r="${referencia}"${estilo}>${formula ? `<f>${xml(formula)}</f>` : ''}<v>${valor}</v></c>`;
        return `<c r="${referencia}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
    };
    const filasXml = filas.map((f, i) => `<row r="${i + 1}">${celda(`A${i + 1}`, f.a, f.negritaA)}${celda(`B${i + 1}`, f.b, f.negritaB, f.formula)}</row>`).join('');
    const hoja = c => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${c}</sheetData></worksheet>`;
    const ids = Array.from({ length: hojasDeMas + 1 }, (_, i) => i + 1);
    const partes = {
        '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ids.map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
        '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${ids.map(i => `<sheet name="Hoja${i}" sheetId="${i}" r:id="rId${i}"/>`).join('')}</sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ids.map(i => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
    };
    for (const i of ids) partes[`xl/worksheets/sheet${i}.xml`] = hoja(i === 1 ? filasXml : `<row r="1">${celda('A1', 'Otra hoja')}</row>`);

    // Un .zip sin comprimir: cada archivo con su encabezado, y al final el índice.
    const locales = [], central = [];
    let desplazamiento = 0;
    for (const [nombre, contenido] of Object.entries(partes)) {
        const n = Buffer.from(nombre), d = Buffer.from(contenido), c = crc32(d);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(c, 14); local.writeUInt32LE(d.length, 18); local.writeUInt32LE(d.length, 22); local.writeUInt16LE(n.length, 26);
        const indice = Buffer.alloc(46);
        indice.writeUInt32LE(0x02014b50, 0); indice.writeUInt16LE(20, 4); indice.writeUInt16LE(20, 6); indice.writeUInt32LE(c, 16); indice.writeUInt32LE(d.length, 20); indice.writeUInt32LE(d.length, 24); indice.writeUInt16LE(n.length, 28); indice.writeUInt32LE(desplazamiento, 42);
        locales.push(local, n, d);
        central.push(indice, n);
        desplazamiento += 30 + n.length + d.length;
    }
    const tamanoCentral = central.reduce((t, b) => t + b.length, 0);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(partes).length, 8); fin.writeUInt16LE(Object.keys(partes).length, 10); fin.writeUInt32LE(tamanoCentral, 12); fin.writeUInt32LE(desplazamiento, 16);
    writeFileSync(ruta, Buffer.concat([...locales, ...central, fin]));
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
