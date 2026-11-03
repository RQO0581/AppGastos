// Recorre la app de principio a fin, como la usaría una persona, y mide cuánto tarda con muchas transacciones.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node completa.mjs <puerto-de-depuración> <url-de-la-app> <conred|sinred> <carpeta-para-descargas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
// La etapa "sinred" se corre después de "conred", en el mismo perfil y con el servidor apagado.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { conectar, crearBien, dormir, leerFilas } from './ayuda.mjs';

const [puerto, base, etapa, carpeta] = process.argv.slice(2);
const descargas = join(carpeta, 'descargas-completa');
mkdirSync(descargas, { recursive: true });
const bien = crearBien();
const p = await conectar(puerto, base, 360);
const { cdp, evaluar, esperar, texto, valor, tocar, elegir, fecha, teclear, opciones, irA, leerBd, escribirBd } = p;
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });

const vaciar = () => { for (const a of readdirSync(descargas)) rmSync(join(descargas, a), { force: true }); };
const esperarDescarga = async (ms = 60000) => {
    const limite = Date.now() + ms;
    while (Date.now() < limite) {
        const listos = readdirSync(descargas).filter(a => a.endsWith('.xlsx'));
        if (listos.length > 0) { await dormir(300); return listos[0]; }
        await dormir(50);
    }
    return null;
};
const fila = monto => evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes(${JSON.stringify(monto)}))?.innerText?.replace(/\\n+/g,' | ') ?? '(no está)'`);
const accion = async (monto, clase) => { await evaluar(`[...document.querySelectorAll('#lista .lista-fila')].find(f => f.innerText.includes(${JSON.stringify(monto)})).querySelector(${JSON.stringify(clase)}).click()`); await dormir(200); };
const registrar = async ({ tipo, digitos, metodo, origen, destino, comentario, dia }) => {
    await tocar(`#tipo-${tipo}`);
    if (dia) await fecha('#fecha', dia);
    await teclear('#monto', digitos);
    if (metodo) await tocar(`#metodo-${metodo}`);
    if (origen) await elegir('#origen', origen);
    await elegir('#destino', destino);
    if (comentario) await teclear('#comentario', comentario);
    await tocar('#guardar');
    await esperar(`!!document.querySelector('#exito')`, 5000);
    return texto('#exito');
};

