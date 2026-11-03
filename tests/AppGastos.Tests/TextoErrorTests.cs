using AppGastos.Servicios;

namespace AppGastos.Tests;

public class TextoErrorTests
{
    [Theory]
    [InlineData("Fallo de prueba", "Fallo de prueba")]
    [InlineData("Fallo de prueba\nundefined", "Fallo de prueba")]
    [InlineData("Fallo de prueba\nError: Fallo de prueba\n    at ejecutar (almacen.js:40:15)", "Fallo de prueba")]
    [InlineData("  Fallo de prueba  \r\nundefined", "Fallo de prueba")]
    [InlineData("", "Error desconocido")]
    [InlineData("\nundefined", "Error desconocido")]
    public void Detalle_SoloDejaLaPrimeraLinea(string mensaje, string esperado)
    {
        Assert.Equal(esperado, TextoError.Detalle(new Exception(mensaje)));
    }
}
