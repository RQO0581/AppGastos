using AppGastos.Modelos;
using AppGastos.Servicios;
using ClosedXML.Excel;

namespace AppGastos.Tests;

public class ImportadorCatalogoTests
{
    private static MemoryStream Libro(params (string Hoja, string?[][] Filas)[] hojas)
    {
        using var libro = new XLWorkbook();
        foreach (var (nombre, filas) in hojas)
        {
            var hoja = libro.AddWorksheet(nombre);
            for (var f = 0; f < filas.Length; f++)
            {
                for (var c = 0; c < filas[f].Length; c++)
                {
                    if (filas[f][c] is { } valor)
                    {
                        hoja.Cell(f + 1, c + 1).Value = valor;
                    }
                }
            }
        }

        var memoria = new MemoryStream();
        libro.SaveAs(memoria);
        memoria.Position = 0;
        return memoria;
    }

    private static readonly (string, string?[][]) GastoValido =
        ("CuentasGasto", [["Nombre"], ["Comida"], ["Telefonos"]]);

    private static (string, string?[][]) Origen(params string?[][] filas) =>
        ("CuentasOrigen", [["Nombre", "Tipo"], .. filas]);

    private static ResultadoImportacion LeerConOrigen(params string?[][] filas) =>
        ImportadorCatalogo.Leer(Libro(Origen(filas), GastoValido));

    [Fact]
    public void Plantilla_SeImportaSinErrores()
    {
        var resultado = ImportadorCatalogo.Leer(new MemoryStream(PlantillaCatalogo.Crear()));

        Assert.Empty(resultado.Errores);
        Assert.Equal(["Comida", "Telefonos"], resultado.CuentasGasto.Select(c => c.Nombre));
        Assert.Equal(TipoCuentaOrigen.Efectivo, resultado.CuentasOrigen.Single(c => c.Nombre == "Efectivo").Tipo);
        Assert.Equal(TipoCuentaOrigen.Banco, resultado.CuentasOrigen.Single(c => c.Nombre == "Banco-Ejemplo").Tipo);
        Assert.Equal(TipoCuentaOrigen.TarjetaCredito, resultado.CuentasOrigen.Single(c => c.Nombre == "Tarjeta-Ejemplo").Tipo);
    }

    [Fact]
    public void Plantilla_NoIncluyeLaListaDeTiposEnLosDatos()
    {
        using var libro = new XLWorkbook(new MemoryStream(PlantillaCatalogo.Crear()));

        Assert.Equal(4, libro.Worksheet("CuentasOrigen").LastRowUsed()!.RowNumber());
    }

    [Fact]
    public void Efectivo_SeAnadeSiFalta()
    {
        var resultado = LeerConOrigen(["Banco-Ejemplo", "Banco"]);

        Assert.True(resultado.EsValido);
        Assert.Contains(resultado.CuentasOrigen, c => c.Nombre == "Efectivo" && c.Tipo == TipoCuentaOrigen.Efectivo);
    }

    [Fact]
    public void Efectivo_NoSeDuplicaYSeGuardaConSuNombreExacto()
    {
        var resultado = LeerConOrigen(["efectivo", "Efectivo"], ["Banco-Ejemplo", "Banco"]);

        Assert.True(resultado.EsValido);
        Assert.Single(resultado.CuentasOrigen, c => c.Tipo == TipoCuentaOrigen.Efectivo);
        Assert.Contains(resultado.CuentasOrigen, c => c.Nombre == "Efectivo");
    }

    [Theory]
    [InlineData("Banco", TipoCuentaOrigen.Banco)]
    [InlineData("BANCO", TipoCuentaOrigen.Banco)]
    [InlineData(" banco ", TipoCuentaOrigen.Banco)]
    [InlineData("Tarjeta de crédito", TipoCuentaOrigen.TarjetaCredito)]
    [InlineData("Tarjeta de credito", TipoCuentaOrigen.TarjetaCredito)]
    [InlineData("TARJETA DE CRÉDITO", TipoCuentaOrigen.TarjetaCredito)]
    [InlineData("TarjetaCredito", TipoCuentaOrigen.TarjetaCredito)]
    public void Tipo_AceptaVariantesRazonables(string texto, TipoCuentaOrigen esperado)
    {
        var resultado = LeerConOrigen(["Cuenta-Ejemplo", texto]);

        Assert.True(resultado.EsValido);
        Assert.Equal(esperado, resultado.CuentasOrigen.Single(c => c.Nombre == "Cuenta-Ejemplo").Tipo);
    }

    [Fact]
    public void Tipo_NoValido_IndicaLaHojaYLaFila()
    {
        var resultado = LeerConOrigen(["Banco-Ejemplo", "Banco"], ["Cuenta-Ejemplo", "Cooperativa"]);

        var error = Assert.Single(resultado.Errores);
        Assert.Contains("CuentasOrigen", error);
        Assert.Contains("fila 3", error);
        Assert.Contains("Cooperativa", error);
    }

    [Fact]
    public void Tipo_Vacio_EsError()
    {
        var resultado = LeerConOrigen(["Banco-Ejemplo", null]);

        Assert.Contains("fila 2", Assert.Single(resultado.Errores));
    }

    [Fact]
    public void Nombre_VacioConTipo_EsError()
    {
        var resultado = LeerConOrigen([null, "Banco"], ["Banco-Ejemplo", "Banco"]);

        Assert.Contains("falta el nombre", Assert.Single(resultado.Errores));
    }

    [Theory]
    [InlineData("Banco-Ejemplo", "Efectivo")]
    [InlineData("Efectivo", "Banco")]
    public void TipoEfectivo_SoloParaLaCuentaEfectivo(string nombre, string tipo)
    {
        var resultado = LeerConOrigen([nombre, tipo]);

        Assert.Contains("solo la cuenta", Assert.Single(resultado.Errores));
    }

