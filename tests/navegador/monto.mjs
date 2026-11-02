// Comprueba en un navegador el campo de monto al estilo cajero, tecleando de verdad.
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
    const codigo = c.toUpperCase().charCodeAt(0);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', text: c, key: c, windowsVirtualKeyCode: codigo });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: c, windowsVirtualKeyCode: codigo });
    await dormir(80);
};
const borrar = async () => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await dormir(80);
};
const enfocar = async () => { await evaluar(`document.querySelector('#monto').focus()`); await dormir(100); };
const teclear = async digitos => { await enfocar(); for (const c of digitos) await tecla(c); await dormir(100); };
const vaciar = async () => { await enfocar(); for (let i = 0; i < 14 && (await valor('#monto')) !== ''; i++) await borrar(); };
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
await esperar(`!!document.querySelector('#monto')`, 20000);

// Un solo campo, con teclado de dígitos.
bien('un solo campo de monto', await evaluar(`!document.querySelector('#monto-dolares') && !document.querySelector('#monto-centavos')`));
bien('se llama Monto', (await texto('label[for="monto"]')) === 'Monto');
bien('pide teclado de dígitos', (await evaluar(`document.querySelector('#monto').inputMode`)) === 'numeric');
bien('ningún campo pide teclado decimal', await evaluar(`!document.querySelector('[inputmode="decimal"]')`));
bien('sin desborde a 320', await evaluar('document.documentElement.scrollWidth <= innerWidth'));
bien('empieza vacío', (await valor('#monto')) === '');

// El ejemplo pedido: 2-2-2-2.
await enfocar();
const pasos = [];
for (const c of '2222') { await tecla(c); pasos.push(await valor('#monto')); }
bien('2-2-2-2 entra por la derecha', pasos.join(' ') === '0.02 0.22 2.22 22.22', pasos.join(' '));
await captura('monto-cajero.png');

// Borrar quita el último dígito.
const borrados = [];
for (let i = 0; i < 5; i++) { await borrar(); borrados.push(await valor('#monto') || '(vacío)'); }
bien('borrar quita el último dígito', borrados.join(' ') === '2.22 0.22 0.02 (vacío) (vacío)', borrados.join(' '));

// Lo que no es un dígito no entra.
await teclear('12');
await teclear('a');
bien('una letra no entra', (await valor('#monto')) === '0.12', await valor('#monto'));
await tecla('.');
await tecla('-');
bien('punto y signo no entran', (await valor('#monto')) === '0.12', await valor('#monto'));
await tecla('5');
bien('después de una letra sigue funcionando', (await valor('#monto')) === '1.25', await valor('#monto'));
await vaciar();

// Ceros.
await teclear('0');
bien('un cero solo deja el campo vacío', (await valor('#monto')) === '', await valor('#monto'));
await teclear('007');
bien('los ceros a la izquierda no cuentan', (await valor('#monto')) === '0.07', await valor('#monto'));
await teclear('00');
bien('los ceros a la derecha sí cuentan', (await valor('#monto')) === '7.00', await valor('#monto'));
await vaciar();

// El cursor no se puede quedar en medio.
await teclear('2222');
await evaluar(`document.querySelector('#monto').setSelectionRange(1, 1)`);
await dormir(200);
bien('el cursor vuelve al final', (await evaluar(`document.querySelector('#monto').selectionStart`)) === 5);
await tecla('3');
bien('con el cursor en medio, el dígito entra por la derecha', (await valor('#monto')) === '222.23', await valor('#monto'));
await evaluar(`document.querySelector('#monto').setSelectionRange(0, 2)`);
await dormir(200);
await borrar();
bien('con parte seleccionada, borrar quita el último dígito', (await valor('#monto')) === '22.22', await valor('#monto'));
await vaciar();

// El máximo.
await teclear('9999999999');
bien('llega al máximo', (await valor('#monto')) === '99999999.99', await valor('#monto'));
await tecla('9');
bien('no pasa del máximo', (await valor('#monto')) === '99999999.99', await valor('#monto'));
await vaciar();

// Guardar: el monto es exacto y el campo se vacía.
await teclear('10424');
await completarYGuardar();
bien('guarda el monto', (await texto('#exito')).includes('$104.24'), await texto('#exito'));
bien('el campo se vacía', (await valor('#monto')) === '');
await teclear('5000');
await completarYGuardar();
bien('guarda dólares redondos', (await texto('#exito')).includes('$50.00'), await texto('#exito'));
await teclear('75');
await completarYGuardar();
bien('guarda solo centavos', (await texto('#exito')).includes('$0.75'), await texto('#exito'));

// Sin monto no se guarda.
await tocar('#metodo-Efectivo');
await elegir('#destino', 'Comida');
await tocar('#guardar');
bien('sin monto no guarda', (await texto('#errores')).includes('Falta el monto.'), await texto('#errores'));
await teclear('1205');
bien('el error se quita al escribir', (await texto('#errores')) === '(no está)' || !(await texto('#errores')).includes('monto'), await texto('#errores'));
await tocar('#guardar');
await esperar(`!!document.querySelector('#exito')`, 5000);
bien('lo guardado es exacto', (await montos()) === JSON.stringify([0.75, 12.05, 50, 104.24]), await montos());

// Editar muestra el monto guardado y sigue la misma regla.
const abrirEdicion = async monto => {
    await cdp('Page.navigate', { url: base + 'historial' });
    await esperar(`!!document.querySelector('#lista .accion-editar')`, 20000);
    await evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes(${JSON.stringify(monto)})).querySelector('.accion-editar').click()`);
    await esperar(`!!document.querySelector('#monto')`, 10000);
    await dormir(200);
};
await abrirEdicion('$104.24');
bien('Editar muestra el monto guardado', (await valor('#monto')) === '104.24', await valor('#monto'));
await captura('monto-editar.png');
await tocar('#guardar');
await esperar(`!!document.querySelector('#mensaje')`, 10000);
bien('editar sin tocar el monto no lo cambia', (await texto('#mensaje')) === 'No hubo cambios.', await texto('#mensaje'));

await abrirEdicion('$50.00');
bien('Editar muestra los ceros', (await valor('#monto')) === '50.00', await valor('#monto'));
await enfocar();
await borrar();
bien('borrar al editar quita el último dígito', (await valor('#monto')) === '5.00', await valor('#monto'));
await tecla('1');
bien('escribir al editar entra por la derecha', (await valor('#monto')) === '50.01', await valor('#monto'));
await tocar('#guardar');
await esperar(`!!document.querySelector('#mensaje')`, 10000);
bien('el mensaje dice el cambio', (await texto('#mensaje')) === 'Gasto actualizado. Monto: $50.00 → $50.01.', await texto('#mensaje'));
bien('lo editado es exacto', (await montos()) === JSON.stringify([0.75, 12.05, 50.01, 104.24]), await montos());

console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
