using System.Globalization;
using AppGastos.Servicios;

namespace AppGastos.Tests;

public class VersionCompiladaTests
{
    private static readonly TimeZoneInfo PuertoRico = TimeZoneInfo.FindSystemTimeZoneById("America/Puerto_Rico");

    private static DateTime Leer() =>
        DateTime.ParseExact(VersionCompilada.Valor, "yyyyMMdd HHmmss", CultureInfo.InvariantCulture, DateTimeStyles.None);

    [Fact]
    public void TieneElFormatoPedido()
    {
        Assert.Matches(@"^\d{8} \d{6}$", VersionCompilada.Valor);
        Leer();
    }

    // Si la versión estuviera en UTC, aquí iría unas 4 horas por delante de la hora de Puerto Rico.
    [Fact]
    public void NoVaPorDelanteDeLaHoraDePuertoRico()
    {
        var ahora = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, PuertoRico);

        Assert.True(Leer() <= ahora.AddMinutes(1), $"Versión {VersionCompilada.Valor}, hora de Puerto Rico {ahora:yyyyMMdd HHmmss}");
    }

    // AppGastos.csproj resta 4 horas fijas a UTC. Si Puerto Rico cambiara de horario, esta prueba avisa.
    [Theory]
    [InlineData(1)]
    [InlineData(4)]
    [InlineData(7)]
    [InlineData(10)]
    [InlineData(12)]
    public void PuertoRicoEsUtcMenos4TodoElAnio(int mes)
    {
        var fecha = new DateTime(DateTime.UtcNow.Year, mes, 15, 12, 0, 0, DateTimeKind.Utc);

        Assert.Equal(TimeSpan.FromHours(-4), PuertoRico.GetUtcOffset(fecha));
    }
}
