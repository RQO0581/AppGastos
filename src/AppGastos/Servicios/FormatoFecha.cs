namespace AppGastos.Servicios;

// Cómo se muestran las fechas en pantalla. El Excel exportado no usa esto: sigue con m/d/yyyy.
public static class FormatoFecha
{
    // Los nombres están escritos aquí a propósito: así no dependen del idioma del teléfono,
    // y el iPhone en inglés muestra lo mismo que el Samsung en español.
    private static readonly string[] Dias =
        ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

    private static readonly string[] Meses =
        ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    // Por ejemplo: "Lunes, 2 de noviembre de 2026".
    public static string EnPalabras(DateOnly fecha) =>
        $"{Dias[(int)fecha.DayOfWeek]}, {fecha.Day} de {Meses[fecha.Month - 1]} de {fecha.Year}";

    // Por ejemplo: "Noviembre de 2026".
    public static string MesEnPalabras(DateOnly fecha)
    {
        var mes = Meses[fecha.Month - 1];
        return $"{char.ToUpperInvariant(mes[0])}{mes[1..]} de {fecha.Year}";
    }
}
