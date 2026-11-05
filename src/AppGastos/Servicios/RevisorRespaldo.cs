using System.Globalization;
using System.Text.Json;
using AppGastos.Modelos;

namespace AppGastos.Servicios;

public record ResumenRespaldo(
    string Creado,
    int Transacciones,
    int CuentasOrigen,
    int CuentasGasto,
    int CuentasIngreso,
    bool HayCorreo,
    bool HayTestamento);

public record RevisionRespaldo(bool EsValido, string? Error, ResumenRespaldo? Resumen);

// Revisa el contenido ya descifrado antes de restaurarlo. Si algo no cuadra, no se restaura nada:
// así un archivo dañado no puede dejar el teléfono a medias.
public static class RevisorRespaldo
{
    public const string Formato = "AppGastos-respaldo-contenido";
    public const int Version = 1;

    public static readonly string[] Almacenes =
        ["transacciones", "cuentasOrigen", "cuentasGasto", "cuentasIngreso", "ajustes", "testamento", "seguridadTestamento"];

    // Las mismas reglas con las que la app guarda las transacciones.
    private static readonly JsonSerializerOptions OpcionesWeb = new(JsonSerializerDefaults.Web);

    public static RevisionRespaldo Revisar(string contenido)
    {
        try
        {
            using var documento = JsonDocument.Parse(contenido);
            return Revisar(documento.RootElement);
        }
        catch (JsonException)
        {
            return Fallo("el contenido no se puede leer");
        }
    }

    private static RevisionRespaldo Revisar(JsonElement raiz)
    {
        if (raiz.ValueKind != JsonValueKind.Object || Texto(raiz, "formato") != Formato)
        {
            return Fallo("no es un respaldo de AppGastos");
        }
        if (!raiz.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number || version.GetInt32() != Version)
        {
            return Fallo("la versión del respaldo no es compatible");
        }

        var creado = Texto(raiz, "creado");
        if (creado is null || !DateTime.TryParseExact(creado, "yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
        {
            return Fallo("falta la fecha en que se creó");
        }

        if (!raiz.TryGetProperty("almacenes", out var almacenes) || almacenes.ValueKind != JsonValueKind.Object)
        {
            return Fallo("faltan los datos");
        }
        foreach (var nombre in Almacenes)
        {
            if (!almacenes.TryGetProperty(nombre, out var lista) || lista.ValueKind != JsonValueKind.Array)
            {
                return Fallo($"falta la parte \"{nombre}\"");
            }
        }

        var error = RevisarTransacciones(almacenes.GetProperty("transacciones"))
            ?? RevisarClaves(almacenes, "cuentasOrigen", "nombre", "cuentas de origen")
            ?? RevisarClaves(almacenes, "cuentasGasto", "nombre", "cuentas de gasto")
            ?? RevisarClaves(almacenes, "cuentasIngreso", "nombre", "cuentas de ingreso")
            ?? RevisarClaves(almacenes, "ajustes", "clave", "ajustes")
            ?? RevisarClaves(almacenes, "testamento", "clave", "testamento")
            ?? RevisarClaves(almacenes, "seguridadTestamento", "clave", "PIN del testamento");
        if (error is not null)
        {
            return Fallo(error);
        }

        var hayPin = Claves(almacenes, "seguridadTestamento", "clave").Contains("pin");
        var hayTestamento = Claves(almacenes, "testamento", "clave").Contains("actual");
        // Sin su PIN, el testamento no se podría abrir nunca.
        if (hayTestamento && !hayPin)
        {
            return Fallo("el testamento no trae su PIN");
        }

        var hayCorreo = almacenes.GetProperty("ajustes").EnumerateArray()
            .Any(a => Texto(a, "clave") == "correo" && a.TryGetProperty("valor", out var v) && v.ValueKind == JsonValueKind.String && v.GetString()!.Length > 0);

        return new RevisionRespaldo(true, null, new ResumenRespaldo(
            creado,
            almacenes.GetProperty("transacciones").GetArrayLength(),
            almacenes.GetProperty("cuentasOrigen").GetArrayLength(),
            almacenes.GetProperty("cuentasGasto").GetArrayLength(),
            almacenes.GetProperty("cuentasIngreso").GetArrayLength(),
            hayCorreo,
            hayTestamento));
    }

    private static string? RevisarTransacciones(JsonElement lista)
    {
        var ids = new HashSet<Guid>();
        var numero = 0;
        foreach (var elemento in lista.EnumerateArray())
        {
            numero++;
            Transaccion? transaccion;
            try
            {
                transaccion = elemento.ValueKind == JsonValueKind.Object ? elemento.Deserialize<Transaccion>(OpcionesWeb) : null;
            }
            catch (JsonException)
            {
                transaccion = null;
            }
            if (transaccion is null || transaccion.Id == Guid.Empty || !elemento.TryGetProperty("fecha", out _))
            {
                return $"la transacción número {numero} está dañada";
            }
            if (!ids.Add(transaccion.Id))
            {
                return $"la transacción número {numero} está repetida";
            }
        }
        return null;
    }

    // Cada registro necesita su clave: sin ella, la base de datos lo rechazaría a mitad de la restauración.
    private static string? RevisarClaves(JsonElement almacenes, string almacen, string propiedad, string descripcion)
    {
        var vistas = new HashSet<string>(StringComparer.Ordinal);
        foreach (var elemento in almacenes.GetProperty(almacen).EnumerateArray())
        {
            var clave = elemento.ValueKind == JsonValueKind.Object ? Texto(elemento, propiedad) : null;
            if (string.IsNullOrEmpty(clave))
            {
                return $"hay un registro dañado en {descripcion}";
            }
            if (!vistas.Add(clave))
            {
                return $"hay un registro repetido en {descripcion}";
            }
        }
        return null;
    }

    private static HashSet<string> Claves(JsonElement almacenes, string almacen, string propiedad) =>
        almacenes.GetProperty(almacen).EnumerateArray().Select(e => Texto(e, propiedad)).OfType<string>().ToHashSet();

    private static string? Texto(JsonElement elemento, string propiedad) =>
        elemento.TryGetProperty(propiedad, out var valor) && valor.ValueKind == JsonValueKind.String ? valor.GetString() : null;

    private static RevisionRespaldo Fallo(string detalle) =>
        new(false, $"El respaldo está dañado o no es válido: {detalle}. No se cambió nada.", null);
}
