using System.Globalization;
using AppGastos.Modelos;

namespace AppGastos.Servicios;

public record CatalogoCuentas(
    IReadOnlyList<CuentaOrigen> Origen,
    IReadOnlyList<CuentaGasto> Gasto,
    IReadOnlyList<CuentaIngreso> Ingreso);

// Las reglas del formulario, sin nada de pantalla: así las pruebas automáticas pueden comprobarlas.
public class BorradorTransaccion(CatalogoCuentas catalogo, DateOnly hoy)
{
    // Un número de JavaScript conserva los centavos exactos hasta este tamaño.
    private const decimal MontoMaximo = 99_999_999.99m;

    private DateOnly hoy = hoy;

    // Solo al editar: la transacción tal como estaba guardada.
    private Transaccion? original;

    public static BorradorTransaccion DesdeTransaccion(CatalogoCuentas catalogo, Transaccion transaccion) =>
        new(catalogo, transaccion.Fecha)
        {
            original = transaccion,
            Tipo = transaccion.Tipo,
            Fecha = transaccion.Fecha,
            TextoDolares = decimal.Truncate(transaccion.Monto).ToString("0", CultureInfo.InvariantCulture),
            TextoCentavos = ((transaccion.Monto - decimal.Truncate(transaccion.Monto)) * 100).ToString("00", CultureInfo.InvariantCulture),
            Metodo = transaccion.MetodoPago,
            Origen = transaccion.CuentaOrigen,
            Destino = transaccion.CuentaDestino,
        };

    public TipoTransaccion Tipo { get; private set; } = TipoTransaccion.Gasto;
    public DateOnly? Fecha { get; set; } = hoy;

    // Dos campos de solo dígitos: el teclado del iPhone puede no tener tecla de punto ni de coma.
    public string TextoDolares { get; set; } = "";
    public string TextoCentavos { get; set; } = "";

