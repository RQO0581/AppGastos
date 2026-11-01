using System.Globalization;
using System.Text.Json;
using AppGastos.Modelos;

namespace AppGastos.Tests;

// IndexedDB guarda lo que produce el JSON, y el índice por fecha depende de ese formato.
public class ModeloJsonTests
{
    // Las mismas reglas que usa Blazor para enviar datos a JavaScript.
    private static readonly JsonSerializerOptions Opciones = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    private static readonly Transaccion Ejemplo = new()
    {
        Id = Guid.Parse("11111111-2222-3333-4444-555555555555"),
        Fecha = new DateOnly(2026, 1, 5),
        Monto = 104.24m,
        MetodoPago = MetodoPago.AthMovil,
        CuentaOrigen = "Banco-Ejemplo",
        CuentaGasto = "Telefonos",
    };

    [Fact]
    public void Transaccion_UsaLosNombresQueEsperaIndexedDb()
    {
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(Ejemplo, Opciones));
        var raiz = json.RootElement;

        Assert.Equal("11111111-2222-3333-4444-555555555555", raiz.GetProperty("id").GetString());
        Assert.Equal("2026-01-05", raiz.GetProperty("fecha").GetString());
        Assert.Equal(104.24m, raiz.GetProperty("monto").GetDecimal());
        Assert.Equal("AthMovil", raiz.GetProperty("metodoPago").GetString());
        Assert.Equal("Banco-Ejemplo", raiz.GetProperty("cuentaOrigen").GetString());
        Assert.Equal("Telefonos", raiz.GetProperty("cuentaGasto").GetString());
    }

    [Fact]
    public void CuentaOrigen_GuardaElTipoComoTexto()
    {
        var cuenta = new CuentaOrigen { Nombre = "Tarjeta-Ejemplo", Tipo = TipoCuentaOrigen.TarjetaCredito };

        Assert.Equal("""{"nombre":"Tarjeta-Ejemplo","tipo":"TarjetaCredito"}""", JsonSerializer.Serialize(cuenta, Opciones));
    }

    // El monto pasa por un número de JavaScript al guardarse. Estos valores comprueban que vuelve exacto.
    [Theory]
    [InlineData("0.10")]
    [InlineData("0.07")]
    [InlineData("104.24")]
    [InlineData("1250.50")]
    [InlineData("99999999.99")]
    public void Monto_VuelveExactoDespuesDePasarPorUnNumeroDeJavaScript(string texto)
    {
        var monto = decimal.Parse(texto, CultureInfo.InvariantCulture);

        // Un número de JavaScript es un double, y al convertirlo a JSON se escribe como aquí.
        var comoJavaScript = double.Parse(JsonSerializer.Serialize(monto), CultureInfo.InvariantCulture);
        var devuelto = JsonSerializer.Deserialize<decimal>(JsonSerializer.Serialize(comoJavaScript));

        Assert.Equal(monto, devuelto);
    }

    // Si el texto no se ordena como las fechas, los rangos de IndexedDB devolverían datos incorrectos.
    [Fact]
    public void Fechas_SeOrdenanComoTextoIgualQueComoFechas()
    {
        DateOnly[] fechas = [new(2026, 10, 1), new(2026, 2, 1), new(2025, 12, 31), new(2026, 1, 15)];

        var comoTexto = fechas.Select(f => JsonSerializer.Serialize(f, Opciones)).Order(StringComparer.Ordinal);
        var comoFecha = fechas.Order().Select(f => JsonSerializer.Serialize(f, Opciones));

        Assert.Equal(comoFecha, comoTexto);
    }

    [Theory]
    [InlineData("es-ES")]
    [InlineData("ar-SA")]
    public void Json_NoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(idioma);

            var json = JsonSerializer.Serialize(Ejemplo, Opciones);

            Assert.Contains("\"fecha\":\"2026-01-05\"", json);
            Assert.Contains("\"monto\":104.24", json);
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    [Fact]
    public void Transaccion_SeRecuperaIgual()
    {
        var copia = JsonSerializer.Deserialize<Transaccion>(JsonSerializer.Serialize(Ejemplo, Opciones), Opciones)!;

        Assert.Equal(Ejemplo.Id, copia.Id);
        Assert.Equal(Ejemplo.Fecha, copia.Fecha);
        Assert.Equal(Ejemplo.Monto, copia.Monto);
        Assert.Equal(Ejemplo.MetodoPago, copia.MetodoPago);
        Assert.Equal(Ejemplo.CuentaOrigen, copia.CuentaOrigen);
        Assert.Equal(Ejemplo.CuentaGasto, copia.CuentaGasto);
    }
}
