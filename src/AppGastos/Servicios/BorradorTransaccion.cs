using System.Globalization;
using System.Text.RegularExpressions;
using AppGastos.Modelos;

namespace AppGastos.Servicios;

public record CatalogoCuentas(
    IReadOnlyList<CuentaOrigen> Origen,
    IReadOnlyList<CuentaGasto> Gasto,
    IReadOnlyList<CuentaIngreso> Ingreso);

// Las reglas del formulario, sin nada de pantalla: así las pruebas automáticas pueden comprobarlas.
public partial class BorradorTransaccion(CatalogoCuentas catalogo, DateOnly hoy)
{
    // Un número de JavaScript conserva los centavos exactos hasta este tamaño.
    private const decimal MontoMaximo = 99_999_999.99m;

    private DateOnly hoy = hoy;

    public TipoTransaccion Tipo { get; private set; } = TipoTransaccion.Gasto;
    public DateOnly? Fecha { get; set; } = hoy;
    public string TextoMonto { get; set; } = "";
    public MetodoPago? Metodo { get; private set; }
    public string Origen { get; private set; } = "";
    public string Destino { get; private set; } = "";

    // En efectivo la cuenta es una sola, así que no se pregunta.
    public bool OrigenEsAutomatico => Tipo == TipoTransaccion.Gasto && Metodo == MetodoPago.Efectivo;

    public string EtiquetaOrigen => Tipo switch
    {
        TipoTransaccion.Gasto => "Cuenta con la que se pagó",
        TipoTransaccion.Ingreso => "Cuenta de ingreso",
        _ => "Cuenta de donde sale el dinero",
    };

    public string EtiquetaDestino => Tipo switch
    {
        TipoTransaccion.Gasto => "Cuenta de gasto",
        TipoTransaccion.Ingreso => "Cuenta donde entra el dinero",
        _ => "Cuenta a donde entra el dinero",
    };

    public IReadOnlyList<string> OpcionesOrigen => Tipo switch
    {
        TipoTransaccion.Gasto => Metodo is { } metodo ? CuentasDelMetodo(metodo) : [],
        TipoTransaccion.Ingreso => Ordenar(catalogo.Ingreso.Select(c => c.Nombre)),
        _ => Ordenar(catalogo.Origen.Select(c => c.Nombre)),
    };

    public IReadOnlyList<string> OpcionesDestino => Tipo switch
    {
        TipoTransaccion.Gasto => Ordenar(catalogo.Gasto.Select(c => c.Nombre)),
        TipoTransaccion.Ingreso => CuentasDeTipo(TipoCuentaOrigen.Banco, TipoCuentaOrigen.Efectivo),
        _ => Ordenar(catalogo.Origen.Select(c => c.Nombre).Where(nombre => !EsLaMismaCuenta(nombre, Origen))),
    };

    public string? MotivoTipoNoDisponible(TipoTransaccion tipo) => tipo switch
    {
        TipoTransaccion.Ingreso when catalogo.Ingreso.Count == 0 =>
            "Para registrar ingresos, importa un catálogo con cuentas en la hoja CuentasIngreso.",
        TipoTransaccion.Transferencia when catalogo.Origen.Count < 2 =>
            "Para registrar transferencias, el catálogo necesita al menos dos cuentas en la hoja CuentasOrigen.",
        _ => null,
    };

    public string? MotivoMetodoNoDisponible(MetodoPago metodo) =>
        CuentasDelMetodo(metodo).Count > 0
            ? null
            : $"{TextoMetodo(metodo)} no está disponible porque el catálogo no tiene cuentas para ese método.";

    public static string TextoMetodo(MetodoPago metodo) => metodo switch
    {
        MetodoPago.Efectivo => "Efectivo",
        MetodoPago.TarjetaDebito => "Tarjeta de débito",
        MetodoPago.TarjetaCredito => "Tarjeta de crédito",
        MetodoPago.AthMovil => "ATH Móvil",
        _ => throw new ArgumentOutOfRangeException(nameof(metodo)),
    };

    public void CambiarTipo(TipoTransaccion tipo)
    {
        if (tipo == Tipo)
        {
            return;
        }

        // Las listas de cuentas son distintas en cada tipo. La fecha y el monto siguen sirviendo.
        Tipo = tipo;
        Metodo = null;
        Origen = "";
        Destino = "";
    }

