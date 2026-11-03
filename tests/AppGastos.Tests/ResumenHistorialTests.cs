using AppGastos.Modelos;
using AppGastos.Servicios;

namespace AppGastos.Tests;

public class ResumenHistorialTests
{
    private static Transaccion Nueva(TipoTransaccion tipo, decimal monto, DateOnly? fecha = null) => new()
    {
        Id = Guid.NewGuid(),
        Tipo = tipo,
        Fecha = fecha ?? new DateOnly(2026, 1, 15),
        Monto = monto,
        CuentaOrigen = "Banco-Ejemplo",
        CuentaDestino = "Telefonos",
    };

    [Fact]
    public void Totales_NoMezclanLosTipos()
    {
        var totales = ResumenHistorial.Totales(
        [
            Nueva(TipoTransaccion.Gasto, 104.24m),
            Nueva(TipoTransaccion.Gasto, 0.10m),
            Nueva(TipoTransaccion.Ingreso, 500m),
            Nueva(TipoTransaccion.Transferencia, 200m),
        ]);

        Assert.Equal(
            [
                new TotalPorTipo(TipoTransaccion.Gasto, 2, 104.34m),
                new TotalPorTipo(TipoTransaccion.Devolucion, 0, 0m),
                new TotalPorTipo(TipoTransaccion.Ingreso, 1, 500m),
                new TotalPorTipo(TipoTransaccion.Transferencia, 1, 200m),
            ],
            totales);
    }

    [Fact]
    public void Totales_SinTransaccionesMuestranTodosLosTiposEnCero()
    {
        var totales = ResumenHistorial.Totales([]);

        Assert.Equal(Enum.GetValues<TipoTransaccion>().Length, totales.Count);
        Assert.All(totales, total =>
        {
            Assert.Equal(0, total.Cantidad);
            Assert.Equal(0m, total.Suma);
        });
    }

    // Con double, sumar 0.10 diez veces no daría exactamente 1.
    [Fact]
    public void Totales_SumanSinErroresDeRedondeo()
    {
        var total = ResumenHistorial.Totales(Enumerable.Range(0, 10).Select(_ => Nueva(TipoTransaccion.Gasto, 0.10m)))[0];

        Assert.Equal(1.00m, total.Suma);
    }

    [Fact]
    public void MasRecientesPrimero_OrdenaPorFecha()
    {
        var vieja = Nueva(TipoTransaccion.Gasto, 1, new DateOnly(2026, 1, 1));
        var nueva = Nueva(TipoTransaccion.Gasto, 2, new DateOnly(2026, 1, 31));
        var media = Nueva(TipoTransaccion.Gasto, 3, new DateOnly(2026, 1, 15));

        Assert.Equal([nueva, media, vieja], ResumenHistorial.MasRecientesPrimero([vieja, nueva, media]));
    }

    [Theory]
    [InlineData(2026, 1, 31)]
    [InlineData(2026, 2, 28)]
    [InlineData(2028, 2, 29)]
    [InlineData(2026, 4, 30)]
    [InlineData(2026, 12, 31)]
    public void UltimoDiaDelMes_ConoceLaDuracionDeCadaMes(int anio, int mes, int ultimoDia)
    {
        var dentroDelMes = new DateOnly(anio, mes, 15);

        Assert.Equal(new DateOnly(anio, mes, ultimoDia), ResumenHistorial.UltimoDiaDelMes(dentroDelMes));
        Assert.Equal(new DateOnly(anio, mes, 1), ResumenHistorial.PrimerDiaDelMes(dentroDelMes));
    }

    [Fact]
    public void LeerMes_EntiendeElTextoDeLaDireccion()
    {
        Assert.Equal(new DateOnly(2026, 3, 1), ResumenHistorial.LeerMes("2026-03", new DateOnly(2026, 11, 2)));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("2026-13")]
    [InlineData("2026-3-1")]
    public void LeerMes_UnTextoInvalidoLlevaAlMesDeHoy(string? texto)
    {
        Assert.Equal(new DateOnly(2026, 11, 1), ResumenHistorial.LeerMes(texto, new DateOnly(2026, 11, 2)));
    }

    [Fact]
    public void TextoMes_SeLeeIgualQueSeEscribe()
    {
        var mes = new DateOnly(2026, 3, 1);

        Assert.Equal("2026-03", ResumenHistorial.TextoMes(mes));
        Assert.Equal(mes, ResumenHistorial.LeerMes(ResumenHistorial.TextoMes(mes), new DateOnly(2000, 1, 1)));
    }

    [Theory]
    [InlineData("es-ES")]
    [InlineData("ar-SA")]
    public void TextoMes_NoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.GetCultureInfo(idioma);

            Assert.Equal("2026-03", ResumenHistorial.TextoMes(new DateOnly(2026, 3, 1)));
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = original;
        }
    }
}
