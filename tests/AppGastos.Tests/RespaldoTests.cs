using System.Text.Json.Nodes;
using AppGastos.Servicios;

namespace AppGastos.Tests;

// Solo datos ficticios.
public class RevisorRespaldoTests
{
    private static JsonObject Valido() => JsonNode.Parse("""
        {
          "formato": "AppGastos-respaldo-contenido",
          "version": 1,
          "creado": "2026-11-05 14:30",
          "almacenes": {
            "transacciones": [
              { "id": "6f1c2a6e-0d6b-4b8e-9a39-0e4f4b2f8c11", "tipo": "Gasto", "fecha": "2026-11-01", "monto": 12.5, "metodoPago": "Efectivo", "cuentaOrigen": "Efectivo", "cuentaDestino": "Telefonos", "comentario": "" },
              { "id": "0a7b1f3c-5d2e-4c11-8f40-6a9d2b7e3c22", "tipo": "Ingreso", "fecha": "2026-11-02", "monto": 100, "metodoPago": null, "cuentaOrigen": "Salario-Ejemplo", "cuentaDestino": "Banco-Ejemplo", "comentario": "ficticio" }
            ],
            "cuentasOrigen": [ { "nombre": "Banco-Ejemplo", "tipo": "Banco" }, { "nombre": "Efectivo", "tipo": "Efectivo" } ],
            "cuentasGasto": [ { "nombre": "Telefonos" } ],
            "cuentasIngreso": [ { "nombre": "Salario-Ejemplo" } ],
            "ajustes": [ { "clave": "correo", "valor": "ejemplo@example.com" } ],
            "testamento": [ { "clave": "actual", "iv": { "$bytes": "AAAAAAAAAAAAAAAA" }, "cifrado": { "$buffer": "AAAA" } } ],
            "seguridadTestamento": [ { "clave": "pin", "sal": { "$bytes": "AAAAAAAAAAAAAAAAAAAAAA==" }, "hash": { "$bytes": "AAAA" }, "iteraciones": 600000, "intentos": 0, "bloqueadoHasta": 0 } ]
          }
        }
        """)!.AsObject();

    private static JsonObject Almacenes(JsonObject raiz) => raiz["almacenes"]!.AsObject();

    private static RevisionRespaldo Revisar(JsonObject raiz) => RevisorRespaldo.Revisar(raiz.ToJsonString());

    [Fact]
    public void UnRespaldoValidoDaSuResumen()
    {
        var revision = Revisar(Valido());

        Assert.True(revision.EsValido, revision.Error);
        Assert.Equal(new ResumenRespaldo("2026-11-05 14:30", 2, 2, 1, 1, true, true), revision.Resumen);
    }

    [Fact]
    public void UnTelefonoVacioTambienSeRespalda()
    {
        var raiz = Valido();
        foreach (var nombre in RevisorRespaldo.Almacenes)
        {
            Almacenes(raiz)[nombre] = new JsonArray();
        }

        var revision = Revisar(raiz);

        Assert.True(revision.EsValido, revision.Error);
        Assert.Equal(new ResumenRespaldo("2026-11-05 14:30", 0, 0, 0, 0, false, false), revision.Resumen);
    }

    [Fact]
    public void UnPinSinTestamentoEsValido()
    {
        var raiz = Valido();
        Almacenes(raiz)["testamento"] = new JsonArray();

        var revision = Revisar(raiz);

        Assert.True(revision.EsValido, revision.Error);
        Assert.False(revision.Resumen!.HayTestamento);
    }

    [Theory]
    [InlineData("no es json")]
    [InlineData("[]")]
    [InlineData("""{ "formato": "otra-cosa", "version": 1 }""")]
    public void RechazaLoQueNoEsUnRespaldo(string contenido)
    {
        var revision = RevisorRespaldo.Revisar(contenido);

        Assert.False(revision.EsValido);
        Assert.Contains("No se cambió nada", revision.Error);
    }

    [Fact]
    public void RechazaOtraVersion()
    {
        var raiz = Valido();
        raiz["version"] = 2;

        Assert.False(Revisar(raiz).EsValido);
    }

    [Fact]
    public void RechazaSinFechaDeCreacion()
    {
        var raiz = Valido();
        raiz["creado"] = "ayer";

        Assert.False(Revisar(raiz).EsValido);
    }

    [Theory]
    [InlineData("transacciones")]
    [InlineData("cuentasOrigen")]
    [InlineData("cuentasGasto")]
    [InlineData("cuentasIngreso")]
    [InlineData("ajustes")]
    [InlineData("testamento")]
    [InlineData("seguridadTestamento")]
    public void RechazaSiFaltaUnaParte(string almacen)
    {
        var raiz = Valido();
        Almacenes(raiz).Remove(almacen);

        var revision = Revisar(raiz);

        Assert.False(revision.EsValido);
        Assert.Contains(almacen, revision.Error);
    }

