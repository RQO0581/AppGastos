// Provoca fallos reales de IndexedDB y comprueba que la app lo dice y que los datos no cambian.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node errores.mjs <puerto-de-depuración> <url-de-la-app>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
import { conectar, crearBien, dormir } from './ayuda.mjs';

const [puerto, base] = process.argv.slice(2);
const bien = crearBien();
const p = await conectar(puerto, base);
const { evaluar, esperar, texto, valor, tocar, elegir, escribir, fecha, teclear, irA, leerBd, escribirBd } = p;

const ORIGEN = [{ nombre: 'Efectivo', tipo: 'Efectivo' }, { nombre: 'Banco-Ejemplo', tipo: 'Banco' }];
const GASTO = [{ nombre: 'Telefonos' }];
const INGRESO = [{ nombre: 'Ingreso-Ejemplo' }];
const t = (n, fechaTexto, monto) => ({ id: `aaaaaaaa-0000-0000-0000-00000000000${n}`, tipo: 'Gasto', fecha: fechaTexto, monto, metodoPago: 'Efectivo', cuentaOrigen: 'Efectivo', cuentaDestino: 'Telefonos', comentario: '' });
const TRANSACCIONES = [t(1, '2026-01-05', 10), t(2, '2026-01-06', 20)];
const sembrar = async () => {
    await escribirBd('cuentasOrigen', ORIGEN, true);
    await escribirBd('cuentasGasto', GASTO, true);
    await escribirBd('cuentasIngreso', INGRESO, true);
    await escribirBd('transacciones', TRANSACCIONES, true);
    await escribirBd('ajustes', [{ clave: 'correo', valor: 'nombre@ejemplo.com' }], true);
};
const fotografia = async () => JSON.stringify([await leerBd('transacciones'), await leerBd('cuentasOrigen'), await leerBd('cuentasGasto'), await leerBd('cuentasIngreso'), await leerBd('ajustes')].map(l => l.sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)));

// El fallo se provoca en el mismo IndexedDB, y solo para la transacción de la app: la prueba lee con otra copia.
const romper = (clase, metodo) => evaluar(`(() => { window.__original = window.__original || []; const o = ${clase}.prototype.${metodo}; window.__original.push([${clase}.prototype, '${metodo}', o]); ${clase}.prototype.${metodo} = function () { throw new DOMException('Fallo de prueba', 'QuotaExceededError'); }; })()`);
const reparar = () => evaluar(`(() => { for (const [c, m, o] of (window.__original || [])) c[m] = o; window.__original = []; })()`);

