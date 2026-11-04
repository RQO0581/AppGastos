using System.Text.Json;
using AppGastos.Modelos;
using Microsoft.JSInterop;

namespace AppGastos.Servicios;

public record EstadoTestamento(bool HayPin, bool HayTestamento, int EsperaSegundos);

public record ResultadoPin(bool Correcto, int IntentosRestantes, int EsperaSegundos);

// El cifrado lo hace el navegador (js/testamento.js). Aquí solo se convierte el documento a texto y de vuelta.
public class ServicioTestamento(IJSRuntime js)
{
    public const int LargoPin = 4;

    // Deja solo los dígitos, hasta el largo del PIN, aunque el teclado permita otra cosa.
    public static string LimpiarPin(string? texto) =>
        new((texto ?? "").Where(char.IsAsciiDigit).Take(LargoPin).ToArray());

    public static bool PinEsValido(string? pin) =>
        pin is { Length: LargoPin } && pin.All(char.IsAsciiDigit);

    public static string Serializar(DocumentoTestamento documento) => JsonSerializer.Serialize(documento);

    public static DocumentoTestamento? Deserializar(string json) => JsonSerializer.Deserialize<DocumentoTestamento>(json);

    public ValueTask<EstadoTestamento> ObtenerEstadoAsync() =>
        js.InvokeAsync<EstadoTestamento>("appGastos.testamento.estado");

    public ValueTask CrearPinAsync(string pin) =>
        js.InvokeVoidAsync("appGastos.testamento.crearPin", pin);

    public ValueTask<ResultadoPin> DesbloquearAsync(string pin) =>
        js.InvokeAsync<ResultadoPin>("appGastos.testamento.desbloquear", pin);

    public async ValueTask<DocumentoTestamento?> LeerAsync()
    {
        var json = await js.InvokeAsync<string?>("appGastos.testamento.leer");
        return json is null ? null : Deserializar(json);
    }

    public ValueTask GuardarAsync(DocumentoTestamento documento) =>
        js.InvokeVoidAsync("appGastos.testamento.guardar", Serializar(documento));

    public ValueTask BloquearAsync() =>
        js.InvokeVoidAsync("appGastos.testamento.bloquear");

    // Borra el testamento y el PIN en una sola transacción.
    public ValueTask BorrarTodoAsync() =>
        js.InvokeVoidAsync("appGastos.testamento.borrarTodo");

    public ValueTask VigilarAsync<T>(DotNetObjectReference<T> pantalla) where T : class =>
        js.InvokeVoidAsync("appGastos.testamento.vigilar", pantalla);

    public ValueTask DejarDeVigilarAsync() =>
        js.InvokeVoidAsync("appGastos.testamento.dejarDeVigilar");
}
