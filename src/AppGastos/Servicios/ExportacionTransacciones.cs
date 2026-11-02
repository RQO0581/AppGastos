using System.Globalization;
using AppGastos.Modelos;

namespace AppGastos.Servicios;

// Las reglas de la pantalla de Exportar, sin nada de pantalla, para que las pruebas las comprueben.
public static class ExportacionTransacciones
{
    private const string AsuntoCorreo = "Gastos";

    // Las transacciones de cualquier tipo usan la misma regla de origen y destino.
    public static IReadOnlyList<MovimientoExcel> Movimientos(IEnumerable<Transaccion> transacciones) =>
        transacciones
            .OrderBy(t => t.Fecha)
            .Select(t => new MovimientoExcel(t.Fecha, t.CuentaOrigen, t.CuentaDestino, t.Monto))
            .ToList();

    // El nombre lleva el rango porque el teléfono guarda cada exportación como otra copia en Descargas.
    // Las fechas van con números: un nombre de archivo no debe llevar espacios, y este formato no se confunde.
    public static string NombreArchivo(DateOnly? desde, DateOnly? hasta, DateOnly hoy) => (desde, hasta) switch
    {
        ({ } inicio, { } fin) => $"Gastos_{Texto(inicio)}_a_{Texto(fin)}.xlsx",
        ({ } inicio, null) => $"Gastos_desde_{Texto(inicio)}.xlsx",
        (null, { } fin) => $"Gastos_hasta_{Texto(fin)}.xlsx",
        _ => $"Gastos_todo_al_{Texto(hoy)}.xlsx",
    };

    public static bool RangoEsValido(DateOnly? desde, DateOnly? hasta) =>
        desde is null || hasta is null || desde <= hasta;

    // Solo evita errores de escritura. La aplicación de correo es la que decide si la dirección sirve.
    public static bool CorreoEsValido(string correo)
    {
        var limpio = correo.Trim();
        var arroba = limpio.IndexOf('@');
        return arroba > 0
            && arroba == limpio.LastIndexOf('@')
            && arroba < limpio.Length - 1
            && !limpio.Any(char.IsWhiteSpace);
    }

    public static string EnlaceCorreo(string correo) =>
        // La @ queda sin codificar: algunas apps de correo no entienden %40 en el destinatario.
        $"mailto:{Uri.EscapeDataString(correo.Trim()).Replace("%40", "@")}?subject={Uri.EscapeDataString(AsuntoCorreo)}";

    private static string Texto(DateOnly fecha) => fecha.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