    // El monto tal como se va a guardar, para mostrarlo mientras se escribe. Null si todavía no es válido.
    public decimal? MontoEscrito =>
        RevisarMonto(TextoDolares, TextoCentavos) is null && TryLeerMonto(TextoDolares, TextoCentavos, out var monto) ? monto : null;

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
        TipoTransaccion.Ingreso => ConOrigenOriginal(catalogo.Ingreso.Select(c => c.Nombre)),
        _ => ConOrigenOriginal(catalogo.Origen.Select(c => c.Nombre)),
    };

    public IReadOnlyList<string> OpcionesDestino => Tipo switch
    {
        TipoTransaccion.Gasto => ConDestinoOriginal(catalogo.Gasto.Select(c => c.Nombre)),
        TipoTransaccion.Ingreso => ConDestinoOriginal(CuentasDeTipo(TipoCuentaOrigen.Banco, TipoCuentaOrigen.Efectivo)),
        _ => ConDestinoOriginal(catalogo.Origen.Select(c => c.Nombre)).Where(nombre => !EsLaMismaCuenta(nombre, Origen)).ToList(),
    };

    public string? MotivoTipoNoDisponible(TipoTransaccion tipo) => tipo switch
    {
        // Al editar, el tipo original sigue disponible aunque el catálogo ya no tenga sus cuentas.
        _ when tipo == original?.Tipo => null,
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
            // Al editar, volver a Efectivo recupera la cuenta original aunque el catálogo tenga otra.
            Origen = original is { Tipo: TipoTransaccion.Gasto, MetodoPago: MetodoPago.Efectivo }
                ? original.CuentaOrigen
                : opciones.FirstOrDefault() ?? "";
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

    // La app puede quedar abierta de un día para otro. Una fecha escogida a mano no se toca,
    // y al editar la fecha nunca cambia sola.
    public void ActualizarHoy(DateOnly nuevoHoy)
    {
        if (original is null && Fecha == hoy)
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

        if (RevisarMonto(TextoDolares, TextoCentavos) is { } errorMonto)
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
        TryLeerMonto(TextoDolares, TextoCentavos, out var monto);
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

    // Cualquiera de los dos campos puede ir vacío, pero no los dos. Los centavos son un número de
    // centavos: "5" son $0.05, no $0.50. Por eso la pantalla muestra el monto mientras se escribe.
    public static bool TryLeerMonto(string dolares, string centavos, out decimal monto)
    {
        monto = 0;
        var textoDolares = dolares.Trim();
        var textoCentavos = centavos.Trim();
        if (textoDolares.Length + textoCentavos.Length == 0
            || textoCentavos.Length > 2
            || !textoDolares.All(char.IsAsciiDigit)
            || !textoCentavos.All(char.IsAsciiDigit)
            || !decimal.TryParse(textoDolares.Length == 0 ? "0" : textoDolares, NumberStyles.None, CultureInfo.InvariantCulture, out var enteros))
        {
            return false;
        }

        var fraccion = textoCentavos.Length == 0 ? 0 : int.Parse(textoCentavos, CultureInfo.InvariantCulture);
        monto = enteros + fraccion / 100m;
        return true;
    }

    private static string? RevisarMonto(string dolares, string centavos)
    {
        if (string.IsNullOrWhiteSpace(dolares) && string.IsNullOrWhiteSpace(centavos))
        {
            return "Falta el monto.";
        }

        if (!TryLeerMonto(dolares, centavos, out var monto))
        {
            return "El monto no es válido. Escribe solo números: los dólares en un campo y hasta dos dígitos de centavos en el otro.";
        }

        if (monto <= 0)
        {
            return "El monto debe ser mayor que cero.";
        }

        return monto > MontoMaximo ? "El monto es demasiado grande." : null;
    }

    private static TipoCuentaOrigen TipoDeCuentaDelMetodo(MetodoPago metodo) => metodo switch
    {
        MetodoPago.Efectivo => TipoCuentaOrigen.Efectivo,
        MetodoPago.TarjetaCredito => TipoCuentaOrigen.TarjetaCredito,
        // ATH Móvil y débito siempre salen de una cuenta de banco.
        _ => TipoCuentaOrigen.Banco,
    };

    private IReadOnlyList<string> CuentasDelMetodo(MetodoPago metodo)
    {
        var cuentas = CuentasDeTipo(TipoDeCuentaDelMetodo(metodo));
        return original?.Tipo == TipoTransaccion.Gasto
            && original.MetodoPago is { } metodoOriginal
            && TipoDeCuentaDelMetodo(metodoOriginal) == TipoDeCuentaDelMetodo(metodo)
                ? Incluir(cuentas, original.CuentaOrigen)
                : cuentas;
    }

    private List<string> ConOrigenOriginal(IEnumerable<string> cuentas) =>
        original?.Tipo == Tipo ? Incluir(cuentas, original.CuentaOrigen) : Ordenar(cuentas);

    private List<string> ConDestinoOriginal(IEnumerable<string> cuentas) =>
        original?.Tipo == Tipo ? Incluir(cuentas, original.CuentaDestino) : Ordenar(cuentas);

    // Una cuenta que ya no está en el catálogo debe seguir en la lista: si no, se perdería al editar sin que se note.
    private static List<string> Incluir(IEnumerable<string> cuentas, string nombre)
    {
        var lista = cuentas.ToList();
        if (nombre.Length > 0 && !lista.Exists(cuenta => EsLaMismaCuenta(cuenta, nombre)))
        {
            lista.Add(nombre);
        }
        return Ordenar(lista);
    }

    private List<string> CuentasDeTipo(params TipoCuentaOrigen[] tipos) =>
        Ordenar(catalogo.Origen.Where(c => tipos.Contains(c.Tipo)).Select(c => c.Nombre));

    private static List<string> Ordenar(IEnumerable<string> nombres) =>
        nombres.Order(StringComparer.CurrentCultureIgnoreCase).ToList();
}
