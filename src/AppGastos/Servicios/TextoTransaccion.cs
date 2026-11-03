using System.Globalization;
using AppGastos.Modelos;

namespace AppGastos.Servicios;

// Los mensajes sobre una transacción, en un solo lugar para que todas las pantallas digan lo mismo.
public static class TextoTransaccion
{
    // Los montos no usan el idioma del teléfono: en algunos idiomas 104.24 se vería como 104,24.
    // El signo va antes del dólar: el Gasto neto puede ser negativo.
    public static string Monto(decimal monto) =>
        (monto < 0 ? "-$" : "$") + Math.Abs(monto).ToString("N2", CultureInfo.InvariantCulture);

    public static string Cuentas(Transaccion t) => $"De {t.CuentaOrigen} a {t.CuentaDestino}";

    // El nombre para mostrar: en el código no se usan acentos, y en pantalla debe decir "Devolución".
    public static string Nombre(TipoTransaccion tipo) => tipo switch
    {
        TipoTransaccion.Gasto => "Gasto",
        TipoTransaccion.Ingreso => "Ingreso",
        TipoTransaccion.Transferencia => "Transferencia",
        TipoTransaccion.Devolucion => "Devolución",
        _ => throw new ArgumentOutOfRangeException(nameof(tipo)),
    };

    public static string Plural(TipoTransaccion tipo) => tipo switch
    {
        TipoTransaccion.Gasto => "Gastos",
        TipoTransaccion.Ingreso => "Ingresos",
        TipoTransaccion.Transferencia => "Transferencias",
        TipoTransaccion.Devolucion => "Devoluciones",
        _ => throw new ArgumentOutOfRangeException(nameof(tipo)),
    };

    public static string Guardada(Transaccion t) => Resumen(t, "guardado", "guardada");

    public static string Borrada(Transaccion t) => Resumen(t, "borrado", "borrada");

    public static string PreguntaBorrar(Transaccion t) => t.Tipo switch
    {
        TipoTransaccion.Gasto => $"¿Seguro que deseas borrar este gasto de {Monto(t.Monto)}?",
        TipoTransaccion.Ingreso => $"¿Seguro que deseas borrar este ingreso de {Monto(t.Monto)}?",
        TipoTransaccion.Transferencia => $"¿Seguro que deseas borrar esta transferencia de {Monto(t.Monto)}?",
        TipoTransaccion.Devolucion => $"¿Seguro que deseas borrar esta devolución de {Monto(t.Monto)}?",
        _ => throw new ArgumentOutOfRangeException(nameof(t)),
    };

    // Dice qué cambió al editar, para poder confirmarlo de un vistazo.
    public static string Cambios(Transaccion antes, Transaccion despues)
    {
        var cambios = new List<string>();
        Comparar(cambios, "Tipo", Nombre(antes.Tipo), Nombre(despues.Tipo));
        Comparar(cambios, "Fecha", FormatoFecha.EnPalabras(antes.Fecha), FormatoFecha.EnPalabras(despues.Fecha));
        Comparar(cambios, "Monto", Monto(antes.Monto), Monto(despues.Monto));
        Comparar(cambios, "Método de pago", TextoMetodo(antes.MetodoPago), TextoMetodo(despues.MetodoPago));
        Comparar(cambios, "Cuenta de origen", antes.CuentaOrigen, despues.CuentaOrigen);
        Comparar(cambios, "Cuenta de destino", antes.CuentaDestino, despues.CuentaDestino);

        if (cambios.Count == 0)
        {
            return "No hubo cambios.";
        }

        var actualizado = EsFemenino(despues.Tipo) ? "actualizada" : "actualizado";
        return $"{Nombre(despues.Tipo)} {actualizado}. {string.Join(". ", cambios)}.";
    }

    public static string TextoMetodo(MetodoPago? metodo) =>
        metodo is { } valor ? BorradorTransaccion.TextoMetodo(valor) : "Sin método";

    private static bool EsFemenino(TipoTransaccion tipo) =>
        tipo is TipoTransaccion.Transferencia or TipoTransaccion.Devolucion;

    private static void Comparar(List<string> cambios, string campo, string antes, string despues)
    {
        if (antes != despues)
        {
            cambios.Add($"{campo}: {antes} → {despues}");
        }
    }

    private static string Resumen(Transaccion t, string masculino, string femenino)
    {
        var accion = EsFemenino(t.Tipo) ? femenino : masculino;
        return $"{Nombre(t.Tipo)} {accion}: {Monto(t.Monto)}. {FormatoFecha.EnPalabras(t.Fecha)}. {Cuentas(t)}.";
    }
}