    [Fact]
    public void CuentaOrigenRepetida_EsErrorSinImportarMayusculas()
    {
        var resultado = LeerConOrigen(["Banco-Ejemplo", "Banco"], ["BANCO-EJEMPLO", "Banco"]);

        Assert.Contains("repetida", Assert.Single(resultado.Errores));
    }

    [Fact]
    public void CuentaGastoRepetida_IndicaLaFila()
    {
        var resultado = ImportadorCatalogo.Leer(Libro(
            Origen(["Banco-Ejemplo", "Banco"]),
            ("CuentasGasto", [["Nombre"], ["Comida"], ["comida"]])));

        var error = Assert.Single(resultado.Errores);
        Assert.Contains("CuentasGasto", error);
        Assert.Contains("fila 3", error);
    }

    [Fact]
    public void ConErrores_NoDevuelveCuentas()
    {
        var resultado = LeerConOrigen(["Banco-Ejemplo", "Banco"], ["Cuenta-Ejemplo", "Cooperativa"]);

        Assert.False(resultado.EsValido);
        Assert.Empty(resultado.CuentasOrigen);
        Assert.Empty(resultado.CuentasGasto);
    }

    [Fact]
    public void FaltanLasDosHojas_InformaAmbas()
    {
        var resultado = ImportadorCatalogo.Leer(Libro(("Gastos", [["Date"]])));

        Assert.Equal(2, resultado.Errores.Count);
        Assert.Contains(resultado.Errores, e => e.Contains("CuentasOrigen"));
        Assert.Contains(resultado.Errores, e => e.Contains("CuentasGasto"));
    }

    [Fact]
    public void FaltaColumnaTipo_EsError()
    {
        var resultado = ImportadorCatalogo.Leer(Libro(("CuentasOrigen", [["Nombre"], ["Banco-Ejemplo"]]), GastoValido));

        Assert.Contains("columna Tipo", Assert.Single(resultado.Errores));
    }

    [Fact]
    public void HojaDeGastoSinCuentas_EsError()
    {
        var resultado = ImportadorCatalogo.Leer(Libro(Origen(["Banco-Ejemplo", "Banco"]), ("CuentasGasto", [["Nombre"]])));

        Assert.Contains("no tiene cuentas", Assert.Single(resultado.Errores));
    }

    [Fact]
    public void HojaDeOrigenSinCuentas_EsError()
    {
        var resultado = LeerConOrigen();

        Assert.Contains("no tiene cuentas", Assert.Single(resultado.Errores));
    }

    [Fact]
    public void HojasYColumnas_NoDistinguenMayusculasNiOrden()
    {
        var resultado = ImportadorCatalogo.Leer(Libro(
            ("cuentasorigen", [["Notas", "TIPO", "nombre"], ["Mi nota", "Banco", "Banco-Ejemplo"]]),
            ("CUENTASGASTO", [["NOMBRE"], ["Comida"]])));

        Assert.True(resultado.EsValido);
        Assert.Contains(resultado.CuentasOrigen, c => c.Nombre == "Banco-Ejemplo");
    }

    [Fact]
    public void FilasVaciasYEspacios_SeIgnoran()
    {
        var resultado = ImportadorCatalogo.Leer(Libro(
            Origen(["  Banco-Ejemplo  ", "Banco"], [null, null], ["Tarjeta-Ejemplo", "Tarjeta de crédito"]),
            ("CuentasGasto", [["Nombre"], [" Comida "], [null], ["   "], ["Telefonos"]])));

        Assert.True(resultado.EsValido);
        Assert.Contains(resultado.CuentasOrigen, c => c.Nombre == "Banco-Ejemplo");
        Assert.Equal(["Comida", "Telefonos"], resultado.CuentasGasto.Select(c => c.Nombre));
    }

    [Fact]
    public void NombreNumerico_SeLeeComoTexto()
    {
        using var libro = new XLWorkbook();
        var origen = libro.AddWorksheet("CuentasOrigen");
        origen.Cell(1, 1).Value = "Nombre";
        origen.Cell(1, 2).Value = "Tipo";
        origen.Cell(2, 1).Value = 1001;
        origen.Cell(2, 2).Value = "Banco";
        var gasto = libro.AddWorksheet("CuentasGasto");
        gasto.Cell(1, 1).Value = "Nombre";
        gasto.Cell(2, 1).Value = 5100;
        var memoria = new MemoryStream();
        libro.SaveAs(memoria);
        memoria.Position = 0;

        var resultado = ImportadorCatalogo.Leer(memoria);

        Assert.True(resultado.EsValido);
        Assert.Contains(resultado.CuentasOrigen, c => c.Nombre == "1001");
        Assert.Equal("5100", resultado.CuentasGasto.Single().Nombre);
    }

    [Fact]
    public void ArchivoQueNoEsExcel_DaUnErrorClaro()
    {
        var resultado = ImportadorCatalogo.Leer(new MemoryStream("esto no es un Excel"u8.ToArray()));

        Assert.Contains("No se pudo leer el archivo", Assert.Single(resultado.Errores));
    }

    [Fact]
    public void ExcelExportado_NoSeConfundeConUnCatalogo()
    {
        var exportado = ExportadorExcel.Crear([new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 104.24m)]);

        var resultado = ImportadorCatalogo.Leer(new MemoryStream(exportado));

        Assert.False(resultado.EsValido);
        Assert.Contains(resultado.Errores, e => e.Contains("Falta la hoja"));
    }
}
