using AppGastos.Modelos;
using AppGastos.Servicios;
using ClosedXML.Excel;

namespace AppGastos.Tests;

public class ExportacionTransaccionesTests
{
    private static readonly DateOnly Hoy = new(2026, 11, 2);

    private static Transaccion Nueva(TipoTransaccion tipo, DateOnly fecha, decimal monto, string origen, string destino) => new()
    {
        Id = Guid.NewGuid(),
        Tipo = tipo,
        Fecha = fecha,
        Monto = monto,
        CuentaOrigen = origen,
        CuentaDestino = destino,
    };

    // Los tres ejemplos de REQUISITOS.md, con cuentas ficticias: es el camino completo hasta el archivo.
    [Fact]
    public void Archivo_TieneLosTresTiposConLaMismaRegla()
    {
        var transacciones = new[]
        {
            Nueva(TipoTransaccion.Transferencia, new DateOnly(2026, 1, 10), 200m, "Banco-Ejemplo", "Tarjeta-Ejemplo"),
            Nueva(TipoTransaccion.Gasto, new DateOnly(2026, 1, 1), 104.24m, "Banco-Ejemplo", "Telefonos"),
            Nueva(TipoTransaccion.Ingreso, new DateOnly(2026, 1, 5), 500m, "Ingreso-Ejemplo", "Banco-Ejemplo"),
        };

        var archivo = ExportadorExcel.Crear(ExportacionTransacciones.Movimientos(transacciones));

        var hoja = new XLWorkbook(new MemoryStream(archivo)).Worksheet(1);
        Assert.Equal(7, hoja.LastRowUsed()!.RowNumber());
        RevisarFila(hoja, 2, new DateTime(2026, 1, 1), "Banco-Ejemplo", "Telefonos", null, 104.24);
        RevisarFila(hoja, 3, new DateTime(2026, 1, 1), "Telefonos", "Banco-Ejemplo", 104.24, null);
        RevisarFila(hoja, 4, new DateTime(2026, 1, 5), "Ingreso-Ejemplo", "Banco-Ejemplo", null, 500);
        RevisarFila(hoja, 5, new DateTime(2026, 1, 5), "Banco-Ejemplo", "Ingreso-Ejemplo", 500, null);
        RevisarFila(hoja, 6, new DateTime(2026, 1, 10), "Banco-Ejemplo", "Tarjeta-Ejemplo", null, 200);
        RevisarFila(hoja, 7, new DateTime(2026, 1, 10), "Tarjeta-Ejemplo", "Banco-Ejemplo", 200, null);
    }

    private static void RevisarFila(IXLWorksheet hoja, int fila, DateTime fecha, string cr, string dr, double? debit, double? credit)
    {
        Assert.Equal(fecha, hoja.Cell(fila, 1).GetDateTime());
        Assert.Equal(cr, hoja.Cell(fila, 5).GetString());
        Assert.Equal(dr, hoja.Cell(fila, 6).GetString());
        Assert.Equal(debit is null, hoja.Cell(fila, 7).IsEmpty());
        Assert.Equal(credit is null, hoja.Cell(fila, 8).IsEmpty());
        if (debit is { } valorDebit)
        {
            Assert.Equal(valorDebit, hoja.Cell(fila, 7).GetDouble());
        }
        if (credit is { } valorCredit)
        {
            Assert.Equal(valorCredit, hoja.Cell(fila, 8).GetDouble());
        }
    }

    [Fact]
    public void Movimientos_VanDeLaFechaMasViejaALaMasNueva()
    {
        var movimientos = ExportacionTransacciones.Movimientos(
        [
            Nueva(TipoTransaccion.Gasto, new DateOnly(2026, 3, 1), 3, "A", "B"),
            Nueva(TipoTransaccion.Gasto, new DateOnly(2026, 1, 1), 1, "A", "B"),
            Nueva(TipoTransaccion.Gasto, new DateOnly(2026, 2, 1), 2, "A", "B"),
        ]);

        Assert.Equal([1m, 2m, 3m], movimientos.Select(m => m.Monto));
    }

    [Fact]
    public void NombreArchivo_LlevaElRango()
    {
        var desde = new DateOnly(2026, 1, 1);
        var hasta = new DateOnly(2026, 1, 31);

        Assert.Equal("Gastos_2026-01-01_a_2026-01-31.xlsx", ExportacionTransacciones.NombreArchivo(desde, hasta, Hoy));
        Assert.Equal("Gastos_desde_2026-01-01.xlsx", ExportacionTransacciones.NombreArchivo(desde, null, Hoy));
        Assert.Equal("Gastos_hasta_2026-01-31.xlsx", ExportacionTransacciones.NombreArchivo(null, hasta, Hoy));
        Assert.Equal("Gastos_todo_al_2026-11-02.xlsx", ExportacionTransacciones.NombreArchivo(null, null, Hoy));
    }

    [Theory]
    [InlineData("es-ES")]
    [InlineData("ar-SA")]
    public void NombreArchivo_NoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.GetCultureInfo(idioma);

            Assert.Equal("Gastos_todo_al_2026-11-02.xlsx", ExportacionTransacciones.NombreArchivo(null, null, Hoy));
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = original;
        }
    }

    [Fact]
    public void Rango_DesdeNoPuedeSerDespuesDeHasta()
    {
        var uno = new DateOnly(2026, 1, 1);
        var dos = new DateOnly(2026, 1, 2);

        Assert.True(ExportacionTransacciones.RangoEsValido(uno, dos));
        Assert.True(ExportacionTransacciones.RangoEsValido(uno, uno));
        Assert.True(ExportacionTransacciones.RangoEsValido(null, null));
        Assert.True(ExportacionTransacciones.RangoEsValido(dos, null));
        Assert.True(ExportacionTransacciones.RangoEsValido(null, uno));
        Assert.False(ExportacionTransacciones.RangoEsValido(dos, uno));
    }

    [Theory]
    [InlineData("nombre@ejemplo.com", true)]
    [InlineData("  nombre@ejemplo.com  ", true)]
    [InlineData("n@e", true)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("nombre", false)]
    [InlineData("@ejemplo.com", false)]
    [InlineData("nombre@", false)]
    [InlineData("nom bre@ejemplo.com", false)]
    [InlineData("a@b@c", false)]
    public void Correo_SeRevisaSolo(string correo, bool esperado)
    {
        Assert.Equal(esperado, ExportacionTransacciones.CorreoEsValido(correo));
    }

    [Theory]
    [InlineData("nombre@ejemplo.com", "mailto:nombre@ejemplo.com?subject=Gastos")]
    [InlineData(" nombre@ejemplo.com ", "mailto:nombre@ejemplo.com?subject=Gastos")]
    [InlineData("nombre+a@ejemplo.com", "mailto:nombre%2Ba@ejemplo.com?subject=Gastos")]
    public void EnlaceCorreo_NoCodificaLaArroba(string correo, string esperado)
    {
        Assert.Equal(esperado, ExportacionTransacciones.EnlaceCorreo(correo));
    }
}
