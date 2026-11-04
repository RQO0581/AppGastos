using AppGastos.Modelos;
using AppGastos.Servicios;
using ClosedXML.Excel;

namespace AppGastos.Tests;

// Todos los nombres y montos son ficticios.
public class TestamentoTests
{
    private static readonly DateOnly Hoy = new(2026, 11, 4);

    private static MemoryStream Archivo(Action<XLWorkbook> llenar)
    {
        using var libro = new XLWorkbook();
        llenar(libro);
        var memoria = new MemoryStream();
        libro.SaveAs(memoria);
        memoria.Position = 0;
        return memoria;
    }

    private static MemoryStream Ejemplo() => Archivo(libro =>
    {
        var hoja = libro.AddWorksheet("Resumen");
        hoja.Cell("A1").Value = "Testamento de Ejemplo";
        hoja.Cell("A1").Style.Font.Bold = true;
        hoja.Cell("A3").Value = "Bienes";
        hoja.Cell("A3").Style.Font.Bold = true;
        hoja.Cell("A4").Value = "  Casa-Ejemplo";
        hoja.Cell("B4").Value = 250000;
        hoja.Cell("A5").Value = "Deuda-Ejemplo";
        hoja.Cell("B5").Value = -1500.25;
        hoja.Cell("A6").Value = "Total";
        hoja.Cell("A6").Style.Font.Bold = true;
        hoja.Cell("B6").FormulaA1 = "SUM(B4:B5)";
        hoja.Cell("B6").Style.Font.Bold = true;
        hoja.Cell("A8").Value = "Nota-Ejemplo";
        hoja.Cell("B8").Value = "Por definir";
    });

    private static DocumentoTestamento LeerEjemplo()
    {
        var resultado = ImportadorTestamento.Leer(Ejemplo(), Hoy);
        Assert.Empty(resultado.Errores);
        return resultado.Documento!;
    }

    [Fact]
    public void ConservaElOrdenYLasFilasVacias()
    {
        var filas = LeerEjemplo().Filas;

        Assert.Equal(8, filas.Count);
        Assert.Equal("Testamento de Ejemplo", filas[0].Descripcion);
        Assert.Equal("", filas[1].Descripcion);
        Assert.Null(filas[1].Cantidad);
        Assert.Equal("Bienes", filas[2].Descripcion);
        Assert.Equal("Total", filas[5].Descripcion);
        Assert.Equal("", filas[6].Descripcion);
        Assert.Equal("Nota-Ejemplo", filas[7].Descripcion);
    }

    [Fact]
    public void GuardaLaFechaDeImportacion()
    {
        Assert.Equal(Hoy, LeerEjemplo().FechaImportacion);
    }

    [Fact]
    public void RespetaLaNegrita()
    {
        var filas = LeerEjemplo().Filas;

        Assert.True(filas[0].DescripcionEnNegrita);
        Assert.True(filas[2].DescripcionEnNegrita);
        Assert.False(filas[3].DescripcionEnNegrita);
        Assert.True(filas[5].DescripcionEnNegrita);
        Assert.True(filas[5].CantidadEnNegrita);
        Assert.False(filas[3].CantidadEnNegrita);
    }

    [Fact]
    public void LasSeccionesNoTienenCantidad()
    {
        var seccion = LeerEjemplo().Filas[2];

        Assert.Null(seccion.Cantidad);
        Assert.Null(seccion.TextoCantidad);
    }

    [Fact]
    public void LeeMontosNegativosYDeFormula()
    {
        var filas = LeerEjemplo().Filas;

        Assert.Equal(250000m, filas[3].Cantidad);
        Assert.Equal(-1500.25m, filas[4].Cantidad);
        Assert.Equal(248499.75m, filas[5].Cantidad);
    }

    [Fact]
    public void ConservaLaSangria()
    {
        Assert.Equal("  Casa-Ejemplo", LeerEjemplo().Filas[3].Descripcion);
    }

    [Fact]
    public void ConservaElTextoEnLaColumnaB()
    {
        var fila = LeerEjemplo().Filas[7];

        Assert.Null(fila.Cantidad);
        Assert.Equal("Por definir", fila.TextoCantidad);
    }

    [Fact]
    public void RedondeaACentavos()
    {
        var resultado = ImportadorTestamento.Leer(Archivo(libro =>
        {
            var hoja = libro.AddWorksheet("A");
            hoja.Cell("A1").Value = "Total";
            hoja.Cell("B1").Value = 261000.2500000001;
        }), Hoy);

        Assert.Equal(261000.25m, resultado.Documento!.Filas[0].Cantidad);
    }

