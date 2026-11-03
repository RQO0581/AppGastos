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

    public const int LargoMaximoComentario = 100;

    private DateOnly hoy = hoy;

    // Solo al editar: la transacción tal como estaba guardada.
    private Transaccion? original;

    public static BorradorTransaccion DesdeTransaccion(CatalogoCuentas catalogo, Transaccion transaccion) =>
        new(catalogo, transaccion.Fecha)
        {
            original = transaccion,
            Tipo = transaccion.Tipo,
            Fecha = transaccion.Fecha,
            Monto = transaccion.Monto,
            Metodo = transaccion.MetodoPago,
            Origen = transaccion.CuentaOrigen,
            Destino = transaccion.CuentaDestino,
            Comentario = transaccion.Comentario,
        };

    public TipoTransaccion Tipo { get; private set; } = TipoTransaccion.Gasto;
    public DateOnly? Fecha { get; set; } = hoy;

    // Cero significa que aún no se ha escrito nada: un monto en cero no se puede guardar.
    public decimal Monto { get; private set; }

    // Lo que muestra el campo. Vacío deja ver el ejemplo del campo, en lugar de un "0.00" que hay que borrar.
    public string TextoMonto => Monto == 0 ? "" : Monto.ToString("0.00", CultureInfo.InvariantCulture);

    public MetodoPago? Metodo { get; private set; }
    public string Origen { get; private set; } = "";
    public string Destino { get; private set; } = "";
    public string Comentario { get; set; } = "";

    // En efectivo la cuenta es una sola, así que no se pregunta.
    public bool OrigenEsAutomatico => Tipo == TipoTransaccion.Gasto && Metodo == MetodoPago.Efectivo;

    public string EtiquetaOrigen => Tipo switch
    {
        TipoTransaccion.Gasto => "Cuenta con la que se pagó",
        TipoTransaccion.Ingreso => "Cuenta de ingreso",
        TipoTransaccion.Devolucion => "Cuenta del gasto original",
        _ => "Cuenta de donde sale el dinero",
    };

    public string EtiquetaDestino => Tipo switch
    {
        TipoTransaccion.Gasto => "Cuenta de gasto",
        TipoTransaccion.Ingreso => "Cuenta donde entra el dinero",
        TipoTransaccion.Devolucion => "Cuenta a donde vuelve el dinero",
        _ => "Cuenta a donde entra el dinero",
    };

    public IReadOnlyList<string> OpcionesOrigen => Tipo switch
    {
        TipoTransaccion.Gasto => Metodo is { } metodo ? CuentasDelMetodo(metodo) : [],
        TipoTransaccion.Ingreso => ConOrigenOriginal(catalogo.Ingreso.Select(c => c.Nombre)),
        TipoTransaccion.Devolucion => ConOrigenOriginal(catalogo.Gasto.Select(c => c.Nombre)),
        _ => ConOrigenOriginal(catalogo.Origen.Select(c => c.Nombre)),
    };

    public IReadOnlyList<string> OpcionesDestino => Tipo switch
    {
        TipoTransaccion.Gasto => ConDestinoOriginal(catalogo.Gasto.Select(c => c.Nombre)),
        TipoTransaccion.Ingreso => ConDestinoOriginal(CuentasDeTipo(TipoCuentaOrigen.Banco, TipoCuentaOrigen.Efectivo)),
        TipoTransaccion.Devolucion => ConDestinoOriginal(catalogo.Origen.Select(c => c.Nombre)),
        _ => ConDestinoOriginal(catalogo.Origen.Select(c => c.Nombre)).Where(nombre => !EsLaMismaCuenta(nombre, Origen)).ToList(),
    };

    public string? MotivoTipoNoDisponible(TipoTransaccion tipo) => tipo switch
    {
        // Al editar, el tipo original sigue disponible aunque el catálogo ya no tenga sus cuentas.
        _ when tipo == original?.Tipo => null,
        TipoTransaccion.Ingreso when catalogo.Ingreso.Count == 0 =>
            "Para registrar ingresos, importa cuentas en la hoja CuentasIngreso.",
        TipoTransaccion.Transferencia when catalogo.Origen.Count < 2 =>
            "Para registrar transferencias, importa al menos dos cuentas en la hoja CuentasOrigen.",
        TipoTransaccion.Devolucion when catalogo.Gasto.Count == 0 || catalogo.Origen.Count == 0 =>
            "Para registrar devoluciones, importa cuentas en las hojas CuentasGasto y CuentasOrigen.",
        _ => null,
    };

    public string? MotivoMetodoNoDisponible(MetodoPago metodo) =>
        CuentasDelMetodo(metodo).Count > 0
            ? null
            : $"{TextoMetodo(metodo)} no está disponible porque no hay cuentas para ese método.";

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

        if (Monto == 0)
        {
            errores.Add("Falta el monto.");
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

        // No se corta sin avisar: el usuario decide qué quitar. El campo normalmente no deja pasar del máximo.
        if (Comentario.Trim().Length > LargoMaximoComentario)
        {
            errores.Add($"El comentario tiene {Comentario.Trim().Length} caracteres. El máximo es {LargoMaximoComentario}.");
        }
        return errores;
    }

    // Llamar solo si Validar() no devolvió errores.
    public Transaccion Crear(Guid id)
    {
        return new Transaccion
        {
            Id = id,
            Tipo = Tipo,
            Fecha = Fecha!.Value,
            Monto = Monto,
            MetodoPago = Tipo == TipoTransaccion.Gasto ? Metodo : null,
            CuentaOrigen = Origen,
            CuentaDestino = Destino,
            Comentario = Comentario.Trim(),
        };
    }

    public static bool EsLaMismaCuenta(string a, string b) =>
        string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    // Estilo cajero: recibe lo que quedó en el campo y usa solo sus dígitos, leídos como centavos.
    // Con "22.22" más un 3 llega "22.223", que son 22223 centavos: $222.23.
    // Al borrar llega "22.2", que son 222 centavos: $2.22.
    // Un monto más grande que el máximo se ignora, y el campo se queda con el monto anterior.
    public void EscribirMonto(string entrada)
    {
        var digitos = new string(entrada.Where(char.IsAsciiDigit).ToArray());
        if (digitos.Length == 0)
        {
            Monto = 0;
        }
        else if (decimal.TryParse(digitos, NumberStyles.None, CultureInfo.InvariantCulture, out var centavos)
            && centavos / 100m <= MontoMaximo)
        {
            Monto = centavos / 100m;
        }
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

    private static List<string> Ordenar(IEnumerable<string> nombres) => OrdenCuentas.Ordenar(nombres);
}
