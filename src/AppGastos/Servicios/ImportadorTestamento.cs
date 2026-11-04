using AppGastos.Modelos;
using ClosedXML.Excel;

namespace AppGastos.Servicios;

public record ResultadoTestamento(DocumentoTestamento? Documento, IReadOnlyList<string> Avisos, IReadOnlyList<string> Errores)
{
    public bool EsValido => Errores.Count == 0;
}

public static class ImportadorTestamento
{
    private const int ColumnaDescripcion = 1;
    private const int ColumnaCantidad = 2;

    public static ResultadoTestamento Leer(Stream archivo, DateOnly hoy)
    {
        try
        {
            using var libro = new XLWorkbook(archivo);
            var hoja = libro.Worksheet(1);
            var ultimaFila = hoja.LastRowUsed()?.RowNumber() ?? 0;
            var avisos = new List<string>();
            var filas = new List<FilaTestamento>();

            for (var numero = 1; numero <= ultimaFila; numero++)
            {
                filas.Add(LeerFila(hoja, numero, avisos));
            }

            if (filas.All(f => f.Descripcion.Length == 0 && f.Cantidad is null && f.TextoCantidad is null))
            {
                return ConError("El archivo no tiene datos en las columnas A y B de la primera hoja.");
            }

            // Sin ningún monto, lo más probable es que se haya escogido otro archivo.
            if (filas.All(f => f.Cantidad is null))
            {
                return ConError("El archivo no tiene ninguna cantidad en la columna B. ¿Es el archivo correcto?");
            }

            if (libro.Worksheets.Count > 1)
            {
                avisos.Insert(0, $"El archivo tiene {libro.Worksheets.Count} hojas. Solo se muestra la primera: {hoja.Name}.");
            }
            if (hoja.LastColumnUsed()?.ColumnNumber() > ColumnaCantidad)
            {
                avisos.Add("El archivo tiene datos después de la columna B. No se muestran.");
            }

            return new ResultadoTestamento(new DocumentoTestamento { FechaImportacion = hoy, Filas = filas }, avisos, []);
        }
        catch (Exception)
        {
            // ClosedXML lanza excepciones de muchos tipos según qué esté mal en el archivo.
            return ConError("No se pudo leer el archivo. Debe ser un Excel .xlsx sin contraseña.");
        }
    }

    private static FilaTestamento LeerFila(IXLWorksheet hoja, int numero, List<string> avisos)
    {
        var descripcion = hoja.Cell(numero, ColumnaDescripcion);
        var cantidad = hoja.Cell(numero, ColumnaCantidad);
        var fila = new FilaTestamento
        {
            // Sin recortar: los espacios al inicio pueden ser la sangría del documento.
            Descripcion = descripcion.Value.IsBlank ? "" : descripcion.GetFormattedString(),
            DescripcionEnNegrita = descripcion.Style.Font.Bold,
            CantidadEnNegrita = cantidad.Style.Font.Bold,
        };

        var valor = cantidad.Value;
        if (valor.IsNumber)
        {
            // Excel puede guardar un total como 261000.2500000001: se redondea a centavos.
            fila.Cantidad = Math.Round((decimal)valor.GetNumber(), 2);
        }
        else if (!valor.IsBlank)
        {
            var texto = cantidad.GetFormattedString();
            fila.TextoCantidad = texto.Trim().Length > 0 ? texto : null;
            if (valor.IsError)
            {
                avisos.Add($"Fila {numero}: la cantidad tiene un error de Excel ({texto}). Revisa el archivo.");
            }
        }
        return fila;
    }

    private static ResultadoTestamento ConError(string error) => new(null, [], [error]);
}
