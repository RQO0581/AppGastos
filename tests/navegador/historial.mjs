// Comprueba en un navegador el Historial, Editar y Borrar, con y sin servidor.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node historial.mjs <puerto-de-depuración> <url-de-la-app> <conred|sinred> <carpeta-para-capturas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
// La etapa "sinred" se corre después de "conred", en el mismo perfil y con el servidor apagado.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [puerto, base, etapa, carpeta] = process.argv.slice(2);
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
const cdp = (method, params = {}) => new Promise(r => { const id = siguiente++; pendientes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluar = async expr => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'error en evaluar');
    return r.result?.result?.value;
};
const esperar = async (expr, ms = 60000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await evaluar(expr)) return true; await dormir(100); } return false; };
const texto = sel => evaluar(`document.querySelector(${JSON.stringify(sel)})?.innerText?.replace(/\\n+/g,' | ') ?? '(no está)'`);
const valor = sel => evaluar(`document.querySelector(${JSON.stringify(sel)})?.value ?? '(no está)'`);
const tocar = async sel => { await evaluar(`document.querySelector(${JSON.stringify(sel)}).click()`); await dormir(200); };
const elegir = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; if (e.value !== ${JSON.stringify(v)}) throw new Error('la opción no existe: ${v}'); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await dormir(150); };
const escribir = async (sel, v) => { await evaluar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await dormir(100); };
const escribirMonto = async texto => { await escribir('#monto', texto.includes('.') ? texto : texto + '.00'); };
const valorMonto = () => valor('#monto');
const captura = async nombre => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64')); };
const bien = (nombre, ok, extra = '') => { console.log(`${ok ? 'BIEN ' : 'FALLA'} ${nombre}${extra ? ' -> ' + extra : ''}`); if (!ok) process.exitCode = 1; };

