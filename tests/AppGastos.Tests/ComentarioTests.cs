using System.Text.Json;
using AppGastos.Modelos;
using AppGastos.Servicios;
using ClosedXML.Excel;

namespace AppGastos.Tests;

public class ComentarioTests
{
    private static readonly DateOnly Hoy = new(2026, 3, 15);

    private static readonly JsonSerializerOptions Opciones = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    private static readonly CatalogoCuentas Catalogo = new(
        [
            new CuentaOrigen { Nombre = "Efectivo", Tipo = TipoCuentaOrigen.Efectivo },
            new CuentaOrigen { Nombre = "Banco-Ejemplo", Tipo = TipoCuentaOrigen.Banco },
            new CuentaOrigen { Nombre = "Tarjeta-Ejemplo", Tipo = TipoCuentaOrigen.TarjetaCredito },
        ],
        [new CuentaGasto { Nombre = "Telefonos" }],
        [new CuentaIngreso { Nombre = "Ingreso-Ejemplo" }]);

    private static BorradorTransaccion GastoListo()
    {
        var borrador = new BorradorTransaccion(Catalogo, Hoy);
        borrador.EscribirMonto("10.00");
        borrador.CambiarMetodo(MetodoPago.Efectivo);
        borrador.CambiarDestino("Telefonos");
        return borrador;
    }

    private static Transaccion Guardada(string comentario = "") => new()
    {
        Id = Guid.NewGuid(),
        Tipo = TipoTransaccion.Gasto,
        Fecha = new DateOnly(2026, 11, 2),
        Monto = 10m,
        MetodoPago = MetodoPago.Efectivo,
        CuentaOrigen = "Efectivo",
        CuentaDestino = "Telefonos",
        Comentario = comentario,
    };

    private static IXLWorksheet Hoja(params MovimientoExcel[] movimientos) =>
        new XLWorkbook(new MemoryStream(ExportadorExcel.Crear(movimientos))).Worksheet(1);

    [Fact]
    public void EsOpcional()
    {
        var borrador = GastoListo();

        Assert.Empty(borrador.Validar());
        Assert.Equal("", borrador.Crear(Guid.NewGuid()).Comentario);
    }

    [Theory]
    [InlineData(TipoTransaccion.Gasto, "Efectivo", "Telefonos")]
    [InlineData(TipoTransaccion.Ingreso, "Ingreso-Ejemplo", "Banco-Ejemplo")]
    [InlineData(TipoTransaccion.Transferencia, "Banco-Ejemplo", "Tarjeta-Ejemplo")]
    [InlineData(TipoTransaccion.Devolucion, "Telefonos", "Tarjeta-Ejemplo")]
    public void SeGuardaEnLosCuatroTipos(TipoTransaccion tipo, string origen, string destino)
    {
        var borrador = new BorradorTransaccion(Catalogo, Hoy);
        borrador.CambiarTipo(tipo);
        if (tipo == TipoTransaccion.Gasto)
        {
            borrador.CambiarMetodo(MetodoPago.Efectivo);
        }
        borrador.EscribirMonto("10.00");
        borrador.CambiarOrigen(origen);
        borrador.CambiarDestino(destino);
        borrador.Comentario = "Factura de marzo";

        Assert.Empty(borrador.Validar());
        Assert.Equal("Factura de marzo", borrador.Crear(Guid.NewGuid()).Comentario);
    }

    [Fact]
    public void QuitaLosEspaciosDeLosExtremos()
    {
        var borrador = GastoListo();
        borrador.Comentario = "  Factura  de marzo  ";

        Assert.Equal("Factura  de marzo", borrador.Crear(Guid.NewGuid()).Comentario);
    }

    [Fact]
    public void SoloEspaciosQuedaSinComentario()
    {
        var borrador = GastoListo();
        borrador.Comentario = "     ";

        Assert.Empty(borrador.Validar());
        Assert.Equal("", borrador.Crear(Guid.NewGuid()).Comentario);
    }

    [Fact]
    public void AceptaExactamenteElMaximo()
    {
        var borrador = GastoListo();
        borrador.Comentario = new string('a', 100);

        Assert.Empty(borrador.Validar());
        Assert.Equal(100, borrador.Crear(Guid.NewGuid()).Comentario.Length);
    }

    [Fact]
    public void RechazaUnoMasDelMaximoSinCortarlo()
    {
        var borrador = GastoListo();
        borrador.Comentario = new string('a', 101);

        Assert.Equal(["El comentario tiene 101 caracteres. El máximo es 100."], borrador.Validar());
        Assert.Equal(101, borrador.Comentario.Length);
    }

    [Fact]
    public void LosEspaciosDeLosExtremosNoCuentanParaElMaximo()
    {
        var borrador = GastoListo();
        borrador.Comentario = "  " + new string('a', 100) + "  ";

        Assert.Empty(borrador.Validar());
    }

    [Fact]
    public void CambiarDeTipoLoConserva()
    {
        var borrador = GastoListo();
        borrador.Comentario = "Factura";

        borrador.CambiarTipo(TipoTransaccion.Ingreso);

        Assert.Equal("Factura", borrador.Comentario);
    }

    [Fact]
    public void Editar_LoCargaYPermiteCambiarlo()
    {
        var guardada = Guardada("Factura");

        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);
        Assert.Equal("Factura", borrador.Comentario);

