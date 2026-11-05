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
    // Con el teléfono vacío, la app manda a Importar cuentas al abrir: se espera a que termine de decidir,
    // porque si no, esa redirección llega después de tocar Más y la prueba termina en Importar.
    await irA('');
    await esperar(`!!document.querySelector('#menu-mas') && !document.body.innerText.includes('Cargando')`, 60000);
    await p.servicioListo();
    await new Promise(r => setTimeout(r, 500));
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
bien('está en negritas', Number(await estilo('fontWeight')) >= 700, await estilo('fontWeight'));
bien('está al final de la pantalla', await evaluar(`document.querySelector('main').lastElementChild === document.querySelector('#version') || !document.querySelector('#version').nextElementSibling`));
await evaluar(`document.querySelector('#version').scrollIntoView({ block: 'center' })`);
const separacion = () => evaluar(`document.querySelector('.menu-inferior').getBoundingClientRect().top - document.querySelector('#version').getBoundingClientRect().bottom`);
bien('el menú no la tapa', (await separacion()) >= 0, String(await separacion()));
bien('está justo encima del menú', (await separacion()) <= 8, `${await separacion()} px`);

// Bajar la versión no debe mover lo demás: entre dos párrafos, la separación es el mayor de sus márgenes, no la suma.
const separacionBotones = await evaluar(`(() => { const a = document.querySelector('#ir-importar').parentElement; const b = document.querySelector('#ir-borrar').parentElement; return { hueco: b.getBoundingClientRect().top - a.getBoundingClientRect().bottom, esperado: Math.max(parseFloat(getComputedStyle(a).marginBottom), parseFloat(getComputedStyle(b).marginTop)) }; })()`);
bien('los botones conservan su separación', Math.abs(separacionBotones.hueco - separacionBotones.esperado) < 0.5, `${separacionBotones.hueco} px, esperado ${separacionBotones.esperado} px`);

// En un teléfono alto queda abajo sin necesidad de scroll, y en uno bajo no tapa el contenido.
for (const [ancho, alto] of [[390, 844], [320, 480]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: true });
    await evaluar(`window.scrollTo(0, document.documentElement.scrollHeight)`);
    await new Promise(r => setTimeout(r, 200));
    bien(`a ${ancho}x${alto}, justo encima del menú al final`, (await separacion()) >= 0 && (await separacion()) <= 8, `${await separacion()} px`);
    bien(`a ${ancho}x${alto}, no tapa lo anterior`, await evaluar(`(() => { const v = document.querySelector('#version'); const a = v.previousElementSibling.getBoundingClientRect().bottom; return v.getBoundingClientRect().top + parseFloat(getComputedStyle(v).paddingTop) >= a; })()`));
    bien(`a ${ancho}x${alto}, sin desborde a los lados`, await evaluar('document.documentElement.scrollWidth <= innerWidth'));
    if (carpeta) {
        const { result } = await cdp('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(carpeta, `version-${ancho}x${alto}.png`), Buffer.from(result.data, 'base64'));
    }
}
bien('sin scroll en un teléfono alto', await (async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await new Promise(r => setTimeout(r, 200)); return evaluar('document.documentElement.scrollHeight <= innerHeight'); })());
if (carpeta) {
    const { result } = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(carpeta, 'version.png'), Buffer.from(result.data, 'base64'));
}
console.log('errores en consola:', p.consola.length ? p.consola : 'ninguno');
p.cerrar();
