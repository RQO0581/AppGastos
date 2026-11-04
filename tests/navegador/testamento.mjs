// Comprueba en un navegador el testamento: PIN, importar, cifrado, bloqueo, olvido y modo avión.
// Usa solo datos ficticios y BORRA los datos del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node testamento.mjs <puerto-de-depuración> <url-de-la-app> <conred|sinred> <carpeta-para-archivos-y-capturas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
// La etapa "sinred" se corre después de "conred", en el mismo perfil y con el servidor apagado.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conectar, crearBien, crearExcel, dormir } from './ayuda.mjs';

const [puerto, base, etapa, carpeta] = process.argv.slice(2);
const archivos = join(carpeta, 'archivos-testamento');
mkdirSync(archivos, { recursive: true });
const bien = crearBien();
const p = await conectar(puerto, base);
const { cdp, evaluar, esperar, texto, valor, tocar, fecha, teclear, escribir, irA, leerBd, escribirBd } = p;

const PIN = '4827';
const OTRO_PIN = '1111';
const ROJO = 'rgb(179, 38, 30)';

const FILAS = [
    { a: 'Testamento de Ejemplo', negritaA: true },
    {},
    { a: 'Bienes', negritaA: true },
    { a: '  Casa-Ejemplo', b: 250000 },
    { a: 'Carro-Ejemplo', b: 12500.5 },
    { a: 'Deuda-Ejemplo', b: -1500.25 },
    { a: 'Total de bienes', negritaA: true, b: 261000.25, negritaB: true, formula: 'SUM(B4:B6)' },
    {},
    { a: 'Legados', negritaA: true },
    { a: 'Persona-Ejemplo con un nombre muy largo que no debe salirse de la pantalla', b: 1000 },
    { a: 'Nota-Ejemplo', b: 'Por definir' },
];
const uno = join(archivos, 'testamento-1.xlsx'), dos = join(archivos, 'testamento-2.xlsx'), sinMontos = join(archivos, 'sin-montos.xlsx'), noExcel = join(archivos, 'no-es-excel.xlsx'), hojas = join(archivos, 'dos-hojas.xlsx');
crearExcel(uno, FILAS);
crearExcel(dos, [{ a: 'Testamento de Ejemplo 2', negritaA: true }, { a: 'Solo una fila', b: 5 }]);
crearExcel(sinMontos, [{ a: 'Otro archivo cualquiera' }]);
crearExcel(hojas, [{ a: 'Primera hoja', b: 1 }], 1);
writeFileSync(noExcel, 'esto no es un Excel');

