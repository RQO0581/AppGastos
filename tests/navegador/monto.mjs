// Comprueba en un navegador los campos de dólares y centavos, tecleando de verdad.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node monto.mjs <puerto-de-depuración> <url-de-la-app> <carpeta-para-capturas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
// No puede comprobar qué teclado muestra un teléfono real: eso hay que verlo en el iPhone y en el Samsung.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [puerto, base, carpeta] = process.argv.slice(2);
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
const captura = async nombre => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64')); };
const bien = (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };
const tecla = async c => {
    const codigo = c.charCodeAt(0);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', text: c, key: c, windowsVirtualKeyCode: codigo });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: c, windowsVirtualKeyCode: codigo });
    await dormir(40);
};
const teclear = async (sel, digitos) => { await evaluar(`document.querySelector('${sel}').focus()`); await dormir(100); for (const c of digitos) await tecla(c); await dormir(200); };
const vaciar = async sel => { await evaluar(`(() => { const e = document.querySelector('${sel}'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await dormir(100); };
const montos = () => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('transacciones').objectStore('transacciones').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result.map(t => t.monto).sort((a, b) => a - b))); }; }; })`);
const sembrar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones'],'readwrite'); t.objectStore('transacciones').clear(); t.objectStore('cuentasOrigen').put({nombre:'Efectivo',tipo:'Efectivo'}); t.objectStore('cuentasOrigen').put({nombre:'Banco-Ejemplo',tipo:'Banco'}); t.objectStore('cuentasGasto').put({nombre:'Comida'}); t.objectStore('cuentasIngreso').put({nombre:'Ingreso-Ejemplo'}); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
const abrir = async () => { await cdp('Page.navigate', { url: base }); await dormir(300); await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`); };
const completarYGuardar = async () => { await tocar('#metodo-Efectivo'); await elegir('#destino', 'Comida'); await tocar('#guardar'); await esperar(`!!document.querySelector('#exito')`, 5000); };

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 2, mobile: true });
await abrir();
await sembrar();
await abrir();
await esperar(`!!document.querySelector('#monto-dolares')`, 20000);

// Los dos campos piden dígitos, y ya ningún campo depende de una tecla decimal.
bien('dólares pide teclado de dígitos', (await evaluar(`document.querySelector('#monto-dolares').inputMode`)) === 'numeric');
bien('centavos pide teclado de dígitos', (await evaluar(`document.querySelector('#monto-centavos').inputMode`)) === 'numeric');
bien('ningún campo pide teclado decimal', await evaluar(`!document.querySelector('[inputmode="decimal"]')`));
bien('sin desborde a 320', await evaluar('document.documentElement.scrollWidth <= innerWidth'));
bien('sin monto no muestra el resumen', (await texto('#monto-palabras')) === '(no está)');

// Dólares y centavos.
await teclear('#monto-dolares', '104');
bien('solo dólares', (await texto('#monto-palabras')) === 'Monto: $104.00', await texto('#monto-palabras'));
await teclear('#monto-centavos', '2');
bien('un dígito son centavos sueltos', (await texto('#monto-palabras')) === 'Monto: $104.02', await texto('#monto-palabras'));
await teclear('#monto-centavos', '45');
bien('no acepta más de dos dígitos', (await valor('#monto-centavos')) === '24', await valor('#monto-centavos'));
bien('dólares y centavos', (await texto('#monto-palabras')) === 'Monto: $104.24', await texto('#monto-palabras'));
await tocar('#metodo-Efectivo');
await captura('monto-lleno.png');
await elegir('#destino', 'Comida');
await tocar('#guardar');
await esperar(`!!document.querySelector('#exito')`, 5000);
bien('guarda dólares y centavos', (await texto('#exito')).includes('$104.24'), await texto('#exito'));
bien('los dos campos se vacían', (await valor('#monto-dolares')) === '' && (await valor('#monto-centavos')) === '');
bien('el resumen se quita', (await texto('#monto-palabras')) === '(no está)');

// Solo dólares y solo centavos.
await teclear('#monto-dolares', '50');
await completarYGuardar();
bien('solo dólares se guarda', (await texto('#exito')).includes('$50.00'), await texto('#exito'));
await teclear('#monto-centavos', '75');
await completarYGuardar();
bien('solo centavos se guarda', (await texto('#exito')).includes('$0.75'), await texto('#exito'));

// Montos no válidos.
await teclear('#monto-dolares', '0');
await teclear('#monto-centavos', '00');
bien('cero no muestra resumen', (await texto('#monto-palabras')) === '(no está)');
await tocar('#guardar');
bien('cero se rechaza', (await texto('#errores')).includes('mayor que cero'), await texto('#errores'));
await vaciar('#monto-dolares');
await vaciar('#monto-centavos');
bien('al vaciar, pide el monto', (await texto('#errores')).includes('Falta el monto.'), await texto('#errores'));
await teclear('#monto-dolares', 'abc');
bien('letras se rechazan', (await texto('#errores')).includes('no es válido'), await texto('#errores'));
await vaciar('#monto-dolares');
await teclear('#monto-dolares', '12');
await teclear('#monto-centavos', '5');
bien('el error se quita al corregir', !(await texto('#errores')).includes('monto'), await texto('#errores'));
bien('12 con 5 son $12.05, y se ve antes de guardar', (await texto('#monto-palabras')) === 'Monto: $12.05', await texto('#monto-palabras'));
await completarYGuardar();

bien('lo guardado es exacto', (await montos()) === JSON.stringify([0.75, 12.05, 50, 104.24]), await montos());

// Editar separa el monto y lo conserva.
await cdp('Page.navigate', { url: base + 'historial' });
await esperar(`!!document.querySelector('#lista .accion-editar')`, 20000);
await evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes('$104.24')).querySelector('.accion-editar').click()`);
await esperar(`!!document.querySelector('#monto-dolares')`, 10000);
await dormir(200);
bien('Editar separa los dólares', (await valor('#monto-dolares')) === '104', await valor('#monto-dolares'));
bien('Editar separa los centavos', (await valor('#monto-centavos')) === '24', await valor('#monto-centavos'));
bien('Editar muestra el resumen', (await texto('#monto-palabras')) === 'Monto: $104.24');
await captura('monto-editar.png');
await tocar('#guardar');
await esperar(`!!document.querySelector('#mensaje')`, 10000);
bien('editar sin tocar el monto no lo cambia', (await texto('#mensaje')) === 'No hubo cambios.', await texto('#mensaje'));

console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
