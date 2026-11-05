// Comprueba la versión en la pantalla Más. Para comprobar el sitio de pruebas, pásale su dirección.
// No guarda ni borra datos.
// Uso: node version.mjs <puerto-de-depuración> <url-de-la-app> [carpeta-para-la-captura]
// Necesita Edge o Chrome abierto con --remote-debugging-port y la app publicada en esa URL.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conectar, crearBien } from './ayuda.mjs';

const [puerto, base, carpeta] = process.argv.slice(2);
const bien = crearBien();
const p = await conectar(puerto, base);
const { cdp, evaluar, esperar, texto, irA } = p;

await irA('mas');
await esperar(`!!document.querySelector('#version') || !!document.querySelector('.menu-inferior')`, 60000);
if (!(await evaluar(`!!document.querySelector('#version')`))) {
    // Un servidor de prueba sin service worker no conoce esta dirección: se entra por el menú.
    await irA('');
    await esperar(`!!document.querySelector('#menu-mas')`, 60000);
    await p.servicioListo();
    await p.tocar('#menu-mas');
    await esperar(`!!document.querySelector('#version')`, 10000);
}

const textoVersion = await texto('#version');
console.log('version:', textoVersion);
const m = textoVersion.match(/^Versión: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})$/);
bien('el formato es Versión: aaaa-mm-dd hh:mm:ss', !!m, textoVersion);

// La hora de Puerto Rico, según el navegador: si la versión estuviera en UTC, iría 4 horas por delante.
const ahora = await evaluar(`(() => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date()); const v = t => f.find(x => x.type === t).value; return v('year') + '-' + v('month') + '-' + v('day') + ' ' + v('hour') + ':' + v('minute') + ':' + v('second'); })()`);
const compilada = m ? m[1] : '';
console.log('hora de Puerto Rico ahora:', ahora);
bien('no va por delante de la hora de Puerto Rico', compilada <= ahora, `${compilada} frente a ${ahora}`);

const estilo = prop => evaluar(`getComputedStyle(document.querySelector('#version')).${prop}`);
bien('se ve discreta: letra pequeña', parseFloat(await estilo('fontSize')) < 16, await estilo('fontSize'));
bien('se ve discreta: en gris', (await estilo('color')) === 'rgb(95, 95, 95)', await estilo('color'));
bien('está al final de la pantalla', await evaluar(`document.querySelector('main').lastElementChild === document.querySelector('#version') || !document.querySelector('#version').nextElementSibling`));
await evaluar(`document.querySelector('#version').scrollIntoView({ block: 'center' })`);
bien('el menú no la tapa', await evaluar(`document.querySelector('#version').getBoundingClientRect().bottom <= document.querySelector('.menu-inferior').getBoundingClientRect().top`));
if (carpeta) {
    const { result } = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(carpeta, 'version.png'), Buffer.from(result.data, 'base64'));
}
console.log('errores en consola:', p.consola.length ? p.consola : 'ninguno');
p.cerrar();