const leerBd = almacen => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('${almacen}').objectStore('${almacen}').getAll(); g.onsuccess = () => { d.close(); res(JSON.stringify(g.result)); }; }; })`).then(JSON.parse);
const transaccion = async id => (await leerBd('transacciones')).find(t => t.id === id);
const sembrar = () => evaluar(`new Promise((res, rej) => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const t = d.transaction(['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones','ajustes'],'readwrite'); for (const s of ['cuentasOrigen','cuentasGasto','cuentasIngreso','transacciones']) t.objectStore(s).clear(); ${JSON.stringify(ORIGEN)}.forEach(c => t.objectStore('cuentasOrigen').put(c)); ${JSON.stringify(GASTO)}.forEach(c => t.objectStore('cuentasGasto').put(c)); ${JSON.stringify(INGRESO)}.forEach(c => t.objectStore('cuentasIngreso').put(c)); ${JSON.stringify(TRANSACCIONES)}.forEach(c => t.objectStore('transacciones').put(c)); t.objectStore('ajustes').put({ clave: 'correo', valor: 'nombre@ejemplo.com' }); t.oncomplete = () => { d.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
const irA = async ruta => { await cdp('Page.navigate', { url: base + ruta }); await dormir(300); };
const historial = async mes => { await irA(`historial?mes=${mes}`); return esperar(`!!document.querySelector('#lista')`); };
const fila = id => `[data-id="${id}"]`;
const filas = () => evaluar(`document.querySelectorAll('#lista .lista-fila').length`);
const abrirEdicion = async id => { await tocar(`${fila(id)} .accion-editar`); return esperar(`!!document.querySelector('#guardar')`); };
const guardarYVolver = async () => { await tocar('#guardar'); return esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#lista')`); };

const ORIGEN = [
    { nombre: 'Efectivo', tipo: 'Efectivo' },
    { nombre: 'Banco-Ejemplo', tipo: 'Banco' },
    { nombre: 'Ahorros-Ejemplo', tipo: 'Banco' },
    { nombre: 'Tarjeta-Ejemplo', tipo: 'TarjetaCredito' },
];
const GASTO = [{ nombre: 'Telefonos' }, { nombre: 'Comida' }];
const INGRESO = [{ nombre: 'Ingreso-Ejemplo' }];
const id = n => `aaaaaaaa-0000-0000-0000-00000000000${n}`;
const t = (n, tipo, fecha, monto, metodoPago, cuentaOrigen, cuentaDestino) => ({ id: id(n), tipo, fecha, monto, metodoPago, cuentaOrigen, cuentaDestino });
const TRANSACCIONES = [
    t(1, 'Gasto', '2026-01-15', 104.24, 'AthMovil', 'Banco-Ejemplo', 'Telefonos'),
    t(2, 'Gasto', '2026-01-31', 0.1, 'Efectivo', 'Efectivo', 'Comida'),
    t(3, 'Ingreso', '2026-01-05', 500, null, 'Ingreso-Ejemplo', 'Banco-Ejemplo'),
    t(4, 'Transferencia', '2026-01-10', 200, null, 'Banco-Ejemplo', 'Tarjeta-Ejemplo'),
    t(5, 'Gasto', '2026-02-01', 7, 'TarjetaDebito', 'Banco-Viejo', 'Gasto-Viejo'),
    t(6, 'Gasto', '2025-12-31', 9, 'Efectivo', 'Efectivo', 'Comida'),
];

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });

if (etapa === 'conred') {
    await irA('');
    await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`, 60000);
    // Sin service worker, un servidor de prueba responde 404 a las direcciones internas como historial?mes=...
    await evaluar(`navigator.serviceWorker.ready.then(r => !!r.active)`);
    await sembrar();

    // Lista, orden, límites del mes y totales.
    await historial('2026-01');
    bien('muestra el mes', (await texto('#mes-actual')) === 'Enero de 2026', await texto('#mes-actual'));
    bien('solo las 4 de enero, ni diciembre ni febrero', (await filas()) === 4, String(await filas()));
    const orden = await evaluar(`JSON.stringify([...document.querySelectorAll('#lista .lista-fila')].map(f => f.dataset.id.slice(-1)))`);
    bien('la más reciente primero', orden === JSON.stringify(['2', '1', '4', '3']), orden);
    const totales = await texto('#totales');
    console.log('totales:', totales);
    bien('total de gastos', (await texto('#total-Gasto')).includes('(2)') && (await texto('#total-Gasto')).includes('$104.34'), await texto('#total-Gasto'));
    bien('total de ingresos', (await texto('#total-Ingreso')).includes('(1)') && (await texto('#total-Ingreso')).includes('$500.00'));
    bien('total de transferencias aparte', (await texto('#total-Transferencia')).includes('(1)') && (await texto('#total-Transferencia')).includes('$200.00'));
    console.log('fila de gasto:', await texto(fila(id(1))));
    bien('el gasto muestra el método', (await texto(fila(id(1)))).includes('ATH Móvil'));
    bien('el ingreso no muestra método', !(await texto(fila(id(3)))).includes('método'));
    bien('fecha en palabras', (await texto(fila(id(1)))).includes('Jueves, 15 de enero de 2026'));
    bien('sin fechas numéricas', !/\d{1,2}\/\d{1,2}\/\d{4}/.test(await evaluar('document.body.innerText')));
    bien('sin desborde a 360', await evaluar('document.documentElement.scrollWidth <= innerWidth'));
    await captura('6-historial.png');

    // Navegar por meses.
    await tocar('#mes-anterior');
    await esperar(`document.querySelector('#mes-actual').innerText === 'Diciembre de 2025' && document.querySelectorAll('#lista .lista-fila').length === 1`);
    bien('Anterior cruza el año', (await texto('#mes-actual')) === 'Diciembre de 2025');
    await tocar('#mes-siguiente'); await tocar('#mes-siguiente');
    await esperar(`document.querySelector('#mes-actual').innerText === 'Febrero de 2026' && document.querySelectorAll('#lista .lista-fila').length === 1`);
    bien('Siguiente dos veces llega a febrero', (await filas()) === 1);
    await historial('2030-05');
    bien('un mes vacío lo dice', (await texto('#sin-transacciones')).includes('No hay transacciones'));
    bien('un mes vacío tiene totales en cero', (await texto('#total-Gasto')).includes('$0.00'));
    await irA('historial?mes=basura');
    await esperar(`!!document.querySelector('#lista')`);
    const hoyMes = await evaluar(`(() => { const d = new Date(); return ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][d.getMonth()] + ' de ' + d.getFullYear(); })()`);
    bien('una dirección inválida va al mes de hoy', (await texto('#mes-actual')) === hoyMes, await texto('#mes-actual'));
    await irA('');
    await esperar(`!!document.querySelector('#guardar')`);
    await tocar('#menu-historial');
    await esperar(`!!document.querySelector('#lista')`);
    bien('el menú abre el mes de hoy', (await texto('#mes-actual')) === hoyMes);
    bien('el menú marca Historial', await evaluar(`document.querySelector('#menu-historial').classList.contains('active')`));

    // Editar un gasto: el formulario viene lleno.
    await historial('2026-01');
    await abrirEdicion(id(1));
    bien('Editar carga el tipo', (await evaluar(`document.querySelector('#tipo-Gasto').getAttribute('aria-pressed')`)) === 'true');
    bien('Editar carga la fecha', (await valor('#fecha')) === '2026-01-15');
    bien('Editar carga el monto', (await valorMonto()) === '104.24');
    bien('Editar carga el método', (await evaluar(`document.querySelector('#metodo-AthMovil').getAttribute('aria-pressed')`)) === 'true');
    bien('Editar carga el origen', (await valor('#origen')) === 'Banco-Ejemplo');
    bien('Editar carga el destino', (await valor('#destino')) === 'Telefonos');
    await captura('6-editar.png');

    // Cancelar no cambia nada y regresa al mes.
    await escribirMonto('999');
    await tocar('#cancelar');
    await esperar(`!!document.querySelector('#lista')`);
    bien('Cancelar regresa al mes', (await texto('#mes-actual')) === 'Enero de 2026');
    bien('Cancelar no cambia nada', (await transaccion(id(1))).monto === 104.24);
    bien('Cancelar no deja mensaje', (await texto('#mensaje')) === '(no está)');

    // Guardar una edición.
    await abrirEdicion(id(1));
    await escribirMonto('20');
    bien('guardar vuelve al historial', await guardarYVolver());
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('el mensaje dice qué cambió', (await texto('#mensaje')) === 'Gasto actualizado. Monto: $104.24 → $20.00.', await texto('#mensaje'));
    await captura('6-editado.png');
    bien('no crea un duplicado', (await leerBd('transacciones')).length === 6);
    bien('conserva el Id y el resto', JSON.stringify(await transaccion(id(1))) === JSON.stringify({ ...TRANSACCIONES[0], monto: 20 }), JSON.stringify(await transaccion(id(1))));
    bien('el total se actualiza', (await texto('#total-Gasto')).includes('$20.10'), await texto('#total-Gasto'));

    // El mensaje solo aparece una vez.
    await tocar('#menu-mas');
    await esperar(`location.pathname.endsWith('/mas')`);
    await evaluar(`history.back()`);
    await esperar(`!!document.querySelector('#lista')`);
    bien('el mensaje no se repite al regresar', (await texto('#mensaje')) === '(no está)');

    // Cambiar la fecha a otro mes lleva a ese mes.
    await historial('2026-01');
    await abrirEdicion(id(2));
    await elegir('#fecha', '2026-03-02');
    await guardarYVolver();
    await esperar(`document.querySelector('#mes-actual').innerText === 'Marzo de 2026'`);
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('abre el mes de la fecha nueva', (await filas()) === 1 && !!(await texto(fila(id(2)))));
    console.log('mensaje de fecha:', await texto('#mensaje'));
    bien('el mensaje nombra las dos fechas', (await texto('#mensaje')).includes('Sábado, 31 de enero de 2026 → Lunes, 2 de marzo de 2026'));

    // Una cuenta que ya no está en el catálogo.
    await historial('2026-02');
    await abrirEdicion(id(5));
    bien('muestra el origen viejo', (await valor('#origen')) === 'Banco-Viejo', await valor('#origen'));
    bien('muestra el destino viejo', (await valor('#destino')) === 'Gasto-Viejo', await valor('#destino'));
    await guardarYVolver();
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('guardar sin cambios lo dice', (await texto('#mensaje')) === 'No hubo cambios.', await texto('#mensaje'));
    bien('las cuentas viejas siguen', (await transaccion(id(5))).cuentaOrigen === 'Banco-Viejo' && (await transaccion(id(5))).cuentaDestino === 'Gasto-Viejo');

    // Editar un ingreso y una transferencia.
    await historial('2026-01');
    await abrirEdicion(id(3));
    bien('el ingreso no pide método', (await texto('#metodos')) === '(no está)');
    await elegir('#destino', 'Efectivo');
    await guardarYVolver();
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('ingreso editado', (await texto('#mensaje')) === 'Ingreso actualizado. Cuenta de destino: Banco-Ejemplo → Efectivo.', await texto('#mensaje'));
    bien('el ingreso sigue sin método', (await transaccion(id(3))).metodoPago === null);
    await abrirEdicion(id(4));
    bien('el destino no ofrece el origen', !(await evaluar(`[...document.querySelector('#destino').options].some(o => o.value === 'Banco-Ejemplo')`)));
    await elegir('#origen', 'Ahorros-Ejemplo');
    await guardarYVolver();
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('transferencia editada', (await texto('#mensaje')) === 'Transferencia actualizada. Cuenta de origen: Banco-Ejemplo → Ahorros-Ejemplo.', await texto('#mensaje'));

    // Cambiar el tipo al editar.
    await abrirEdicion(id(4));
    await tocar('#tipo-Gasto');
    bien('cambiar el tipo vacía el destino', (await valor('#destino')) === '');
    await tocar('#guardar');
    bien('cambiar el tipo pide las cuentas', (await texto('#errores')).includes('Falta'), await texto('#errores'));
    bien('un error no guarda', (await transaccion(id(4))).tipo === 'Transferencia');
    await tocar('#cancelar');
    await esperar(`!!document.querySelector('#lista')`);

    // Una transacción que no existe.
    await irA('editar/bbbbbbbb-0000-0000-0000-000000000000');
    await esperar(`!!document.querySelector('#error-carga')`);
    bien('una transacción inexistente lo dice', (await texto('#error-carga')) === 'Esta transacción ya no existe.', await texto('#error-carga'));

    // Abrir Editar directamente, como al recargar la pantalla.
    await irA(`editar/${id(1)}`);
    bien('Editar abre con la dirección directa', await esperar(`document.querySelector('#monto')?.value === '20.00'`));

    // Borrar: primero pregunta, y Cancelar no borra.
    await historial('2026-01');
    await tocar(`${fila(id(1))} .accion-borrar`);
    console.log('pregunta:', await texto(`${fila(id(1))} .confirmar-borrado`));
    bien('borrar pregunta', (await texto(`${fila(id(1))} .confirmar-borrado`)).includes('¿Seguro que deseas borrar este gasto de $20.00?'));
    bien('borrar todavía no borra', !!(await transaccion(id(1))));
    await evaluar(`document.querySelector('${fila(id(1))} .confirmar-borrado').scrollIntoView({ block: 'center' })`);
    await dormir(100);
    await captura('6-confirmar.png');
    await tocar(`${fila(id(1))} .confirmar-no`);
    bien('Cancelar no borra', !!(await transaccion(id(1))));
    bien('Cancelar quita la pregunta', (await evaluar(`!document.querySelector('.confirmar-borrado')`)));

    // Borrar de verdad.
    const catalogoAntes = JSON.stringify([await leerBd('cuentasOrigen'), await leerBd('cuentasGasto'), await leerBd('cuentasIngreso'), await leerBd('ajustes')]);
    await tocar(`${fila(id(1))} .accion-borrar`);
    await tocar(`${fila(id(1))} .confirmar-si`);
    await esperar(`!!document.querySelector('#mensaje')`);
    console.log('al borrar:', await texto('#mensaje'));
    bien('el mensaje dice qué se borró', (await texto('#mensaje')).startsWith('Gasto borrado: $20.00. Jueves, 15 de enero de 2026.'));
    bien('se borró solo esa', !(await transaccion(id(1))) && (await leerBd('transacciones')).length === 5);
    bien('sale de la lista', (await texto(fila(id(1)))) === '(no está)');
    bien('el total se actualiza al borrar', (await texto('#total-Gasto')).includes('(0)') && (await texto('#total-Gasto')).includes('$0.00'), await texto('#total-Gasto'));
    bien('catálogo y correo intactos', JSON.stringify([await leerBd('cuentasOrigen'), await leerBd('cuentasGasto'), await leerBd('cuentasIngreso'), await leerBd('ajustes')]) === catalogoAntes);
    await captura('6-borrado.png');

    // Lo temporal ya no está.
    await tocar('#menu-mas');
    await esperar(`location.pathname.endsWith('/mas')`);
    bien('Más ya no enlaza a la prueba de datos', (await texto('#ir-prueba-datos')) === '(no está)');
    await irA('prueba-datos');
    await esperar(`!!document.querySelector('.menu-inferior')`);
    await dormir(300);
    bien('la prueba de datos ya no abre', (await texto('#anadir')) === '(no está)');

    await dormir(5000); // que el service worker termine de guardar todo en caché
}

if (etapa === 'sinred') {
    await irA('historial?mes=2026-01');
    bien('abre el historial sin servidor', await esperar(`!!document.querySelector('#lista')`));
    await abrirEdicion(id(3));
    await escribirMonto('555.55');
    await guardarYVolver();
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('edita sin servidor', (await transaccion(id(3))).monto === 555.55, await texto('#mensaje'));
    await tocar(`${fila(id(4))} .accion-borrar`);
    await tocar(`${fila(id(4))} .confirmar-si`);
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('borra sin servidor', !(await transaccion(id(4))), await texto('#mensaje'));
    await irA('historial?mes=2026-01');
    await esperar(`!!document.querySelector('#lista')`);
    bien('los cambios siguen al reabrir', (await texto('#total-Ingreso')).includes('$555.55') && (await texto('#total-Transferencia')).includes('$0.00'));
}

console.log('errores en consola:', consola.length ? consola : 'ninguno');
ws.close();
