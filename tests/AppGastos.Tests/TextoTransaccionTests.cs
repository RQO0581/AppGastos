using AppGastos.Modelos;
using AppGastos.Servicios;

namespace AppGastos.Tests;

public class TextoTransaccionTests
{
    private static Transaccion Gasto() => new()
    {
        Id = Guid.NewGuid(),
        Tipo = TipoTransaccion.Gasto,
        Fecha = new DateOnly(2026, 11, 2),
        Monto = 1104.24m,
        MetodoPago = MetodoPago.AthMovil,
        CuentaOrigen = "Banco-Ejemplo",
        CuentaDestino = "Telefonos",
    };

    private static Transaccion Transferencia() => new()
    {
        Id = Guid.NewGuid(),
        Tipo = TipoTransaccion.Transferencia,
        Fecha = new DateOnly(2026, 11, 2),
        Monto = 200m,
        CuentaOrigen = "Banco-Ejemplo",
        CuentaDestino = "Tarjeta-Ejemplo",
    };

    [Fact]
    public void Guardada_UsaLaFechaEnPalabras()
    {
        Assert.Equal(
            "Gasto guardado: $1,104.24. Lunes, 2 de noviembre de 2026. De Banco-Ejemplo a Telefonos.",
            TextoTransaccion.Guardada(Gasto()));
    }

    [Fact]
    public void Borrada_ConcuerdaConElTipo()
    {
        Assert.StartsWith("Gasto borrado:", TextoTransaccion.Borrada(Gasto()));
        Assert.StartsWith("Transferencia borrada:", TextoTransaccion.Borrada(Transferencia()));
    }

    [Fact]
    public void PreguntaBorrar_ConcuerdaConElTipo()
    {
        Assert.Equal("¿Seguro que deseas borrar este gasto de $1,104.24?", TextoTransaccion.PreguntaBorrar(Gasto()));
        Assert.Equal("¿Seguro que deseas borrar esta transferencia de $200.00?", TextoTransaccion.PreguntaBorrar(Transferencia()));

        var ingreso = Gasto();
        ingreso.Tipo = TipoTransaccion.Ingreso;
        Assert.StartsWith("¿Seguro que deseas borrar este ingreso", TextoTransaccion.PreguntaBorrar(ingreso));
    }

    [Fact]
    public void Cambios_SinDiferenciasLoDice()
    {
        Assert.Equal("No hubo cambios.", TextoTransaccion.Cambios(Gasto(), Gasto()));
    }

    [Fact]
    public void Cambios_SoloNombraLoQueCambio()
    {
        var despues = Gasto();
        despues.Monto = 20m;

        Assert.Equal("Gasto actualizado. Monto: $1,104.24 → $20.00.", TextoTransaccion.Cambios(Gasto(), despues));
    }

    [Fact]
    public void Cambios_NombraCadaCampoCambiado()
    {
        var despues = Transferencia();
        despues.Fecha = new DateOnly(2026, 2, 11);

        var texto = TextoTransaccion.Cambios(Gasto(), despues);

        Assert.StartsWith("Transferencia actualizada.", texto);
        Assert.Contains("Tipo: Gasto → Transferencia", texto);
        Assert.Contains("Fecha: Lunes, 2 de noviembre de 2026 → Miércoles, 11 de febrero de 2026", texto);
        Assert.Contains("Monto: $1,104.24 → $200.00", texto);
        Assert.Contains("Método de pago: ATH Móvil → Sin método", texto);
        Assert.Contains("Cuenta de destino: Telefonos → Tarjeta-Ejemplo", texto);
        Assert.DoesNotContain("Cuenta de origen", texto);
    }

    [Theory]
    [InlineData(TipoTransaccion.Gasto, "Gastos")]
    [InlineData(TipoTransaccion.Ingreso, "Ingresos")]
    [InlineData(TipoTransaccion.Transferencia, "Transferencias")]
    public void Plural_NombraCadaTipo(TipoTransaccion tipo, string esperado)
    {
        Assert.Equal(esperado, TextoTransaccion.Plural(tipo));
    }

    [Theory]
    [InlineData("es-ES")]
    [InlineData("ar-SA")]
    public void Monto_NoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.GetCultureInfo(idioma);

            Assert.Equal("$1,250.50", TextoTransaccion.Monto(1250.5m));
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = original;
        }
    }
}
