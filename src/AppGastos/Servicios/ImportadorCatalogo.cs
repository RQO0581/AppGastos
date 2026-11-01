using AppGastos.Modelos;
using ClosedXML.Excel;

namespace AppGastos.Servicios;

public record ResultadoImportacion(
    IReadOnlyList<CuentaOrigen> CuentasOrigen,
    IReadOnlyList<CuentaGasto> CuentasGasto,
    IReadOnlyList<string> Errores)
{
    public bool EsValido => Errores.Count == 0;
}

public static class ImportadorCatalogo
{
    public const string HojaCuentasGasto = "CuentasGasto";
    public const string HojaCuentasOrigen = "CuentasOrigen";
    public const string ColumnaNombre = "Nombre";
    public const string ColumnaTipo = "Tipo";
    public const string NombreEfectivo = "Efectivo";

    private const int FilaEncabezados = 1;

    public static string TextoTipo(TipoCuentaOrigen tipo) => tipo switch
    {
        TipoCuentaOrigen.Efectivo => "Efectivo",
        TipoCuentaOrigen.Banco => "Banco",
        TipoCuentaOrigen.TarjetaCredito => "Tarjeta de crédito",
        _ => throw new ArgumentOutOfRangeException(nameof(tipo)),
    };

    public static ResultadoImportacion Leer(Stream archivo)
    {
        var errores = new List<string>();
        try
        {
            using var libro = new XLWorkbook(archivo);
            var cuentasOrigen = LeerCuentasOrigen(libro, errores);
            var cuentasGasto = LeerCuentasGasto(libro, errores);

            // Si hay errores no se devuelve nada, para que sea imposible importar un catálogo a medias.
            return errores.Count == 0
                ? new ResultadoImportacion(cuentasOrigen, cuentasGasto, errores)
                : new ResultadoImportacion([], [], errores);
        }
        catch (Exception)
        {
            // ClosedXML lanza excepciones de muchos tipos según qué esté mal en el archivo.
            return new ResultadoImportacion([], [], ["No se pudo leer el archivo. Debe ser un Excel .xlsx sin contraseña."]);
        }
    }

    private static List<CuentaGasto> LeerCuentasGasto(XLWorkbook libro, List<string> errores)
    {
        var cuentas = new List<CuentaGasto>();
        if (!TryObtenerHoja(libro, HojaCuentasGasto, errores, out var hoja)
            || !TryObtenerColumna(hoja, ColumnaNombre, errores, out var columnaNombre))
        {
            return cuentas;
        }

        var vistos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var fila = FilaEncabezados + 1; fila <= UltimaFila(hoja); fila++)
        {
            var nombre = Texto(hoja, fila, columnaNombre);
            if (nombre.Length == 0)
            {
                continue;
            }

            if (vistos.Add(nombre))
            {
                cuentas.Add(new CuentaGasto { Nombre = nombre });
            }
            else
            {
                errores.Add($"Hoja {HojaCuentasGasto}, fila {fila}: la cuenta \"{nombre}\" está repetida.");
            }
        }

        if (cuentas.Count == 0)
        {
            errores.Add($"La hoja {HojaCuentasGasto} no tiene cuentas.");
        }
        return cuentas;
    }

    private static List<CuentaOrigen> LeerCuentasOrigen(XLWorkbook libro, List<string> errores)
    {
        var cuentas = new List<CuentaOrigen>();
        if (!TryObtenerHoja(libro, HojaCuentasOrigen, errores, out var hoja))
        {
            return cuentas;
        }

        // Se evalúan las dos columnas para informar de ambas si faltan.
        var tieneNombre = TryObtenerColumna(hoja, ColumnaNombre, errores, out var columnaNombre);
        var tieneTipo = TryObtenerColumna(hoja, ColumnaTipo, errores, out var columnaTipo);
        if (!tieneNombre || !tieneTipo)
        {
            return cuentas;
        }

        var vistos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var fila = FilaEncabezados + 1; fila <= UltimaFila(hoja); fila++)
        {
            var nombre = Texto(hoja, fila, columnaNombre);
            var textoTipo = Texto(hoja, fila, columnaTipo);
            if (nombre.Length == 0 && textoTipo.Length == 0)
            {
                continue;
            }

            var ubicacion = $"Hoja {HojaCuentasOrigen}, fila {fila}";
            if (nombre.Length == 0)
            {
                errores.Add($"{ubicacion}: falta el nombre de la cuenta.");
                continue;
            }

            if (!vistos.Add(nombre))
            {
                errores.Add($"{ubicacion}: la cuenta \"{nombre}\" está repetida.");
                continue;
            }

            if (!TryLeerTipo(textoTipo, out var tipo))
            {
                errores.Add($"{ubicacion}: el tipo \"{textoTipo}\" no es válido. Usa Efectivo, Banco o Tarjeta de crédito.");
                continue;
            }

            var esEfectivo = nombre.Equals(NombreEfectivo, StringComparison.OrdinalIgnoreCase);
            if (esEfectivo != (tipo == TipoCuentaOrigen.Efectivo))
            {
                errores.Add($"{ubicacion}: solo la cuenta \"{NombreEfectivo}\" puede ser de tipo Efectivo, y debe serlo.");
                continue;
            }

            // El nombre exacto importa porque es el que aparece en el Excel exportado.
            cuentas.Add(new CuentaOrigen { Nombre = esEfectivo ? NombreEfectivo : nombre, Tipo = tipo });
        }

        if (cuentas.Count == 0 && errores.Count == 0)
        {
            errores.Add($"La hoja {HojaCuentasOrigen} no tiene cuentas.");
        }

        if (!vistos.Contains(NombreEfectivo))
        {
            cuentas.Add(new CuentaOrigen { Nombre = NombreEfectivo, Tipo = TipoCuentaOrigen.Efectivo });
        }
        return cuentas;
    }

    private static bool TryObtenerHoja(XLWorkbook libro, string nombre, List<string> errores, out IXLWorksheet hoja)
    {
        if (libro.TryGetWorksheet(nombre, out hoja!))
        {
            return true;
        }
        errores.Add($"Falta la hoja {nombre}.");
        return false;
    }

    private static bool TryObtenerColumna(IXLWorksheet hoja, string encabezado, List<string> errores, out int columna)
    {
        var celda = hoja.Row(FilaEncabezados).CellsUsed()
            .FirstOrDefault(c => c.GetFormattedString().Trim().Equals(encabezado, StringComparison.OrdinalIgnoreCase));
        columna = celda?.Address.ColumnNumber ?? 0;
        if (celda is null)
        {
            errores.Add($"En la hoja {hoja.Name} falta la columna {encabezado} en la fila {FilaEncabezados}.");
        }
        return celda is not null;
    }

    private static bool TryLeerTipo(string texto, out TipoCuentaOrigen tipo)
    {
        var normalizado = texto.ToLowerInvariant().Replace(" ", "").Replace("é", "e");
        switch (normalizado)
        {
            case "efectivo":
                tipo = TipoCuentaOrigen.Efectivo;
                return true;
            case "banco":
                tipo = TipoCuentaOrigen.Banco;
                return true;
            case "tarjetadecredito":
            case "tarjetacredito":
                tipo = TipoCuentaOrigen.TarjetaCredito;
                return true;
            default:
                tipo = default;
                return false;
        }
    }

    private static int UltimaFila(IXLWorksheet hoja) => hoja.LastRowUsed()?.RowNumber() ?? 0;

    private static string Texto(IXLWorksheet hoja, int fila, int columna) =>
        hoja.Cell(fila, columna).GetFormattedString().Trim();
}