    [Fact]
    public void RechazaUnaTransaccionDanada()
    {
        var raiz = Valido();
        Almacenes(raiz)["transacciones"]![1]!["monto"] = "mucho";

        var revision = Revisar(raiz);

        Assert.False(revision.EsValido);
        Assert.Contains("número 2", revision.Error);
    }

    [Fact]
    public void RechazaUnaTransaccionSinId()
    {
        var raiz = Valido();
        Almacenes(raiz)["transacciones"]![0]!.AsObject().Remove("id");

        Assert.False(Revisar(raiz).EsValido);
    }

    [Fact]
    public void RechazaUnaTransaccionRepetida()
    {
        var raiz = Valido();
        Almacenes(raiz)["transacciones"]![1]!["id"] = "6f1c2a6e-0d6b-4b8e-9a39-0e4f4b2f8c11";

        var revision = Revisar(raiz);

        Assert.False(revision.EsValido);
        Assert.Contains("repetida", revision.Error);
    }

    [Fact]
    public void RechazaUnaCuentaSinNombre()
    {
        var raiz = Valido();
        Almacenes(raiz)["cuentasGasto"]!.AsArray().Add(new JsonObject { ["nombre"] = "" });

        Assert.False(Revisar(raiz).EsValido);
    }

    [Fact]
    public void RechazaUnaCuentaRepetida()
    {
        var raiz = Valido();
        Almacenes(raiz)["cuentasGasto"]!.AsArray().Add(new JsonObject { ["nombre"] = "Telefonos" });

        var revision = Revisar(raiz);

        Assert.False(revision.EsValido);
        Assert.Contains("cuentas de gasto", revision.Error);
    }

    [Fact]
    public void RechazaUnTestamentoSinSuPin()
    {
        var raiz = Valido();
        Almacenes(raiz)["seguridadTestamento"] = new JsonArray();

        var revision = Revisar(raiz);

        Assert.False(revision.EsValido);
        Assert.Contains("PIN", revision.Error);
    }

    [Fact]
    public void UnCorreoVacioNoCuenta()
    {
        var raiz = Valido();
        Almacenes(raiz)["ajustes"]![0]!["valor"] = "";

        Assert.False(Revisar(raiz).Resumen!.HayCorreo);
    }
}

public class ReglasRespaldoTests
{
    [Theory]
    [InlineData("", "", "Faltan 8 caracteres.")]
    [InlineData("1234567", "1234567", "Falta 1 carácter.")]
    [InlineData("12345678", "12345679", "Las dos contraseñas no coinciden.")]
    [InlineData("12345678", "12345678", null)]
    [InlineData("una frase larga", "una frase larga", null)]
    public void LaContrasenaTieneAlMenos8YCoincide(string contrasena, string repetida, string? esperado)
    {
        Assert.Equal(esperado, ReglasRespaldo.ProblemaContrasena(contrasena, repetida));
    }

    [Fact]
    public void LaContrasenaNoSeRecortaNiCambia()
    {
        Assert.Equal("Las dos contraseñas no coinciden.", ReglasRespaldo.ProblemaContrasena("Clave-Ejemplo", "clave-ejemplo"));
        Assert.Equal("Las dos contraseñas no coinciden.", ReglasRespaldo.ProblemaContrasena("Clave-Ejemplo ", "Clave-Ejemplo"));
    }

    [Theory]
    [InlineData("REEMPLAZAR", true)]
    [InlineData(" REEMPLAZAR ", true)]
    [InlineData("reemplazar", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void LaConfirmacionVaEnMayusculas(string? texto, bool esperado)
    {
        Assert.Equal(esperado, ReglasRespaldo.ConfirmacionEsValida(texto));
    }

    [Fact]
    public void ElArchivoLlevaLaFecha()
    {
        Assert.Equal("AppGastos-respaldo-2026-11-05.json", ReglasRespaldo.NombreArchivo(new DateOnly(2026, 11, 5)));
    }

    [Fact]
    public void LaFechaDeCreacionVaEnPalabras()
    {
        Assert.Equal("Jueves, 5 de noviembre de 2026, a las 14:30", ReglasRespaldo.CreadoEnPalabras("2026-11-05 14:30"));
    }

    [Fact]
    public void ElResultadoDiceQueSeRestauro()
    {
        var resumen = new ResumenRespaldo("2026-11-05 14:30", 1, 2, 3, 1, true, false);

        Assert.Equal("Respaldo restaurado: 1 transacción, 6 cuentas, correo: sí, testamento: no.", ReglasRespaldo.Resultado(resumen));
    }

    [Theory]
    [InlineData("contrasena", "La contraseña no es correcta")]
    [InlineData("version-nueva", "versión más nueva")]
    [InlineData("no-es-respaldo", "no es un respaldo")]
    public void LosErroresDeAperturaDicenQueNoCambioNada(string estado, string texto)
    {
        var mensaje = ReglasRespaldo.ErrorDeApertura(estado);

        Assert.Contains(texto, mensaje);
        Assert.Contains("No se cambió nada", mensaje);
    }
}
