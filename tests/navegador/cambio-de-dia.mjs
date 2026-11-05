// Comprueba que las fechas por defecto de Exportar y Borrar por fechas avanzan al cambiar el día, y que
// un rango escogido por el usuario no cambia. Adelanta el reloj de la página: no espera hasta mañana.
// Usa cuentas ficticias y BORRA las transacciones del navegador: córrelo con un perfil vacío, nunca con datos reales.
// Uso: node cambio-de-dia.mjs <puerto-de-depuración> <url-de-la-app> <carpeta-para-descargas>
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { conectar, crearBien, dormir } from './ayuda.mjs';

const [puerto, base, carpeta] = process.argv.slice(2);
const descargas = join(carpeta, 'descargas-cambio-de-dia');
mkdirSync(descargas, { recursive: true });
const bien = crearBien();
const p = await conectar(puerto, base);
const { cdp, evaluar, esperar, texto, valor, tocar, fecha, irA, escribirBd } = p;
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });

const REVISION = 45000; // la pantalla revisa cada 30 segundos
const texto10 = 'd => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0")';
const hoy = await evaluar(`(${texto10})(new Date())`);
const primero = hoy.slice(0, 8) + '01';
const nuevoDia = await evaluar(`(${texto10})(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1))`);
const delMesPasado = await evaluar(`(${texto10})(new Date(new Date().getFullYear(), new Date().getMonth(), 0))`);
const t = (n, fechaTexto, monto) => ({ id: `aaaaaaaa-0000-0000-0000-00000000000${n}`, tipo: 'Gasto', fecha: fechaTexto, monto, metodoPago: 'Efectivo', cuentaOrigen: 'Efectivo', cuentaDestino: 'Telefonos', comentario: '' });

// Mueve el reloj de la página hasta el día 1 del mes siguiente: cambian el día y el mes.
const adelantar = () => evaluar(`(() => { const real = Date.now.bind(Date); const d = new Date(); const dif = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12).getTime() - real(); Date.now = () => real() + dif; })()`);
const fechas = async () => `${await valor('#desde')} a ${await valor('#hasta')}`;
const abrirExportar = async (ruta = 'exportar') => { await irA(ruta); await esperar(`!!document.querySelector('#desde') && !!document.querySelector('#exportar') && !document.querySelector('#exportar').disabled`); };
const abrirBorrar = async () => { await irA('borrar'); await esperar(`!!document.querySelector('#desde')?.value && !!document.querySelector('#borrar-rango')`); };

await irA('');
await esperar(`!!document.querySelector('#guardar') || !!document.querySelector('#plantilla')`);
// Sin service worker, un servidor de prueba responde 404 a las direcciones internas.
await p.servicioListo();
await escribirBd('transacciones', [t(1, hoy, 10), t(2, nuevoDia, 20), t(3, delMesPasado, 40)], true);
await escribirBd('ajustes', [{ clave: 'correo', valor: 'nombre@ejemplo.com' }], true);

// Exportar: las fechas por defecto avanzan, y el aviso de "Abrir correo" no se pierde.
await abrirExportar();
bien('Exportar empieza en este mes', (await fechas()) === `${primero} a ${hoy}`, await fechas());
bien('Exportar cuenta solo lo de este mes', (await texto('#total-Gasto')) === 'Gastos (1) | $10.00', await texto('#total-Gasto'));
await p.compartirFalla();
await tocar('#exportar');
await esperar(`!!document.querySelector('#aviso-guardado')`, 20000);
await adelantar();
bien('Exportar avanza solo', await esperar(`document.querySelector('#hasta').value === ${JSON.stringify(nuevoDia)}`, REVISION), await fechas());
bien('Desde también avanza al cambiar el mes', (await valor('#desde')) === nuevoDia, await fechas());
await esperar(`document.querySelector('#total-Gasto')?.innerText.includes('$20.00')`, 5000);
bien('Exportar actualiza los totales', (await texto('#total-Gasto')) === 'Gastos (1) | $20.00', await texto('#total-Gasto'));
bien('Exportar actualiza las palabras', (await texto('#hasta-palabras')).includes(', 1 de '), await texto('#hasta-palabras'));
bien('el aviso de Abrir correo sigue ahí', (await texto('#abrir-correo')) === 'Abrir correo');

// Exportar: una fecha escogida a mano no cambia.
await abrirExportar();
await fecha('#hasta', hoy);
await adelantar();
await dormir(REVISION);
bien('Exportar con una fecha a mano no cambia', (await fechas()) === `${primero} a ${hoy}`, await fechas());

// Exportar: sin fechas, sigue sin fechas.
await abrirExportar();
await tocar('#quitar-fechas');
await esperar(`document.querySelector('#total-Gasto')?.innerText.includes('(3)')`, 5000);
await adelantar();
await dormir(REVISION);
bien('Exportar sin fechas sigue sin fechas', (await fechas()) === ' a ', await fechas());

// Exportar: un rango que viene de otra pantalla no cambia.
await abrirExportar('exportar?todo=1');
await adelantar();
await dormir(REVISION);
bien('Exportar todo sigue sin fechas', (await fechas()) === ' a ', await fechas());
await abrirExportar(`exportar?desde=${primero}&hasta=${hoy}`);
await adelantar();
await dormir(REVISION);
bien('Exportar este rango no cambia', (await fechas()) === `${primero} a ${hoy}`, await fechas());

// Borrar por fechas: avanza, y la confirmación usa las fechas nuevas.
await abrirBorrar();
bien('Borrar empieza en este mes', (await fechas()) === `${primero} a ${hoy}`, await fechas());
await adelantar();
bien('Borrar avanza solo', await esperar(`document.querySelector('#hasta').value === ${JSON.stringify(nuevoDia)}`, REVISION), await fechas());
bien('Borrar actualiza Desde', (await valor('#desde')) === nuevoDia);
await esperar(`document.querySelector('#total-Gasto')?.innerText.includes('$20.00')`, 5000);
bien('Borrar actualiza los totales', (await texto('#total-Gasto')) === 'Gastos (1) | $20.00', await texto('#total-Gasto'));
await tocar('#borrar-rango');
bien('la confirmación usa el rango nuevo', (await texto('#confirmar-total-Gasto')) === 'Gastos (1) | $20.00', await texto('#confirmar-total-Gasto'));
await tocar('#confirmar-no');

// Borrar por fechas: con la confirmación abierta no se mueve; al cancelar, sí.
await abrirBorrar();
await tocar('#borrar-rango');
await adelantar();
await dormir(REVISION);
bien('con la confirmación abierta no se mueve', (await fechas()) === `${primero} a ${hoy}`, await fechas());
bien('los totales de la confirmación no cambian', (await texto('#confirmar-total-Gasto')) === 'Gastos (1) | $10.00', await texto('#confirmar-total-Gasto'));
await tocar('#confirmar-no');
bien('al cancelar, avanza', await esperar(`document.querySelector('#hasta').value === ${JSON.stringify(nuevoDia)}`, REVISION), await fechas());

// Borrar por fechas: a mano no cambia.
await abrirBorrar();
await fecha('#desde', delMesPasado);
await esperar(`!!document.querySelector('#borrar-rango')`, 5000);
await adelantar();
await dormir(REVISION);
bien('Borrar con una fecha a mano no cambia', (await fechas()) === `${delMesPasado} a ${hoy}`, await fechas());

console.log('errores en consola:', p.consola.length ? p.consola : 'ninguno');
p.cerrar();