const captura = async nombre => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(carpeta, nombre), Buffer.from(result.data, 'base64')); };
const abrir = async () => { await irA('testamento'); return esperar(`!!document.querySelector('#pin') || !!document.querySelector('#sin-testamento')`); };
const escribirPin = async (selector, valorPin) => { await escribir(selector, ''); await teclear(selector, valorPin); };
const entrar = async valorPin => { await escribirPin('#pin', valorPin); await tocar('#entrar'); await esperar(`document.querySelector('#entrar')?.innerText !== 'Comprobando…'`, 30000); await dormir(200); };
const subir = async ruta => {
    const { result: { root } } = await cdp('DOM.getDocument');
    const { result: { nodeId } } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#archivo' });
    await cdp('DOM.setFileInputFiles', { nodeId, files: [ruta] });
};
const filasDe = sel => evaluar(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(sel + ' tr')})].map(f => [...f.cells].map(c => c.innerText)))`).then(JSON.parse);
const hayContenido = () => evaluar(`!!document.querySelector('#tabla-testamento')`);
// Simula que el teléfono envía la app a segundo plano.
const ocultar = async () => { await evaluar(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); })()`); await dormir(300); };
const mostrar = async () => { await evaluar(`(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); })()`); await dormir(200); };
// Los bytes tal como están guardados, para compararlos y buscar texto en ellos.
const crudo = almacen => evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const d = r.result; const g = d.transaction('${almacen}').objectStore('${almacen}').getAll(); g.onsuccess = () => { d.close(); const a = v => v instanceof ArrayBuffer ? Array.from(new Uint8Array(v)) : ArrayBuffer.isView(v) ? Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) : v; res(JSON.stringify(g.result.map(x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, a(v)]))))); }; }; })`);
const textoDeBytes = lista => Buffer.from(lista).toString('latin1');
const importar = async ruta => { await subir(ruta); await esperar(`!!document.querySelector('#guardar-testamento') || !!document.querySelector('#errores')`, 20000); };
const importarYGuardar = async ruta => { await importar(ruta); await tocar('#guardar-testamento'); await esperar(`document.querySelector('#mensaje')?.innerText === 'Testamento guardado.'`, 10000); };

if (etapa === 'conred') {
    // Migración: una base de la versión 2 con datos, como la tienen los teléfonos hoy.
    await irA('no-existe-para-sembrar');
    await dormir(300);
    await evaluar(`new Promise((res, rej) => { const s = indexedDB.open('AppGastos', 2); s.onupgradeneeded = () => { const b = s.result; b.createObjectStore('transacciones', { keyPath: 'id' }).createIndex('fecha', 'fecha'); b.createObjectStore('cuentasOrigen', { keyPath: 'nombre' }); b.createObjectStore('cuentasGasto', { keyPath: 'nombre' }); b.createObjectStore('ajustes', { keyPath: 'clave' }); b.createObjectStore('cuentasIngreso', { keyPath: 'nombre' }); }; s.onerror = () => rej(s.error); s.onsuccess = () => { const b = s.result; const t = b.transaction(['transacciones','cuentasOrigen','cuentasGasto','cuentasIngreso','ajustes'],'readwrite'); t.objectStore('transacciones').put({ id: 'aaaaaaaa-0000-0000-0000-000000000001', tipo: 'Gasto', fecha: '2026-01-05', monto: 104.24, metodoPago: 'AthMovil', cuentaOrigen: 'Banco-Ejemplo', cuentaDestino: 'Telefonos' }); t.objectStore('transacciones').put({ id: 'aaaaaaaa-0000-0000-0000-000000000002', tipo: 'Ingreso', fecha: '2026-11-01', monto: 500, metodoPago: null, cuentaOrigen: 'Ingreso-Ejemplo', cuentaDestino: 'Banco-Ejemplo' }); t.objectStore('cuentasOrigen').put({ nombre: 'Efectivo', tipo: 'Efectivo' }); t.objectStore('cuentasOrigen').put({ nombre: 'Banco-Ejemplo', tipo: 'Banco' }); t.objectStore('cuentasGasto').put({ nombre: 'Telefonos' }); t.objectStore('cuentasIngreso').put({ nombre: 'Ingreso-Ejemplo' }); t.objectStore('ajustes').put({ clave: 'correo', valor: 'nombre@ejemplo.com' }); t.oncomplete = () => { b.close(); res('ok'); }; t.onerror = () => rej(t.error); }; })`);
    const antesDeMigrar = JSON.stringify([await leerBd('transacciones'), await leerBd('cuentasOrigen'), await leerBd('cuentasGasto'), await leerBd('cuentasIngreso'), await leerBd('ajustes')]);
    await irA('');
    await esperar(`!!document.querySelector('#guardar')`);
    await p.servicioListo();
    bien('la base sube a la versión 3', (await evaluar(`new Promise(res => { const r = indexedDB.open('AppGastos'); r.onsuccess = () => { const v = r.result.version; r.result.close(); res(v); }; })`)) === 3);
    bien('la migración no cambia los datos', JSON.stringify([await leerBd('transacciones'), await leerBd('cuentasOrigen'), await leerBd('cuentasGasto'), await leerBd('cuentasIngreso'), await leerBd('ajustes')]) === antesDeMigrar);
    bien('los almacenes nuevos empiezan vacíos', (await crudo('testamento')) === '[]' && (await crudo('seguridadTestamento')) === '[]');

    // El botón en Más.
    await irA('mas');
    await esperar(`!!document.querySelector('#ir-testamento')`);
    bien('Más tiene Ver testamento', (await texto('#ir-testamento')) === 'Ver testamento');
    await tocar('#ir-testamento');
    await esperar(`!!document.querySelector('#crear-pin')`);

    // Crear el PIN: dos veces, solo cuatro dígitos.
    bien('la primera vez pide crear el PIN', (await texto('#crear-pin-texto')).includes('Crea un PIN de 4 dígitos'));
    bien('sin PIN, el botón está gris', await evaluar(`document.querySelector('#crear-pin').disabled`));
    bien('el teclado es de dígitos', (await evaluar(`document.querySelector('#pin').inputMode`)) === 'numeric');
    bien('el PIN no se ve', (await evaluar(`getComputedStyle(document.querySelector('#pin')).webkitTextSecurity`)) === 'disc');
    bien('no es un campo de contraseña', (await evaluar(`document.querySelector('#pin').type`)) === 'text');
    await teclear('#pin', '12a');
    bien('solo acepta dígitos', (await valor('#pin')) === '12', await valor('#pin'));
    await escribirPin('#pin', '123');
    await escribirPin('#pin-confirmacion', '123');
    bien('con 3 dígitos sigue gris', await evaluar(`document.querySelector('#crear-pin').disabled`));
    await escribirPin('#pin', PIN);
    await escribirPin('#pin-confirmacion', OTRO_PIN);
    await tocar('#crear-pin');
    bien('si no coinciden, lo dice', (await texto('#mensaje')).includes('no coinciden'), await texto('#mensaje'));
    bien('si no coinciden, no se guarda', (await crudo('seguridadTestamento')) === '[]');
    bien('si no coinciden, los vacía', (await valor('#pin')) === '' && (await valor('#pin-confirmacion')) === '');
    await captura('testamento-crear-pin.png');
    await escribirPin('#pin', PIN);
    await escribirPin('#pin-confirmacion', PIN);
    let inicio = Date.now();
    await tocar('#crear-pin');
    await esperar(`!!document.querySelector('#sin-testamento')`, 30000);
    console.log(`TIEMPO de crear el PIN en este computador: ${Date.now() - inicio} ms`);
    bien('crear el PIN lo dice', (await texto('#mensaje')) === 'PIN creado. Ahora importa tu Excel.', await texto('#mensaje'));
    bien('sin testamento, lo dice', (await texto('#sin-testamento')).includes('Aún no hay testamento'));

    // El PIN solo se guarda como hash.
    const seguridad = JSON.parse(await crudo('seguridadTestamento'))[0];
    bien('el hash es de 32 bytes', seguridad.hash.length === 32);
    bien('hay una sal', seguridad.sal.length === 16);
    bien('el PIN no está guardado', !JSON.stringify(seguridad).includes(PIN) && !textoDeBytes(seguridad.hash).includes(PIN), Object.keys(seguridad).join(' '));
    bien('no se guarda la clave de cifrado', Object.keys(seguridad).sort().join() === 'bloqueadoHasta,clave,hash,intentos,iteraciones,sal', Object.keys(seguridad).join());

    // Archivos con errores: no cambia nada.
    await importar(noExcel);
    bien('un archivo que no es Excel lo dice', (await texto('#errores')).includes('No se pudo leer el archivo'), await texto('#errores'));
    await importar(sinMontos);
    bien('un archivo sin montos lo dice', (await texto('#errores')).includes('ninguna cantidad'), await texto('#errores'));
    bien('con errores no guarda nada', (await crudo('testamento')) === '[]');

    // Vista previa y guardar.
    await importar(uno);
    bien('muestra la vista previa', (await filasDe('#vista-previa')).length === FILAS.length);
    bien('la vista previa no guarda', (await crudo('testamento')) === '[]');
    await tocar('#guardar-testamento');
    await esperar(`document.querySelector('#mensaje')?.innerText === 'Testamento guardado.'`, 10000);

    // La tabla, tal como viene.
    const tabla = await filasDe('#tabla-testamento');
    console.log('tabla:', JSON.stringify(tabla));
    const textoTabla = JSON.stringify(tabla);
    bien('el mismo orden y las filas vacías', tabla.length === FILAS.length && tabla[0][0] === 'Testamento de Ejemplo' && tabla[1][0] === '' && tabla[2][0] === 'Bienes' && tabla[7][0] === '' && tabla[8][0] === 'Legados', textoTabla);
    bien('los montos en dólares', JSON.stringify(tabla[4]) === JSON.stringify(['Carro-Ejemplo', '$12,500.50']), JSON.stringify(tabla[4]));
    bien('el negativo con signo', JSON.stringify(tabla[5]) === JSON.stringify(['Deuda-Ejemplo', '-$1,500.25']), JSON.stringify(tabla[5]));
    bien('el total de una fórmula', JSON.stringify(tabla[6]) === JSON.stringify(['Total de bienes', '$261,000.25']), JSON.stringify(tabla[6]));
    bien('el texto en la columna B', JSON.stringify(tabla[10]) === JSON.stringify(['Nota-Ejemplo', 'Por definir']), JSON.stringify(tabla[10]));
    const estilo = (fila, col, prop) => evaluar(`getComputedStyle(document.querySelectorAll('#tabla-testamento tr')[${fila}].cells[${col}]).${prop}`);
    bien('el negativo es rojo', (await estilo(5, 1, 'color')) === ROJO, await estilo(5, 1, 'color'));
    bien('un positivo no es rojo', (await estilo(4, 1, 'color')) !== ROJO, await estilo(4, 1, 'color'));
    bien('el título es más grande', parseFloat(await estilo(0, 0, 'fontSize')) > parseFloat(await estilo(4, 0, 'fontSize')));
    bien('la sección en negrita', Number(await estilo(2, 0, 'fontWeight')) >= 700, await estilo(2, 0, 'fontWeight'));
    bien('una fila normal sin negrita', Number(await estilo(4, 0, 'fontWeight')) < 700, await estilo(4, 0, 'fontWeight'));
    bien('el total en negrita', Number(await estilo(6, 1, 'fontWeight')) >= 700);
    bien('conserva la sangría', (await estilo(3, 0, 'whiteSpace')) === 'pre-wrap' && (await evaluar(`document.querySelectorAll('#tabla-testamento tr')[3].cells[0].textContent`)) === '  Casa-Ejemplo');
    bien('sin desborde a 320', await evaluar('document.documentElement.scrollWidth <= innerWidth'));
    bien('la fecha de importación en palabras', /^Importado el (Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo), \d+ de \w+ de \d{4}$/.test(await texto('#fecha-importacion')), await texto('#fecha-importacion'));
    bien('es de solo lectura', await evaluar(`document.querySelectorAll('#tabla-testamento input, #tabla-testamento button, #tabla-testamento [contenteditable]').length === 0`));
    bien('avisa del Excel original', (await evaluar('document.body.innerText')).includes('ahí no está protegido'));
    await captura('testamento-tabla.png');

    // Cifrado: lo guardado no se puede leer.
    const guardado = JSON.parse(await crudo('testamento'))[0];
    const bytes = textoDeBytes(guardado.cifrado);
    bien('el contenido está cifrado', !['Casa-Ejemplo', 'Deuda', 'Testamento de Ejemplo', '250000', 'Descripcion'].some(t => bytes.includes(t)));
    bien('la fecha también', !bytes.includes('2026') && Object.keys(guardado).sort().join() === 'cifrado,clave,iv', Object.keys(guardado).join());

    // Cancelar una importación.
    await importar(dos);
    await tocar('#cancelar-importar');
    bien('cancelar deja el testamento', (await filasDe('#tabla-testamento')).length === FILAS.length);
    bien('cancelar no cambia lo guardado', JSON.parse(await crudo('testamento'))[0].cifrado.join() === guardado.cifrado.join());

    // Un error al importar otro deja el anterior.
    await importar(noExcel);
    bien('un error avisa que sigue igual', (await texto('#errores')).includes('El testamento guardado sigue igual'));
    bien('un error mantiene la tabla', (await filasDe('#tabla-testamento')).length === FILAS.length);

    // Varias hojas.
    await importar(hojas);
    bien('avisa si hay varias hojas', (await texto('.aviso-testamento')).includes('2 hojas'), await texto('.aviso-testamento'));
    await tocar('#cancelar-importar');

    // Bloqueo: en segundo plano.
    await ocultar();
    await esperar(`!!document.querySelector('#pin')`, 5000);
    bien('en segundo plano se bloquea', !(await hayContenido()));
    bien('la tabla ya no está en la pantalla', !(await evaluar('document.body.innerText')).includes('Casa-Ejemplo'));
    await mostrar();
    await entrar(PIN);
    bien('con el PIN correcto se ve otra vez', await hayContenido());

    // El selector de archivos no debe bloquear, aunque envíe la app a segundo plano.
    await cdp('Page.setInterceptFileChooserDialog', { enabled: true });
    await tocar('#elegir-archivo');
    await ocultar();
    await dormir(300);
    bien('elegir un archivo no bloquea', await hayContenido());
    await mostrar();
    await importarYGuardar(dos);
    bien('reemplaza el anterior', JSON.stringify(await filasDe('#tabla-testamento')) === JSON.stringify([['Testamento de Ejemplo 2'], ['Solo una fila', '$5.00']]), JSON.stringify(await filasDe('#tabla-testamento')));
    await cdp('Page.setInterceptFileChooserDialog', { enabled: false });
    await ocultar();
    await esperar(`!!document.querySelector('#pin')`, 5000);
    bien('después de elegir, vuelve a bloquearse', !(await hayContenido()));
    await mostrar();
    await entrar(PIN);

    // Bloqueo: al salir de la pantalla y al recargar.
    await tocar('#menu-mas');
    await esperar(`!!document.querySelector('#ir-testamento')`);
    await tocar('#ir-testamento');
    await esperar(`!!document.querySelector('#pin')`);
    bien('al salir y volver, pide el PIN', !(await hayContenido()));
    await abrir();
    bien('al recargar, pide el PIN', !!(await esperar(`!!document.querySelector('#entrar')`, 5000)) && !(await hayContenido()));

    // PIN incorrecto.
    bien('con 3 dígitos, Entrar está gris', await (async () => { await escribirPin('#pin', '12'); return evaluar(`document.querySelector('#entrar').disabled`); })());
    await entrar(OTRO_PIN);
    bien('un PIN incorrecto lo dice', (await texto('#mensaje')) === 'PIN incorrecto. Te quedan 4 intentos antes de tener que esperar.', await texto('#mensaje'));
    bien('un PIN incorrecto no abre', !(await hayContenido()));
    bien('el campo se vacía', (await valor('#pin')) === '');
    await entrar(PIN);
    bien('el PIN correcto reinicia los intentos', JSON.parse(await crudo('seguridadTestamento'))[0].intentos === 0);
    await abrir();

    // Espera después de 5 intentos, aunque se recargue.
    for (let i = 0; i < 4; i++) await entrar(OTRO_PIN);
    bien('quedan intentos antes del quinto', (await texto('#mensaje')).includes('Te quedan 1 intentos') , await texto('#mensaje'));
    await abrir();
    await entrar(OTRO_PIN);
    await esperar(`!!document.querySelector('#espera')`, 5000);
    bien('al quinto, pide esperar', (await texto('#espera')).includes('Demasiados intentos'), await texto('#espera'));
    await captura('testamento-espera.png');
    await abrir();
    await esperar(`!!document.querySelector('#espera')`, 5000);
    bien('recargar no quita la espera', !!(await texto('#espera')).includes('Espera'));
    await escribirPin('#pin', PIN);
    bien('durante la espera, Entrar está gris', await evaluar(`document.querySelector('#entrar').disabled`));
    const resultado = await evaluar(`appGastos.testamento.desbloquear(${JSON.stringify(PIN)}).then(r => JSON.stringify(r))`);
    bien('la espera también vale por debajo de la pantalla', !JSON.parse(resultado).correcto, resultado);
    await esperar(`!document.querySelector('#espera')`, 40000);
    bien('la espera termina sola', (await texto('#espera')) === '(no está)');
    await entrar(PIN);
    bien('después de esperar, el PIN correcto abre', await hayContenido());

    // Borrar transacciones no toca el testamento.
    await irA('');
    await esperar(`!!document.querySelector('#guardar')`);
    const fotoTestamento = [await crudo('testamento'), await crudo('seguridadTestamento')].join();
    await irA('borrar');
    await esperar(`!!document.querySelector('#desde')?.value`);
    await fecha('#desde', '2026-01-01');
    await fecha('#hasta', '2026-01-31');
    await esperar(`!!document.querySelector('#borrar-rango')`, 5000);
    await tocar('#borrar-rango');
    await tocar('#confirmar-si');
    await esperar(`document.querySelector('#mensaje')?.innerText.startsWith('Se bor')`, 5000);
    bien('borrar por fechas no toca el testamento', [await crudo('testamento'), await crudo('seguridadTestamento')].join() === fotoTestamento);
    await irA('borrar-todo');
    await esperar(`!!document.querySelector('#confirmar-borrado')`);
    await teclear('#confirmacion', 'BORRAR');
    await tocar('#confirmar-borrado');
    await esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#mensaje')`);
    bien('borrar todas borró las transacciones', (await leerBd('transacciones')).length === 0);
    bien('borrar todas no toca el testamento', [await crudo('testamento'), await crudo('seguridadTestamento')].join() === fotoTestamento);
    await abrir();
    await entrar(PIN);
    bien('el testamento se sigue viendo', (await filasDe('#tabla-testamento')).length === 2);
    await abrir();

    // Olvidé el PIN.
    await tocar('#olvide-pin');
    bien('olvidar explica qué borra', (await texto('#olvido-texto')).includes('No se borran las transacciones'));
    bien('sin escribir, el botón está gris', await evaluar(`document.querySelector('#borrar-testamento').disabled`));
    for (const mala of ['borrar', 'Borrar', 'BORRA']) {
        await escribir('#confirmar-olvido', mala);
        bien(`"${mala}" no activa el botón`, await evaluar(`document.querySelector('#borrar-testamento').disabled`));
    }
    await captura('testamento-olvido.png');
    await tocar('#cancelar-olvido');
    await esperar(`!!document.querySelector('#entrar')`, 5000);
    bien('cancelar vuelve a pedir el PIN', [await crudo('testamento'), await crudo('seguridadTestamento')].join() === fotoTestamento);
    const antesDeOlvidar = JSON.stringify([await leerBd('cuentasOrigen'), await leerBd('cuentasGasto'), await leerBd('cuentasIngreso'), await leerBd('ajustes')]);
    await escribirBd('transacciones', [{ id: 'aaaaaaaa-0000-0000-0000-000000000009', tipo: 'Gasto', fecha: '2026-01-05', monto: 9, metodoPago: 'Efectivo', cuentaOrigen: 'Efectivo', cuentaDestino: 'Telefonos', comentario: '' }]);
    await tocar('#olvide-pin');
    await escribir('#confirmar-olvido', 'BORRAR');
    await tocar('#borrar-testamento');
    await esperar(`!!document.querySelector('#crear-pin')`, 5000);
    bien('olvidar lo dice', (await texto('#mensaje')).startsWith('Se borraron el testamento y el PIN.'), await texto('#mensaje'));
    bien('olvidar borra el testamento y el PIN', (await crudo('testamento')) === '[]' && (await crudo('seguridadTestamento')) === '[]');
    bien('olvidar no toca lo demás', JSON.stringify([await leerBd('cuentasOrigen'), await leerBd('cuentasGasto'), await leerBd('cuentasIngreso'), await leerBd('ajustes')]) === antesDeOlvidar && (await leerBd('transacciones')).length === 1);

    // Empezar otra vez, con otro PIN: el contenido anterior no vuelve.
    await escribirPin('#pin', OTRO_PIN);
    await escribirPin('#pin-confirmacion', OTRO_PIN);
    await tocar('#crear-pin');
    await esperar(`!!document.querySelector('#sin-testamento')`, 30000);
    bien('después de olvidar, no hay testamento', !(await hayContenido()));
    await importarYGuardar(uno);
    bien('se puede volver a importar', (await filasDe('#tabla-testamento')).length === FILAS.length);

    await dormir(5000); // que el service worker termine de guardar todo en caché
}

if (etapa === 'sinred') {
    await abrir();
    bien('pide el PIN sin servidor', await esperar(`!!document.querySelector('#entrar')`));
    await entrar(PIN);
    bien('el PIN anterior ya no sirve', !(await hayContenido()));
    await entrar(OTRO_PIN);
    bien('se ve sin servidor', (await filasDe('#tabla-testamento')).length === FILAS.length);
    await importarYGuardar(dos);
    bien('reemplaza sin servidor', (await filasDe('#tabla-testamento')).length === 2);
    await abrir();
    await entrar(OTRO_PIN);
    bien('sigue después de recargar sin servidor', (await filasDe('#tabla-testamento')).length === 2);
}

console.log('errores en consola:', p.consola.length ? p.consola : 'ninguno');
p.cerrar();
