using Microsoft.JSInterop;

namespace AppGastos.Servicios;

public class CompartirArchivos(IJSRuntime js)
{
    private const string TipoExcel = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    // Devuelve "compartido", "cancelado", "descargado" o "error: ...".
    public ValueTask<string> CompartirExcelAsync(string nombreArchivo, byte[] contenido) =>
        js.InvokeAsync<string>("appGastos.compartirArchivo", nombreArchivo, TipoExcel, contenido);
}
