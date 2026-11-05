using Microsoft.JSInterop;

namespace AppGastos.Servicios;

public class CompartirArchivos(IJSRuntime js)
{
    private const string TipoExcel = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    // Devuelve "compartido", "cancelado", "guardado" o "guardado: <motivo>" si compartir falló.
    public ValueTask<string> CompartirOGuardarExcelAsync(string nombreArchivo, byte[] contenido) =>
        js.InvokeAsync<string>("appGastos.compartirOGuardar", nombreArchivo, TipoExcel, contenido);

    public ValueTask<string> CompartirOGuardarRespaldoAsync(string nombreArchivo, byte[] contenido) =>
        js.InvokeAsync<string>("appGastos.compartirOGuardar", nombreArchivo, "application/json", contenido);

    public ValueTask<bool> CopiarTextoAsync(string texto) =>
        js.InvokeAsync<bool>("appGastos.copiarTexto", texto);
}
