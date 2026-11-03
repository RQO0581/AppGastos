// Comprueba en un navegador la pantalla de Exportar y revisa el Excel que se descarga, con y sin servidor.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node exportar.mjs <puerto-de-depuración> <url-de-la-app> <conred|sinred> <carpeta-para-descargas-y-capturas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
// La etapa "sinred" se corre después de "conred", en el mismo perfil y con el servidor apagado.
// No puede abrir la hoja de compartir real ni una app de correo: eso hay que verlo en los teléfonos.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const [puerto, base, etapa, carpeta] = process.argv.slice(2);
const descargas = join(carpeta, 'descargas-exportar');
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
const escribirCorreo = async v => { await evaluar(`(() => { const e = document.querySelector('#correo'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(300); };
const desactivado = sel => evaluar(`document.querySelector(${JSON.stringify(sel)}).disabled`);
const colores = sel => evaluar(`(() => { const c = getComputedStyle(document.querySelector(${JSON.stringify(sel)})); return c.backgroundColor; })()`);
const captura = async nombre => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64')); };
const bien = (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };

const leerBd = almacen => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('${almacen}').objectStore('${almacen}').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result)); }; }; })`).then(JSON.parse);
const abrirPorDefecto = async () => { await cdp('Page.navigate', { url: base + 'exportar' }); await dormir(300); return esperar(`!!document.querySelector('#exportar') && !document.querySelector('#exportar').disabled || !!document.querySelector('#sin-transacciones')`); };
// Las transacciones de esta prueba son de enero y febrero: para verlas hay que quitar las fechas por defecto.
const abrir = async () => { await abrirPorDefecto(); await tocar('#quitar-fechas'); return esperar(`!document.querySelector('#exportar').disabled`); };

// Lee un .xlsx sin librerías: un .xlsx es un .zip con archivos XML.
const leerZip = ruta => {
    const datos = readFileSync(ruta);
    const entradas = {};
    let fin = datos.length - 22;
    while (datos.readUInt32LE(fin) !== 0x06054b50) fin--;
    let p = datos.readUInt32LE(fin + 16);
    for (let i = 0; i < datos.readUInt16LE(fin + 10); i++) {
        const metodo = datos.readUInt16LE(p + 10), comprimido = datos.readUInt32LE(p + 20), largoNombre = datos.readUInt16LE(p + 28), largoExtra = datos.readUInt16LE(p + 30), largoComentario = datos.readUInt16LE(p + 32), local = datos.readUInt32LE(p + 42);
        const nombre = datos.toString('utf8', p + 46, p + 46 + largoNombre);
        const inicio = local + 30 + datos.readUInt16LE(local + 26) + datos.readUInt16LE(local + 28);
        const crudo = datos.subarray(inicio, inicio + comprimido);
        // ClosedXML escribe las etiquetas como <x:row>: se quita el prefijo para leerlas igual que <row>.
        entradas[nombre] = (metodo === 8 ? inflateRawSync(crudo) : crudo).toString('utf8').replace(/<(\/?)x:/g, '<$1');
        p += 46 + largoNombre + largoExtra + largoComentario;
    }
    return entradas;
};
const leerFilas = ruta => {
    const zip = leerZip(ruta);
    const compartidos = [...(zip['xl/sharedStrings.xml'] ?? '').matchAll(/<si>.*?<t[^>]*>(.*?)<\/t>.*?<\/si>/gs)].map(m => m[1]);
    const filas = [];
    for (const [, cuerpo] of zip['xl/worksheets/sheet1.xml'].matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
        const fila = {};
        for (const [, columna, atributos, interior] of cuerpo.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
            const v = interior?.match(/<v>(.*?)<\/v>/)?.[1];
            if (v !== undefined) fila[columna] = atributos.includes('t="s"') ? compartidos[Number(v)] : v;
        }
        filas.push(fila);
    }
    return filas;
};
const serial = texto => String(Math.round((Date.parse(texto + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000));
const filaExcel = (fechaTexto, cr, dr, debit, credit) => {
    const f = { A: serial(fechaTexto), E: cr, F: dr };
    if (debit) f.G = debit;
    if (credit) f.H = credit;
    return JSON.stringify(f);
};
const vaciarDescargas = () => { for (const a of readdirSync(descargas)) rmSync(join(descargas, a), { force: true }); };
const esperarDescarga = async () => {
    const limite = Date.now() + 20000;
    while (Date.now() < limite) {
        const listos = readdirSync(descargas).filter(a => a.endsWith('.xlsx'));
        if (listos.length > 0) { await dormir(300); return listos; }
        await dormir(100);
    }
    return [];
};
const FALLO_COMO_ANDROID = `navigator.canShare = () => true; navigator.share = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };`;

const ORIGEN = [{ nombre: 'Efectivo', tipo: 'Efectivo' }, { nombre: 'Banco-Ejemplo', tipo: 'Banco' }, { nombre: 'Tarjeta-Ejemplo', tipo: 'TarjetaCredito' }];
const GASTO = [{ nombre: 'Telefonos' }];
const INGRESO = [{ nombre: 'Ingreso-Ejemplo' }];
const id = n => `aaaaaaaa-0000-0000-0000-00000000000${n}`;
const t = (n, tipo, fecha, monto, metodoPago, cuentaOrigen, cuentaDestino) => ({ id: id(n), tipo, fecha, monto, metodoPago, cuentaOrigen, cuentaDestino });
const TRANSACCIONES = [
    t(1, 'Transferencia', '2026-01-10', 200, null, 'Banco-Ejemplo', 'Tarjeta-Ejemplo'),
    t(2, 'Gasto', '2026-01-01', 104.24, 'AthMovil', 'Banco-Ejemplo', 'Telefonos'),
    t(3, 'Ingreso', '2026-01-05', 500, null, 'Ingreso-Ejemplo', 'Banco-Ejemplo'),
    t(4, 'Gasto', '2026-01-31', 0.1, 'Efectivo', 'Efectivo', 'Telefonos'),
    t(5, 'Gasto', '2026-02-01', 7, 'TarjetaCredito', 'Tarjeta-Ejemplo', 'Telefonos'),
];
const sembrar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes'],'readwrite'); for (const s of ['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes']) t.objectStore(s).clear(); ${JSON.stringify(ORIGEN)}.forEach(c => t.objectStore('cuentasOrigen').put(c)); ${JSON.stringify(GASTO)}.forEach(c => t.objectStore('cuentasGasto').put(c)); ${JSON.stringify(INGRESO)}.forEach(c => t.objectStore('cuentasIngreso').put(c)); ${JSON.stringify(TRANSACCIONES)}.forEach(c => t.objectStore('transacciones').put(c)); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 2, mobile: true });
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });
const hoy = () => evaluar(`(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })()`);

if (etapa === 'conred') {
    await cdp('Page.navigate', { url: base });
    await dormir(300);
    await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`);
    // Sin service worker, un servidor de prueba responde 404 a las direcciones internas como exportar.
    await evaluar(`navigator.serviceWorker.ready.then(r => !!r.active)`);
    await sembrar();
    await abrir();

    // Primera vez.
    bien('el menú marca Exportar', await evaluar(`document.querySelector('#menu-exportar').classList.contains('active')`));
    bien('el menú cabe a 320', await evaluar(`(() => { const m = document.querySelector('.menu-inferior'); return m.scrollWidth <= m.clientWidth && document.documentElement.scrollWidth <= innerWidth; })()`));
    bien('sin rango muestra todas', (await texto('#total-Gasto')).includes('(3)') && (await texto('#total-Gasto')).includes('$111.34'), await texto('#total-Gasto'));
    bien('totales de ingresos', (await texto('#total-Ingreso')).includes('$500.00'));
    bien('totales de transferencias', (await texto('#total-Transferencia')).includes('$200.00'));
    bien('la primera vez el correo está vacío', (await valor('#correo')) === '');
    bien('sin correo, Copiar está gris', await desactivado('#copiar'));
    bien('sin correo, Exportar sigue azul', !(await desactivado('#exportar')) && (await colores('#exportar')) === 'rgb(21, 101, 192)', await colores('#exportar'));
    await captura('7-inicio.png');

    // Sin correo o con correo inválido no exporta.
    vaciarDescargas();
    await tocar('#exportar');
    bien('sin correo lo pide', (await texto('#mensaje')) === 'Falta el correo de destino.', await texto('#mensaje'));
    await escribirCorreo('nombre');
    await tocar('#exportar');
    bien('un correo inválido lo dice', (await texto('#mensaje')).includes('no parece válido'), await texto('#mensaje'));
    bien('un correo inválido no se guarda', (await leerBd('ajustes')).length === 0);
    await dormir(500);
    bien('sin correo válido no descarga', readdirSync(descargas).length === 0);

    // Exportar todo: como en el Samsung, compartir falla y se guarda en Descargas.
    await evaluar(FALLO_COMO_ANDROID);
    await escribirCorreo('nombre@ejemplo.com');
    await tocar('#exportar');
    const archivos = await esperarDescarga();
    await esperar(`!!document.querySelector('#aviso-guardado')`, 5000);
    const nombreTodo = `Gastos_todo_al_${await hoy()}.xlsx`;
    bien('descarga con el nombre correcto', archivos.join() === nombreTodo, archivos.join());
    console.log('mensaje:', await texto('#mensaje'));
    console.log('aviso:', await texto('#aviso-guardado'));
    bien('dice cuántas tiene', (await texto('#mensaje')).includes('5 transacciones'));
    bien('dice el nombre del archivo', (await texto('#aviso-guardado')).includes(nombreTodo));
    bien('avisa que sigue en Descargas', (await texto('#aviso-guardado')).includes('seguirá en Descargas'));
    bien('Abrir correo lleva destinatario y asunto', (await evaluar(`document.querySelector('#abrir-correo').getAttribute('href')`)) === 'mailto:nombre@ejemplo.com?subject=Gastos');
    await evaluar(`document.querySelector('#aviso-guardado').scrollIntoView({ block: 'center' })`);
    await dormir(100);
    await captura('7-guardado.png');

    // El archivo: encabezados, tres tipos, orden, dos filas por transacción.
    const filas = leerFilas(join(descargas, nombreTodo));
    bien('encabezados exactos', JSON.stringify(filas[0]) === JSON.stringify({ A: 'Date', B: 'filler', C: 'filler', D: 'filler', E: 'Account Cr', F: 'Account Dr', G: 'Debit', H: 'Credit' }), JSON.stringify(filas[0]));
    bien('dos filas por transacción', filas.length === 11, String(filas.length));
    const esperado = [
        filaExcel('2026-01-01', 'Banco-Ejemplo', 'Telefonos', null, '104.24'),
        filaExcel('2026-01-01', 'Telefonos', 'Banco-Ejemplo', '104.24', null),
        filaExcel('2026-01-05', 'Ingreso-Ejemplo', 'Banco-Ejemplo', null, '500'),
        filaExcel('2026-01-05', 'Banco-Ejemplo', 'Ingreso-Ejemplo', '500', null),
        filaExcel('2026-01-10', 'Banco-Ejemplo', 'Tarjeta-Ejemplo', null, '200'),
        filaExcel('2026-01-10', 'Tarjeta-Ejemplo', 'Banco-Ejemplo', '200', null),
        filaExcel('2026-01-31', 'Efectivo', 'Telefonos', null, '0.1'),
        filaExcel('2026-01-31', 'Telefonos', 'Efectivo', '0.1', null),
        filaExcel('2026-02-01', 'Tarjeta-Ejemplo', 'Telefonos', null, '7'),
        filaExcel('2026-02-01', 'Telefonos', 'Tarjeta-Ejemplo', '7', null),
    ];
    const obtenidas = filas.slice(1).map(f => JSON.stringify(f));
    bien('cada fila es exacta, con los tres tipos', JSON.stringify(obtenidas) === JSON.stringify(esperado), obtenidas.join(' '));
    const hoja = leerZip(join(descargas, nombreTodo))['xl/styles.xml'];
    bien('la fecha tiene formato m/d/yyyy', /formatCode="m\/d\/yyyy"/.test(hoja) || /numFmtId="14"/.test(hoja));
    bien('los montos tienen dos decimales', /formatCode="0\.00"/.test(hoja) || /numFmtId="2"/.test(hoja));

    // El correo queda guardado y exportar no toca los datos.
    bien('el correo se guardó', JSON.stringify(await leerBd('ajustes')) === JSON.stringify([{ clave: 'correo', valor: 'nombre@ejemplo.com' }]));
    bien('exportar no cambia las transacciones', (await leerBd('transacciones')).length === 5);
    await abrir();
    bien('al volver, el correo aparece escrito', (await valor('#correo')) === 'nombre@ejemplo.com');
    bien('con correo, Copiar está azul', !(await desactivado('#copiar')));

    // Copiar.
    await evaluar(`window.__copiado = ''; navigator.clipboard.writeText = async t => { window.__copiado = t; };`);
    await tocar('#copiar');
    bien('Copiar copia el correo', (await evaluar('window.__copiado')) === 'nombre@ejemplo.com');
    bien('Copiar lo dice', (await texto('#mensaje')) === 'Correo copiado.', await texto('#mensaje'));
    await evaluar(`navigator.clipboard.writeText = async () => { throw new Error('no'); };`);
    await tocar('#copiar');
    bien('si no puede copiar, lo dice', (await texto('#mensaje')).includes('No se pudo copiar'), await texto('#mensaje'));

    // Cambiar el correo.
    await escribirCorreo('otro@ejemplo.com');
    bien('un correo nuevo queda guardado', (await leerBd('ajustes'))[0].valor === 'otro@ejemplo.com');
    await abrir();
    bien('el correo nuevo aparece al volver', (await valor('#correo')) === 'otro@ejemplo.com');

    // Rango de fechas: los dos extremos se incluyen.
    await fecha('#desde', '2026-01-05');
    await fecha('#hasta', '2026-01-31');
    bien('Desde en palabras', (await texto('#desde-palabras')) === 'Lunes, 5 de enero de 2026', await texto('#desde-palabras'));
    bien('Hasta en palabras', (await texto('#hasta-palabras')) === 'Sábado, 31 de enero de 2026', await texto('#hasta-palabras'));
    bien('el rango filtra los gastos', (await texto('#total-Gasto')).includes('(1)') && (await texto('#total-Gasto')).includes('$0.10'), await texto('#total-Gasto'));
    bien('el rango incluye el primer día', (await texto('#total-Ingreso')).includes('(1)'));
    bien('sin fechas numéricas en pantalla', !/\d{1,2}\/\d{1,2}\/\d{4}/.test(await evaluar('document.body.innerText')));
    await captura('7-rango.png');
    vaciarDescargas();
    await evaluar(FALLO_COMO_ANDROID);
    await tocar('#exportar');
    const conRango = await esperarDescarga();
    bien('el nombre lleva el rango', conRango.join() === 'Gastos_2026-01-05_a_2026-01-31.xlsx', conRango.join());
    const filasRango = leerFilas(join(descargas, conRango[0]));
    bien('el archivo solo trae el rango', filasRango.length === 7, String(filasRango.length));
    bien('y las filas son las del rango', JSON.stringify(filasRango.slice(1).map(f => JSON.stringify(f))) === JSON.stringify(esperado.slice(2, 8)));

    // Un solo extremo.
    await fecha('#hasta', '');
    bien('solo Desde filtra', (await texto('#total-Gasto')).includes('(2)'), await texto('#total-Gasto'));
    vaciarDescargas();
    await evaluar(FALLO_COMO_ANDROID);
    await tocar('#exportar');
    bien('nombre con solo Desde', (await esperarDescarga()).join() === 'Gastos_desde_2026-01-05.xlsx');

    // Rango al revés y rango vacío: el botón se ve gris y dice por qué.
    await fecha('#desde', '2026-02-02');
    await fecha('#hasta', '2026-01-01');
    bien('rango al revés lo dice', (await texto('#rango-invalido')).includes('no puede ser después'), await texto('#rango-invalido'));
    bien('rango al revés, botón gris', (await desactivado('#exportar')) && (await colores('#exportar')) === 'rgb(201, 201, 201)', await colores('#exportar'));
    await fecha('#desde', '2030-01-01');
    await fecha('#hasta', '2030-01-31');
    bien('rango vacío lo dice', (await texto('#sin-transacciones')).includes('No hay transacciones'));
    bien('rango vacío, botón gris', await desactivado('#exportar'));

    // Quitar las fechas.
    await tocar('#quitar-fechas');
    await esperar(`!document.querySelector('#exportar').disabled`, 5000);
    bien('Quitar las fechas vacía los campos', (await valor('#desde')) === '' && (await valor('#hasta')) === '');
    bien('Quitar las fechas vuelve a todas', (await texto('#total-Gasto')).includes('(3)'));

    // Compartir funciona, como en el iPhone.
    await evaluar(`window.__compartido = null; navigator.canShare = () => true; navigator.share = async d => { window.__compartido = d.files[0].name + '|' + d.files[0].type + '|' + d.files[0].size; };`);
    vaciarDescargas();
    await tocar('#exportar');
    await esperar(`!!document.querySelector('#mensaje')`, 5000);
    console.log('compartido:', await evaluar('window.__compartido'));
    bien('si comparte, lo dice', (await texto('#mensaje')).startsWith('Excel compartido:'), await texto('#mensaje'));
    bien('si comparte, envía el Excel', (await evaluar('window.__compartido')).startsWith(`${nombreTodo}|application/vnd.openxmlformats`));
    bien('si comparte, no descarga', readdirSync(descargas).length === 0);
    bien('si comparte, no muestra Abrir correo', (await texto('#abrir-correo')) === '(no está)');

    // Cancelar la hoja de compartir.
    await evaluar(`navigator.share = async () => { throw new DOMException('cancelado', 'AbortError'); };`);
    await tocar('#exportar');
    await esperar(`document.querySelector('#mensaje')?.innerText.includes('No se compartió')`, 5000);
    bien('si cancela, lo dice sin parecer un éxito', (await evaluar(`document.querySelector('#mensaje').className`)) === 'aviso', await evaluar(`document.querySelector('#mensaje').className`));
    bien('si cancela, no descarga', readdirSync(descargas).length === 0);

    // Fechas por defecto: del día 1 del mes actual hasta hoy.
    const textoHoy = await hoy();
    const primero = textoHoy.slice(0, 8) + '01';
    const mesAnterior = await evaluar(`(() => { const d = new Date(); const u = new Date(d.getFullYear(), d.getMonth(), 0); return u.getFullYear() + '-' + String(u.getMonth()+1).padStart(2,'0') + '-' + String(u.getDate()).padStart(2,'0'); })()`);
    const poner = lista => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction('transacciones','readwrite'); ${JSON.stringify(lista)}.forEach(c => t.objectStore('transacciones').put(c)); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
    const quitar = ids => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction('transacciones','readwrite'); ${JSON.stringify(ids)}.forEach(c => t.objectStore('transacciones').delete(c)); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
    await abrirPorDefecto();
    bien('sin nada este mes, lo dice', (await texto('#sin-transacciones')).includes('No hay transacciones'));
    bien('sin nada este mes, botón gris', await desactivado('#exportar'));
    bien('y se puede quitar las fechas', (await texto('#quitar-fechas')) === 'Quitar las fechas');
    await poner([t(6, 'Gasto', textoHoy, 12, 'Efectivo', 'Efectivo', 'Telefonos'), t(7, 'Gasto', primero, 13, 'Efectivo', 'Efectivo', 'Telefonos'), t(8, 'Gasto', mesAnterior, 14, 'Efectivo', 'Efectivo', 'Telefonos')]);
    await abrirPorDefecto();
    bien('Desde trae el día 1 del mes', (await valor('#desde')) === primero, await valor('#desde'));
    bien('Hasta trae la fecha de hoy', (await valor('#hasta')) === textoHoy, await valor('#hasta'));
    const [anio, mes, dia] = textoHoy.split('-').map(Number);
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    bien('Desde en palabras', (await texto('#desde-palabras')).endsWith(`, 1 de ${meses[mes - 1]} de ${anio}`), await texto('#desde-palabras'));
    bien('Hasta en palabras', (await texto('#hasta-palabras')).endsWith(`, ${dia} de ${meses[mes - 1]} de ${anio}`), await texto('#hasta-palabras'));
    bien('solo cuenta este mes', (await texto('#total-Gasto')).includes('(2)') &&(await texto('#total-Gasto')).includes('$25.00'), await texto('#total-Gasto'));
    await captura('7-por-defecto.png');
    vaciarDescargas();
    await evaluar(FALLO_COMO_ANDROID);
    await escribirCorreo('nombre@ejemplo.com');
    await tocar('#exportar');
    const porDefecto = await esperarDescarga();
    bien('el nombre lleva el rango por defecto', porDefecto.join() === `Gastos_${primero}_a_${textoHoy}.xlsx`, porDefecto.join());
    const filasDefecto = leerFilas(join(descargas, porDefecto[0])).slice(1);
    bien('el archivo trae solo este mes', filasDefecto.length === 4 && !filasDefecto.some(f => (f.G ?? f.H) === '14'), JSON.stringify(filasDefecto));
    await fecha('#desde', mesAnterior);
    await esperar(`document.querySelector('#total-Gasto')?.innerText.includes('(3)')`, 5000);
    bien('Desde se puede cambiar', (await texto('#total-Gasto')).includes('$39.00'), await texto('#total-Gasto'));
    await fecha('#hasta', mesAnterior);
    await esperar(`document.querySelector('#total-Gasto')?.innerText.includes('(1)')`, 5000);
    bien('Hasta se puede cambiar', (await texto('#total-Gasto')).includes('$14.00'), await texto('#total-Gasto'));
    await abrirPorDefecto();
    bien('al volver, trae otra vez el mes actual', (await valor('#desde')) === primero && (await valor('#hasta')) === textoHoy);
    await quitar([id(6), id(7), id(8)]);

    // Lo temporal ya no está.
    await tocar('#menu-mas');
    await esperar(`location.pathname.endsWith('/mas')`, 5000);
    bien('Más ya no enlaza a la prueba de Excel', (await texto('#ir-prueba-excel')) === '(no está)');
    await cdp('Page.navigate', { url: base + 'prueba-excel' });
    await esperar(`!!document.querySelector('.menu-inferior')`);
    await dormir(300);
    bien('la prueba de Excel ya no abre', (await texto('#enviar')) === '(no está)');

    await dormir(5000); // que el service worker termine de guardar todo en caché
}

if (etapa === 'sinred') {
    bien('abre Exportar sin servidor', await abrir());
    await evaluar(FALLO_COMO_ANDROID);
    vaciarDescargas();
    await tocar('#exportar');
    const listos = await esperarDescarga();
    await esperar(`!!document.querySelector('#aviso-guardado')`, 5000);
    bien('crea el Excel sin servidor', listos.length === 1, listos.join());
    bien('el archivo sin servidor es correcto', leerFilas(join(descargas, listos[0])).length === 11);
    bien('ofrece Abrir correo sin servidor', (await texto('#abrir-correo')) === 'Abrir correo');
}

console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
