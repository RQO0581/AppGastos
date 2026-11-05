using Microsoft.JSInterop;

namespace AppGastos.Servicios;

public record AperturaRespaldo(string Estado, string? Contenido);

// El cifrado y la base de datos los maneja el navegador (js/respaldo.js). La revisión la hace RevisorRespaldo.
public class ServicioRespaldo(IJSRuntime js)
{
    // Devuelve el texto del archivo, ya cifrado.
    public ValueTask<string> CrearAsync(string contrasena) =>
        js.InvokeAsync<string>("appGastos.respaldo.crear", contrasena);

    public ValueTask<AperturaRespaldo> AbrirAsync(string textoArchivo, string contrasena) =>
        js.InvokeAsync<AperturaRespaldo>("appGastos.respaldo.abrir", textoArchivo, contrasena);

    public ValueTask<Dictionary<string, int>> ContarAsync() =>
        js.InvokeAsync<Dictionary<string, int>>("appGastos.respaldo.contar");

    public ValueTask RestaurarAsync(string contenido) =>
        js.InvokeVoidAsync("appGastos.respaldo.restaurar", contenido);

    public async ValueTask<bool> HayRecordatorioAsync() =>
        await js.InvokeAsync<bool?>("appGastos.almacen.obtenerAjuste", ReglasRespaldo.ClaveRecordatorio) == true;

    public ValueTask QuitarRecordatorioAsync() =>
        js.InvokeVoidAsync("appGastos.almacen.guardarAjuste", ReglasRespaldo.ClaveRecordatorio, false);
}
