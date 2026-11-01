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

    // Un arreglo pasado solo se convertiría en varios argumentos, uno por cuenta.
    [Fact]
    public async Task ReemplazarCatalogo_EnviaCadaListaComoUnSoloArgumento()
    {
        var js = new JsFalso();

        await new Almacen(js).ReemplazarCatalogoAsync(
        [
            new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo },
            new CuentaOrigen { Nombre = "Banco-Ejemplo", Tipo = TipoCuentaOrigen.Banco },
            new CuentaOrigen { Nombre = "Tarjeta-Ejemplo", Tipo = TipoCuentaOrigen.TarjetaCredito },
        ],
        [
            new CuentaGasto { Nombre = "Comida" },
            new CuentaGasto { Nombre = "Telefonos" },
        ]);

        Assert.Equal(2, js.Argumentos!.Length);
        Assert.Equal(3, Assert.IsType<CuentaOrigen[]>(js.Argumentos[0]).Length);
        Assert.Equal(2, Assert.IsType<CuentaGasto[]>(js.Argumentos[1]).Length);
    }
}
