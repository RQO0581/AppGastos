using AppGastos.Modelos;
using ClosedXML.Excel;

namespace AppGastos.Servicios;

public record ResultadoImportacion(
    IReadOnlyList<CuentaOrigen> CuentasOrigen,
    IReadOnlyList<CuentaGasto> CuentasGasto,
    IReadOnlyList<CuentaIngreso> CuentasIngreso,
    bool EfectivoAnadido,
    IReadOnlyList<string> Errores)
{
    public bool EsValido => Errores.Count == 0;
}

public static class ImportadorCatalogo
{
    public const string HojaCuentasGasto = "CuentasGasto";
    public const string HojaCuentasOrigen = "CuentasOrigen";
    public const string HojaCuentasIngreso = "CuentasIngreso";
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
            var nombresGasto = LeerNombres(libro, HojaCuentasGasto, obligatoria: true, errores);
            // Opcional, para que los catálogos de dos hojas sigan funcionando.
            var nombresIngreso = LeerNombres(libro, HojaCuentasIngreso, obligatoria: false, errores);

            // Efectivo se añade antes de comparar: tampoco puede repetirse en las otras hojas.
            var efectivoAnadido = cuentasOrigen.Count > 0
                && !cuentasOrigen.Exists(c => c.Tipo == TipoCuentaOrigen.Efectivo);
            if (efectivoAnadido)
            {
                cuentasOrigen.Add(new CuentaOrigen { Nombre = NombreEfectivo, Tipo = TipoCuentaOrigen.Efectivo });
            }

            RevisarNombresEntreHojas(cuentasOrigen.Select(c => c.Nombre), nombresGasto, nombresIngreso, errores);

            // Si hay errores no se devuelve nada, para que sea imposible importar un catálogo a medias.
            return errores.Count == 0
                ? new ResultadoImportacion(
                    cuentasOrigen,
                    nombresGasto.Select(n => new CuentaGasto { Nombre = n }).ToList(),
                    nombresIngreso.Select(n => new CuentaIngreso { Nombre = n }).ToList(),
                    efectivoAnadido,
                    errores)
                : ConErrores(errores);
        }
        catch (Exception)
        {
            // ClosedXML lanza excepciones de muchos tipos según qué esté mal en el archivo.
            return ConErrores(["No se pudo leer el archivo. Debe ser un Excel .xlsx sin contraseña."]);
        }
    }

    private static ResultadoImportacion ConErrores(List<string> errores) => new([], [], [], false, errores);

    // En el Excel exportado solo se ve el nombre: si dos cuentas se llaman igual, no se distinguen.
    private static void RevisarNombresEntreHojas(IEnumerable<string> origen, IEnumerable<string> gasto, IEnumerable<string> ingreso, List<string> errores)
    {
        var repetidos = origen.Select(nombre => (Nombre: nombre, Hoja: HojaCuentasOrigen))
            .Concat(gasto.Select(nombre => (Nombre: nombre, Hoja: HojaCuentasGasto)))
            .Concat(ingreso.Select(nombre => (Nombre: nombre, Hoja: HojaCuentasIngreso)))
            .GroupBy(cuenta => cuenta.Nombre, StringComparer.OrdinalIgnoreCase)
            .Where(grupo => grupo.Count() > 1);

        foreach (var grupo in repetidos)
        {
            var hojas = string.Join(" y ", grupo.Select(cuenta => cuenta.Hoja));
            errores.Add($"La cuenta \"{grupo.Key}\" aparece en las hojas {hojas}. Un nombre no puede repetirse entre hojas.");
        }
    }

    private static List<string> LeerNombres(XLWorkbook libro, string nombreHoja, bool obligatoria, List<string> errores)
    {
        var nombres = new List<string>();
        if (!libro.TryGetWorksheet(nombreHoja, out var hoja))
        {
            if (obligatoria)
            {
                errores.Add($"Falta la hoja {nombreHoja}.");
            }
            return nombres;
        }

        if (!TryObtenerColumna(hoja, ColumnaNombre, errores, out var columnaNombre))
        {
            return nombres;
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
                nombres.Add(nombre);
            }
            else
            {
                errores.Add($"Hoja {nombreHoja}, fila {fila}: la cuenta \"{nombre}\" está repetida.");
            }
        }

        if (nombres.Count == 0 && obligatoria)
        {
            errores.Add($"La hoja {nombreHoja} no tiene cuentas.");
        }
        return nombres;
    }

    private static List<CuentaOrigen> LeerCuentasOrigen(XLWorkbook libro, List<string> errores)
    {
        var cuentas = new List<CuentaOrigen>();
        if (!libro.TryGetWorksheet(HojaCuentasOrigen, out var hoja))
        {
            errores.Add($"Falta la hoja {HojaCuentasOrigen}.");
            return cuentas;
        }

        // Se evalúan las dos columnas para informar de ambas si faltan.
        var tieneNombre = TryObtenerColumna(hoja, ColumnaNombre, errores, out var columnaNombre);
        var tieneTipo = TryObtenerColumna(hoja, ColumnaTipo, errores, out var columnaTipo);
        if (!tieneNombre || !tieneTipo)
        {
            return cuentas;
        }

        var erroresAntes = errores.Count;
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

            // Se conserva como está escrito: debe coincidir con el sistema de contabilidad.
            cuentas.Add(new CuentaOrigen { Nombre = nombre, Tipo = tipo });
        }

        if (cuentas.Count == 0 && errores.Count == erroresAntes)
        {
            errores.Add($"La hoja {HojaCuentasOrigen} no tiene cuentas.");
        }
        return cuentas;
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