if (etapa === 'conred') {
    vaciar();

    // Primera vez: sin cuentas, la app abre Importar cuentas. La plantilla se crea y se importa.
    await irA('');
    bien('la primera vez abre Importar cuentas', await esperar(`location.pathname.endsWith('/importar') && !!document.querySelector('#plantilla')`));
    await p.servicioListo();
    bien('el tema usa el azul de la app', (await evaluar(`document.querySelector('meta[name="theme-color"]').content`)) === '#1565c0');
    await p.compartirFalla();
    await tocar('#plantilla');
    const plantilla = await esperarDescarga();
    bien('crea la plantilla', plantilla === 'Cuentas_plantilla.xlsx', plantilla);
    const { result: { root } } = await cdp('DOM.getDocument');
    const { result: { nodeId } } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#archivo' });
    await cdp('DOM.setFileInputFiles', { nodeId, files: [join(descargas, plantilla)] });
    await esperar(`!!document.querySelector('#importar')`, 20000);
    await tocar('#importar');
    await esperar(`document.querySelector('#mensaje')?.innerText.includes('importadas')`, 10000);
    bien('importa las cuentas', (await texto('#mensaje')).startsWith('Cuentas importadas:'), await texto('#mensaje'));

    // Registrar los cuatro tipos, con los nombres que trae la plantilla.
    await tocar('#ir-inicio');
    await esperar(`!!document.querySelector('#guardar')`);
    await tocar('#metodo-TarjetaDebito');
    const banco = (await opciones('#origen'))[0];
    await tocar('#metodo-TarjetaCredito');
    const tarjeta = (await opciones('#origen'))[0];
    const gasto = (await opciones('#destino'))[0];
    await tocar('#tipo-Ingreso');
    const ingreso = (await opciones('#origen'))[0];
    await tocar('#tipo-Gasto');
    console.log('cuentas de la plantilla:', banco, '|', tarjeta, '|', gasto, '|', ingreso);
    bien('la plantilla trae cuentas para todo', !!banco && !!tarjeta && !!gasto && !!ingreso);

    bien('registra un gasto', (await registrar({ tipo: 'Gasto', digitos: '10424', metodo: 'AthMovil', origen: banco, destino: gasto, comentario: 'Factura', dia: '2026-01-05' })).startsWith('Gasto guardado: $104.24.'), await texto('#exito'));
    bien('la fecha se queda después de guardar', (await valor('#fecha')) === '2026-01-05');
    bien('registra un ingreso', (await registrar({ tipo: 'Ingreso', digitos: '50000', origen: ingreso, destino: banco })).startsWith('Ingreso guardado: $500.00.'), await texto('#exito'));
    bien('registra una transferencia', (await registrar({ tipo: 'Transferencia', digitos: '20000', origen: banco, destino: tarjeta })).startsWith('Transferencia guardada: $200.00.'), await texto('#exito'));
    bien('registra una devolución', (await registrar({ tipo: 'Devolucion', digitos: '3000', origen: gasto, destino: tarjeta })).startsWith('Devolución guardada: $30.00.'), await texto('#exito'));
    bien('registra un gasto en efectivo', (await registrar({ tipo: 'Gasto', digitos: '100', metodo: 'Efectivo', destino: gasto })).startsWith('Gasto guardado: $1.00.'), await texto('#exito'));

    // Historial.
    await irA('historial?mes=2026-01');
    await esperar(`!!document.querySelector('#lista')`);
    bien('el Historial separa los totales', (await texto('#totales')) === 'Gastos (2) | $105.24 | Devoluciones (1) | $30.00 | Gasto neto | $75.24 | Ingresos (1) | $500.00 | Transferencias (1) | $200.00', await texto('#totales'));
    bien('muestra el comentario', (await fila('$104.24')).includes('Comentario: Factura'), await fila('$104.24'));

    // Editar y borrar.
    await accion('$1.00', '.accion-editar');
    await esperar(`document.querySelector('#monto')?.value === '1.00'`);
    await teclear('#monto', '5');
    bien('editar sigue el estilo cajero', (await valor('#monto')) === '10.05', await valor('#monto'));
    await tocar('#guardar');
    await esperar(`!!document.querySelector('#mensaje')`);
    bien('editar dice qué cambió', (await texto('#mensaje')) === 'Gasto actualizado. Monto: $1.00 → $10.05.', await texto('#mensaje'));
    await accion('$10.05', '.accion-borrar');
    await tocar('.confirmar-si');
    await esperar(`document.querySelector('#mensaje')?.innerText.startsWith('Gasto borrado')`, 5000);
    bien('borrar una la quita', (await leerBd('transacciones')).length === 4);

    // Exportar: el Excel que carga el sistema de contabilidad.
    vaciar();
    await tocar('#menu-exportar');
    await esperar(`!!document.querySelector('#quitar-fechas')`);
    await fecha('#desde', '2026-01-01');
    await fecha('#hasta', '2026-01-31');
    await esperar(`!document.querySelector('#exportar').disabled`, 5000);
    await teclear('#correo', 'nombre@ejemplo.com');
    await evaluar(`document.querySelector('#correo').blur()`);
    await dormir(200);
    await p.compartirFalla();
    await tocar('#exportar');
    const archivo = await esperarDescarga();
    bien('el nombre lleva el rango', archivo === 'Gastos_2026-01-01_a_2026-01-31.xlsx', archivo);
    const filas = leerFilas(join(descargas, archivo));
    bien('los encabezados', JSON.stringify(filas[0]) === JSON.stringify({ A: 'Date', B: 'filler', C: 'filler', D: 'filler', E: 'Account Cr', F: 'Account Dr', G: 'Debit', H: 'Credit' }));
    bien('dos filas por cada una de las 4', filas.length === 9, String(filas.length));
    const de = monto => filas.slice(1).filter(f => (f.G ?? f.H) === monto);
    bien('el gasto, con su comentario en D', JSON.stringify(de('104.24')) === JSON.stringify([{ A: '46027', D: 'Factura', E: banco, F: gasto, H: '104.24' }, { A: '46027', D: 'Factura', E: gasto, F: banco, G: '104.24' }]), JSON.stringify(de('104.24')));
    bien('el ingreso', JSON.stringify(de('500')[0]) === JSON.stringify({ A: '46027', E: ingreso, F: banco, H: '500' }), JSON.stringify(de('500')));
    bien('la transferencia', JSON.stringify(de('200')[0]) === JSON.stringify({ A: '46027', E: banco, F: tarjeta, H: '200' }), JSON.stringify(de('200')));
    bien('la devolución', JSON.stringify(de('30')[0]) === JSON.stringify({ A: '46027', E: gasto, F: tarjeta, H: '30' }), JSON.stringify(de('30')));
    bien('ofrece abrir el correo', (await evaluar(`document.querySelector('#abrir-correo').getAttribute('href')`)) === 'mailto:nombre@ejemplo.com?subject=Gastos');

    // Más.
    await tocar('#menu-mas');
    await esperar(`!!document.querySelector('#ir-borrar')`);
    await esperar(`!!document.querySelector('#proteccion')`, 5000);
    console.log('protección:', await texto('#proteccion'));
    bien('Más dice si está protegido', /Protegido contra borrado automático: (sí|no)\./.test(await texto('#proteccion')), await texto('#proteccion'));

    // Borrar todo.
    await irA('borrar-todo');
    await esperar(`!!document.querySelector('#confirmar-borrado')`);
    await teclear('#confirmacion', 'BORRAR');
    await tocar('#confirmar-borrado');
    await esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#mensaje')`);
    bien('borrar todo dice cuántas', (await texto('#mensaje')) === 'Se borraron 4 transacciones.', await texto('#mensaje'));
    bien('las cuentas siguen', (await leerBd('cuentasGasto')).length > 0 && (await leerBd('cuentasOrigen')).length > 0);
    bien('el correo sigue', JSON.stringify(await leerBd('ajustes')) === JSON.stringify([{ clave: 'correo', valor: 'nombre@ejemplo.com' }]), JSON.stringify(await leerBd('ajustes')));

    // Con muchas transacciones: unos años de uso. Son tiempos en este computador; un teléfono tardará más.
    const CANTIDAD = 3000;
    const muchas = [];
    for (let i = 0; i < CANTIDAD; i++) {
        muchas.push({ id: `bbbbbbbb-0000-0000-0000-${String(i).padStart(12, '0')}`, tipo: 'Gasto', fecha: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, monto: 10.25, metodoPago: 'Efectivo', cuentaOrigen: 'Efectivo', cuentaDestino: gasto, comentario: 'Comentario de prueba' });
    }
    await escribirBd('transacciones', muchas);
    vaciar();
    await irA('historial?mes=2025-06');
    let inicio = Date.now();
    await esperar(`!!document.querySelector('#lista .lista-fila')`);
    const tiempoHistorial = Date.now() - inicio;
    bien('el Historial muestra el mes', (await evaluar(`document.querySelectorAll('#lista .lista-fila').length`)) === 250);
    await irA('exportar?todo=1');
    await esperar(`document.querySelector('#total-Gasto')?.innerText.includes('(${CANTIDAD})')`);
    await p.compartirFalla();
    inicio = Date.now();
    await tocar('#exportar');
    const grande = await esperarDescarga(120000);
    const tiempoExcel = Date.now() - inicio;
    bien('exporta las 3000', leerFilas(join(descargas, grande)).length === CANTIDAD * 2 + 1);
    console.log(`TIEMPOS con ${CANTIDAD} transacciones: abrir un mes del Historial ${tiempoHistorial} ms | crear el Excel ${tiempoExcel} ms`);
    await irA('borrar-todo');
    await esperar(`!!document.querySelector('#confirmar-borrado')`);
    await teclear('#confirmacion', 'BORRAR');
    inicio = Date.now();
    await tocar('#confirmar-borrado');
    await esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#mensaje')`);
    bien('borra las 3000', (await texto('#mensaje')) === `Se borraron ${CANTIDAD} transacciones.`, await texto('#mensaje'));
    console.log(`TIEMPOS con ${CANTIDAD} transacciones: borrar todas ${Date.now() - inicio} ms`);

    await dormir(5000); // que el service worker termine de guardar todo en caché
}

