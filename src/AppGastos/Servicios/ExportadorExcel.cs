using ClosedXML.Excel;

namespace AppGastos.Servicios;

public record MovimientoExcel(DateOnly Fecha, string CuentaOrigen, string CuentaDestino, decimal Monto, string Comentario = "");

public static class ExportadorExcel
{
    private const int ColumnaFecha = 1;
    private const int ColumnaComentario = 4;
    private const int ColumnaAccountCr = 5;
    private const int ColumnaAccountDr = 6;
    private const int ColumnaDebit = 7;
    private const int ColumnaCredit = 8;

    // La columna D lleva el comentario, pero su encabezado sigue siendo "filler": así lo espera el sistema de contabilidad.
    private static readonly string[] Encabezados =
        ["Date", "filler", "filler", "filler", "Account Cr", "Account Dr", "Debit", "Credit"];

    public static byte[] Crear(IEnumerable<MovimientoExcel> movimientos)
    {
        using var libro = new XLWorkbook();
        var hoja = libro.AddWorksheet("Gastos");

        for (var i = 0; i < Encabezados.Length; i++)
        {
            hoja.Cell(1, i + 1).Value = Encabezados[i];
        }

        var fila = 2;
        foreach (var movimiento in movimientos)
        {
            // La misma regla para todos los tipos: solo cambia qué cuenta es el origen y cuál el destino.
            EscribirFila(hoja, fila++, movimiento, movimiento.CuentaOrigen, movimiento.CuentaDestino, ColumnaCredit);
            EscribirFila(hoja, fila++, movimiento, movimiento.CuentaDestino, movimiento.CuentaOrigen, ColumnaDebit);
        }

        // Ancho fijo: calcularlo según el contenido requiere fuentes, y en el teléfono no hay garantía de tenerlas.
        hoja.Column(ColumnaFecha).Width = 12;
        hoja.Column(ColumnaComentario).Width = 30;
        hoja.Column(ColumnaAccountCr).Width = 24;
        hoja.Column(ColumnaAccountDr).Width = 24;
        hoja.Column(ColumnaDebit).Width = 12;
        hoja.Column(ColumnaCredit).Width = 12;

        using var memoria = new MemoryStream();
        libro.SaveAs(memoria);
        return memoria.ToArray();
    }

    private static void EscribirFila(IXLWorksheet hoja, int fila, MovimientoExcel movimiento, string accountCr, string accountDr, int columnaMonto)
    {
        var celdaFecha = hoja.Cell(fila, ColumnaFecha);
        celdaFecha.Value = movimiento.Fecha.ToDateTime(TimeOnly.MinValue);
        celdaFecha.Style.DateFormat.Format = "m/d/yyyy";

        // Sin comentario la celda queda vacía de verdad, igual que las otras columnas "filler".
        if (movimiento.Comentario.Length > 0)
        {
            hoja.Cell(fila, ColumnaComentario).Value = movimiento.Comentario;
        }

        hoja.Cell(fila, ColumnaAccountCr).Value = accountCr;
        hoja.Cell(fila, ColumnaAccountDr).Value = accountDr;

        var celdaMonto = hoja.Cell(fila, columnaMonto);
        celdaMonto.Value = movimiento.Monto;
        celdaMonto.Style.NumberFormat.Format = "0.00";
    }
}
