using System.Globalization;
using AppGastos.Modelos;

namespace AppGastos.Servicios;

public record TotalPorTipo(TipoTransaccion Tipo, int Cantidad, decimal Suma);

// Lo que el Historial calcula, sin nada de pantalla, para que las pruebas lo comprueben.
public static class ResumenHistorial
{
    private const string FormatoMes = "yyyy-MM";

    // Siempre devuelve los tres tipos, aunque alguno esté en cero. Nunca se mezclan:
    // pagar una tarjeta no es un gasto nuevo, porque el gasto se registró al comprar con ella.
    public static IReadOnlyList<TotalPorTipo> Totales(IEnumerable<Transaccion> transacciones)
    {
        var lista = transacciones.ToList();
        return Enum.GetValues<TipoTransaccion>()
            .Select(tipo =>
            {
                var delTipo = lista.Where(t => t.Tipo == tipo).ToList();
                return new TotalPorTipo(tipo, delTipo.Count, delTipo.Sum(t => t.Monto));
            })
            .ToList();
    }

    public static IReadOnlyList<Transaccion> MasRecientesPrimero(IEnumerable<Transaccion> transacciones) =>
        transacciones.OrderByDescending(t => t.Fecha).ToList();

    public static DateOnly PrimerDiaDelMes(DateOnly fecha) => new(fecha.Year, fecha.Month, 1);

    public static DateOnly UltimoDiaDelMes(DateOnly fecha) => PrimerDiaDelMes(fecha).AddMonths(1).AddDays(-1);

    // Un texto que no es un mes válido lleva al mes de hoy, en lugar de mostrar un error.
    public static DateOnly LeerMes(string? texto, DateOnly hoy) =>
        DateOnly.TryParseExact(texto, FormatoMes, CultureInfo.InvariantCulture, DateTimeStyles.None, out var mes)
            ? mes
            : PrimerDiaDelMes(hoy);

    public static string TextoMes(DateOnly fecha) => fecha.ToString(FormatoMes, CultureInfo.InvariantCulture);
}
