using System.Text.Json;
using AppGastos.Modelos;
using AppGastos.Servicios;
using ClosedXML.Excel;

namespace AppGastos.Tests;

public class DevolucionTests
{
    private static readonly DateOnly Hoy = new(2026, 3, 15);

    private static readonly CatalogoCuentas Catalogo = new(
        [
            new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo },
            new CuentaOrigen { Nombre = "Banco-Ejemplo", Tipo = TipoCuentaOrigen.Banco },
            new CuentaOrigen { Nombre = "Tarjeta-Ejemplo", Tipo = TipoCuentaOrigen.TarjetaCredito },
        ],
        [new CuentaGasto { Nombre = "Telefonos" }, new CuentaGasto { Nombre = "Comida" }],
        [new CuentaIngreso { Nombre = "Ingreso-Ejemplo" }]);

    private static BorradorTransaccion NuevaDevolucion()
    {
        var borrador = new BorradorTransaccion(Catalogo, Hoy);
        borrador.CambiarTipo(TipoTransaccion.Devolucion);
        return borrador;
    }

    private static Transaccion Guardada(TipoTransaccion tipo, decimal monto, string origen = "Telefonos", string destino = "Tarjeta-Ejemplo") => new()
    {
        Id = Guid.NewGuid(),
        Tipo = tipo,
        Fecha = new DateOnly(2026, 1, 15),
        Monto = monto,
        CuentaOrigen = origen,
        CuentaDestino = destino,
    };

    [Fact]
    public void Origen_SonLasCuentasDeGasto()
    {
        Assert.Equal(["Comida", "Telefonos"], NuevaDevolucion().OpcionesOrigen);
    }

    [Fact]
    public void Destino_SonTodasLasCuentasDeOrigen_IncluidasTarjetaYEfectivo()
    {
        Assert.Equal(["Banco-Ejemplo", "Efectivo", "Tarjeta-Ejemplo"], NuevaDevolucion().OpcionesDestino);
    }

    [Fact]
    public void Etiquetas_DicenDeQueCuentaSeTrata()
    {
        var borrador = NuevaDevolucion();

        Assert.Equal("Cuenta del gasto original", borrador.EtiquetaOrigen);
        Assert.Equal("Cuenta a donde vuelve el dinero", borrador.EtiquetaDestino);
    }

    [Theory]
    [InlineData("Banco-Ejemplo")]
    [InlineData("Tarjeta-Ejemplo")]
    [InlineData("Efectivo")]
    public void Crear_NoLlevaMetodoDePago(string destino)
    {
        var borrador = NuevaDevolucion();
        borrador.EscribirMonto("30.00");
        borrador.CambiarOrigen("Telefonos");
        borrador.CambiarDestino(destino);

        Assert.Empty(borrador.Validar());
        var devolucion = borrador.Crear(Guid.NewGuid());

        Assert.Equal(TipoTransaccion.Devolucion, devolucion.Tipo);
        Assert.Null(devolucion.MetodoPago);
        Assert.Equal(30m, devolucion.Monto);
        Assert.Equal("Telefonos", devolucion.CuentaOrigen);
        Assert.Equal(destino, devolucion.CuentaDestino);
    }

    [Fact]
    public void Validar_NoPideMetodoYSiPideLasCuentas()
    {
        var borrador = NuevaDevolucion();
        borrador.EscribirMonto("30.00");

        Assert.Equal(
            ["Falta: Cuenta del gasto original.", "Falta: Cuenta a donde vuelve el dinero."],
            borrador.Validar());
    }

    [Fact]
    public void CambiarDeGastoADevolucion_QuitaElMetodoYLasCuentas()
    {
        var borrador = new BorradorTransaccion(Catalogo, Hoy);
        borrador.CambiarMetodo(MetodoPago.Efectivo);
        borrador.CambiarDestino("Comida");

        borrador.CambiarTipo(TipoTransaccion.Devolucion);

        Assert.Null(borrador.Metodo);
        Assert.Equal("", borrador.Origen);
        Assert.Equal("", borrador.Destino);
    }

    [Fact]
    public void Editar_CargaLaDevolucionYConservaCuentasViejas()
    {
        var guardada = Guardada(TipoTransaccion.Devolucion, 30m, "Gasto-Viejo", "Banco-Viejo");

        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);

        Assert.Equal(TipoTransaccion.Devolucion, borrador.Tipo);
        Assert.Equal("30.00", borrador.TextoMonto);
        Assert.Contains("Gasto-Viejo", borrador.OpcionesOrigen);
        Assert.Contains("Banco-Viejo", borrador.OpcionesDestino);
        Assert.Empty(borrador.Validar());
        Assert.Equal(guardada.Id, borrador.Crear(guardada.Id).Id);
    }

    [Fact]
    public void Disponibilidad_SiempreConUnCatalogoNormal()
    {
        Assert.Null(new BorradorTransaccion(Catalogo, Hoy).MotivoTipoNoDisponible(TipoTransaccion.Devolucion));
    }

    [Fact]
    public void Disponibilidad_NoSinCuentasDeGasto()
    {
        var sinGasto = Catalogo with { Gasto = [] };

        Assert.Contains("CuentasGasto", new BorradorTransaccion(sinGasto, Hoy).MotivoTipoNoDisponible(TipoTransaccion.Devolucion));
    }

    [Fact]
    public void GastoNeto_EsGastosMenosDevoluciones()
    {
        var totales = ResumenHistorial.Totales(
        [
            Guardada(TipoTransaccion.Gasto, 100m),
            Guardada(TipoTransaccion.Gasto, 50m),
            Guardada(TipoTransaccion.Devolucion, 30m),
        ]);

        Assert.Equal(120m, ResumenHistorial.GastoNeto(totales));
    }

    [Fact]
    public void GastoNeto_NoCuentaIngresosNiTransferencias()
    {
        var totales = ResumenHistorial.Totales(
        [
            Guardada(TipoTransaccion.Gasto, 100m),
            Guardada(TipoTransaccion.Ingreso, 500m),
            Guardada(TipoTransaccion.Transferencia, 200m),
        ]);

        Assert.Equal(100m, ResumenHistorial.GastoNeto(totales));
    }

    [Fact]
    public void GastoNeto_PuedeSerNegativo()
    {
        var totales = ResumenHistorial.Totales([Guardada(TipoTransaccion.Devolucion, 30m)]);

        Assert.Equal(-30m, ResumenHistorial.GastoNeto(totales));
        Assert.Equal("-$30.00", TextoTransaccion.Monto(ResumenHistorial.GastoNeto(totales)));
    }

    [Fact]
    public void GastoNeto_NoTieneErroresDeRedondeo()
    {
        var totales = ResumenHistorial.Totales(
        [
            Guardada(TipoTransaccion.Gasto, 0.30m),
            Guardada(TipoTransaccion.Devolucion, 0.10m),
            Guardada(TipoTransaccion.Devolucion, 0.20m),
        ]);

        Assert.Equal(0m, ResumenHistorial.GastoNeto(totales));
        Assert.Equal("$0.00", TextoTransaccion.Monto(ResumenHistorial.GastoNeto(totales)));
    }

    [Fact]
    public void Totales_LasDevolucionesVanDespuesDeLosGastos()
    {
        var orden = ResumenHistorial.Totales([]).Select(t => t.Tipo);

        Assert.Equal(
            [TipoTransaccion.Gasto, TipoTransaccion.Devolucion, TipoTransaccion.Ingreso, TipoTransaccion.Transferencia],
            orden);
    }

    [Fact]
    public void Textos_DicenDevolucionConAcentoYEnFemenino()
    {
        var devolucion = Guardada(TipoTransaccion.Devolucion, 30m);

        Assert.Equal("Devolución", TextoTransaccion.Nombre(TipoTransaccion.Devolucion));
        Assert.Equal("Devoluciones", TextoTransaccion.Plural(TipoTransaccion.Devolucion));
        Assert.Equal(
            "Devolución guardada: $30.00. Jueves, 15 de enero de 2026. De Telefonos a Tarjeta-Ejemplo.",
            TextoTransaccion.Guardada(devolucion));
        Assert.StartsWith("Devolución borrada:", TextoTransaccion.Borrada(devolucion));
        Assert.Equal("¿Seguro que deseas borrar esta devolución de $30.00?", TextoTransaccion.PreguntaBorrar(devolucion));
    }

    [Fact]
    public void Cambios_DicenDevolucionActualizada()
    {
        var antes = Guardada(TipoTransaccion.Devolucion, 30m);
        var despues = Guardada(TipoTransaccion.Devolucion, 25m);

        Assert.Equal("Devolución actualizada. Monto: $30.00 → $25.00.", TextoTransaccion.Cambios(antes, despues));
    }

    [Fact]
    public void Monto_PositivoYNegativoLlevanElSignoAntesDelDolar()
    {
        Assert.Equal("$1,250.50", TextoTransaccion.Monto(1250.5m));
        Assert.Equal("-$1,250.50", TextoTransaccion.Monto(-1250.5m));
        Assert.Equal("$0.00", TextoTransaccion.Monto(0m));
    }

    // El ejemplo de REQUISITOS.md.
    [Fact]
    public void Excel_UsaLaMismaReglaDeOrigenYDestino()
    {
        var archivo = ExportadorExcel.Crear(ExportacionTransacciones.Movimientos([Guardada(TipoTransaccion.Devolucion, 30m)]));

        var hoja = new XLWorkbook(new MemoryStream(archivo)).Worksheet(1);
        Assert.Equal(3, hoja.LastRowUsed()!.RowNumber());
        Assert.Equal(new DateTime(2026, 1, 15), hoja.Cell("A2").GetDateTime());
        Assert.Equal("Telefonos", hoja.Cell("E2").GetString());
        Assert.Equal("Tarjeta-Ejemplo", hoja.Cell("F2").GetString());
        Assert.True(hoja.Cell("G2").IsEmpty());
        Assert.Equal(30, hoja.Cell("H2").GetDouble());
        Assert.Equal("Tarjeta-Ejemplo", hoja.Cell("E3").GetString());
        Assert.Equal("Telefonos", hoja.Cell("F3").GetString());
        Assert.Equal(30, hoja.Cell("G3").GetDouble());
        Assert.True(hoja.Cell("H3").IsEmpty());
    }

    [Fact]
    public void Json_SeGuardaComoTextoSinMetodoDePago()
    {
        var opciones = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };

        var json = JsonSerializer.Serialize(Guardada(TipoTransaccion.Devolucion, 30m), opciones);
        var copia = JsonSerializer.Deserialize<Transaccion>(json, opciones)!;

        Assert.Contains("\"tipo\":\"Devolucion\"", json);
        Assert.Contains("\"metodoPago\":null", json);
        Assert.Equal(TipoTransaccion.Devolucion, copia.Tipo);
    }
}
