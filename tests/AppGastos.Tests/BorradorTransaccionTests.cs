using AppGastos.Modelos;
using AppGastos.Servicios;

namespace AppGastos.Tests;

public class BorradorTransaccionTests
{
    private static readonly DateOnly Hoy = new(2026, 3, 15);

    private static readonly CatalogoCuentas Catalogo = new(
        [
            new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo },
            new CuentaOrigen { Nombre = "Banco-Ejemplo", Tipo = TipoCuentaOrigen.Banco },
            new CuentaOrigen { Nombre = "Ahorros-Ejemplo", Tipo = TipoCuentaOrigen.Banco },
            new CuentaOrigen { Nombre = "Tarjeta-Ejemplo", Tipo = TipoCuentaOrigen.TarjetaCredito },
        ],
        [new CuentaGasto { Nombre = "Telefonos" }, new CuentaGasto { Nombre = "Comida" }],
        [new CuentaIngreso { Nombre = "Ingreso-Ejemplo" }]);

    private static BorradorTransaccion Nuevo(CatalogoCuentas? catalogo = null) => new(catalogo ?? Catalogo, Hoy);

    [Fact]
    public void AlEmpezar_EsUnGastoConLaFechaDeHoy()
    {
        var borrador = Nuevo();

        Assert.Equal(TipoTransaccion.Gasto, borrador.Tipo);
        Assert.Equal(Hoy, borrador.Fecha);
        Assert.Null(borrador.Metodo);
    }

    [Fact]
    public void Gasto_EfectivoEscogeLaCuentaSinPreguntar()
    {
        var borrador = Nuevo();

        borrador.CambiarMetodo(MetodoPago.Efectivo);

        Assert.True(borrador.OrigenEsAutomatico);
        Assert.Equal("Efectivo", borrador.Origen);
    }

    [Theory]
    [InlineData(MetodoPago.TarjetaDebito, new[] { "Ahorros-Ejemplo", "Banco-Ejemplo" })]
    [InlineData(MetodoPago.AthMovil, new[] { "Ahorros-Ejemplo", "Banco-Ejemplo" })]
    [InlineData(MetodoPago.TarjetaCredito, new[] { "Tarjeta-Ejemplo" })]
    public void Gasto_FiltraLasCuentasPorMetodo(MetodoPago metodo, string[] esperadas)
    {
        var borrador = Nuevo();

        borrador.CambiarMetodo(metodo);

        Assert.Equal(esperadas, borrador.OpcionesOrigen);
    }

    [Fact]
    public void Gasto_SinMetodoNoOfreceCuentasDeOrigen()
    {
        Assert.Empty(Nuevo().OpcionesOrigen);
    }

    [Fact]
    public void Gasto_CambiarDeDebitoAAthConservaLaCuenta()
    {
        var borrador = Nuevo();
        borrador.CambiarMetodo(MetodoPago.TarjetaDebito);
        borrador.CambiarOrigen("Banco-Ejemplo");

        borrador.CambiarMetodo(MetodoPago.AthMovil);

        Assert.Equal("Banco-Ejemplo", borrador.Origen);
    }

    [Fact]
    public void Gasto_CambiarAUnMetodoSinEsaCuentaLaVacia()
    {
        var borrador = Nuevo();
        borrador.CambiarMetodo(MetodoPago.TarjetaDebito);
        borrador.CambiarOrigen("Banco-Ejemplo");

        borrador.CambiarMetodo(MetodoPago.TarjetaCredito);

        Assert.Equal("", borrador.Origen);
    }

    [Fact]
    public void Gasto_CambiarDeEfectivoAOtroMetodoVaciaLaCuenta()
    {
        var borrador = Nuevo();
        borrador.CambiarMetodo(MetodoPago.Efectivo);

        borrador.CambiarMetodo(MetodoPago.TarjetaDebito);

        Assert.Equal("", borrador.Origen);
        Assert.False(borrador.OrigenEsAutomatico);
    }

    [Fact]
    public void Gasto_DestinoSonLasCuentasDeGastoOrdenadas()
    {
        Assert.Equal(["Comida", "Telefonos"], Nuevo().OpcionesDestino);
    }

    [Fact]
    public void Ingreso_DestinoSoloOfreceBancoYEfectivo()
    {
        var borrador = Nuevo();

        borrador.CambiarTipo(TipoTransaccion.Ingreso);

        Assert.Equal(["Ingreso-Ejemplo"], borrador.OpcionesOrigen);
        Assert.Equal(["Ahorros-Ejemplo", "Banco-Ejemplo", "Efectivo"], borrador.OpcionesDestino);
    }

    [Fact]
    public void Transferencia_OfreceTodasLasCuentasMenosElOrigenEnElDestino()
    {
        var borrador = Nuevo();
        borrador.CambiarTipo(TipoTransaccion.Transferencia);

        Assert.Equal(4, borrador.OpcionesOrigen.Count);
        Assert.Equal(4, borrador.OpcionesDestino.Count);

        borrador.CambiarOrigen("Banco-Ejemplo");

        Assert.Equal(["Ahorros-Ejemplo", "Efectivo", "Tarjeta-Ejemplo"], borrador.OpcionesDestino);
    }

    [Fact]
    public void Transferencia_EscogerComoOrigenElDestinoActualVaciaElDestino()
    {
        var borrador = Nuevo();
        borrador.CambiarTipo(TipoTransaccion.Transferencia);
        borrador.CambiarDestino("Banco-Ejemplo");

        borrador.CambiarOrigen("Banco-Ejemplo");

        Assert.Equal("", borrador.Destino);
    }

    [Fact]
    public void Transferencia_CambiarElOrigenConservaUnDestinoDistinto()
    {
        var borrador = Nuevo();
        borrador.CambiarTipo(TipoTransaccion.Transferencia);
        borrador.CambiarDestino("Tarjeta-Ejemplo");

        borrador.CambiarOrigen("Banco-Ejemplo");

        Assert.Equal("Tarjeta-Ejemplo", borrador.Destino);
    }

    [Theory]
    [InlineData("Banco-Ejemplo", "Banco-Ejemplo")]
    [InlineData("Banco-Ejemplo", "banco-ejemplo")]
    public void Transferencia_NoPermiteLaMismaCuenta(string origen, string destino)
    {
        var borrador = Nuevo();
        borrador.CambiarTipo(TipoTransaccion.Transferencia);
        borrador.TextoMonto = "10";
        borrador.CambiarOrigen(origen);
        borrador.CambiarDestino(destino);

        var error = Assert.Single(borrador.Validar());

        Assert.Contains("no pueden ser la misma", error);
    }

    [Fact]
    public void CambiarTipo_VaciaLasCuentasYElMetodoPeroConservaFechaYMonto()
    {
        var borrador = Nuevo();
        var otraFecha = new DateOnly(2026, 3, 1);
        borrador.Fecha = otraFecha;
        borrador.TextoMonto = "25";
        borrador.CambiarMetodo(MetodoPago.Efectivo);
        borrador.CambiarDestino("Comida");

        borrador.CambiarTipo(TipoTransaccion.Ingreso);

        Assert.Null(borrador.Metodo);
        Assert.Equal("", borrador.Origen);
        Assert.Equal("", borrador.Destino);
        Assert.Equal(otraFecha, borrador.Fecha);
        Assert.Equal("25", borrador.TextoMonto);
    }

    [Fact]
    public void CambiarAlMismoTipo_NoVaciaNada()
    {
        var borrador = Nuevo();
        borrador.CambiarMetodo(MetodoPago.Efectivo);

        borrador.CambiarTipo(TipoTransaccion.Gasto);

        Assert.Equal(MetodoPago.Efectivo, borrador.Metodo);
    }

    [Fact]
    public void SinCuentasDeIngreso_IngresoNoEstaDisponible()
    {
        var borrador = Nuevo(Catalogo with { Ingreso = [] });

        Assert.Contains("CuentasIngreso", borrador.MotivoTipoNoDisponible(TipoTransaccion.Ingreso));
        Assert.Null(Nuevo().MotivoTipoNoDisponible(TipoTransaccion.Ingreso));
    }

    [Fact]
    public void ConMenosDeDosCuentas_TransferenciaNoEstaDisponible()
    {
        var unaCuenta = Catalogo with { Origen = [new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo }] };

        Assert.Contains("dos cuentas", new BorradorTransaccion(unaCuenta, Hoy).MotivoTipoNoDisponible(TipoTransaccion.Transferencia));
        Assert.Null(Nuevo().MotivoTipoNoDisponible(TipoTransaccion.Transferencia));
    }

    [Fact]
    public void SinTarjetas_ElMetodoCreditoNoEstaDisponible()
    {
        var sinTarjetas = Catalogo with { Origen = [new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo }] };

        var borrador = new BorradorTransaccion(sinTarjetas, Hoy);

        Assert.NotNull(borrador.MotivoMetodoNoDisponible(MetodoPago.TarjetaCredito));
        Assert.NotNull(borrador.MotivoMetodoNoDisponible(MetodoPago.AthMovil));
        Assert.Null(borrador.MotivoMetodoNoDisponible(MetodoPago.Efectivo));
    }

    [Theory]
    [InlineData("104.24", "104.24")]
    [InlineData("104,24", "104.24")]
    [InlineData(" 5 ", "5")]
    [InlineData("5.", "5")]
    [InlineData(".5", "0.5")]
    [InlineData("0.07", "0.07")]
    [InlineData("99999999.99", "99999999.99")]
    public void Monto_AceptaEstosTextos(string texto, string esperado)
    {
        Assert.True(BorradorTransaccion.TryLeerMonto(texto, out var monto));
        Assert.Equal(decimal.Parse(esperado, System.Globalization.CultureInfo.InvariantCulture), monto);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("-5")]
    [InlineData("1,250")]
    [InlineData("1,250.50")]
    [InlineData("1.2.3")]
    [InlineData("10.999")]
    [InlineData(".")]
    [InlineData("$5")]
    [InlineData("١٢")]
    [InlineData("99999999999999999999999999999999999999")]
    public void Monto_RechazaEstosTextos(string texto)
    {
        Assert.False(BorradorTransaccion.TryLeerMonto(texto, out _));
    }

    [Theory]
    [InlineData("", "Falta el monto.")]
    [InlineData("0", "mayor que cero")]
    [InlineData("0.00", "mayor que cero")]
    [InlineData("1,250", "no es válido")]
    [InlineData("100000000", "demasiado grande")]
    public void Validar_ExplicaQueLePasaAlMonto(string texto, string esperado)
    {
        var borrador = Nuevo();
        borrador.TextoMonto = texto;

        Assert.Contains(borrador.Validar(), error => error.Contains(esperado));
    }

    [Fact]
    public void Validar_GastoVacioPideFechaMontoMetodoYCuentaDeGasto()
    {
        var borrador = Nuevo();
        borrador.Fecha = null;

        Assert.Equal(
            ["Falta la fecha.", "Falta el monto.", "Falta el método de pago.", "Falta: Cuenta de gasto."],
            borrador.Validar());
    }

    [Fact]
    public void Validar_GastoConMetodoPideLaCuentaDeOrigen()
    {
        var borrador = Nuevo();
        borrador.TextoMonto = "5";
        borrador.CambiarMetodo(MetodoPago.TarjetaDebito);
        borrador.CambiarDestino("Comida");

        Assert.Equal(["Falta: Cuenta con la que se pagó."], borrador.Validar());
    }

    [Fact]
    public void Crear_Gasto()
    {
        var id = Guid.NewGuid();
        var borrador = Nuevo();
        borrador.TextoMonto = "104,24";
        borrador.CambiarMetodo(MetodoPago.AthMovil);
        borrador.CambiarOrigen("Banco-Ejemplo");
        borrador.CambiarDestino("Telefonos");

        Assert.Empty(borrador.Validar());
        var transaccion = borrador.Crear(id);

        Assert.Equal(id, transaccion.Id);
        Assert.Equal(TipoTransaccion.Gasto, transaccion.Tipo);
        Assert.Equal(Hoy, transaccion.Fecha);
        Assert.Equal(104.24m, transaccion.Monto);
        Assert.Equal(MetodoPago.AthMovil, transaccion.MetodoPago);
        Assert.Equal("Banco-Ejemplo", transaccion.CuentaOrigen);
        Assert.Equal("Telefonos", transaccion.CuentaDestino);
    }

    [Theory]
    [InlineData(TipoTransaccion.Ingreso, "Ingreso-Ejemplo", "Banco-Ejemplo")]
    [InlineData(TipoTransaccion.Transferencia, "Banco-Ejemplo", "Tarjeta-Ejemplo")]
    [InlineData(TipoTransaccion.Transferencia, "Tarjeta-Ejemplo", "Efectivo")]
    public void Crear_IngresoOTransferencia_NoLlevaMetodoDePago(TipoTransaccion tipo, string origen, string destino)
    {
        var borrador = Nuevo();
        borrador.CambiarMetodo(MetodoPago.Efectivo);
        borrador.CambiarTipo(tipo);
        borrador.TextoMonto = "200";
        borrador.CambiarOrigen(origen);
        borrador.CambiarDestino(destino);

        Assert.Empty(borrador.Validar());
        var transaccion = borrador.Crear(Guid.NewGuid());

        Assert.Equal(tipo, transaccion.Tipo);
        Assert.Null(transaccion.MetodoPago);
        Assert.Equal(origen, transaccion.CuentaOrigen);
        Assert.Equal(destino, transaccion.CuentaDestino);
    }

    [Fact]
    public void ActualizarHoy_MueveLaFechaSiNoSeTocoAMano()
    {
        var borrador = Nuevo();

        borrador.ActualizarHoy(Hoy.AddDays(1));

        Assert.Equal(Hoy.AddDays(1), borrador.Fecha);
    }

    [Fact]
    public void ActualizarHoy_NoTocaUnaFechaEscogidaAMano()
    {
        var borrador = Nuevo();
        var escogida = Hoy.AddDays(-3);
        borrador.Fecha = escogida;

        borrador.ActualizarHoy(Hoy.AddDays(1));

        Assert.Equal(escogida, borrador.Fecha);
    }

    [Fact]
    public void ActualizarHoy_SigueFuncionandoDosDiasSeguidos()
    {
        var borrador = Nuevo();

        borrador.ActualizarHoy(Hoy.AddDays(1));
        borrador.ActualizarHoy(Hoy.AddDays(2));

        Assert.Equal(Hoy.AddDays(2), borrador.Fecha);
    }
}
