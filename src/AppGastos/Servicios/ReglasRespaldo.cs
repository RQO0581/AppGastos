using System.Globalization;

namespace AppGastos.Servicios;

// Las reglas y los mensajes de la pantalla Respaldo, sin nada de pantalla, para que las pruebas los comprueben.
public static class ReglasRespaldo
{
    public const int LargoMinimoContrasena = 8;
    public const string PalabraDeConfirmacion = "REEMPLAZAR";
    public const string ClaveRecordatorio = "recordarBorrarRespaldo";

    public static string NombreArchivo(DateOnly fecha) => $"AppGastos-respaldo-{fecha:yyyy-MM-dd}.json";

    // Devuelve qué falta, o null si las dos contraseñas sirven.
    public static string? ProblemaContrasena(string? contrasena, string? repetida)
    {
        var largo = contrasena?.Length ?? 0;
        if (largo < LargoMinimoContrasena)
        {
            var faltan = LargoMinimoContrasena - largo;
            return faltan == 1 ? "Falta 1 carácter." : $"Faltan {faltan} caracteres.";
        }
        return contrasena == repetida ? null : "Las dos contraseñas no coinciden.";
    }

    // Igual que BORRAR: en mayúsculas, sin contar los espacios de los extremos.
    public static bool ConfirmacionEsValida(string? texto) =>
        string.Equals(texto?.Trim(), PalabraDeConfirmacion, StringComparison.Ordinal);

    // "2026-11-05 14:30" -> "Jueves, 5 de noviembre de 2026, a las 14:30"
    public static string CreadoEnPalabras(string creado)
    {
        var momento = DateTime.ParseExact(creado, "yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        return $"{FormatoFecha.EnPalabras(DateOnly.FromDateTime(momento))}, a las {momento:HH:mm}";
    }

    public static string Cantidad(int cantidad, string singular, string plural) =>
        cantidad == 1 ? $"1 {singular}" : $"{cantidad} {plural}";

    public static string SiNo(bool valor) => valor ? "sí" : "no";

    public static string Resultado(ResumenRespaldo r) =>
        $"Respaldo restaurado: {Cantidad(r.Transacciones, "transacción", "transacciones")}, " +
        $"{r.CuentasOrigen + r.CuentasGasto + r.CuentasIngreso} cuentas, correo: {SiNo(r.HayCorreo)}, testamento: {SiNo(r.HayTestamento)}.";

    public static string ErrorDeApertura(string estado) => estado switch
    {
        "contrasena" => "La contraseña no es correcta, o el archivo se dañó. No se cambió nada.",
        "version-nueva" => "Este respaldo es de una versión más nueva de la app. Actualiza la app e inténtalo otra vez. No se cambió nada.",
        _ => "Este archivo no es un respaldo de AppGastos. No se cambió nada.",
    };
}