        borrador.Comentario = "Otra";
        Assert.Equal("Otra", borrador.Crear(guardada.Id).Comentario);
        Assert.Equal("Factura", guardada.Comentario);
    }

    [Fact]
    public void Editar_SePuedeQuitar()
    {
        var guardada = Guardada("Factura");
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, guardada);

        borrador.Comentario = "";

        Assert.Equal("", borrador.Crear(guardada.Id).Comentario);
    }

    // Así están guardadas las transacciones viejas en el teléfono: sin el campo.
    [Fact]
    public void TransaccionViejaSinElCampo_QuedaSinComentario()
    {
        const string json = """{"id":"11111111-2222-3333-4444-555555555555","tipo":"Gasto","fecha":"2026-01-05","monto":104.24,"metodoPago":"AthMovil","cuentaOrigen":"Banco-Ejemplo","cuentaDestino":"Telefonos"}""";

        var vieja = JsonSerializer.Deserialize<Transaccion>(json, Opciones)!;

        Assert.Equal("", vieja.Comentario);
        var borrador = BorradorTransaccion.DesdeTransaccion(Catalogo, vieja);
        Assert.Empty(borrador.Validar());
        Assert.Equal("No hubo cambios.", TextoTransaccion.Cambios(vieja, borrador.Crear(vieja.Id)));
    }

    [Fact]
    public void Json_GuardaElComentario()
    {
        var json = JsonSerializer.Serialize(Guardada("Factura"), Opciones);

        Assert.Contains("\"comentario\":\"Factura\"", json);
        Assert.Equal("Factura", JsonSerializer.Deserialize<Transaccion>(json, Opciones)!.Comentario);
    }

    [Fact]
    public void Excel_VaEnLaColumnaDDeLasDosFilas()
    {
        var hoja = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 104.24m, "Factura de marzo"));

        Assert.Equal("Factura de marzo", hoja.Cell("D2").GetString());
        Assert.Equal("Factura de marzo", hoja.Cell("D3").GetString());
    }

    [Fact]
    public void Excel_ElEncabezadoSigueDiciendoFiller()
    {
        var hoja = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 104.24m, "Factura"));

        Assert.Equal("filler", hoja.Cell("D1").GetString());
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void Excel_LasColumnasByCSiguenVacias(int fila)
    {
        var hoja = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 104.24m, "Factura"));

        Assert.True(hoja.Cell(fila, 2).IsEmpty());
        Assert.True(hoja.Cell(fila, 3).IsEmpty());
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void Excel_ElRestoDeLaFilaNoCambia(int fila)
    {
        var conComentario = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 104.24m, "Factura"));
        var sinComentario = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 104.24m));

        foreach (var columna in new[] { 1, 5, 6, 7, 8 })
        {
            Assert.Equal(sinComentario.Cell(fila, columna).Value, conComentario.Cell(fila, columna).Value);
        }
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void Excel_SinComentarioLaCeldaQuedaVaciaDeVerdad(int fila)
    {
        var hoja = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 104.24m));

        Assert.True(hoja.Cell(fila, 4).IsEmpty());
    }

    [Fact]
    public void Excel_LlegaDesdeLaTransaccion()
    {
        var movimiento = Assert.Single(ExportacionTransacciones.Movimientos([Guardada("Factura")]));

        Assert.Equal("Factura", movimiento.Comentario);
    }

    // Excel ejecuta lo que empieza con "=" si se guarda como fórmula. Un comentario siempre debe ser texto.
    [Theory]
    [InlineData("=1+1")]
    [InlineData("=SUM(A1:A9)")]
    [InlineData("+5")]
    [InlineData("-5")]
    [InlineData("@total")]
    [InlineData("0012")]
    [InlineData("1/2/2026")]
    public void Excel_ElComentarioSiempreEsTexto(string comentario)
    {
        var hoja = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 1m, comentario));

        Assert.False(hoja.Cell("D2").HasFormula);
        Assert.Equal(XLDataType.Text, hoja.Cell("D2").DataType);
        Assert.Equal(comentario, hoja.Cell("D2").GetString());
    }

    [Theory]
    [InlineData("Niño & café <bueno> \"sí\"")]
    [InlineData("Compra 😀")]
    public void Excel_ConservaAcentosYSimbolos(string comentario)
    {
        var hoja = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 1m, comentario));

        Assert.Equal(comentario, hoja.Cell("D3").GetString());
    }

    [Fact]
    public void Excel_ConservaLosCienCaracteres()
    {
        var comentario = new string('a', 100);

        var hoja = Hoja(new MovimientoExcel(new DateOnly(2026, 1, 1), "Banco-Ejemplo", "Telefonos", 1m, comentario));

        Assert.Equal(comentario, hoja.Cell("D2").GetString());
    }

    [Fact]
    public void Mensaje_AlGuardarLoIncluyeSiHay()
    {
        Assert.EndsWith("De Efectivo a Telefonos. Comentario: Factura", TextoTransaccion.Guardada(Guardada("Factura")));
        Assert.EndsWith("De Efectivo a Telefonos.", TextoTransaccion.Guardada(Guardada()));
    }

    [Theory]
    [InlineData("", "Factura", "Comentario: Sin comentario → Factura")]
    [InlineData("Factura", "", "Comentario: Factura → Sin comentario")]
    [InlineData("Factura", "Otra", "Comentario: Factura → Otra")]
    public void Mensaje_AlEditarDiceQueCambio(string antes, string despues, string esperado)
    {
        Assert.Equal($"Gasto actualizado. {esperado}.", TextoTransaccion.Cambios(Guardada(antes), Guardada(despues)));
    }
}
