using System.Globalization;
using System.Text;

namespace AppGastos.Servicios;

// El orden en que se muestran las cuentas: alfabético, sin distinguir mayúsculas ni acentos.
// Solo sirve para mostrarlas: los nombres se guardan y se exportan exactamente como están escritos.
public static class OrdenCuentas
{
    // Va después de cualquier letra: así la ñ queda entre la n y la o.
    private const char DespuesDeLaN = '￿';

    private const char TildeCombinable = '̃';

    // No depende del idioma del teléfono: el iPhone en inglés muestra el mismo orden que el Samsung en español.
    public static List<string> Ordenar(IEnumerable<string> nombres) =>
        nombres
            .OrderBy(Clave, StringComparer.Ordinal)
            // Dos nombres con la misma clave, como "Café" y "Cafe", siempre quedan en el mismo orden.
            .ThenBy(nombre => nombre, StringComparer.Ordinal)
            .ToList();

    private static string Clave(string nombre)
    {
        var separado = Separar(nombre.Trim().ToLowerInvariant());
        var clave = new StringBuilder(separado.Length);
        for (var i = 0; i < separado.Length; i++)
        {
            var caracter = separado[i];
            if (CharUnicodeInfo.GetUnicodeCategory(caracter) != UnicodeCategory.NonSpacingMark)
            {
                clave.Append(caracter);
            }
            // La ñ no es una n con acento: en español es otra letra, que va después de la n.
            else if (caracter == TildeCombinable && i > 0 && separado[i - 1] == 'n')
            {
                clave.Append(DespuesDeLaN);
            }
        }
        return clave.ToString();
    }

    // Separa cada letra de su acento: "á" pasa a ser "a" más el acento.
    private static string Separar(string texto)
    {
        try
        {
            return texto.Normalize(NormalizationForm.FormD);
        }
        catch (ArgumentException)
        {
            // Un texto con caracteres rotos no se puede separar. Se ordena como está, sin que falle la pantalla.
            return texto;
        }
    }
}
