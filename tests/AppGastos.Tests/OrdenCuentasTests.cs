using System.Globalization;
using System.Text;
using AppGastos.Modelos;
using AppGastos.Servicios;
using ClosedXML.Excel;

namespace AppGastos.Tests;

public class OrdenCuentasTests
{
    private static readonly string[] Desordenadas =
        ["Zeta", "oro", "Ñame", "Nube", "ÉXITO", "Banco", "árbol", "caja", "Agua", "nada", "exito-2", "Óscar"];

    private static readonly string[] Ordenadas =
        ["Agua", "árbol", "Banco", "caja", "ÉXITO", "exito-2", "nada", "Nube", "Ñame", "oro", "Óscar", "Zeta"];

    [Fact]
    public void Ordena_SinDistinguirMayusculasNiAcentos()
    {
        Assert.Equal(Ordenadas, OrdenCuentas.Ordenar(Desordenadas));
    }

    [Theory]
    [InlineData("en-US")]
    [InlineData("es-PR")]
    [InlineData("es-ES")]
    [InlineData("tr-TR")]
    [InlineData("ar-SA")]
    public void Orden_NoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(idioma);

            Assert.Equal(Ordenadas, OrdenCuentas.Ordenar(Desordenadas));
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    [Fact]
    public void LosNombresNoCambian()
    {
        var resultado = OrdenCuentas.Ordenar(Desordenadas);

        Assert.Equal(Desordenadas.Order(StringComparer.Ordinal), resultado.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void LaEnneVaEntreLaNYLaO()
    {
        Assert.Equal(["nzzz", "ñ", "ñame", "o"], OrdenCuentas.Ordenar(["o", "ñame", "nzzz", "ñ"]));
    }

    // Un teléfono puede guardar la ñ o la á como dos caracteres: la letra más el acento.
    [Fact]
    public void AcentosEscritosComoDosCaracteres_SeOrdenanIgual()
    {
        var ene = "ñame";
        var a = "árbol";

        Assert.Equal([a, "banco", "nube", ene, "oro"], OrdenCuentas.Ordenar(["oro", ene, "nube", "banco", a]));
    }

    [Fact]
    public void LaDieresisTampocoCuenta()
    {
        Assert.Equal(["Guerra", "Güiro", "Guzman"], OrdenCuentas.Ordenar(["Guzman", "Güiro", "Guerra"]));
    }

    [Fact]
    public void NombresConLaMismaClave_QuedanSiempreEnElMismoOrden()
    {
        var uno = OrdenCuentas.Ordenar(["Cafe", "Café", "CAFE"]);
        var otro = OrdenCuentas.Ordenar(["CAFE", "Café", "Cafe"]);

        Assert.Equal(uno, otro);
        Assert.Equal(3, uno.Count);
    }

    [Fact]
    public void LosEspaciosAlInicioNoCuentan()
    {
        Assert.Equal(["Banco", " Caja"], OrdenCuentas.Ordenar([" Caja", "Banco"]));
    }

    // Nombres raros no deben tumbar la pantalla de Registrar.
    [Theory]
    [InlineData("\uD800roto")]
    [InlineData("😀 Compras")]
    [InlineData("")]
    public void NombresRaros_NoFallan(string raro)
    {
        Assert.Contains(raro, OrdenCuentas.Ordenar(["Banco", raro]));
    }

    private static readonly CatalogoCuentas Catalogo = new(
        [
            new CuentaOrigen { Nombre = "zeta-Banco", Tipo = TipoCuentaOrigen.Banco },
            new CuentaOrigen { Nombre = "Ñu-Banco", Tipo = TipoCuentaOrigen.Banco },
            new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo },
            new CuentaOrigen { Nombre = "ÁREA-Tarjeta", Tipo = TipoCuentaOrigen.TarjetaCredito },
            new CuentaOrigen { Nombre = "banco-Uno", Tipo = TipoCuentaOrigen.Banco },
        ],
        [new CuentaGasto { Nombre = "Zapatos" }, new CuentaGasto { Nombre = "éxito-Gasto" }, new CuentaGasto { Nombre = "agua" }],
        [new CuentaIngreso { Nombre = "Sueldo" }, new CuentaIngreso { Nombre = "ápice-Ingreso" }]);

    [Fact]
    public void Gasto_LasDosListasVanOrdenadas()
    {
        var borrador = new BorradorTransaccion(Catalogo, new DateOnly(2026, 3, 15));
        borrador.CambiarMetodo(MetodoPago.TarjetaDebito);

        Assert.Equal(["banco-Uno", "Ñu-Banco", "zeta-Banco"], borrador.OpcionesOrigen);
        Assert.Equal(["agua", "éxito-Gasto", "Zapatos"], borrador.OpcionesDestino);
    }

    [Fact]
    public void Ingreso_LasDosListasVanOrdenadas()
    {
        var borrador = new BorradorTransaccion(Catalogo, new DateOnly(2026, 3, 15));
        borrador.CambiarTipo(TipoTransaccion.Ingreso);

        Assert.Equal(["ápice-Ingreso", "Sueldo"], borrador.OpcionesOrigen);
        Assert.Equal(["banco-Uno", "Efectivo", "Ñu-Banco", "zeta-Banco"], borrador.OpcionesDestino);
    }

    [Fact]
    public void Transferencia_LasDosListasVanOrdenadas()
    {
        var borrador = new BorradorTransaccion(Catalogo, new DateOnly(2026, 3, 15));
        borrador.CambiarTipo(TipoTransaccion.Transferencia);

        string[] esperadas = ["ÁREA-Tarjeta", "banco-Uno", "Efectivo", "Ñu-Banco", "zeta-Banco"];
        Assert.Equal(esperadas, borrador.OpcionesOrigen);
        Assert.Equal(esperadas, borrador.OpcionesDestino);
    }

    [Fact]
    public void Devolucion_LasDosListasVanOrdenadas()
    {
        var borrador = new BorradorTransaccion(Catalogo, new DateOnly(2026, 3, 15));
        borrador.CambiarTipo(TipoTransaccion.Devolucion);

        Assert.Equal(["agua", "éxito-Gasto", "Zapatos"], borrador.OpcionesOrigen);
        Assert.Equal(["ÁREA-Tarjeta", "banco-Uno", "Efectivo", "Ñu-Banco", "zeta-Banco"], borrador.OpcionesDestino);
    }

    [Fact]
    public void Editar_LaCuentaViejaEntraEnSuLugarAlfabetico()
    {
        var guardada = new Transaccion
        {
            Id = Guid.NewGuid(),
            Tipo = TipoTransaccion.Gasto,
            Fecha = new DateOnly(2026, 1, 15),
            Monto = 5m,
            MetodoPago = MetodoPago.Efectivo,
            CuentaOrigen = "Efectivo",
            CuentaDestino = "Ñandú-Viejo",
        };

        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);

        Assert.Equal(["agua", "éxito-Gasto", "Ñandú-Viejo", "Zapatos"], borrador.OpcionesDestino);
    }

