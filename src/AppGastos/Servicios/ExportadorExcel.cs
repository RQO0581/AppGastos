using ClosedXML.Excel;

namespace AppGastos.Servicios;

public record MovimientoExcel(DateOnly Fecha, string CuentaOrigen, string CuentaDestino, decimal Monto);

public static class ExportadorExcel
{
    private const int ColumnaFecha = 1;
    private const int ColumnaAccountCr = 5;
    private const int ColumnaAccountDr = 6;
    private const int ColumnaDebit = 7;
    private const int ColumnaCredit = 8;

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
            EscribirFila(hoja, fila++, movimiento.Fecha, movimiento.CuentaOrigen, movimiento.CuentaDestino, ColumnaCredit, movimiento.Monto);
            EscribirFila(hoja, fila++, movimiento.Fecha, movimiento.CuentaDestino, movimiento.CuentaOrigen, ColumnaDebit, movimiento.Monto);
        }

        // Ancho fijo: calcularlo según el contenido requiere fuentes, y en el teléfono no hay garantía de tenerlas.
        hoja.Column(ColumnaFecha).Width = 12;
        hoja.Column(ColumnaAccountCr).Width = 24;
        hoja.Column(ColumnaAccountDr).Width = 24;
        hoja.Column(ColumnaDebit).Width = 12;
        hoja.Column(ColumnaCredit).Width = 12;

        using var memoria = new MemoryStream();
        libro.SaveAs(memoria);
        return memoria.ToArray();
    }

    private static void EscribirFila(IXLWorksheet hoja, int fila, DateOnly fecha, string accountCr, string accountDr, int columnaMonto, decimal monto)
    {
        var celdaFecha = hoja.Cell(fila, ColumnaFecha);
        celdaFecha.Value = fecha.ToDateTime(TimeOnly.MinValue);
        celdaFecha.Style.DateFormat.Format = "m/d/yyyy";

        hoja.Cell(fila, ColumnaAccountCr).Value = accountCr;
        hoja.Cell(fila, ColumnaAccountDr).Value = accountDr;

        var celdaMonto = hoja.Cell(fila, columnaMonto);
        celdaMonto.Value = monto;
        celdaMonto.Style.NumberFormat.Format = "0.00";
    }
}
