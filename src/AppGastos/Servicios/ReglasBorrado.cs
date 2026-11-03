namespace AppGastos.Servicios;

// Las reglas y los mensajes de las pantallas de borrado, sin nada de pantalla, para que las pruebas los comprueben.
public static class ReglasBorrado
{
    public const string PalabraDeConfirmacion = "BORRAR";

    // Debe ir en mayúsculas: escribirla así es lo que hace que no se pueda confirmar sin querer.
    // Los espacios de los extremos se ignoran porque el teclado a veces añade uno.
    public static bool ConfirmacionEsValida(string? texto) =>
        string.Equals(texto?.Trim(), PalabraDeConfirmacion, StringComparison.Ordinal);

    public static string Cantidad(int cantidad) => cantidad == 1 ? "1 transacción" : $"{cantidad} transacciones";

    public static string Pregunta(int cantidad) => $"¿Seguro que deseas borrar {Cantidad(cantidad)}?";

    public static string Resultado(int cantidad) =>
        cantidad == 1 ? "Se borró 1 transacción." : $"Se borraron {cantidad} transacciones.";
}
