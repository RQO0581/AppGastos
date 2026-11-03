using AppGastos.Servicios;

namespace AppGastos.Tests;

public class ReglasBorradoTests
{
    private static readonly DateOnly Hoy = new(2026, 11, 2);

    [Theory]
    [InlineData("BORRAR")]
    [InlineData(" BORRAR")]
    [InlineData("BORRAR ")]
    [InlineData("  BORRAR  ")]
    public void Confirmacion_AceptaLaPalabraEnMayusculas(string texto)
    {
        Assert.True(ReglasBorrado.ConfirmacionEsValida(texto));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("borrar")]
    [InlineData("Borrar")]
    [InlineData("BORRA")]
    [InlineData("BORRARR")]
    [InlineData("BOR RAR")]
    [InlineData("BORRAR TODO")]
    [InlineData("BÓRRAR")]
    [InlineData("SI")]
    public void Confirmacion_RechazaCualquierOtroTexto(string? texto)
    {
        Assert.False(ReglasBorrado.ConfirmacionEsValida(texto));
    }

    // En turco, "i" e "I" no se corresponden, y una comparación que dependa del idioma daría sorpresas.
    [Theory]
    [InlineData("tr-TR")]
    [InlineData("es-ES")]
    public void Confirmacion_NoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.GetCultureInfo(idioma);

            Assert.True(ReglasBorrado.ConfirmacionEsValida("BORRAR"));
            Assert.False(ReglasBorrado.ConfirmacionEsValida("borrar"));
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = original;
        }
    }

    [Theory]
    [InlineData(0, "0 transacciones")]
    [InlineData(1, "1 transacción")]
    [InlineData(2, "2 transacciones")]
    public void Cantidad_ConcuerdaConElNumero(int cantidad, string esperado)
    {
        Assert.Equal(esperado, ReglasBorrado.Cantidad(cantidad));
    }

    [Theory]
    [InlineData(1, "¿Seguro que deseas borrar 1 transacción?")]
    [InlineData(25, "¿Seguro que deseas borrar 25 transacciones?")]
    public void Pregunta_EsLaDeLosRequisitos(int cantidad, string esperado)
    {
        Assert.Equal(esperado, ReglasBorrado.Pregunta(cantidad));
    }

    [Theory]
    [InlineData(1, "Se borró 1 transacción.")]
    [InlineData(25, "Se borraron 25 transacciones.")]
    public void Resultado_DiceCuantasSeBorraron(int cantidad, string esperado)
    {
        Assert.Equal(esperado, ReglasBorrado.Resultado(cantidad));
    }

    [Fact]
    public void EnlaceConRango_LlevaLasDosFechas()
    {
        Assert.Equal(
            "exportar?desde=2026-01-05&hasta=2026-01-31",
            ExportacionTransacciones.EnlaceConRango(new DateOnly(2026, 1, 5), new DateOnly(2026, 1, 31)));
    }

    [Fact]
    public void RangoInicial_LeeLoQueEscribeElEnlace()
    {
        var rango = ExportacionTransacciones.RangoInicial("2026-01-05", "2026-01-31", null, Hoy);

        Assert.Equal(new DateOnly(2026, 1, 5), rango.Desde);
        Assert.Equal(new DateOnly(2026, 1, 31), rango.Hasta);
    }

    [Fact]
    public void RangoInicial_TodoNoLlevaFechas()
    {
        var rango = ExportacionTransacciones.RangoInicial(null, null, "1", Hoy);

        Assert.Null(rango.Desde);
        Assert.Null(rango.Hasta);
    }

    [Theory]
    [InlineData(null, null, null)]
    [InlineData("basura", "basura", null)]
    [InlineData("2026-01-05", null, null)]
    [InlineData(null, "2026-01-05", null)]
    [InlineData("2026-13-05", "2026-01-31", null)]
    [InlineData("2026-02-01", "2026-01-31", null)]
    [InlineData(null, null, "0")]
    public void RangoInicial_SinDatosValidosUsaElMesActual(string? desde, string? hasta, string? todo)
    {
        var rango = ExportacionTransacciones.RangoInicial(desde, hasta, todo, Hoy);

        Assert.Equal(new DateOnly(2026, 11, 1), rango.Desde);
        Assert.Equal(Hoy, rango.Hasta);
    }
}