await irA('');
await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`);
// Sin service worker, un servidor de prueba responde 404 a las direcciones internas.
await p.servicioListo();
await sembrar();
const inicial = await fotografia();

// Guardar en Registrar.
await irA('');
await esperar(`!!document.querySelector('#guardar')`);
await tocar('#metodo-Efectivo');
await escribir('#monto', '12.34');
await elegir('#destino', 'Telefonos');
await teclear('#comentario', 'Factura');
await romper('IDBObjectStore', 'put');
await tocar('#guardar');
await esperar(`!!document.querySelector('#errores')`, 5000);
console.log('al guardar:', await texto('#errores'));
bien('al guardar: el mensaje no trae restos técnicos', !/undefined|\bat \w+ \(/.test(await texto('#errores')), await texto('#errores'));
bien('guardar: dice que no se pudo', (await texto('#errores')).includes('No se pudo guardar en el teléfono'));
bien('guardar: el monto sigue escrito', (await valor('#monto')) === '12.34', await valor('#monto'));
bien('guardar: el comentario sigue escrito', (await valor('#comentario')) === 'Factura');
bien('guardar: el botón vuelve a estar activo', !(await evaluar(`document.querySelector('#guardar').disabled`)));
await reparar();
bien('guardar: no se guardó nada', (await fotografia()) === inicial);
await tocar('#guardar');
await esperar(`!!document.querySelector('#exito')`, 5000);
bien('guardar: al reintentar, funciona', (await texto('#exito')).includes('$12.34'), await texto('#exito'));
await sembrar();

// Guardar en Editar.
await irA('historial?mes=2026-01');
await esperar(`!!document.querySelector('.accion-editar')`);
await evaluar(`[...document.querySelectorAll('.lista-fila')].find(f => f.innerText.includes('$10.00')).querySelector('.accion-editar').click()`);
await esperar(`!!document.querySelector('#monto')`);
await dormir(200);
await escribir('#monto', '99.00');
await romper('IDBObjectStore', 'put');
await tocar('#guardar');
await esperar(`!!document.querySelector('#errores')`, 5000);
bien('editar: dice que no se pudo', (await texto('#errores')).includes('No se pudo guardar'));
bien('editar: sigue en la pantalla', (await evaluar('location.pathname')).includes('/editar/'));
bien('editar: lo escrito sigue ahí', (await valor('#monto')) === '99.00');
await reparar();
bien('editar: no cambió nada', (await fotografia()) === inicial);

// Borrar una transacción.
await irA('historial?mes=2026-01');
await esperar(`!!document.querySelector('.accion-borrar')`);
await tocar('.accion-borrar');
await romper('IDBObjectStore', 'delete');
await tocar('.confirmar-si');
await esperar(`!!document.querySelector('#mensaje')`, 5000);
console.log('al borrar una:', await texto('#mensaje'));
bien('al borrar una: el mensaje no trae restos técnicos', !/undefined|\bat \w+ \(/.test(await texto('#mensaje')), await texto('#mensaje'));
bien('borrar una: dice que sigue guardada', (await texto('#mensaje')).includes('La transacción sigue guardada'));
bien('borrar una: se ve como error', (await evaluar(`document.querySelector('#mensaje').className`)).includes('mensaje-error'));
await reparar();
bien('borrar una: no se borró', (await fotografia()) === inicial);

// Borrar por fechas.
await irA('borrar');
await esperar(`!!document.querySelector('#desde')?.value`);
await fecha('#desde', '2026-01-01');
await fecha('#hasta', '2026-01-31');
await esperar(`!!document.querySelector('#borrar-rango')`, 5000);
await tocar('#borrar-rango');
await romper('IDBCursor', 'delete');
await tocar('#confirmar-si');
await esperar(`!!document.querySelector('#mensaje')`, 5000);
console.log('al borrar un rango:', await texto('#mensaje'));
bien('al borrar un rango: el mensaje no trae restos técnicos', !/undefined|\bat \w+ \(/.test(await texto('#mensaje')), await texto('#mensaje'));
bien('borrar rango: dice que siguen guardadas', (await texto('#mensaje')).includes('Las transacciones siguen guardadas'));
bien('borrar rango: los botones vuelven a estar activos', !(await evaluar(`document.querySelector('#confirmar-si').disabled`)));
await reparar();
bien('borrar rango: no se borró nada', (await fotografia()) === inicial);

// Borrar todas.
await irA('borrar-todo');
await esperar(`!!document.querySelector('#confirmar-borrado')`);
await teclear('#confirmacion', 'BORRAR');
await romper('IDBObjectStore', 'clear');
await tocar('#confirmar-borrado');
await esperar(`!!document.querySelector('#mensaje')`, 5000);
console.log('al borrar todas:', await texto('#mensaje'));
bien('al borrar todas: el mensaje no trae restos técnicos', !/undefined|\bat \w+ \(/.test(await texto('#mensaje')), await texto('#mensaje'));
bien('borrar todas: dice que siguen guardadas', (await texto('#mensaje')).includes('Las transacciones siguen guardadas'));
bien('borrar todas: sigue en la pantalla', (await evaluar('location.pathname')).endsWith('/borrar-todo'));
bien('borrar todas: el botón vuelve a estar activo', !(await evaluar(`document.querySelector('#confirmar-borrado').disabled`)));
await reparar();
bien('borrar todas: no se borró nada', (await fotografia()) === inicial);

// Leer: el Historial, Exportar y Borrar todas al abrir.
await irA('mas');
await esperar(`!!document.querySelector('#menu-historial')`);
await romper('IDBIndex', 'getAll');
await tocar('#menu-historial');
await esperar(`!!document.querySelector('#mensaje')`, 5000);
bien('leer el historial: lo dice', (await texto('#mensaje')).includes('No se pudo leer el historial'), await texto('#mensaje'));
await tocar('#menu-exportar');
await esperar(`!!document.querySelector('#mensaje')`, 5000);
bien('leer para exportar: lo dice', (await texto('#mensaje')).includes('No se pudieron leer las transacciones'), await texto('#mensaje'));
bien('leer para exportar: no ofrece exportar', await evaluar(`document.querySelector('#exportar').disabled`));
await reparar();

// Después de los fallos, la app sigue funcionando y los datos están como al principio.
await irA('');
await esperar(`!!document.querySelector('#guardar')`);
bien('sin fallos, la app sigue normal', (await fotografia()) === inicial);

const inesperados = p.consola.filter(linea => !linea.includes('Fallo de prueba'));
console.log('errores en consola:', inesperados.length ? inesperados : 'ninguno');
bien('sin errores inesperados en la consola', inesperados.length === 0);
p.cerrar();