    public void CambiarMetodo(MetodoPago metodo)
    {
        Metodo = metodo;
        var opciones = CuentasDelMetodo(metodo);
        if (OrigenEsAutomatico)
        {
            Origen = opciones.FirstOrDefault() ?? "";
        }
        else if (!opciones.Contains(Origen))
        {
            // Débito y ATH Móvil comparten las cuentas de banco: al cambiar entre ellos, la cuenta sigue.
            Origen = "";
        }
    }

    public void CambiarOrigen(string origen)
    {
        Origen = origen;
        if (Tipo == TipoTransaccion.Transferencia && EsLaMismaCuenta(origen, Destino))
        {
            Destino = "";
        }
    }

    public void CambiarDestino(string destino) => Destino = destino;

    // La app puede quedar abierta de un día para otro. Una fecha escogida a mano no se toca.
    public void ActualizarHoy(DateOnly nuevoHoy)
    {
        if (Fecha == hoy)
        {
            Fecha = nuevoHoy;
        }
        hoy = nuevoHoy;
    }

    public List<string> Validar()
    {
        var errores = new List<string>();
        if (Fecha is null)
        {
            errores.Add("Falta la fecha.");
        }

        if (RevisarMonto(TextoMonto) is { } errorMonto)
        {
            errores.Add(errorMonto);
        }

        if (Tipo == TipoTransaccion.Gasto && Metodo is null)
        {
            errores.Add("Falta el método de pago.");
        }
        else if (Origen.Length == 0)
        {
            errores.Add($"Falta: {EtiquetaOrigen}.");
        }

        if (Destino.Length == 0)
        {
            errores.Add($"Falta: {EtiquetaDestino}.");
        }
        else if (Tipo == TipoTransaccion.Transferencia && EsLaMismaCuenta(Origen, Destino))
        {
            errores.Add("La cuenta de donde sale el dinero y la cuenta a donde entra no pueden ser la misma.");
        }
        return errores;
    }

    // Llamar solo si Validar() no devolvió errores.
    public Transaccion Crear(Guid id)
    {
        TryLeerMonto(TextoMonto, out var monto);
        return new Transaccion
        {
            Id = id,
            Tipo = Tipo,
            Fecha = Fecha!.Value,
            Monto = monto,
            MetodoPago = Tipo == TipoTransaccion.Gasto ? Metodo : null,
            CuentaOrigen = Origen,
            CuentaDestino = Destino,
        };
    }

    public static bool EsLaMismaCuenta(string a, string b) =>
        string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    // Acepta punto o coma para los centavos, porque el teclado depende del idioma del teléfono.
    // "1,250" se rechaza: podría significar 1250 o 1.25, y adivinar sería peor que preguntar.
    public static bool TryLeerMonto(string texto, out decimal monto)
    {
        monto = 0;
        var limpio = texto.Trim();
        return FormatoMonto().IsMatch(limpio)
            && limpio.Any(char.IsAsciiDigit)
            && decimal.TryParse(limpio.Replace(',', '.'), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out monto);
    }

    private static string? RevisarMonto(string texto)
    {
        if (string.IsNullOrWhiteSpace(texto))
        {
            return "Falta el monto.";
        }

        if (!TryLeerMonto(texto, out var monto))
        {
            return "El monto no es válido. Escribe solo números, con hasta dos decimales. Por ejemplo: 1250.50.";
        }

        if (monto <= 0)
        {
            return "El monto debe ser mayor que cero.";
        }

        return monto > MontoMaximo ? "El monto es demasiado grande." : null;
    }

    private IReadOnlyList<string> CuentasDelMetodo(MetodoPago metodo) => metodo switch
    {
        MetodoPago.Efectivo => CuentasDeTipo(TipoCuentaOrigen.Efectivo),
        MetodoPago.TarjetaCredito => CuentasDeTipo(TipoCuentaOrigen.TarjetaCredito),
        // ATH Móvil y débito siempre salen de una cuenta de banco.
        _ => CuentasDeTipo(TipoCuentaOrigen.Banco),
    };

    private List<string> CuentasDeTipo(params TipoCuentaOrigen[] tipos) =>
        Ordenar(catalogo.Origen.Where(c => tipos.Contains(c.Tipo)).Select(c => c.Nombre));

    private static List<string> Ordenar(IEnumerable<string> nombres) =>
        nombres.Order(StringComparer.CurrentCultureIgnoreCase).ToList();

    [GeneratedRegex("^[0-9]*([.,][0-9]{0,2})?$")]
    private static partial Regex FormatoMonto();
}
