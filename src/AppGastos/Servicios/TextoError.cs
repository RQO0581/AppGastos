namespace AppGastos.Servicios;

public static class TextoError
{
    // Un error que viene de JavaScript trae en su mensaje el rastro técnico, o "undefined" si no lo tiene.
    // Al usuario solo le sirve la primera línea, que es la que explica qué pasó.
    public static string Detalle(Exception error)
    {
        var primeraLinea = error.Message.Split('\n', 2)[0].Trim();
        return primeraLinea.Length > 0 ? primeraLinea : "Error desconocido";
    }
}
