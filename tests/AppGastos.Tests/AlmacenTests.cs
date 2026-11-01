using AppGastos.Modelos;
using AppGastos.Servicios;
using Microsoft.JSInterop;

namespace AppGastos.Tests;

public class AlmacenTests
{
    // Anota las llamadas a JavaScript, sin ejecutarlas.
    private sealed class JsFalso : IJSRuntime
    {
        public object?[]? Argumentos { get; private set; }

        public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args)
        {
            Argumentos = args;
            return ValueTask.FromResult(default(TValue)!);
        }

        public ValueTask<TValue> InvokeAsync<TValue>(string identifier, CancellationToken cancellationToken, object?[]? args) =>
            InvokeAsync<TValue>(identifier, args);
    }

    [Fact]
    public async Task ReemplazarCuentasOrigen_EnviaLaListaComoUnSoloArgumento()
    {
        var js = new JsFalso();

        await new Almacen(js).ReemplazarCuentasOrigenAsync(
        [
            new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo },
            new CuentaOrigen { Nombre = "Banco-Ejemplo", Tipo = TipoCuentaOrigen.Banco },
        ]);

        var argumento = Assert.Single(js.Argumentos!);
        Assert.Equal(2, Assert.IsType<CuentaOrigen[]>(argumento).Length);
    }

    [Fact]
    public async Task ReemplazarCuentasGasto_EnviaLaListaComoUnSoloArgumento()
    {
        var js = new JsFalso();

        await new Almacen(js).ReemplazarCuentasGastoAsync(
        [
            new CuentaGasto { Nombre = "Comida" },
            new CuentaGasto { Nombre = "Telefonos" },
        ]);

        var argumento = Assert.Single(js.Argumentos!);
        Assert.Equal(2, Assert.IsType<CuentaGasto[]>(argumento).Length);
    }
}
