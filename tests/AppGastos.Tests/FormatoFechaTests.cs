using System.Globalization;
using AppGastos.Servicios;

namespace AppGastos.Tests;

public class FormatoFechaTests
{
    [Theory]
    [InlineData(2026, 11, 2, "Lunes, 2 de noviembre de 2026")]
    [InlineData(2026, 11, 3, "Martes, 3 de noviembre de 2026")]
    [InlineData(2026, 11, 4, "Miércoles, 4 de noviembre de 2026")]
    [InlineData(2026, 11, 5, "Jueves, 5 de noviembre de 2026")]
    [InlineData(2026, 11, 6, "Viernes, 6 de noviembre de 2026")]
    [InlineData(2026, 11, 7, "Sábado, 7 de noviembre de 2026")]
    [InlineData(2026, 11, 8, "Domingo, 8 de noviembre de 2026")]
    public void EnPalabras_NombraCadaDiaDeLaSemana(int anio, int mes, int dia, string esperado)
    {
        Assert.Equal(esperado, FormatoFecha.EnPalabras(new DateOnly(anio, mes, dia)));
    }

    [Theory]
    [InlineData(1, "enero")]
    [InlineData(2, "febrero")]
    [InlineData(3, "marzo")]
    [InlineData(4, "abril")]
    [InlineData(5, "mayo")]
    [InlineData(6, "junio")]
    [InlineData(7, "julio")]
    [InlineData(8, "agosto")]
    [InlineData(9, "septiembre")]
    [InlineData(10, "octubre")]
    [InlineData(11, "noviembre")]
    [InlineData(12, "diciembre")]
    public void EnPalabras_NombraCadaMes(int mes, string esperado)
    {
        Assert.Contains($" de {esperado} de 2026", FormatoFecha.EnPalabras(new DateOnly(2026, mes, 1)));
    }

    [Theory]
    [InlineData(1, "Enero de 2026")]
    [InlineData(11, "Noviembre de 2026")]
    public void MesEnPalabras_EmpiezaConMayuscula(int mes, string esperado)
    {
        Assert.Equal(esperado, FormatoFecha.MesEnPalabras(new DateOnly(2026, mes, 15)));
    }

    // Es el caso que confundía: 02/11 y 11/2 son la misma fecha, y en palabras no hay duda.
    [Fact]
    public void EnPalabras_NoConfundeElDiaConElMes()
    {
        Assert.Equal("Lunes, 2 de noviembre de 2026", FormatoFecha.EnPalabras(new DateOnly(2026, 11, 2)));
        Assert.Equal("Miércoles, 11 de febrero de 2026", FormatoFecha.EnPalabras(new DateOnly(2026, 2, 11)));
    }

    // "ar-SA" usa otro calendario y otros dígitos: si dependiera del idioma, aquí fallaría.
    [Theory]
    [InlineData("en-US")]
    [InlineData("es-PR")]
    [InlineData("ar-SA")]
    public void EnPalabras_NoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(idioma);

            Assert.Equal("Lunes, 2 de noviembre de 2026", FormatoFecha.EnPalabras(new DateOnly(2026, 11, 2)));
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }
}
