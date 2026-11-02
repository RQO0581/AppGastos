namespace AppGastos.Servicios;

// Lleva un mensaje de una pantalla a la siguiente. Se lee una sola vez:
// así no vuelve a aparecer al regresar más tarde a esa pantalla.
public class AvisoPendiente
{
    private string? texto;

    public void Dejar(string mensaje) => texto = mensaje;

    public string? Tomar()
    {
        var mensaje = texto;
        texto = null;
        return mensaje;
    }
}
