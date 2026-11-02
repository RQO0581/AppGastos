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
        borrador.TextoDolares = "10";
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
        borrador.TextoDolares = "25";
        borrador.CambiarMetodo(MetodoPago.Efectivo);
        borrador.CambiarDestino("Comida");

        borrador.CambiarTipo(TipoTransaccion.Ingreso);

        Assert.Null(borrador.Metodo);
        Assert.Equal("", borrador.Origen);
        Assert.Equal("", borrador.Destino);
        Assert.Equal(otraFecha, borrador.Fecha);
        Assert.Equal("25", borrador.TextoDolares);
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
    [InlineData("104", "24", "104.24")]
    [InlineData("104", "", "104")]
    [InlineData("104", "00", "104")]
    [InlineData("", "50", "0.50")]
    [InlineData("0", "07", "0.07")]
    [InlineData("5", "5", "5.05")]
    [InlineData(" 5 ", " 25 ", "5.25")]
    [InlineData("1250", "50", "1250.50")]
    [InlineData("99999999", "99", "99999999.99")]
    public void Monto_AceptaEstosTextos(string dolares, string centavos, string esperado)
    {
        Assert.True(BorradorTransaccion.TryLeerMonto(dolares, centavos, out var monto));
        Assert.Equal(decimal.Parse(esperado, System.Globalization.CultureInfo.InvariantCulture), monto);
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("abc", "")]
    [InlineData("-5", "")]
    [InlineData("104.24", "")]
    [InlineData("1,250", "")]
    [InlineData("$5", "")]
    [InlineData("١٢", "")]
    [InlineData("5", "abc")]
    [InlineData("5", ".5")]
    [InlineData("5", "100")]
    [InlineData("5", "١")]
    [InlineData("99999999999999999999999999999999999999", "")]
    public void Monto_RechazaEstosTextos(string dolares, string centavos)
    {
        Assert.False(BorradorTransaccion.TryLeerMonto(dolares, centavos, out _));
    }

    [Theory]
    [InlineData("", "", "Falta el monto.")]
    [InlineData("0", "", "mayor que cero")]
    [InlineData("0", "00", "mayor que cero")]
    [InlineData("1,250", "", "no es válido")]
    [InlineData("100000000", "", "demasiado grande")]
    public void Validar_ExplicaQueLePasaAlMonto(string dolares, string centavos, string esperado)
    {
        var borrador = Nuevo();
        borrador.TextoDolares = dolares;
        borrador.TextoCentavos = centavos;

        Assert.Contains(borrador.Validar(), error => error.Contains(esperado));
    }

    [Theory]
    [InlineData("104", "24", 104.24)]
    [InlineData("104", "5", 104.05)]
    [InlineData("", "50", 0.50)]
    public void MontoEscrito_MuestraLoQueSeVaAGuardar(string dolares, string centavos, double esperado)
    {
        var borrador = Nuevo();
        borrador.TextoDolares = dolares;
        borrador.TextoCentavos = centavos;

        Assert.Equal((decimal)esperado, borrador.MontoEscrito);
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("0", "")]
    [InlineData("abc", "")]
    [InlineData("100000000", "")]
    public void MontoEscrito_EsNullSiElMontoNoSePuedeGuardar(string dolares, string centavos)
    {
        var borrador = Nuevo();
        borrador.TextoDolares = dolares;
        borrador.TextoCentavos = centavos;

        Assert.Null(borrador.MontoEscrito);
    }

    [Theory]
    [InlineData(1250.5, "1250", "50")]
    [InlineData(104.24, "104", "24")]
    [InlineData(0.07, "0", "07")]
    [InlineData(200, "200", "00")]
    [InlineData(99999999.99, "99999999", "99")]
    public void Editar_SeparaDolaresYCentavosYVuelveAlMismoMonto(double valor, string dolares, string centavos)
    {
        var guardada = GastoGuardado();
        guardada.Monto = (decimal)valor;

        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);

        Assert.Equal(dolares, borrador.TextoDolares);
        Assert.Equal(centavos, borrador.TextoCentavos);
        Assert.Equal(guardada.Monto, borrador.Crear(guardada.Id).Monto);
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
        borrador.TextoDolares = "5";
        borrador.CambiarMetodo(MetodoPago.TarjetaDebito);
        borrador.CambiarDestino("Comida");

        Assert.Equal(["Falta: Cuenta con la que se pagó."], borrador.Validar());
    }

    [Fact]
    public void Crear_Gasto()
    {
        var id = Guid.NewGuid();
        var borrador = Nuevo();
        borrador.TextoDolares = "104";
        borrador.TextoCentavos = "24";
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
        borrador.TextoDolares = "200";
        borrador.CambiarOrigen(origen);
        borrador.CambiarDestino(destino);

        Assert.Empty(borrador.Validar());
        var transaccion = borrador.Crear(Guid.NewGuid());

        Assert.Equal(tipo, transaccion.Tipo);
        Assert.Null(transaccion.MetodoPago);
        Assert.Equal(origen, transaccion.CuentaOrigen);
        Assert.Equal(destino, transaccion.CuentaDestino);
    }

    private static Transaccion GastoGuardado(string origen = "Banco-Ejemplo", string destino = "Telefonos", MetodoPago metodo = MetodoPago.AthMovil) => new()
    {
        Id = Guid.NewGuid(),
        Tipo = TipoTransaccion.Gasto,
        Fecha = new DateOnly(2026, 1, 15),
        Monto = 1250.5m,
        MetodoPago = metodo,
        CuentaOrigen = origen,
        CuentaDestino = destino,
    };

    private static Transaccion Guardada(TipoTransaccion tipo, string origen, string destino) => new()
    {
        Id = Guid.NewGuid(),
        Tipo = tipo,
        Fecha = new DateOnly(2026, 1, 15),
        Monto = 200m,
        CuentaOrigen = origen,
        CuentaDestino = destino,
    };

    [Fact]
    public void Editar_CargaTodosLosDatos()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado());

        Assert.Equal(TipoTransaccion.Gasto, borrador.Tipo);
        Assert.Equal(new DateOnly(2026, 1, 15), borrador.Fecha);
        Assert.Equal("1250", borrador.TextoDolares);
        Assert.Equal("50", borrador.TextoCentavos);
        Assert.Equal(MetodoPago.AthMovil, borrador.Metodo);
        Assert.Equal("Banco-Ejemplo", borrador.Origen);
        Assert.Equal("Telefonos", borrador.Destino);
        Assert.Empty(borrador.Validar());
    }

    [Theory]
    [InlineData("es-ES")]
    [InlineData("ar-SA")]
    public void Editar_ElMontoNoDependeDelIdiomaDelTelefono(string idioma)
    {
        var original = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.GetCultureInfo(idioma);

            var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado());

            Assert.Equal("1250", borrador.TextoDolares);
        Assert.Equal("50", borrador.TextoCentavos);
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = original;
        }
    }

    [Fact]
    public void Editar_SinCambiosDevuelveLoMismoConElMismoId()
    {
        var guardada = GastoGuardado();

        var copia = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada).Crear(guardada.Id);

        Assert.Equal(guardada.Id, copia.Id);
        Assert.Equal(guardada.Tipo, copia.Tipo);
        Assert.Equal(guardada.Fecha, copia.Fecha);
        Assert.Equal(guardada.Monto, copia.Monto);
        Assert.Equal(guardada.MetodoPago, copia.MetodoPago);
        Assert.Equal(guardada.CuentaOrigen, copia.CuentaOrigen);
        Assert.Equal(guardada.CuentaDestino, copia.CuentaDestino);
    }

    [Fact]
    public void Editar_CambiarDatosNoTocaLaTransaccionOriginal()
    {
        var guardada = GastoGuardado();
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);

        borrador.TextoDolares = "5";
        borrador.CambiarTipo(TipoTransaccion.Ingreso);

        Assert.Equal(1250.5m, guardada.Monto);
        Assert.Equal(TipoTransaccion.Gasto, guardada.Tipo);
    }

    [Fact]
    public void Editar_CuentasQueYaNoEstanEnElCatalogoSiguenEnLaLista()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado("Banco-Viejo", "Gasto-Viejo"));

        Assert.Contains("Banco-Viejo", borrador.OpcionesOrigen);
        Assert.Contains("Gasto-Viejo", borrador.OpcionesDestino);
        Assert.Equal("Banco-Viejo", borrador.Origen);
        Assert.Empty(borrador.Validar());
    }

    [Fact]
    public void Editar_LasCuentasViejasVanOrdenadasYSinRepetir()
    {
        var conVieja = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado(destino: "Gasto-Viejo"));
        var sinVieja = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado());

        Assert.Equal(["Comida", "Gasto-Viejo", "Telefonos"], conVieja.OpcionesDestino);
        Assert.Equal(["Comida", "Telefonos"], sinVieja.OpcionesDestino);
    }

    [Fact]
    public void Editar_CuentaViejaSigueAlPasarDeAthADebito()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado("Banco-Viejo"));

        borrador.CambiarMetodo(MetodoPago.TarjetaDebito);

        Assert.Equal("Banco-Viejo", borrador.Origen);
    }

    [Fact]
    public void Editar_CuentaViejaDeBancoNoSeOfreceConOtroMetodo()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado("Banco-Viejo"));

        borrador.CambiarMetodo(MetodoPago.TarjetaCredito);

        Assert.Equal("", borrador.Origen);
        Assert.Equal(["Tarjeta-Ejemplo"], borrador.OpcionesOrigen);
    }

    [Fact]
    public void Editar_VolverAlMetodoOriginalVuelveAOfrecerLaCuentaVieja()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado("Banco-Viejo"));

        borrador.CambiarMetodo(MetodoPago.TarjetaCredito);
        borrador.CambiarMetodo(MetodoPago.AthMovil);

        Assert.Contains("Banco-Viejo", borrador.OpcionesOrigen);
    }

    [Fact]
    public void Editar_EfectivoConNombreViejoConservaLaCuenta()
    {
        var guardada = GastoGuardado("Caja-Vieja", metodo: MetodoPago.Efectivo);
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);

        Assert.True(borrador.OrigenEsAutomatico);
        Assert.Equal("Caja-Vieja", borrador.Origen);

        borrador.CambiarMetodo(MetodoPago.TarjetaDebito);
        borrador.CambiarMetodo(MetodoPago.Efectivo);

        Assert.Equal("Caja-Vieja", borrador.Origen);
    }

    [Fact]
    public void Editar_PasarDeOtroMetodoAEfectivoUsaLaCuentaDelCatalogo()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado());

        borrador.CambiarMetodo(MetodoPago.Efectivo);

        Assert.Equal("Efectivo", borrador.Origen);
    }

    [Fact]
    public void Editar_MetodoSigueDisponibleSiSoloQuedaLaCuentaOriginal()
    {
        var sinTarjetas = Catalogo with { Origen = [new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo }] };

        var borrador = BorradorTransaccion.DesdeTransaccion(sinTarjetas, GastoGuardado("Tarjeta-Vieja", metodo: MetodoPago.TarjetaCredito));

        Assert.Null(borrador.MotivoMetodoNoDisponible(MetodoPago.TarjetaCredito));
        Assert.NotNull(borrador.MotivoMetodoNoDisponible(MetodoPago.AthMovil));
    }

    [Fact]
    public void Editar_IngresoConCuentasViejasSiguenEnLaLista()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, Guardada(TipoTransaccion.Ingreso, "Ingreso-Viejo", "Banco-Viejo"));

        Assert.Contains("Ingreso-Viejo", borrador.OpcionesOrigen);
        Assert.Contains("Banco-Viejo", borrador.OpcionesDestino);
        Assert.Null(borrador.Metodo);
    }

    [Fact]
    public void Editar_IngresoSigueDisponibleAunqueElCatalogoNoTengaCuentasDeIngreso()
    {
        var sinIngresos = Catalogo with { Ingreso = [] };

        var borrador = BorradorTransaccion.DesdeTransaccion(sinIngresos, Guardada(TipoTransaccion.Ingreso, "Ingreso-Viejo", "Banco-Ejemplo"));

        Assert.Null(borrador.MotivoTipoNoDisponible(TipoTransaccion.Ingreso));
    }

    [Fact]
    public void Editar_UnGastoNoHabilitaIngresoSiElCatalogoNoTieneCuentas()
    {
        var sinIngresos = Catalogo with { Ingreso = [] };

        var borrador = BorradorTransaccion.DesdeTransaccion(sinIngresos, GastoGuardado());

        Assert.NotNull(borrador.MotivoTipoNoDisponible(TipoTransaccion.Ingreso));
    }

    [Fact]
    public void Editar_TransferenciaConDestinoViejoNoLoOfreceComoOrigenRepetido()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, Guardada(TipoTransaccion.Transferencia, "Banco-Ejemplo", "Tarjeta-Vieja"));

        Assert.Contains("Tarjeta-Vieja", borrador.OpcionesDestino);
        Assert.DoesNotContain("Banco-Ejemplo", borrador.OpcionesDestino);
        Assert.Empty(borrador.Validar());
    }

    [Fact]
    public void Editar_LaCuentaViejaDeOrigenSaleDelDestinoSiSigueEscogida()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, Guardada(TipoTransaccion.Transferencia, "Banco-Viejo", "Tarjeta-Ejemplo"));

        Assert.Contains("Banco-Viejo", borrador.OpcionesOrigen);
        Assert.DoesNotContain("Banco-Viejo", borrador.OpcionesDestino);
    }

    [Fact]
    public void Editar_CambiarDeTipoVaciaLasCuentasYNoOfreceLasViejas()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado("Banco-Viejo", "Gasto-Viejo"));

        borrador.CambiarTipo(TipoTransaccion.Transferencia);

        Assert.Equal("", borrador.Origen);
        Assert.Equal("", borrador.Destino);
        Assert.Null(borrador.Metodo);
        Assert.DoesNotContain("Banco-Viejo", borrador.OpcionesOrigen);
        Assert.DoesNotContain("Gasto-Viejo", borrador.OpcionesDestino);
    }

    [Fact]
    public void Editar_VolverAlTipoOriginalOfreceLasViejasPeroHayQueEscogerlas()
    {
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, GastoGuardado("Banco-Viejo", "Gasto-Viejo"));

        borrador.CambiarTipo(TipoTransaccion.Ingreso);
        borrador.CambiarTipo(TipoTransaccion.Gasto);

        Assert.Equal("", borrador.Destino);
        Assert.Contains("Gasto-Viejo", borrador.OpcionesDestino);
    }

    [Fact]
    public void Editar_CambiarAIngresoQuitaElMetodoAlGuardar()
    {
        var guardada = GastoGuardado();
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);

        borrador.CambiarTipo(TipoTransaccion.Ingreso);
        borrador.CambiarOrigen("Ingreso-Ejemplo");
        borrador.CambiarDestino("Banco-Ejemplo");

        Assert.Empty(borrador.Validar());
        var editada = borrador.Crear(guardada.Id);

        Assert.Equal(guardada.Id, editada.Id);
        Assert.Equal(TipoTransaccion.Ingreso, editada.Tipo);
        Assert.Null(editada.MetodoPago);
    }

    [Fact]
    public void Editar_LaFechaNuncaCambiaSola()
    {
        var guardada = GastoGuardado();
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);

        borrador.ActualizarHoy(guardada.Fecha.AddDays(1));

        Assert.Equal(guardada.Fecha, borrador.Fecha);
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
