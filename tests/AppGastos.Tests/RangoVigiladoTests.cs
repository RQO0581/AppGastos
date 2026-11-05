using AppGastos.Servicios;

namespace AppGastos.Tests;

public class RangoVigiladoTests
{
    private static readonly DateOnly Hoy = new(2026, 11, 5);

    [Fact]
    public void ElMismoDia_NoCambiaNada()
    {
        Assert.Null(new RangoVigilado(Hoy, automatico: true).Revisar(Hoy));
    }

    [Fact]
    public void AlCambiarElDia_HastaAvanza()
    {
        var rango = new RangoVigilado(Hoy, automatico: true).Revisar(Hoy.AddDays(1));

        Assert.Equal((new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 6)), rango);
    }

    [Fact]
    public void AlCambiarElMes_DesdeTambienAvanza()
    {
        var rango = new RangoVigilado(new DateOnly(2026, 11, 30), automatico: true).Revisar(new DateOnly(2026, 12, 1));

        Assert.Equal((new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 1)), rango);
    }

    [Fact]
    public void AlCambiarElAnio_TambienAvanza()
    {
        var rango = new RangoVigilado(new DateOnly(2026, 12, 31), automatico: true).Revisar(new DateOnly(2027, 1, 1));

        Assert.Equal((new DateOnly(2027, 1, 1), new DateOnly(2027, 1, 1)), rango);
    }

    [Fact]
    public void AvanzaUnaSolaVezPorCadaDia()
    {
        var vigilado = new RangoVigilado(Hoy, automatico: true);

        Assert.NotNull(vigilado.Revisar(Hoy.AddDays(1)));
        Assert.Null(vigilado.Revisar(Hoy.AddDays(1)));
        Assert.NotNull(vigilado.Revisar(Hoy.AddDays(2)));
    }

    [Fact]
    public void UnRangoQueNoEsPorDefecto_NoCambia()
    {
        Assert.Null(new RangoVigilado(Hoy, automatico: false).Revisar(Hoy.AddDays(1)));
    }

    [Fact]
    public void DespuesDeEscogerUnaFechaAMano_NoCambiaMas()
    {
        var vigilado = new RangoVigilado(Hoy, automatico: true);

        vigilado.MarcarAMano();

        Assert.False(vigilado.Automatico);
        Assert.Null(vigilado.Revisar(Hoy.AddDays(1)));
    }

    [Fact]
    public void EnPausa_EsperaYDespuesAplicaElCambio()
    {
        var vigilado = new RangoVigilado(Hoy, automatico: true);

        Assert.Null(vigilado.Revisar(Hoy.AddDays(1), enPausa: true));

        Assert.Equal((new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 6)), vigilado.Revisar(Hoy.AddDays(1)));
    }
}