if (etapa === 'sinred') {
    // En modo avión: todo menos enviar el correo.
    await irA('');
    bien('abre sin servidor', await esperar(`!!document.querySelector('#guardar')`));
    const cuentaGasto = (await opciones('#destino'))[0];
    bien('registra sin servidor', (await registrar({ tipo: 'Gasto', digitos: '777', metodo: 'Efectivo', destino: cuentaGasto, dia: '2026-03-01' })).startsWith('Gasto guardado: $7.77.'), await texto('#exito'));
    await irA('historial?mes=2026-03');
    await esperar(`!!document.querySelector('#lista .lista-fila')`);
    bien('el Historial sin servidor', (await texto('#total-Gasto')) === 'Gastos (1) | $7.77', await texto('#total-Gasto'));
    vaciar();
    await irA('exportar?todo=1');
    await esperar(`!document.querySelector('#exportar')?.disabled && !!document.querySelector('#total-Gasto')`);
    await p.compartirFalla();
    await tocar('#exportar');
    const archivo = await esperarDescarga();
    bien('exporta sin servidor', leerFilas(join(descargas, archivo)).length === 3, archivo);
    await irA('mas');
    bien('abre Más sin servidor', await esperar(`!!document.querySelector('#ir-importar')`));
    await irA('borrar-todo');
    await esperar(`!!document.querySelector('#confirmar-borrado')`);
    await teclear('#confirmacion', 'BORRAR');
    await tocar('#confirmar-borrado');
    await esperar(`location.pathname.endsWith('/historial') && !!document.querySelector('#mensaje')`);
    bien('borra todas sin servidor', (await texto('#mensaje')) === 'Se borró 1 transacción.', await texto('#mensaje'));
}

console.log('errores en consola:', p.consola.length ? p.consola : 'ninguno');
p.cerrar();
