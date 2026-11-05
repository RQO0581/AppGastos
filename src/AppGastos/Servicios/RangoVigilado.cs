namespace AppGastos.Servicios;

// Decide si las fechas por defecto de una pantalla deben avanzar cuando cambia el día con la app abierta.
// Sin esto, "Hasta" se queda en ayer, y un Excel exportado hoy dejaría fuera lo de hoy sin avisar.
public class RangoVigilado(DateOnly hoy, bool automatico)
{
    private DateOnly hoy = hoy;

    // Un rango escogido por el usuario, a mano o desde otra pantalla, nunca cambia solo.
    public bool Automatico { get; private set; } = automatico;

    public void MarcarAMano() => Automatico = false;

    // Devuelve el rango nuevo si hay que aplicarlo. Con la pantalla en pausa, por ejemplo mientras se
    // confirma un borrado, no hace nada: el cambio de día se aplica en la primera revisión sin pausa.
    public (DateOnly Desde, DateOnly Hasta)? Revisar(DateOnly nuevoHoy, bool enPausa = false)
    {
        if (!Automatico || enPausa || nuevoHoy == hoy)
        {
            return null;
        }

        hoy = nuevoHoy;
        return ExportacionTransacciones.RangoPorDefecto(nuevoHoy);
    }
}
