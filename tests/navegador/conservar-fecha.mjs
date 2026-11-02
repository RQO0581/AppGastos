// Comprueba en un navegador que la fecha escogida se conserva después de guardar.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node conservar-fecha.mjs <puerto-de-depuración> <url-de-la-app>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
const [puerto, base] = process.argv.slice(2);
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
    if (m.method === 'Runtime.exceptionThrown') consola.push(m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consola.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const cdp = (method, params = {}) => new Promise(r => { const id = siguiente++; pendientes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluar = async expr => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const esperar = async (expr, ms = 60000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await evaluar(expr)) return true; await dormir(100); } return false; };
const texto = sel => evaluar(`document.querySelector('${sel}')?.innerText?.replace(/\\n+/g,' | ') ?? '(no está)'`);
const valor = sel => evaluar(`document.querySelector('${sel}')?.value ?? '(no está)'`);
const tocar = async sel => { await evaluar(`document.querySelector('${sel}').click()`); await dormir(200); };
const elegir = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector('${sel}'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(150); };
const escribir = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector('${sel}'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await dormir(100); };
const crudo = () => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('transacciones').objectStore('transacciones').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result.map(t => [t.fecha, t.monto]))); }; }; })`);
const sembrar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones'],'readwrite'); t.objectStore('transacciones').clear(); t.objectStore('cuentasOrigen').put({nombre:'Efectivo',tipo:'Efectivo'}); t.objectStore('cuentasOrigen').put({nombre:'Banco-Ejemplo',tipo:'Banco'}); t.objectStore('cuentasGasto').put({nombre:'Comida'}); t.objectStore('cuentasIngreso').put({nombre:'Ingreso-Ejemplo'}); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
const abrir = async () => { await cdp('Page.navigate', { url: base }); await dormir(300); await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`); };
const hoyJs = () => evaluar(`(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })()`);
const bien = (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };
// IndexedDB los devuelve ordenados por Id, que es aleatorio: el orden no dice nada, así que se ordenan antes de comparar.
const enOrden = gastos => JSON.stringify(gastos.map(g => JSON.stringify(g)).sort());
const gasto = async monto => { await escribir('#monto', monto); await tocar('#metodo-Efectivo'); await elegir('#destino', 'Comida'); await tocar('#guardar'); await dormir(300); };

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await abrir();
await sembrar();
await abrir();
await esperar(`!!document.querySelector('#fecha-palabras')`, 20000);
const hoy = await hoyJs();

await elegir('#fecha', '2026-03-15');
await gasto('1');
console.log('mensaje:', await texto('#exito'));
bien('el campo se queda en la fecha escogida', (await valor('#fecha')) === '2026-03-15', await valor('#fecha'));
bien('las palabras también', (await texto('#fecha-palabras')) === 'Domingo, 15 de marzo de 2026', await texto('#fecha-palabras'));
bien('el monto sí se vacía', (await valor('#monto')) === '');
bien('el método sí se vacía', (await evaluar(`document.querySelector('#metodo-Efectivo').getAttribute('aria-pressed')`)) === 'false');
bien('la cuenta sí se vacía', (await valor('#destino')) === '');

// Un segundo gasto sin tocar la fecha usa la misma.
await gasto('2');
bien('el segundo gasto usa la misma fecha', (await texto('#exito')).includes('15 de marzo'), await texto('#exito'));

// Otra fecha.
await elegir('#fecha', '2026-02-11');
await gasto('3');
bien('una fecha nueva también se queda', (await valor('#fecha')) === '2026-02-11');

// Un cambio de tipo no la toca.
await tocar('#tipo-Ingreso');
bien('cambiar de tipo la conserva', (await valor('#fecha')) === '2026-02-11');
await tocar('#tipo-Gasto');

// El reloj no mueve una fecha escogida, aunque cambie el día.
await evaluar(`(() => { const real = Date.now.bind(Date); Date.now = () => real() + 86400000; })()`);
await dormir(35000);
bien('el cambio de día no mueve la fecha escogida', (await valor('#fecha')) === '2026-02-11', await valor('#fecha'));

// Al abrir otra vez vuelve a hoy.
await abrir();
await esperar(`!!document.querySelector('#fecha-palabras')`, 20000);
bien('al abrir de nuevo vuelve a hoy', (await valor('#fecha')) === hoy, await valor('#fecha'));

// Si se usó hoy, sigue siendo hoy después de guardar y avanza a medianoche.
await gasto('4');
bien('guardar con hoy deja hoy', (await valor('#fecha')) === hoy);
await evaluar(`(() => { const real = Date.now.bind(Date); Date.now = () => real() + 86400000; })()`);
const avanzo = await esperar(`document.querySelector('#fecha').value !== ${JSON.stringify(hoy)}`, 40000);
bien('tras guardar con hoy, la fecha avanza sola', avanzo, await valor('#fecha'));
await abrir();

console.log('guardado:', await crudo());
bien('cada gasto tiene su fecha', enOrden(JSON.parse(await crudo())) === enOrden([['2026-02-11', 3], ['2026-03-15', 1], ['2026-03-15', 2], [hoy, 4]]));
await cdp('Page.navigate', { url: base + 'historial?mes=2026-03' });
await esperar(`!!document.querySelector('#lista')`, 20000);
await dormir(400);
console.log('lista:', await texto('#lista'));
bien('el historial muestra las dos de marzo', (await evaluar(`document.querySelectorAll('#lista .lista-fila').length`)) === 2);
console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
