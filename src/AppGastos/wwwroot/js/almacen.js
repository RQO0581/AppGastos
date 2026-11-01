window.appGastos = window.appGastos || {};

(function () {
    const NOMBRE_BD = "AppGastos";
    const VERSION_BD = 1;
    const TRANSACCIONES = "transacciones";
    const CUENTAS_ORIGEN = "cuentasOrigen";
    const CUENTAS_GASTO = "cuentasGasto";
    const AJUSTES = "ajustes";
    const INDICE_FECHA = "fecha";

    let conexion = null;

    function abrir() {
        if (conexion) {
            return conexion;
        }

        conexion = new Promise((resolver, rechazar) => {
            const solicitud = indexedDB.open(NOMBRE_BD, VERSION_BD);

            // Solo corre al crear la base de datos o al subir VERSION_BD.
            solicitud.onupgradeneeded = () => {
                const bd = solicitud.result;
                const transacciones = bd.createObjectStore(TRANSACCIONES, { keyPath: "id" });
                transacciones.createIndex(INDICE_FECHA, "fecha");
                bd.createObjectStore(CUENTAS_ORIGEN, { keyPath: "nombre" });
                bd.createObjectStore(CUENTAS_GASTO, { keyPath: "nombre" });
                bd.createObjectStore(AJUSTES, { keyPath: "clave" });
            };

            solicitud.onsuccess = () => {
                const bd = solicitud.result;
                // Si otra pestaña trae una versión nueva, se cierra para no bloquearla.
                bd.onversionchange = () => {
                    bd.close();
                    conexion = null;
                };
                resolver(bd);
            };

            solicitud.onerror = () => {
                conexion = null;
                rechazar(solicitud.error);
            };

            solicitud.onblocked = () => {
                conexion = null;
                rechazar(new Error("La base de datos está abierta en otra ventana."));
            };
        });

        return conexion;
    }

    // Resuelve al completarse la transacción, no al terminar cada operación: solo entonces
    // el dato está guardado. Si algo falla, IndexedDB deshace toda la transacción.
    async function ejecutar(almacenes, modo, trabajo) {
        const bd = await abrir();
        return new Promise((resolver, rechazar) => {
            const transaccion = bd.transaction(almacenes, modo);
            const salida = { valor: null };
            transaccion.oncomplete = () => resolver(salida.valor);
            let fallo = null;
            transaccion.onerror = () => rechazar(fallo ?? transaccion.error);
            transaccion.onabort = () => rechazar(fallo ?? transaccion.error);
            try {
                trabajo(transaccion, salida);
            } catch (error) {
                // Sin esto, lo ya hecho se confirmaría: un clear seguido de un error vaciaría el almacén.
                fallo = error;
                transaccion.abort();
            }
        });
    }

    function rangoDeFechas(desde, hasta) {
        if (desde && hasta) {
            return IDBKeyRange.bound(desde, hasta);
        }
        if (desde) {
            return IDBKeyRange.lowerBound(desde);
        }
        return hasta ? IDBKeyRange.upperBound(hasta) : null;
    }

    function esRangoInvertido(desde, hasta) {
        return desde && hasta && desde > hasta;
    }

    function listarTodo(almacen) {
        return ejecutar(almacen, "readonly", (transaccion, salida) => {
            const solicitud = transaccion.objectStore(almacen).getAll();
            solicitud.onsuccess = () => salida.valor = solicitud.result;
        });
    }

    function reemplazarTodo(almacen, elementos) {
        return ejecutar(almacen, "readwrite", transaccion => {
            const destino = transaccion.objectStore(almacen);
            destino.clear();
            elementos.forEach(elemento => destino.put(elemento));
        });
    }

    window.appGastos.almacen = {
        guardarTransaccion: transaccionNueva => ejecutar(TRANSACCIONES, "readwrite", transaccion => {
            transaccion.objectStore(TRANSACCIONES).put(transaccionNueva);
        }),

        obtenerTransaccion: id => ejecutar(TRANSACCIONES, "readonly", (transaccion, salida) => {
            const solicitud = transaccion.objectStore(TRANSACCIONES).get(id);
            solicitud.onsuccess = () => salida.valor = solicitud.result ?? null;
        }),

        // Las fechas son texto aaaa-mm-dd, que se ordena igual que las fechas.
        listarTransacciones: async (desde, hasta) => {
            if (esRangoInvertido(desde, hasta)) {
                return [];
            }
            return ejecutar(TRANSACCIONES, "readonly", (transaccion, salida) => {
                const indice = transaccion.objectStore(TRANSACCIONES).index(INDICE_FECHA);
                const solicitud = indice.getAll(rangoDeFechas(desde, hasta));
                solicitud.onsuccess = () => salida.valor = solicitud.result;
            });
        },

        borrarTransaccion: id => ejecutar(TRANSACCIONES, "readwrite", transaccion => {
            transaccion.objectStore(TRANSACCIONES).delete(id);
        }),

        // La transacción solo incluye el almacén de transacciones: no puede tocar cuentas ni ajustes.
        borrarTransaccionesPorRango: async (desde, hasta) => {
            if (esRangoInvertido(desde, hasta)) {
                return 0;
            }
            return ejecutar(TRANSACCIONES, "readwrite", (transaccion, salida) => {
                salida.valor = 0;
                const indice = transaccion.objectStore(TRANSACCIONES).index(INDICE_FECHA);
                const solicitud = indice.openCursor(rangoDeFechas(desde, hasta));
                solicitud.onsuccess = () => {
                    const cursor = solicitud.result;
                    if (cursor) {
                        cursor.delete();
                        salida.valor++;
                        cursor.continue();
                    }
                };
            });
        },

        listarCuentasOrigen: () => listarTodo(CUENTAS_ORIGEN),
        reemplazarCuentasOrigen: cuentas => reemplazarTodo(CUENTAS_ORIGEN, cuentas),
        listarCuentasGasto: () => listarTodo(CUENTAS_GASTO),
        reemplazarCuentasGasto: cuentas => reemplazarTodo(CUENTAS_GASTO, cuentas),

        obtenerAjuste: clave => ejecutar(AJUSTES, "readonly", (transaccion, salida) => {
            const solicitud = transaccion.objectStore(AJUSTES).get(clave);
            solicitud.onsuccess = () => salida.valor = solicitud.result?.valor ?? null;
        }),

        guardarAjuste: (clave, valor) => ejecutar(AJUSTES, "readwrite", transaccion => {
            transaccion.objectStore(AJUSTES).put({ clave, valor });
        }),

        // Pide al navegador que no borre los datos cuando falte espacio. Puede responder que no.
        pedirPersistencia: async () => {
            if (!navigator.storage || !navigator.storage.persist) {
                return false;
            }
            return navigator.storage.persist();
        },
    };
})();
