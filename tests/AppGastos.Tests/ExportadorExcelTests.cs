using System.Globalization;
using System.IO.Compression;
using System.Xml.Linq;
using AppGastos.Servicios;
using ClosedXML.Excel;

namespace AppGastos.Tests;

public class ExportadorExcelTests
{
    private static readonly MovimientoExcel Movimiento =
        new(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 104.24m);

    private static IXLWorksheet AbrirHoja(byte[] archivo) =>
        new XLWorkbook(new MemoryStream(archivo)).Worksheet(1);

    [Fact]
    public void Encabezados_SonExactamenteLosDelFormato()
    {
        var hoja = AbrirHoja(ExportadorExcel.Crear([Movimiento]));

        string[] esperados = ["Date", "filler", "filler", "filler", "Account Cr", "Account Dr", "Debit", "Credit"];
        for (var i = 0; i < esperados.Length; i++)
        {
            Assert.Equal(esperados[i], hoja.Cell(1, i + 1).GetString());
        }
        Assert.True(hoja.Cell(1, 9).IsEmpty());
    }

    [Fact]
    public void CadaMovimiento_GeneraDosFilas()
    {
        var hoja = AbrirHoja(ExportadorExcel.Crear([Movimiento, Movimiento]));

        Assert.Equal(5, hoja.LastRowUsed()!.RowNumber());
    }

    [Fact]
    public void FilaDeCredito_LlevaOrigenEnCrGastoEnDrYMontoEnCredit()
    {
        var hoja = AbrirHoja(ExportadorExcel.Crear([Movimiento]));

        Assert.Equal("Banco-Ejemplo", hoja.Cell("E2").GetString());
        Assert.Equal("Telefonos", hoja.Cell("F2").GetString());
        Assert.True(hoja.Cell("G2").IsEmpty());
        Assert.Equal(104.24, hoja.Cell("H2").GetDouble());
    }

    [Fact]
    public void FilaDeDebito_LlevaGastoEnCrOrigenEnDrYMontoEnDebit()
    {
        var hoja = AbrirHoja(ExportadorExcel.Crear([Movimiento]));

        Assert.Equal("Telefonos", hoja.Cell("E3").GetString());
        Assert.Equal("Banco-Ejemplo", hoja.Cell("F3").GetString());
        Assert.Equal(104.24, hoja.Cell("G3").GetDouble());
        Assert.True(hoja.Cell("H3").IsEmpty());
    }

    // El ejemplo de ingreso de REQUISITOS.md, con una cuenta ficticia.
    [Fact]
    public void Ingreso_UsaLaMismaReglaConOrigenYDestino()
    {
        var ingreso = new MovimientoExcel(new DateOnly(2026, 1, 5), "Ingreso-Ejemplo", "Banco-Ejemplo", 500m);

        var hoja = AbrirHoja(ExportadorExcel.Crear([ingreso]));

        Assert.Equal(new DateTime(2026, 1, 5), hoja.Cell("A2").GetDateTime());
        Assert.Equal("Ingreso-Ejemplo", hoja.Cell("E2").GetString());
        Assert.Equal("Banco-Ejemplo", hoja.Cell("F2").GetString());
        Assert.True(hoja.Cell("G2").IsEmpty());
        Assert.Equal(500, hoja.Cell("H2").GetDouble());
        Assert.Equal("0.00", hoja.Cell("H2").Style.NumberFormat.Format);

        Assert.Equal(new DateTime(2026, 1, 5), hoja.Cell("A3").GetDateTime());
        Assert.Equal("Banco-Ejemplo", hoja.Cell("E3").GetString());
        Assert.Equal("Ingreso-Ejemplo", hoja.Cell("F3").GetString());
        Assert.Equal(500, hoja.Cell("G3").GetDouble());
        Assert.True(hoja.Cell("H3").IsEmpty());
        Assert.Equal("0.00", hoja.Cell("G3").Style.NumberFormat.Format);
    }

    [Fact]
    public void GastosEIngresos_VanEnElMismoArchivo()
    {
        var hoja = AbrirHoja(ExportadorExcel.Crear(
        [
            Movimiento,
            new MovimientoExcel(new DateOnly(2026, 1, 5), "Ingreso-Ejemplo", "Banco-Ejemplo", 500m),
        ]));

        Assert.Equal(5, hoja.LastRowUsed()!.RowNumber());
        Assert.Equal("Banco-Ejemplo", hoja.Cell("E2").GetString());
        Assert.Equal("Ingreso-Ejemplo", hoja.Cell("E4").GetString());
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void ColumnasFiller_VanVacias(int fila)
    {
        var hoja = AbrirHoja(ExportadorExcel.Crear([Movimiento]));

        Assert.True(hoja.Cell(fila, 2).IsEmpty());
        Assert.True(hoja.Cell(fila, 3).IsEmpty());
        Assert.True(hoja.Cell(fila, 4).IsEmpty());
    }

    [Fact]
    public void Fecha_EsFechaRealConFormatoMesDiaAnio()
    {
        var hoja = AbrirHoja(ExportadorExcel.Crear([Movimiento]));
        var celda = hoja.Cell("A2");

        Assert.Equal(XLDataType.DateTime, celda.DataType);
        Assert.Equal(new DateTime(2026, 1, 1), celda.GetDateTime());
        Assert.Equal("m/d/yyyy", celda.Style.DateFormat.Format);
    }

    [Fact]
    public void Monto_TieneFormatoDeDosDecimales()
    {
        var hoja = AbrirHoja(ExportadorExcel.Crear([Movimiento]));

        Assert.Equal("0.00", hoja.Cell("H2").Style.NumberFormat.Format);
        Assert.Equal("0.00", hoja.Cell("G3").Style.NumberFormat.Format);
    }

    // El archivo debe ser idéntico sin importar el idioma del teléfono. "es-ES" usa coma
    // decimal y día/mes, y "ar-SA" usa otro calendario: son los casos más propensos a fallar.
    [Theory]
    [InlineData("en-US")]
    [InlineData("es-PR")]
    [InlineData("es-ES")]
    [InlineData("ar-SA")]
    public void Archivo_NoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = CultureInfo.CurrentCulture;
        var originalUi = CultureInfo.CurrentUICulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(idioma);
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(idioma);

            var archivo = ExportadorExcel.Crear([Movimiento]);

            CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
            CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;

            // Se revisa el XML guardado, que es lo que abrirá Excel en cualquier computadora.
            using var zip = new ZipArchive(new MemoryStream(archivo));
            using var contenidoHoja = zip.GetEntry("xl/worksheets/sheet1.xml")!.Open();
            XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
            var celdas = XDocument.Load(contenidoHoja).Descendants(ns + "c")
                .ToDictionary(c => (string)c.Attribute("r")!, c => (string?)c.Element(ns + "v"));

            Assert.Equal("104.24", celdas["H2"]);
            Assert.Equal("104.24", celdas["G3"]);
            // 46023 es el número con el que Excel representa el 1 de enero de 2026.
            Assert.Equal("46023", celdas["A2"]);
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
            CultureInfo.CurrentUICulture = originalUi;
        }
    }
}