    [Fact]
    public void SiHayVariasHojas_UsaLaPrimeraYLoAvisa()
    {
        var resultado = ImportadorTestamento.Leer(Archivo(libro =>
        {
            var primera = libro.AddWorksheet("Primera");
            primera.Cell("A1").Value = "Uno";
            primera.Cell("B1").Value = 1;
            var segunda = libro.AddWorksheet("Segunda");
            segunda.Cell("A1").Value = "Dos";
            segunda.Cell("B1").Value = 2;
        }), Hoy);

        Assert.Equal("Uno", Assert.Single(resultado.Documento!.Filas).Descripcion);
        Assert.Contains(resultado.Avisos, a => a.Contains("2 hojas") && a.Contains("Primera"));
    }

    [Fact]
    public void SiHayMasColumnas_LoAvisaYNoLasMuestra()
    {
        var resultado = ImportadorTestamento.Leer(Archivo(libro =>
        {
            var hoja = libro.AddWorksheet("A");
            hoja.Cell("A1").Value = "Uno";
            hoja.Cell("B1").Value = 1;
            hoja.Cell("C1").Value = "No se muestra";
        }), Hoy);

        Assert.Contains(resultado.Avisos, a => a.Contains("después de la columna B"));
    }

    [Fact]
    public void UnErrorDeExcelSeAvisaConSuFila()
    {
        var resultado = ImportadorTestamento.Leer(Archivo(libro =>
        {
            var hoja = libro.AddWorksheet("A");
            hoja.Cell("A1").Value = "Uno";
            hoja.Cell("B1").Value = 1;
            hoja.Cell("A2").Value = "Malo";
            hoja.Cell("B2").FormulaA1 = "1/0";
        }), Hoy);

        Assert.True(resultado.EsValido);
        Assert.Contains(resultado.Avisos, a => a.StartsWith("Fila 2:"));
        Assert.Null(resultado.Documento!.Filas[1].Cantidad);
        Assert.Equal("#DIV/0!", resultado.Documento.Filas[1].TextoCantidad);
    }

    [Fact]
    public void UnaHojaVaciaEsUnError()
    {
        var resultado = ImportadorTestamento.Leer(Archivo(libro => libro.AddWorksheet("A")), Hoy);

        Assert.False(resultado.EsValido);
        Assert.Null(resultado.Documento);
    }

    [Fact]
    public void SinNingunaCantidadEsUnError()
    {
        var resultado = ImportadorTestamento.Leer(Archivo(libro =>
        {
            var hoja = libro.AddWorksheet("A");
            hoja.Cell("A1").Value = "Solo texto";
        }), Hoy);

        Assert.Contains(resultado.Errores, e => e.Contains("ninguna cantidad"));
    }

    [Fact]
    public void UnArchivoQueNoEsExcelEsUnError()
    {
        var resultado = ImportadorTestamento.Leer(new MemoryStream([1, 2, 3, 4]), Hoy);

        Assert.Contains(resultado.Errores, e => e.Contains("No se pudo leer"));
    }

    [Fact]
    public void SeGuardaYSeRecuperaIgual()
    {
        var original = LeerEjemplo();

        var copia = ServicioTestamento.Deserializar(ServicioTestamento.Serializar(original))!;

        Assert.Equal(original.FechaImportacion, copia.FechaImportacion);
        Assert.Equal(original.Filas.Count, copia.Filas.Count);
        for (var i = 0; i < original.Filas.Count; i++)
        {
            Assert.Equal(original.Filas[i].Descripcion, copia.Filas[i].Descripcion);
            Assert.Equal(original.Filas[i].Cantidad, copia.Filas[i].Cantidad);
            Assert.Equal(original.Filas[i].TextoCantidad, copia.Filas[i].TextoCantidad);
            Assert.Equal(original.Filas[i].DescripcionEnNegrita, copia.Filas[i].DescripcionEnNegrita);
            Assert.Equal(original.Filas[i].CantidadEnNegrita, copia.Filas[i].CantidadEnNegrita);
        }
    }

    [Theory]
    [InlineData("1234", true)]
    [InlineData("0000", true)]
    [InlineData("123", false)]
    [InlineData("12345", false)]
    [InlineData("12a4", false)]
    [InlineData("١٢٣٤", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Pin_DebeSerDeCuatroDigitos(string? pin, bool esperado)
    {
        Assert.Equal(esperado, ServicioTestamento.PinEsValido(pin));
    }

    [Theory]
    [InlineData("1234", "1234")]
    [InlineData("12345", "1234")]
    [InlineData("1a2b3", "123")]
    [InlineData(" 12 ", "12")]
    [InlineData("١٢", "")]
    [InlineData(null, "")]
    public void Pin_SoloConservaDigitos(string? texto, string esperado)
    {
        Assert.Equal(esperado, ServicioTestamento.LimpiarPin(texto));
    }
}