    [Fact]
    public void SeGuardaYSeExportaExactamenteComoEstaEscrito()
    {
        var borrador = new BorradorTransaccion(Catalogo, new DateOnly(2026, 3, 15));
        borrador.EscribirMonto("10.00");
        borrador.CambiarMetodo(MetodoPago.TarjetaCredito);
        borrador.CambiarOrigen(borrador.OpcionesOrigen[0]);
        borrador.CambiarDestino(borrador.OpcionesDestino[1]);

        var transaccion = borrador.Crear(Guid.NewGuid());

        Assert.Equal("ÁREA-Tarjeta", transaccion.CuentaOrigen);
        Assert.Equal("éxito-Gasto", transaccion.CuentaDestino);

        var archivo = ExportadorExcel.Crear(ExportacionTransacciones.Movimientos([transaccion]));
        var hoja = new XLWorkbook(new MemoryStream(archivo)).Worksheet(1);
        Assert.Equal("ÁREA-Tarjeta", hoja.Cell("E2").GetString());
        Assert.Equal("éxito-Gasto", hoja.Cell("F2").GetString());
    }

    [Fact]
    public void Plantilla_SeLlamaCuentas()
    {
        Assert.Equal("Cuentas_plantilla.xlsx", PlantillaCatalogo.NombreArchivo);
    }
}
