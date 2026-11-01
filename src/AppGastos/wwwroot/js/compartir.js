window.appGastos = window.appGastos || {};

window.appGastos.compartirArchivo = async function (nombre, tipo, contenido) {
    const archivo = new File([contenido], nombre, { type: tipo });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try {
            // Solo se envía el archivo: añadir título o texto puede hacer que algunas apps lo ignoren.
            await navigator.share({ files: [archivo] });
            return "compartido";
        } catch (error) {
            return error.name === "AbortError" ? "cancelado" : `error: ${error.name}: ${error.message}`;
        }
    }

    // Sin Web Share con archivos, como en muchas PC, se descarga.
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
    return "descargado";
};
